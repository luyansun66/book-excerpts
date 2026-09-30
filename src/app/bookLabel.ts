/**
 * 「读完」角标的纯逻辑。
 *
 * 角标是纯手动开关：`finishedAt` 有值才画。文案和颜色都可以**按书覆盖**，
 * 没覆盖就落到全局默认（设置页改），再没有才落到这里的常量。
 *
 * 单独抽出来是因为三个地方要用同一份判断：书架封面、分类网格封面、详情页开关。
 * 颜色只给 6 个预设、不做自由取色，所以这里同时是「选色板」的唯一数据源——
 * 色块和封面上的角标从同一个 `bg`/`fg` 取色，不会出现选了 A 却画出 B。
 */
import type { Book } from './types';

export interface FinishedLabelDefaults {
  text: string;
  /** 取 `FINISHED_LABEL_PRESETS` 里的 `bg` */
  color: string;
}

export interface FinishedLabelStyle {
  text: string;
  /** 已经带上 `FINISHED_LABEL_BG_ALPHA` 透明度的 CSS 颜色，直接拿去当 background */
  bg: string;
  fg: string;
}

/**
 * 6 个预设色。这里存的是**不透明** hex：它是入库的那个值，也是选中态的比对依据，
 * 画到封面上时才由 withAlpha 转成半透明（见 FINISHED_LABEL_BG_ALPHA）。
 */
export const FINISHED_LABEL_PRESETS = [
  { name: '琥珀', bg: '#E2A13C' },
  { name: '朱砂', bg: '#B8483C' },
  { name: '松绿', bg: '#3F6B52' },
  { name: '黛蓝', bg: '#3C5A7A' },
  { name: '藕荷', bg: '#7E5570' },
  { name: '墨玉', bg: '#3A3229' },
] as const;

/** 角标字色，六个预设统一用白。 */
export const FINISHED_LABEL_TEXT_COLOR = '#FFFFFF';

/** 角标底色不透明度：留一点透，压在书封上不至于像贴了块实心胶布。 */
export const FINISHED_LABEL_BG_ALPHA = 0.8;

/** #RRGGBB → rgba(r, g, b, alpha)。同一个色号在色板和角标上是同一种颜色，只是浓淡不同。 */
export function withAlpha(hex: string, alpha: number = FINISHED_LABEL_BG_ALPHA): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DEFAULT_FINISHED_LABEL_TEXT = '读完';

/** 默认色就是第一个预设（琥珀），设置页里那份「没选过」也指到它。 */
export const DEFAULT_FINISHED_LABEL_COLOR: string = FINISHED_LABEL_PRESETS[0].bg;

/**
 * 角标文案最多 4 个字。书架封面 94px 宽，4 个字刚好占掉约六成；
 * 再长就得靠省略号截断，不如在输入框就卡住。
 */
export const MAX_LABEL_TEXT_LENGTH = 4;

/** 只去首尾空白；空串一律当作「没写」，由调用方决定回落到哪一层。 */
export function normalizeLabelText(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** 文案截断到上限，输入框和导入数据都走这里，免得角标被撑破。 */
export function clampLabelText(raw: string): string {
  return normalizeLabelText(raw).slice(0, MAX_LABEL_TEXT_LENGTH);
}

function findPreset(color: string | null | undefined) {
  return FINISHED_LABEL_PRESETS.find((p) => p.bg === color) ?? null;
}

/** 按书的覆盖 → 全局默认 → 内置默认，收敛到一个已知预设。 */
function resolvePreset(
  book: Pick<Book, 'label'>,
  defaults: FinishedLabelDefaults,
): (typeof FINISHED_LABEL_PRESETS)[number] {
  return findPreset(book.label?.color) ?? findPreset(defaults.color) ?? FINISHED_LABEL_PRESETS[0];
}

/** 这个色是不是预设之一（用来判断书上的颜色是不是用户自己塞进来的野值）。 */
export function isPresetLabelColor(color: string | null | undefined): boolean {
  return findPreset(color) !== null;
}

const BUILTIN_DEFAULTS: FinishedLabelDefaults = {
  text: DEFAULT_FINISHED_LABEL_TEXT,
  color: DEFAULT_FINISHED_LABEL_COLOR,
};

/**
 * 只看文案与配色，不看有没有读完：把「按书覆盖 → 全局默认 → 常量」三层
 * 收敛成一个具体样式。颜色不是预设里的值时退回默认色，而不是按原样画——
 * 不认识的色多半是坏数据，与其画一块读不清的角标，不如回到已知可读的那个。
 *
 * 详情页那个开关也要这份配色（未读完时它显示的是「点下去会变成的颜色」），
 * 所以单独暴露出来，由 resolveBookLabel 负责再加一层「有没有读完」的判断。
 */
export function resolveLabelStyle(
  book: Pick<Book, 'label'>,
  defaults: FinishedLabelDefaults = BUILTIN_DEFAULTS,
): FinishedLabelStyle {
  const text =
    clampLabelText(book.label?.text ?? '') ||
    clampLabelText(defaults.text) ||
    DEFAULT_FINISHED_LABEL_TEXT;
  const preset = resolvePreset(book, defaults);

  return { text, bg: withAlpha(preset.bg), fg: FINISHED_LABEL_TEXT_COLOR };
}

/** 这本书的角标该长什么样：没标记读完返回 null，调用方据此不渲染。 */
export function resolveBookLabel(
  book: Pick<Book, 'finishedAt' | 'label'>,
  defaults: FinishedLabelDefaults = BUILTIN_DEFAULTS,
): FinishedLabelStyle | null {
  if (!book.finishedAt) return null;
  return resolveLabelStyle(book, defaults);
}

/** 角标是否该显示——只跟「有没有标记读完」有关，与文案颜色无关。 */
export function isBookFinished(book: Pick<Book, 'finishedAt'>): boolean {
  return !!book.finishedAt;
}
