// ─── 分享卡片导出：字体清单 + 导出前要等的字体 + html2canvas 的克隆范围 ────────
// 这里只放纯逻辑（可单测）；DOM 编排留在 ShareSheet。

/** document.fonts.load 的探测字号：只用来命中 @font-face，与卡片实际字号无关。 */
const PROBE_SIZE = '14px';

export const SYSTEM_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export interface FontOption {
  id: string;
  name: string;
  /**
   * 降级字体栈：**含整款字体族名**。
   * 只在「子集还没拿到 / 拿不到」时用 —— 也就是修复前的行为：
   * 老老实实下载整套字体（最大 7.4MB，慢网下 41s），但一定出图。
   */
  family: string;
  /**
   * 子集就位后的兜底栈：**故意不含整款字体族名**。
   * 子集缺字时逐级退到这里的系统字体；因为不点名整款字体，
   * 「点选字体」这个动作不会再顺手把整套字体拉下来（首访 41s 的起点之一）。
   */
  fallbackFamily: string;
  /**
   * 选择器按钮上「字体名」的字体栈。
   * 只指向 /fonts/labels 下的名字子集（每个约 1KB），绝不指向整套字体 ——
   * 按钮用整套字体渲染的话，一打开面板就要下七款字体（约 22MB），
   * 慢网下就是几分钟的「字体加载」。子集缺字时退回系统字体，
   * 不会再触发整套字体的下载（见 scripts/subset-label-fonts.sh）。
   */
  labelFamily: string;
  /** document.fonts.load 用的族名；system 表示系统字体，不用等。 */
  face: string;
}

export const FONTS: FontOption[] = [
  {
    id: 'system',
    name: '系统默认',
    family: SYSTEM_FAMILY,
    fallbackFamily: SYSTEM_FAMILY,
    labelFamily: SYSTEM_FAMILY,
    face: 'system',
  },
  {
    id: 'siyuan',
    name: '思源宋体',
    family: '"SourceHanSerifCN", "Noto Serif SC", Georgia, serif',
    fallbackFamily: '"Noto Serif SC", Georgia, serif',
    labelFamily: '"SourceHanSerifCNLabel", "Songti SC", serif',
    face: 'SourceHanSerifCN',
  },
  {
    id: 'lanting',
    name: '兰亭细黑',
    family: '"FZLanTingXiHei", "PingFang SC", sans-serif',
    fallbackFamily: '"PingFang SC", sans-serif',
    labelFamily: '"FZLanTingXiHeiLabel", "PingFang SC", sans-serif',
    face: 'FZLanTingXiHei',
  },
  {
    id: 'beiwei',
    name: '北魏楷书',
    family: '"FZBeiWeiKaiShu", "KaiTi", serif',
    fallbackFamily: '"KaiTi", serif',
    labelFamily: '"FZBeiWeiKaiShuLabel", "KaiTi", serif',
    face: 'FZBeiWeiKaiShu',
  },
  {
    id: 'songhei',
    name: '宋黑',
    family: '"FZSongHei", "PingFang SC", sans-serif',
    fallbackFamily: '"PingFang SC", sans-serif',
    labelFamily: '"FZSongHeiLabel", "PingFang SC", sans-serif',
    face: 'FZSongHei',
  },
  {
    id: 'xiaozhuan',
    name: '小篆体',
    family: '"FZXiaoZhuan", serif',
    fallbackFamily: 'serif',
    labelFamily: '"FZXiaoZhuanLabel", "Songti SC", serif',
    face: 'FZXiaoZhuan',
  },
  {
    id: 'zhengxian',
    name: '正纤黑',
    family: '"FZZhengXianHei", "PingFang SC", sans-serif',
    fallbackFamily: '"PingFang SC", sans-serif',
    labelFamily: '"FZZhengXianHeiLabel", "PingFang SC", sans-serif',
    face: 'FZZhengXianHei',
  },
  {
    id: 'mingchao',
    name: '明朝体',
    family: '"HuiWenMingChao", "Noto Serif SC", serif',
    fallbackFamily: '"Noto Serif SC", serif',
    labelFamily: '"HuiWenMingChaoLabel", "Songti SC", serif',
    face: 'HuiWenMingChao',
  },
];

/** 等字体的上限。字体已经在下载时立刻就返回，超时只是兜底，
 *  免得网络卡住时按钮永远停在「生成中…」。 */
export const FONT_WAIT_TIMEOUT_MS = 15_000;

function documentFonts(): FontFaceSet | undefined {
  if (typeof document === 'undefined') return undefined;
  return (document as Document & { fonts?: FontFaceSet }).fonts;
}

function uniqueTexts(texts: string[]): string[] {
  return [...new Set(texts)].filter((text) => text.length > 0);
}

/** 后台把某一款字体拉起来（不阻塞、不报错），供预览与导出共用。 */
export function preloadFont(face: string, texts: string[]): void {
  if (face === 'system') return;
  const fonts = documentFonts();
  if (!fonts || typeof fonts.load !== 'function') return;
  for (const text of uniqueTexts(texts)) {
    fonts.load(`${PROBE_SIZE} "${face}"`, text).catch(() => {});
  }
}

/**
 * 等「卡片要用的那一款」字体就位，返回是否等到了。
 * 刻意不用 document.fonts.ready：那是整篇文档的字体都就位，会被选择器里的其它
 * 字体（哪怕用户没选）、被页面上任何一处字体一起拖住 —— 导出只需要这一款。
 */
export async function ensureFontReady(
  face: string,
  texts: string[],
  timeoutMs: number = FONT_WAIT_TIMEOUT_MS,
): Promise<boolean> {
  if (face === 'system') return true;
  const fonts = documentFonts();
  if (!fonts || typeof fonts.load !== 'function') return true;

  const loaded = Promise.all(
    uniqueTexts(texts).map((text) => fonts.load(`${PROBE_SIZE} "${face}"`, text)),
  ).then(
    () => true,
    () => false,
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loaded,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * html2canvas 的 ignoreElements：只留卡片本身。
 * 它默认把整个 <html> 克隆进隐藏 iframe，于是书架上的封面图要在克隆里重新加载
 * 一遍（WebKit 上还会等全部图片 load），选择器按钮上的字体也要在克隆里再解析
 * 一遍 —— 首访「生成中…」的几分钟大半花在这儿。
 * <head> 要留下：那是克隆文档里唯一的 @font-face 来源，丢了卡片就没字体。
 */
export function buildIgnoreElements(card: Element | null): (element: Element) => boolean {
  return (element: Element): boolean => {
    if (!card) return false;
    if (typeof element.closest === 'function' && element.closest('head')) return false;
    return !(card.contains(element) || element.contains(card));
  };
}

// ─── 按摘录文字做字体子集化 ───────────────────────────────────────────────────
// 首访慢的根子是「下载整套字体」：最大的一款 7.4MB，按实测慢网 180KB/s 就是 41s。
// 服务端（functions/api/fonts/subset.ts）只按这段摘录用到的字返回子集
// （十几~几十 KB），客户端把它包成 @font-face 注入。
// 任何一环失败都返回 null，调用方退回整套字体 —— 失败必须是「跟修复前一样」，不是报错。

/** 子集请求的等待上限：超了就退回整套字体，绝不让按钮一直停在「生成中…」。 */
export const SUBSET_TIMEOUT_MS = 4_000;

/** 注入的 <style> 用这个属性标记，方便替换/清理。 */
const SUBSET_STYLE_ATTR = 'data-share-subset-font';

/** 子集字体族名：与整款字体分开命名，缺字时才能逐级兜底到系统字体。 */
export function subsetFamily(face: string): string {
  return `ShareSub-${face}`;
}

/**
 * 卡片里用所选字体渲染的全部文字：正文 + 前后那两个引号。
 * 引号是单独 <span> 里的 \u201c / \u201d，很容易漏 —— 漏了它们，
 * 导出图里的引号是兜底字体的形状，跟正文对不上。
 */
export function collectCardText(quoteText: string): string {
  return `\u201c${quoteText}\u201d`;
}

/** 子集的 format()：跟着服务端 Content-Type 走，别把 .otf 说成 truetype。 */
function fontFormat(contentType: string | null): 'truetype' | 'opentype' {
  return contentType && contentType.includes('otf') ? 'opentype' : 'truetype';
}

/**
 * 清掉注入的子集 @font-face 并释放它的 blob URL。
 * 刻意不按族名过滤：换字体时旧族名的 <style> 也得清，否则那份 blob 一直挂着。
 */
export function clearSubsetFont(): void {
  if (typeof document === 'undefined') return;
  for (const style of Array.from(document.querySelectorAll(`style[${SUBSET_STYLE_ATTR}]`))) {
    const objectUrl = /url\("([^"]+)"\)/.exec(style.textContent ?? '')?.[1];
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* 已经释放过了 */
      }
    }
    style.remove();
  }
}

export interface SubsetFont {
  /** 注入 @font-face 用的族名。 */
  family: string;
  /** 子集字节，十几~几十 KB。 */
  blob: Blob;
  /** @font-face 的 format() 值。 */
  format: 'truetype' | 'opentype';
}

/**
 * 拉当前摘录的字体子集；失败 / 超时 / 非 2xx 一律返回 null。
 *
 * 刻意只负责「拿到字节」，不碰 DOM：拉取是异步的，用户可能在它落地前就换了字体，
 * 如果这里顺手注入，迟到的响应会把新字体的 @font-face 冲掉（而且是在谁也看不见的
 * 角落），卡片就静默退化成系统字体。注入交给调用方在「确认这次结果还算数」时做。
 */
export async function fetchSubsetFont(
  face: string,
  text: string,
  timeoutMs: number = SUBSET_TIMEOUT_MS,
): Promise<SubsetFont | null> {
  if (face === 'system') return null;
  if (typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const query = `face=${encodeURIComponent(face)}&text=${encodeURIComponent(text)}`;
    const response = await fetch(`/api/fonts/subset?${query}`, {
      signal: controller.signal,
      headers: { Accept: 'font/ttf, font/otf' },
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.size === 0) return null;

    return {
      family: subsetFamily(face),
      blob,
      format: fontFormat(response.headers.get('Content-Type')),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 把子集注入成一条真正的 @font-face 规则，并等它可用。
 *
 * 用 <style> 而不是 new FontFace() + document.fonts.add()：html2canvas 是把
 * document.styleSheets 里的 @font-face 搬进克隆文档的，注册在 FontFaceSet 里
 * 的字体不在样式表里，克隆文档看不到 —— 导出图会静默退化成兜底字体，
 * 而预览看起来完全正常，这是最难查的一类坏法。
 */
export async function applySubsetFont(subset: SubsetFont, text: string): Promise<void> {
  if (typeof document === 'undefined') return;

  clearSubsetFont();
  const objectUrl = URL.createObjectURL(subset.blob);
  const style = document.createElement('style');
  style.setAttribute(SUBSET_STYLE_ATTR, subset.family);
  style.textContent =
    `@font-face{font-family:"${subset.family}";src:url("${objectUrl}")` +
    ` format("${subset.format}");font-display:block}`;
  document.head.appendChild(style);

  // @font-face 是懒加载的：真正 load 一次才确保用的时候字形已经在。
  const fonts = documentFonts();
  if (fonts && typeof fonts.load === 'function') {
    await fonts.load(`${PROBE_SIZE} "${subset.family}"`, text);
  }
}

/**
 * 把克隆文档里卡片的字体栈钉成 family。
 *
 * 为什么不靠 React 状态：handleSave 里可能刚 await 完子集就立刻截图，
 * 这时候 setState 还没渲染，克隆文档拿到的仍是旧字体栈 —— 导出的图会静默
 * 退化成兜底字体。这里直接改克隆 DOM，导出结果与渲染时序无关。
 * 注意卡片里带字体的元素各自有 inline font-family，必须逐个覆盖。
 */
export function applyCardFont(root: Document | Element, family: string): void {
  for (const node of Array.from(root.querySelectorAll('[data-share-card-font]'))) {
    (node as HTMLElement).style.fontFamily = family;
  }
}

export const STICKER_HOST_ATTR = 'data-share-sticker';

/**
 * 把贴纸里继承自 CSS 的 currentColor 换成具体颜色。
 *
 * 贴纸 SVG 用的是 fill="currentColor"（或内部 <style> 里的 fill: currentColor），
 * 在页面上靠 CSS 继承拿卡片文字色。但 html2canvas 会把 <svg> 单独序列化成
 * data: URL 当图片画，脱离了页面 CSS —— currentColor 只能退回初始值黑色，
 * 深色主题下导出的贴纸就是一团黑。颜色必须提前烤进 markup。
 */
export function bakeStickerColor(markup: string, color: string): string {
  return markup.replace(/currentColor/g, color);
}

/**
 * 把贴纸 SVG 钉在克隆文档上，理由和 applyCardFont 一样：handleSave 里可能刚
 * 拿到贴纸就立刻截图，setState 还没渲染，克隆里那张是空的 —— 图会静默少一个贴纸。
 * markup 为 null（没选贴纸 / chunk 没拉到）时清空，让「没贴纸」也是一种确定结果。
 * color 必传：贴纸的颜色就靠它，漏传会退回黑色，在深色主题上几乎看不见。
 */
export function applyCardSticker(
  root: Document | Element,
  markup: string | null,
  color: string,
): void {
  const host = root.querySelector(`[${STICKER_HOST_ATTR}]`);
  if (host) host.innerHTML = markup ? bakeStickerColor(markup, color) : '';
}

/** 注入克隆文档的补丁样式用这个属性标记，方便测试和排查。 */
export const CLONE_COLOR_STYLE_ATTR = 'data-share-clone-color';

/**
 * 给克隆文档的 body 钉一个能解析的 color。
 *
 * html2canvas 1.x 的颜色解析只认 rgb / rgba / hsl / hex，碰到 CSS Color 4 的
 * oklch / oklab 会直接抛「Attempting to parse an unsupported color function」，
 * 整张图都出不来。
 *
 * 中招的是渲染根：截的是 cardRef 那层 wrapper，它自己没写 color，继承的是 body 的
 * text-foreground —— theme.css 的 shadcn base 层里那是 oklch(0.145 0 0)。
 * html2canvas 解析根元素的计算样式时第一个就撞上它（color / text-decoration-color /
 * -webkit-text-stroke-color 都是这个继承值）。卡片内部每个元素都写死了 hex，
 * 所以把克隆里 body 的颜色换成一个能解析的值就行，出图结果不变。
 */
export function applyCloneSafeColors(doc: Document, color: string): void {
  const style = doc.createElement('style');
  style.setAttribute(CLONE_COLOR_STYLE_ATTR, '');
  // 不放进 @layer：无层级规则优先于 theme.css 的 @layer base，不用 !important。
  style.textContent = `body{color:${color}}`;
  doc.head.appendChild(style);
}
