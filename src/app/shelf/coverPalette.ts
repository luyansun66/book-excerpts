interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface ColorBucket extends RgbColor {
  count: number;
}

export interface CoverPalette {
  /** 书脊主体色 */
  base: string;
  /** 受光端，保留封面色相并略提亮 */
  top: string;
  /** 落影端，保留封面色相并略压暗 */
  bottom: string;
  /** 从封面里取出的第二醒目色 */
  accent: string;
  /** 第二醒目色的极轻量材质层 */
  accentWash: string;
  /** 能压住主体色的正文色 */
  ink: string;
  /** 作者与压印带使用的次级正文色 */
  mutedInk: string;
  /** 柱面高光 */
  highlight: string;
}

const SAMPLE_WIDTH = 36;
const SAMPLE_HEIGHT = 54;
const MIN_ALPHA = 128;
const LIGHT_INK = '#F4E9D4';
const DARK_INK = '#241E18';

const paletteByBase = new Map<string, CoverPalette>();
const palettePromises = new Map<string, Promise<CoverPalette | null>>();
const loadedPalettes = new Map<string, CoverPalette | null>();

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHex(hex: string): RgbColor {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((part) => part + part).join('')
    : normalized;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

function toHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function mix(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function colorDistance(a: RgbColor, b: RgbColor): number {
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return Math.sqrt(red * red + green * green + blue * blue);
}

function saturation(color: RgbColor): number {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max === 0 ? 0 : (max - min) / max;
}

function relativeLuminance(color: RgbColor): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

function contrastRatio(a: RgbColor, b: RgbColor): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function rgba(hex: string, alpha: number): string {
  const color = parseHex(hex);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function readableBase(base: RgbColor, ink: RgbColor): RgbColor {
  if (contrastRatio(base, ink) >= 4.5) return base;
  const target = relativeLuminance(ink) > 0.5
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };
  for (let amount = 0.08; amount <= 0.64; amount += 0.08) {
    const candidate = mix(base, target, amount);
    if (contrastRatio(candidate, ink) >= 4.5) return candidate;
  }
  return mix(base, target, 0.72);
}

/**
 * 把封面的主色变成一套完整的书脊材质色。
 *
 * 主体色不强行压黑：浅色封面保留自己的明度，文字自动换成深色；这样同一本书的
 * 正面和书脊仍是同一种纸，不会为了固定白字把所有封面都染成深棕。
 */
export function paletteFromColors(baseHex: string, accentHex?: string): CoverPalette {
  const cacheKey = `${baseHex}:${accentHex ?? ''}`;
  const cached = paletteByBase.get(cacheKey);
  if (cached) return cached;

  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const sourceBase = parseHex(baseHex);
  const accent = accentHex
    ? parseHex(accentHex)
    : mix(sourceBase, relativeLuminance(sourceBase) < 0.28 ? white : black, 0.36);
  const lightInk = parseHex(LIGHT_INK);
  const darkInk = parseHex(DARK_INK);
  const inkColor = contrastRatio(sourceBase, lightInk) >= contrastRatio(sourceBase, darkInk)
    ? lightInk
    : darkInk;
  const base = readableBase(sourceBase, inkColor);
  const ink = toHex(inkColor);
  const baseLuminance = relativeLuminance(base);
  const top = mix(base, white, baseLuminance < 0.24 ? 0.18 : 0.08);
  const bottom = mix(base, black, baseLuminance > 0.72 ? 0.11 : 0.18);

  const palette: CoverPalette = {
    base: toHex(base),
    top: toHex(top),
    bottom: toHex(bottom),
    accent: toHex(accent),
    accentWash: rgba(toHex(accent), 0.16),
    ink,
    mutedInk: ink === LIGHT_INK ? rgba(LIGHT_INK, 0.78) : rgba(DARK_INK, 0.72),
    highlight: ink === LIGHT_INK ? rgba('#FFF8E8', 0.18) : rgba('#FFFFFF', 0.34),
  };
  paletteByBase.set(cacheKey, palette);
  return palette;
}

function bucketScore(color: RgbColor, count: number, total: number): number {
  const frequency = count / total;
  const luminance = relativeLuminance(color);
  const extremePenalty = luminance < 0.025 || luminance > 0.975 ? 0.2 : 1;
  const whiteMarginPenalty = luminance > 0.93 ? 0.55 : 1;
  return frequency * (0.7 + saturation(color) * 0.85) * extremePenalty * whiteMarginPenalty;
}

/**
 * 从降采样后的 RGBA 像素提取主色与第二醒目色。
 *
 * 先按 16 级色桶聚合，避免封面上的渐变把同一片底色拆成许多很轻的候选；再给高
 * 饱和色一点权重，并压低近乎纯白、纯黑的纸边。只有全透明或没有任何可读像素时
 * 返回 null，让调用方回退到书名占位色。
 */
export function deriveCoverPalette(pixels: Uint8ClampedArray | number[]): CoverPalette | null {
  const buckets = new Map<number, ColorBucket>();
  let total = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < MIN_ALPHA) continue;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.count += 1;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
    total += 1;
  }

  if (total === 0 || buckets.size === 0) return null;

  const candidates = Array.from(buckets.values(), (bucket) => {
    const color = {
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
    };
    return {
      color,
      count: bucket.count,
      score: bucketScore(color, bucket.count, total),
    };
  }).sort((a, b) => b.score - a.score);

  const primary = candidates[0];
  const accent = candidates.find((candidate) => colorDistance(candidate.color, primary.color) >= 64)
    ?? candidates[1]
    ?? { color: primary.color };

  return paletteFromColors(toHex(primary.color), toHex(accent.color));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('cover-load-failed'));
    image.src = src;
  });
}

async function extractCoverPalette(src: string): Promise<CoverPalette | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

  try {
    const image = await loadImage(src);
    if (!image.naturalWidth || !image.naturalHeight) return null;

    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    return deriveCoverPalette(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data);
  } catch {
    // 跨域封面、已失效的 blob: 地址和旧浏览器都走占位色；书脊本身不需要因此报错。
    return null;
  }
}

/** 已完成的缓存可直接同步读取，避免切换页面回来时先闪一帧占位色。 */
export function peekCoverPalette(src: string): CoverPalette | null | undefined {
  return loadedPalettes.get(src);
}

/** 同一张封面无论同时出现在几条书脊上，只解码和采样一次。 */
export function loadCoverPalette(src: string): Promise<CoverPalette | null> {
  const loaded = loadedPalettes.get(src);
  if (loaded !== undefined) return Promise.resolve(loaded);

  const existing = palettePromises.get(src);
  if (existing) return existing;

  const request = extractCoverPalette(src).then((palette) => {
    loadedPalettes.set(src, palette);
    palettePromises.delete(src);
    if (loadedPalettes.size > 240) {
      const oldest = loadedPalettes.keys().next().value;
      if (oldest !== undefined) loadedPalettes.delete(oldest);
    }
    return palette;
  });
  palettePromises.set(src, request);
  return request;
}
