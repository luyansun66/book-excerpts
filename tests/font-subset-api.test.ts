// @vitest-environment node
// /api/fonts/subset 的端到端验证：真的驱动 harfbuzz 的子集化 wasm，喂真的 sfnt，
// 再从输出字节里自己解析 sfnt 表目录 + cmap，断言「请求的每个码点都还在」。
//
// 为什么值得这么麻烦：这段代码最容易的坏法不是报错，而是产出一份「合法但缺字」
// 的字体 —— 浏览器不报错，只悄悄退回兜底字体，导出图上就是另一种字体的形状。
// 所以断言不能只看 HTTP 200，必须落到 cmap 上。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_TEXT_LENGTH,
  fontContentType,
  onRequestGet,
  resetRuntimeCache,
} from '../functions/api/fonts/subset';

const ROOT = process.cwd();
const INDEX = JSON.parse(
  readFileSync(resolve(ROOT, 'public/fonts/sfnt/index.json'), 'utf8'),
) as Record<string, string>;
const FACES = Object.keys(INDEX);

/** 一段真实形状的摘录：正文 + 前后引号（引号单独渲染，最容易被子集漏掉）。 */
const TEXT = '\u201c阅读是随身携带的避难所，让人在喧嚣里有一处安静的地方。\u201d';

// ─── 自写的 sfnt 解析（不引依赖，够用就好） ─────────────────────────────────────

interface SfntTable {
  offset: number;
  length: number;
}

function readTables(bytes: Uint8Array): Map<string, SfntTable> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint16(4);
  const tables = new Map<string, SfntTable>();
  for (let i = 0; i < count; i += 1) {
    const base = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(base, base + 4));
    tables.set(tag, {
      offset: view.getUint32(base + 8),
      length: view.getUint32(base + 12),
    });
  }
  return tables;
}

/** 返回 cmap 查表函数；查不到的字形返回 0（也就是 .notdef）。 */
function buildCmap(bytes: Uint8Array): (codepoint: number) => number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const cmap = readTables(bytes).get('cmap');
  if (!cmap) throw new Error('子集里没有 cmap 表');

  // 挑一个 Unicode 子表：优先 platform 3 / encoding 10（全码点），
  // 其次 3/1（BMP），再次 platform 0。
  const count = view.getUint16(cmap.offset + 2);
  let chosen = 0;
  let bestScore = -1;
  for (let i = 0; i < count; i += 1) {
    const record = cmap.offset + 4 + i * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmap.offset + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    const score =
      (platform === 3 && encoding === 10) || (platform === 0 && format === 12)
        ? 3
        : platform === 3 && encoding === 1
          ? 2
          : platform === 0
            ? 1
            : 0;
    if (score > bestScore) {
      bestScore = score;
      chosen = offset;
    }
  }

  const format = view.getUint16(chosen);
  if (format === 4) {
    const segCount = view.getUint16(chosen + 6) / 2;
    const endAt = chosen + 14;
    const startAt = endAt + segCount * 2 + 2;
    const deltaAt = startAt + segCount * 2;
    const rangeAt = deltaAt + segCount * 2;
    return (codepoint: number): number => {
      for (let i = 0; i < segCount; i += 1) {
        if (codepoint > view.getUint16(endAt + i * 2)) continue;
        const start = view.getUint16(startAt + i * 2);
        if (codepoint < start) return 0;
        const delta = view.getInt16(deltaAt + i * 2);
        const rangeOffset = view.getUint16(rangeAt + i * 2);
        if (rangeOffset === 0) return (codepoint + delta) & 0xffff;
        const glyphAt = rangeAt + i * 2 + rangeOffset + (codepoint - start) * 2;
        const glyph = view.getUint16(glyphAt);
        return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
      }
      return 0;
    };
  }
  if (format === 12) {
    const groups = view.getUint32(chosen + 12);
    return (codepoint: number): number => {
      for (let i = 0; i < groups; i += 1) {
        const base = chosen + 16 + i * 12;
        const start = view.getUint32(base);
        const end = view.getUint32(base + 4);
        if (codepoint >= start && codepoint <= end) return view.getUint32(base + 8) + (codepoint - start);
      }
      return 0;
    };
  }
  throw new Error(`不支持的 cmap 格式：${format}`);
}

// ─── 假的 Pages 运行时 ────────────────────────────────────────────────────────

interface StubOptions {
  /** 让字体资源返回垃圾字节，用来验证「子集化失败 → 500」。 */
  corruptFonts?: boolean;
  /** 让这个路径返回 404。 */
  missingPath?: string;
}

function stubAssets(options: StubOptions = {}): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    urls.push(url);
    const path = new URL(url).pathname;
    if (options.missingPath && path === options.missingPath) return new Response('nope', { status: 404 });

    const file = `public${path}`;
    const bytes =
      options.corruptFonts && path.startsWith('/fonts/sfnt/')
        ? new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
        : new Uint8Array(readFileSync(resolve(ROOT, file)));
    return new Response(bytes, { status: 200 });
  });
  return { urls };
}

/** caches.default 的最小实现：按完整 URL 存取。 */
function stubCache(): Map<string, Response> {
  const store = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: async (incoming: Request) => store.get(incoming.url)?.clone(),
      put: async (incoming: Request, response: Response) => {
        store.set(incoming.url, response);
      },
    },
  });
  return store;
}

function request(face: string, text: string): Request {
  const query = `face=${encodeURIComponent(face)}&text=${encodeURIComponent(text)}`;
  return new Request(`https://books.example.com/api/fonts/subset?${query}`);
}

async function subsetOf(face: string, text: string): Promise<{ response: Response; bytes: Uint8Array }> {
  const response = await onRequestGet({ request: request(face, text), env: {} });
  return { response, bytes: new Uint8Array(await response.arrayBuffer()) };
}

beforeEach(() => {
  resetRuntimeCache();
  stubAssets();
  stubCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetRuntimeCache();
});

describe('七款字体都产出「可用」的字体，而不是看起来像字体的字节', () => {
  for (const face of FACES) {
    it(`${face}：cmap 覆盖请求的每一个字，体积远小于整套`, async () => {
      const { response, bytes } = await subsetOf(face, TEXT);

      expect(response.status).toBe(200);
      const sourceSize = readFileSync(resolve(ROOT, `public/fonts/sfnt/${INDEX[face]}`)).byteLength;
      const magic = String.fromCharCode(...bytes.subarray(0, 4));
      expect(['\u0000\u0001\u0000\u0000', 'OTTO']).toContain(magic);
      expect(response.headers.get('Content-Type')).toBe(magic === 'OTTO' ? 'font/otf' : 'font/ttf');
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

      // 必需的表一张都不能少：少了任何一张，浏览器都会静默认为渲染不出来。
      const tables = readTables(bytes);
      for (const tag of ['cmap', 'head', 'hhea', 'hmtx', 'maxp']) {
        expect(tables.has(tag), `${face} 的子集缺少 ${tag}`).toBe(true);
      }
      expect(tables.has('glyf') || tables.has('CFF ')).toBe(true);

      const glyphOf = buildCmap(bytes);
      for (const char of TEXT) {
        const codepoint = char.codePointAt(0) as number;
        expect(glyphOf(codepoint), `${face} 的子集丢了 U+${codepoint.toString(16)}`).not.toBe(0);
      }

      expect(bytes.byteLength).toBeLessThan(sourceSize / 10);
      expect(bytes.byteLength).toBeLessThan(200 * 1024);
    });
  }
});

describe('失败必须是「客户端看得出该降级」，不是空响应', () => {
  it('文字为空 → 400', async () => {
    const response = await onRequestGet({ request: request('FZSongHei', ''), env: {} });
    expect(response.status).toBe(400);
  });

  it('文字超长 → 400', async () => {
    const response = await onRequestGet({
      request: request('FZSongHei', '字'.repeat(MAX_TEXT_LENGTH + 1)),
      env: {},
    });
    expect(response.status).toBe(400);
  });

  it('face 为空 → 400', async () => {
    const response = await onRequestGet({ request: request('', TEXT), env: {} });
    expect(response.status).toBe(400);
  });

  it('index.json 里没有的 face → 404', async () => {
    const response = await onRequestGet({ request: request('Comic Sans', TEXT), env: {} });
    expect(response.status).toBe(404);
  });

  it('sfnt 资源缺失 → 404', async () => {
    resetRuntimeCache();
    stubAssets({ missingPath: `/fonts/sfnt/${INDEX.FZSongHei}` });
    const response = await onRequestGet({ request: request('FZSongHei', TEXT), env: {} });
    expect(response.status).toBe(404);
  });

  it('字体读不了（子集化返回 0）→ 500，而不是空字体', async () => {
    resetRuntimeCache();
    stubAssets({ corruptFonts: true });
    const response = await onRequestGet({ request: request('FZSongHei', TEXT), env: {} });
    expect(response.status).toBe(500);
  });
});

describe('缓存', () => {
  it('同一段摘录的第二次请求直接命中 caches.default，不再取字体', async () => {
    resetRuntimeCache();
    const { urls } = stubAssets();
    const store = stubCache();

    // 只数「字体本体」的请求：index.json 也在 /fonts/sfnt/ 下面，但它小到无所谓。
    const fontFetchesOf = (): number => urls.filter((url) => /\.(ttf|otf)$/.test(new URL(url).pathname)).length;

    const first = await onRequestGet({ request: request('HuiWenMingChao', TEXT), env: {} });
    expect(first.status).toBe(200);
    const fontFetches = fontFetchesOf();
    expect(fontFetches).toBe(1);
    expect(store.size).toBe(1);

    const second = await onRequestGet({ request: request('HuiWenMingChao', TEXT), env: {} });
    expect(second.status).toBe(200);
    expect(fontFetchesOf()).toBe(fontFetches);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(
      new Uint8Array(await first.arrayBuffer()),
    );
  });

  it('不同文字不会互相串味（缓存键含 text）', async () => {
    resetRuntimeCache();
    stubAssets();
    const store = stubCache();
    await onRequestGet({ request: request('FZSongHei', TEXT), env: {} });
    await onRequestGet({ request: request('FZSongHei', '另一段完全不同的摘录'), env: {} });
    expect(store.size).toBe(2);
  });
});

describe('静态资源取法', () => {
  it('有 ASSETS 绑定时走绑定，不走同源 fetch', async () => {
    resetRuntimeCache();
    const globalFetch = globalThis.fetch;
    const globalCalls: string[] = [];
    const assetsPaths: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      globalCalls.push(String(input));
      return globalFetch(input);
    });

    const response = await onRequestGet({
      request: request('FZSongHei', TEXT),
      env: {
        ASSETS: {
          fetch: (incoming: Request) => {
            assetsPaths.push(new URL(incoming.url).pathname);
            return globalFetch(incoming);
          },
        },
      },
    });

    expect(response.status).toBe(200);
    expect(assetsPaths).toContain('/fonts/sfnt/index.json');
    expect(assetsPaths).toContain(`/fonts/sfnt/${INDEX.FZSongHei}`);
    // 子集化 wasm 是构建期编进 function 的，运行时**不该**再有这次抓取：
    // 之前它走 fetch 字节 + WebAssembly.instantiate(buffer)，workerd 禁运行时编译，
    // 线上就是这个点 500 的。
    expect(assetsPaths).toEqual(['/fonts/sfnt/index.json', `/fonts/sfnt/${INDEX.FZSongHei}`]);
    expect(globalCalls).toEqual([]);
  });
});

describe('fontContentType', () => {
  it('OTTO → font/otf，其余 → font/ttf', () => {
    expect(fontContentType(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]))).toBe('font/otf');
    expect(fontContentType(new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe('font/ttf');
  });
});
