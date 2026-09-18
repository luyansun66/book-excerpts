// ─── GET /api/fonts/subset?face=<face>&text=<摘录文字> ─────────────────────────
// 首访导出的另一个瓶颈：为了渲染一段摘录要下载整款 CJK 字体（最大 7.4MB，
// 按实测慢网 180KB/s 约 41s）。这里只返回这段文字真正用到的字形，十几~几十 KB。
//
// 为什么放服务端而不是浏览器里做：子集化要读整份 sfnt（七款合计 48.6MB），
// 让浏览器先拿到它，等于把「下载整套字体」换了个说法。
//
// 注意：Cloudflare Pages 把 functions/ 下的**每个文件**都当路由，共享代码不能
// 放在这里。为了让逻辑可单测，纯函数直接从本文件导出给 vitest 直接 import。

// wasm 走构建期导入，由 wrangler 编成 WebAssembly.Module 随 function 一起打包。
// **不能用 fetch 拿字节再 WebAssembly.instantiate(arrayBuffer)** —— workerd 禁掉了
// 运行时编译（Wasm code generation disallowed by embedder），线上接口 500 就是
// 栽在这里，前端拿不到子集只能退回下载整套字体。构建期编好、运行时只实例化，
// 这条路 workerd 是允许的。
//
// 用命名空间导入而不是默认导入：wrangler/esbuild 给的是 { default: Module }，
// 而 vitest 走 node 原生 wasm ESM，命名空间本身就是 wasm 的导出表（没有 default）。
// 默认导入在后一种形态下拿到的是 undefined，会变成「instantiate(undefined)」。
import * as hbWasmModule from 'harfbuzzjs/dist/harfbuzz-subset.wasm';

/** 摘录字符数上限。超了直接 400，客户端拿到非 2xx 就走降级路径。 */
export const MAX_TEXT_LENGTH = 2000;

// 同一个 face + 同一段文字永远是同一份子集，可以一直缓存。
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const INDEX_PATH = '/fonts/sfnt/index.json';
const FONT_DIR = '/fonts/sfnt';

interface SubsetEnv {
  /** Pages 的静态资源绑定。本地/单测里没有它，那就退回同源 fetch。 */
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

interface SubsetContext {
  request: Request;
  env: SubsetEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
}

/** harfbuzz-subset.wasm 导出的那部分 C API（零 import，可直接实例化）。 */
interface HbExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(size: number): number;
  free(ptr: number): void;
  hb_blob_create(data: number, length: number, mode: number, userData: number, destroy: number): number;
  hb_blob_destroy(blob: number): void;
  hb_blob_get_length(blob: number): number;
  hb_blob_get_data(blob: number, length: number): number;
  hb_face_create(blob: number, index: number): number;
  hb_face_destroy(face: number): void;
  hb_face_reference_blob(face: number): number;
  hb_set_add(set: number, codepoint: number): void;
  hb_subset_input_create_or_fail(): number;
  hb_subset_input_destroy(input: number): void;
  hb_subset_input_unicode_set(input: number): number;
  hb_subset_or_fail(face: number, input: number): number;
}

/**
 * 按 text 里的字符裁出 fontBytes 的子集，返回一份新的 sfnt 字节。
 * 失败一律抛错（让上层转 500），不要返回空字节 —— 空字体在浏览器里是静默兜底。
 */
export function subsetFont(hb: HbExports, fontBytes: Uint8Array, text: string): Uint8Array {
  // 每次都重新取视图，绝不复用：malloc 会让 wasm 内存增长，旧视图随即失效
  // （上一轮就是踩了这个，把明朝体误判成「子集化失败」）。
  const heap = (): Uint8Array => new Uint8Array(hb.memory.buffer);

  let fontPtr = hb.malloc(fontBytes.byteLength);
  if (!fontPtr) throw new Error('wasm malloc failed');

  let blob = 0;
  let face = 0;
  let input = 0;
  let subset = 0;
  let resultBlob = 0;
  try {
    heap().set(fontBytes, fontPtr);

    // mode 0 = HB_MEMORY_MODE_DUPLICATE：让 harfbuzz 自己留一份，
    // 我们这块内存写完就能还回去。
    blob = hb.hb_blob_create(fontPtr, fontBytes.byteLength, 0, 0, 0);
    if (!blob) throw new Error('hb_blob_create failed');
    hb.free(fontPtr);
    fontPtr = 0;

    face = hb.hb_face_create(blob, 0);
    if (!face) throw new Error('hb_face_create failed');

    input = hb.hb_subset_input_create_or_fail();
    if (!input) throw new Error('hb_subset_input_create_or_fail failed');

    const unicodes = hb.hb_subset_input_unicode_set(input);
    // 按码点遍历：代理对（emoji 等）要当成一个字符。
    for (const char of text) {
      hb.hb_set_add(unicodes, char.codePointAt(0) as number);
    }

    // 判据只能是这里的返回值：hb_face_create 对垃圾字节也返回非空 face，
    // 而子集化失败（woff2 就是，本 wasm 不支持）会返回 0。
    subset = hb.hb_subset_or_fail(face, input);
    if (!subset) throw new Error('hb_subset_or_fail failed');

    resultBlob = hb.hb_face_reference_blob(subset);
    if (!resultBlob) throw new Error('hb_face_reference_blob failed');

    const length = hb.hb_blob_get_length(resultBlob);
    const dataPtr = hb.hb_blob_get_data(resultBlob, 0);
    if (!length || !dataPtr) throw new Error('subset is empty');

    // 拷出来：这块 wasm 内存在后续调用里会被搬走/增长。
    return heap().slice(dataPtr, dataPtr + length);
  } finally {
    if (resultBlob) hb.hb_blob_destroy(resultBlob);
    if (subset) hb.hb_face_destroy(subset);
    if (input) hb.hb_subset_input_destroy(input);
    if (face) hb.hb_face_destroy(face);
    if (blob) hb.hb_blob_destroy(blob);
    if (fontPtr) hb.free(fontPtr);
  }
}

/** 按 sfnt 头 4 字节判类型：CFF/CID 是 'OTTO'，其余是 glyf 的 ttf。 */
export function fontContentType(bytes: Uint8Array): string {
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  return magic === 'OTTO' ? 'font/otf' : 'font/ttf';
}

/**
 * 模块作用域缓存：每个 isolate 只付一次。
 * 刻意**不缓存字体字节** —— 七款合计 48.6MB，加上 wasm 堆（子集化 22.6MB
 * 那份时实测已到 65MB）会顶到 isolate 的 128MB 上限。字体字节的重复获取
 * 只是一次边缘内 I/O，而且同一段摘录的第二次导出本来就命中 caches.default，
 * 根本走不到这里。
 */
const runtime: {
  index: Record<string, string> | null;
  wasm: HbExports | null;
} = { index: null, wasm: null };

/** 清掉模块作用域缓存。给测试用；线上靠 isolate 生命周期自然失效。 */
export function resetRuntimeCache(): void {
  runtime.index = null;
  runtime.wasm = null;
}

function cacheDefault(): Cache | null {
  const store = (globalThis as { caches?: { default?: Cache } }).caches;
  return store?.default ?? null;
}

async function fetchAsset(path: string, context: SubsetContext): Promise<Response> {
  const url = new URL(path, context.request.url).toString();
  const assets = context.env?.ASSETS;
  // Pages 的静态资源优先走 ASSETS 绑定；没有绑定（本地测试）才用同源 fetch。
  if (assets && typeof assets.fetch === 'function') return assets.fetch(new Request(url));
  return fetch(url);
}

async function loadIndex(context: SubsetContext): Promise<Record<string, string>> {
  if (runtime.index) return runtime.index;
  const response = await fetchAsset(INDEX_PATH, context);
  if (!response.ok) throw new Error(`index fetch failed: ${response.status}`);
  const parsed: unknown = await response.json();
  if (!parsed || typeof parsed !== 'object') throw new Error('index is not an object');
  const index: Record<string, string> = {};
  for (const [face, file] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof file === 'string') index[face] = file;
  }
  runtime.index = index;
  return index;
}

/**
 * 实例化 harfbuzz 并返回导出表，每个 isolate 只付一次。
 *
 * 导入的东西有两种形态，两种都得认：
 * - 线上（wrangler/workerd）：WebAssembly.Module，要自己实例化；
 * - vitest（node 原生 wasm ESM）：导入的已经就是导出表本身。
 * 认错的后果很隐蔽 —— 拿不到真的导出表，子集化会失败或产出空字体。
 */
function isHbExports(imported: unknown): imported is HbExports {
  return typeof (imported as { _initialize?: unknown } | null)?._initialize === 'function';
}

async function getWasm(): Promise<HbExports> {
  if (runtime.wasm) return runtime.wasm;

  const imported: unknown = (hbWasmModule as { default?: unknown }).default ?? hbWasmModule;
  let exports: HbExports;
  if (isHbExports(imported)) {
    exports = imported;
  } else {
    // 入参只能是 Module：它走「构建期已编好、运行时仅实例化」，workerd 允许。
    const instance = (await WebAssembly.instantiate(
      imported as WebAssembly.Module,
      {},
    )) as unknown as WebAssembly.Instance;
    exports = instance.exports as unknown as HbExports;
  }

  // 不调 _initialize()，hb_subset_or_fail 会静默返回 0（看着像「字体读不了」）。
  exports._initialize();
  runtime.wasm = exports;
  return exports;
}

export async function onRequestGet(context: SubsetContext): Promise<Response> {
  const url = new URL(context.request.url);
  const face = url.searchParams.get('face') ?? '';
  const text = url.searchParams.get('text') ?? '';

  // 先做不花钱的校验：这些情况重试多少次都一样，所以给 4xx 让客户端立刻降级。
  if (!text) return new Response('missing text', { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) return new Response('text too long', { status: 400 });
  if (!face) return new Response('missing face', { status: 400 });

  const cache = cacheDefault();
  const hit = cache ? await cache.match(context.request) : undefined;
  if (hit) return hit;

  let filename: string | undefined;
  try {
    filename = (await loadIndex(context))[face];
  } catch (error) {
    console.error('[fonts/subset] index unavailable', error);
    return new Response('font index unavailable', { status: 500 });
  }
  if (!filename) return new Response('unknown face', { status: 404 });

  let bytes: Uint8Array;
  try {
    const fontResponse = await fetchAsset(`${FONT_DIR}/${filename}`, context);
    if (!fontResponse.ok) return new Response('font asset missing', { status: 404 });
    const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
    bytes = subsetFont(await getWasm(), fontBytes, text);
  } catch (error) {
    console.error('[fonts/subset] subset failed', error);
    return new Response('subset failed', { status: 500 });
  }

  const response = new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': fontContentType(bytes), 'Cache-Control': CACHE_CONTROL },
  });

  if (cache) {
    // 写缓存是收尾动作，不拖慢这次响应；没有 waitUntil（本地测试）就老实等一下。
    const put = cache.put(context.request, response.clone());
    if (typeof context.waitUntil === 'function') context.waitUntil(put);
    else await put;
  }
  return response;
}
