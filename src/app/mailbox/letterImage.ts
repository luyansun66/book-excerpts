// ─── 引言卡 → 图片 ─────────────────────────────────────────────────────────────
// 把 generateLetterSvg 产出的 SVG 直接光栅化成 PNG：
//   1. 把 SVG 里引用的外链资源（@font-face 的 woff2、底图 bg01.jpg）内联成 data URI
//      —— SVG 作为 <img> 加载时不会请求外链，必须内联，否则丢字/丢底图
//   2. <img> → <canvas> → toBlob('image/png')
// 字体被烘焙进图片，保存/分享到任何设备都能保持设计稿的样子。

export const LETTER_WIDTH = 1021.9;
export const LETTER_HEIGHT = 1527.7;

/** 卡片用到的外链资源，用于提前预热；实际内联以 SVG 中出现的引用为准。 */
export const LETTER_ASSET_URLS = [
  '/fonts/华康宋体W3-P.woff2',
  '/fonts/Georgia-Bold.woff2',
  '/fonts/Georgia-Italic.woff2',
  '/fonts/TrebuchetMS.woff2',
  '/assets/bg01.jpg',
] as const;

/** 站内资源引用：/fonts/… 与 /assets/… */
const ASSET_REF_RE = /\/(?:fonts|assets)\/[^"'()\s]+/g;

/** 资源地址 → data URI 的解析器；默认走 fetch，测试可注入。 */
export type AssetResolver = (url: string) => Promise<string>;

const MIME_BY_EXT: Record<string, string> = {
  woff2: 'font/woff2',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function mimeFromUrl(url: string): string {
  const ext = url.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      comma >= 0 ? resolve(result.slice(comma + 1)) : reject(new Error('data URL 解析失败'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('资源读取失败'));
    reader.readAsDataURL(blob);
  });
}

const assetCache = new Map<string, Promise<string>>();

/** 带缓存的默认解析器：按 MIME + base64 包装成 data URI。 */
export const fetchAssetAsDataUri: AssetResolver = (url) => {
  const cached = assetCache.get(url);
  if (cached) return cached;
  const task = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`资源加载失败：${url} (${res.status})`);
    const blob = await res.blob();
    const mime = blob.type || mimeFromUrl(url);
    return `data:${mime};base64,${await blobToBase64(blob)}`;
  })();
  assetCache.set(url, task);
  task.catch(() => assetCache.delete(url)); // 失败不缓存，允许重试
  return task;
};

/** 列出 SVG 中引用的全部站内资源地址（去重）。 */
export function collectAssetUrls(svg: string): string[] {
  return [...new Set(svg.match(ASSET_REF_RE) ?? [])];
}

/** 把 SVG 里的外链字体与底图替换成 data URI。 */
export async function inlineLetterAssets(
  svg: string,
  resolve: AssetResolver = fetchAssetAsDataUri,
): Promise<string> {
  const urls = collectAssetUrls(svg);
  if (urls.length === 0) return svg;

  const resolved = await Promise.all(urls.map((url) => resolve(url)));
  const byUrl = new Map(urls.map((url, i) => [url, resolved[i]]));

  return svg.replace(ASSET_REF_RE, (match) => byUrl.get(match) ?? match);
}

/** SVG 字符串 → <img> 可直接加载的 data URL。 */
export function buildSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('引言卡图片解码失败'));
    img.decoding = 'async';
    img.src = src;
  });
}

/** 内联资源后解码，返回可绘制的图片元素。 */
export async function loadLetterImage(
  svg: string,
  resolve: AssetResolver = fetchAssetAsDataUri,
): Promise<HTMLImageElement> {
  const inlined = await inlineLetterAssets(svg, resolve);
  return loadImageElement(buildSvgDataUrl(inlined));
}

export interface RasterizeOptions {
  /** 输出倍率，默认取设备像素比（封顶 3）。 */
  scale?: number;
  resolve?: AssetResolver;
}

/** SVG 字符串 → PNG Blob。 */
export async function rasterizeLetter(svg: string, options: RasterizeOptions = {}): Promise<Blob> {
  const { scale, resolve } = options;
  const img = await loadLetterImage(svg, resolve);

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const ratio = Math.min(scale ?? dpr, 3);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LETTER_WIDTH * ratio);
  canvas.height = Math.round(LETTER_HEIGHT * ratio);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolveBlob, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolveBlob(blob) : reject(new Error('图片生成失败'))),
      'image/png',
    );
  });
}

/** 触发浏览器下载。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 每日书签图片文件名，如 折角书摘-47-2026-09-09.png。 */
export function letterImageFilename(number: number, dateKey: string): string {
  return `折角书摘-${number}-${dateKey}.png`;
}
