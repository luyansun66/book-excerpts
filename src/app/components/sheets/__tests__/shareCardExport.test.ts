// @vitest-environment jsdom
// 分享卡片的两个首访瓶颈：字体下载量、html2canvas 的克隆范围。
// 这两件事都只在「第一次用」时暴露（第二次字体和图都在缓存里，10 秒内就完事），
// 所以这里把「等哪几款字体」「克隆哪些节点」钉成断言。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FONTS,
  applyCardFont,
  applySubsetFont,
  buildIgnoreElements,
  clearSubsetFont,
  collectCardText,
  ensureFontReady,
  fetchSubsetFont,
  preloadFont,
  subsetFamily,
} from '../shareCardExport';

/** 只替换 document.fonts，别动 document 本身（jsdom 的 fonts 是只读 getter）。 */
function stubFonts(load: (font: string, text?: string) => Promise<unknown>): void {
  Object.defineProperty(document, 'fonts', {
    value: { load, ready: Promise.resolve() },
    configurable: true,
  });
}

afterEach(() => {
  vi.useRealTimers();
  delete (document as { fonts?: unknown }).fonts;
});

describe('ensureFontReady — 只等卡片要用的那一款字体', () => {
  it('系统字体不用等', async () => {
    const load = vi.fn();
    stubFonts(load);
    await expect(ensureFontReady('system', ['正文'])).resolves.toBe(true);
    expect(load).not.toHaveBeenCalled();
  });

  it('只请求指定 face，不碰页面上其它字体', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    stubFonts(load);

    await expect(ensureFontReady('FZXiaoZhuan', ['正文', '正文', '小篆体'])).resolves.toBe(true);

    expect(load.mock.calls).toEqual([
      ['14px "FZXiaoZhuan"', '正文'],
      ['14px "FZXiaoZhuan"', '小篆体'],
    ]);
  });

  it('字体下不来时超时返回 false，不把按钮卡在生成中', async () => {
    vi.useFakeTimers();
    stubFonts(() => new Promise(() => {}));

    const pending = ensureFontReady('HuiWenMingChao', ['正文'], 500);
    await vi.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toBe(false);
  });

  it('字体报错按「没等到」处理，仍让导出继续', async () => {
    stubFonts(() => Promise.reject(new Error('network')));
    await expect(ensureFontReady('FZSongHei', ['正文'])).resolves.toBe(false);
  });
});

describe('preloadFont — 后台预热', () => {
  it('系统字体不发请求', () => {
    const load = vi.fn();
    stubFonts(load);
    preloadFont('system', ['正文']);
    expect(load).not.toHaveBeenCalled();
  });

  it('去重后按文案预热，且不抛错', () => {
    const load = vi.fn(() => Promise.reject(new Error('offline')));
    stubFonts(load);
    expect(() => preloadFont('FZSongHei', ['正文', '', '正文'])).not.toThrow();
    expect(load.mock.calls).toEqual([['14px "FZSongHei"', '正文']]);
  });
});

describe('buildIgnoreElements — 克隆里只留卡片', () => {
  function buildDom(): { ignore: (el: Element) => boolean; shelf: Element; card: Element } {
    document.head.innerHTML = '<style>@font-face{font-family:x}</style>';
    document.body.innerHTML = `
      <div id="app">
        <div id="shelf"><img id="cover" src="/cover.png"></div>
        <div id="sheet"><div id="card"><p id="text">正文</p></div></div>
      </div>`;
    const card = document.getElementById('card') as Element;
    return { ignore: buildIgnoreElements(card), shelf: document.getElementById('shelf') as Element, card };
  }

  it('丢掉书架上要重新下载的封面图', () => {
    const { ignore, shelf } = buildDom();
    expect(ignore(shelf)).toBe(true);
    expect(ignore(document.getElementById('cover') as Element)).toBe(true);
  });

  it('保留卡片本身与卡片的祖先（布局和样式靠它们）', () => {
    const { ignore, card } = buildDom();
    expect(ignore(card)).toBe(false);
    expect(ignore(document.getElementById('text') as Element)).toBe(false);
    expect(ignore(document.getElementById('sheet') as Element)).toBe(false);
    expect(ignore(document.body)).toBe(false);
  });

  it('保留 <head>：那是克隆文档里唯一的 @font-face 来源', () => {
    const { ignore } = buildDom();
    expect(ignore(document.head)).toBe(false);
    expect(ignore(document.querySelector('head style') as Element)).toBe(false);
  });

  it('卡片还没挂上时谁都不丢', () => {
    const ignore = buildIgnoreElements(null);
    expect(ignore(document.body)).toBe(false);
  });
});

describe('FONTS 与标签字体子集保持一致', () => {

  const fontsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/fonts.css'), 'utf8');
  const script = readFileSync(path.resolve(process.cwd(), 'scripts/subset-label-fonts.sh'), 'utf8');

  /** labelFamily 用的族名（字体栈里的第一个）。 */
  const labelFaceOf = (familyStack: string): string =>
    /^"([^"]+)"/.exec(familyStack.trim())?.[1] ?? '';

  const subsets = [...script.matchAll(/subset\s+"[^"]+"\s+"([^"]+)"\s+"([^"]+)"/g)].map((m) => ({
    face: m[1],
    text: m[2],
  }));

  it('选择器按钮一律指向子集，不指向整套字体（整套七款约 22MB）', () => {
    for (const font of FONTS) {
      if (font.id === 'system') continue;
      expect(font.labelFamily).not.toBe(font.family);
      expect(font.labelFamily).toContain('Label');
    }
  });

  it('每款字体的标签子集都有 @font-face 声明和真实文件', () => {
    for (const font of FONTS) {
      if (font.id === 'system') continue;
      const face = labelFaceOf(font.labelFamily);
      expect(fontsCss).toContain(`font-family: '${face}'`);
      expect(existsSync(path.resolve(process.cwd(), `public/fonts/labels/${face}.woff2`))).toBe(true);
    }
  });

  it('子集脚本覆盖每个按钮上的字体名（字体名改了要重跑脚本）', () => {
    const byFont = new Map(FONTS.filter((f) => f.id !== 'system').map((f) => [labelFaceOf(f.labelFamily), f.name]));
    expect(subsets.map((s) => s.face).sort()).toEqual([...byFont.keys()].sort());
    for (const { face, text } of subsets) expect(text).toBe(byFont.get(face));
  });
});

// ─── 子集字体 ────────────────────────────────────────────────────────────────
// 首访要下的是这几十 KB，而不是整套 7.4MB —— 这条路径错了，首访就还是几十秒。

describe('collectCardText / subsetFamily', () => {
  it('卡片里用所选字体渲染的每个字都进请求：正文 + 前后引号', () => {
    expect(collectCardText('正文')).toBe('\u201c正文\u201d');
  });

  it('子集族名与整款字体分开，缺字时才能逐级兜底', () => {
    expect(subsetFamily('FZSongHei')).toBe('ShareSub-FZSongHei');
    expect(subsetFamily('FZSongHei')).not.toBe('FZSongHei');
  });
});

describe('FONTS 的字体栈：点选字体不该顺手下整套字体', () => {
  it('fallbackFamily 不含整款字体族名（含了就等于首访下 7.4MB）', () => {
    for (const font of FONTS) {
      if (font.id === 'system') continue;
      expect(font.fallbackFamily, `${font.name} 的兜底栈里还有整款字体`).not.toContain(`"${font.face}"`);
      // 降级路径仍然要能用整套字体，所以 family 必须留着它。
      expect(font.family).toContain(`"${font.face}"`);
    }
  });
});

/** 只保留 fetch / blob / headers 三个被用到的面。 */
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    return handler(String(input), init);
  });
  return urls;
}

function fontResponse(contentType = 'font/ttf', size = 3): Response {
  return {
    ok: true,
    blob: async () => new Blob([new Uint8Array(size)]),
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
  } as unknown as Response;
}

describe('fetchSubsetFont — 拿不到就必须返回 null，交给调用方降级', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
  });

  it('请求带上 face 与整段文字，并正确转义', async () => {
    const urls = stubFetch(async () => fontResponse());
    await fetchSubsetFont('FZSongHei', '\u201c正文 & 更多\u201d');
    expect(urls).toEqual([
      expect.stringContaining(
        `/api/fonts/subset?face=FZSongHei&text=${encodeURIComponent('\u201c正文 & 更多\u201d')}`,
      ),
    ]);
  });

  it('拿到子集：族名、字节、format 都跟着服务端走', async () => {
    stubFetch(async () => fontResponse('font/otf', 128));
    await expect(fetchSubsetFont('SourceHanSerifCN', '正文')).resolves.toMatchObject({
      family: 'ShareSub-SourceHanSerifCN',
      format: 'opentype',
    });
  });

  it('系统字体不发请求', async () => {
    const urls = stubFetch(async () => fontResponse());
    await expect(fetchSubsetFont('system', '正文')).resolves.toBeNull();
    expect(urls).toEqual([]);
  });

  it.each([
    ['非 2xx', async () => ({ ...fontResponse(), ok: false }) as unknown as Response],
    ['空响应体', async () => fontResponse('font/ttf', 0)],
  ])('%s → null', async (_label, handler) => {
    stubFetch(handler as (url: string) => Promise<Response>);
    await expect(fetchSubsetFont('FZSongHei', '正文')).resolves.toBeNull();
  });

  it('网络抛错 → null', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    await expect(fetchSubsetFont('FZSongHei', '正文')).resolves.toBeNull();
  });

  it('超时（服务端卡住）→ null，绝不让按钮一直转', async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    await expect(fetchSubsetFont('FZSongHei', '正文', 20)).resolves.toBeNull();
  });
});

describe('applySubsetFont / clearSubsetFont — 注入的必须是真 @font-face', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.head.innerHTML = '';
  });

  const subset = (family = 'ShareSub-FZSongHei', format: 'truetype' | 'opentype' = 'truetype') => ({
    family,
    format,
    blob: new Blob([new Uint8Array([1, 2, 3])]),
  });

  function styles(): HTMLStyleElement[] {
    return Array.from(document.querySelectorAll('style[data-share-subset-font]'));
  }

  it('写进 document.styleSheets 能看见的 <style>，而不是 document.fonts.add', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    stubFonts(load);

    await applySubsetFont(subset(), '正文');

    expect(styles()).toHaveLength(1);
    const css = styles()[0].textContent ?? '';
    expect(css).toContain('font-family:"ShareSub-FZSongHei"');
    expect(css).toContain('src:url("blob:');
    expect(css).toContain('format("truetype")');
    expect(css).toContain('font-display:block');
    // 不 load 一次的话，@font-face 是懒加载的，克隆文档里可能还没有这些字形。
    expect(load.mock.calls).toEqual([['14px "ShareSub-FZSongHei"', '正文']]);
  });

  it('换字体时替换掉上一条并释放旧 blob，不留下第二份字体', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    stubFonts(vi.fn(() => Promise.resolve([])));

    await applySubsetFont(subset('ShareSub-FZSongHei'), '正文');
    const firstUrl = /url\("([^"]+)"\)/.exec(styles()[0].textContent ?? '')?.[1];
    await applySubsetFont(subset('ShareSub-HuiWenMingChao', 'opentype'), '正文');

    expect(styles()).toHaveLength(1);
    expect(styles()[0].getAttribute('data-share-subset-font')).toBe('ShareSub-HuiWenMingChao');
    expect(revoke).toHaveBeenCalledWith(firstUrl);
  });

  it('清掉之后卡片就退回兜底字体（不留残影）', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    stubFonts(vi.fn(() => Promise.resolve([])));
    await applySubsetFont(subset(), '正文');

    clearSubsetFont();

    expect(styles()).toHaveLength(0);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('applyCardFont — 导出用的字体栈钉在克隆 DOM 上', () => {
  it('只改带标记的元素，引号和正文都覆盖到', () => {
    document.body.innerHTML = `
      <div id="card">
        <span data-share-card-font="" id="open-quote"></span>
        <p data-share-card-font="" id="text">正文</p>
        <span id="footer">书名</span>
      </div>`;

    applyCardFont(document, '"ShareSub-FZSongHei", serif');

    const fontOf = (id: string) => (document.getElementById(id) as HTMLElement).style.fontFamily;
    expect(fontOf('open-quote')).toBe('"ShareSub-FZSongHei", serif');
    expect(fontOf('text')).toBe('"ShareSub-FZSongHei", serif');
    // 书名等其它字不是卡片正文，必须保持原样。
    expect(fontOf('footer')).toBe('');
  });
});
