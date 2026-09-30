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
  bg: string;
  fg: string;
}

/**
 * 6 个预设色。每项都把底色和字色成对给出，而不是只存底色再去算——
 * 亮底的「琥珀」配深字才读得清，其余深底配浅字；写死在调色板里比运行时
 * 猜对比度可靠，也方便测试逐个断言。
 */
export const FINISHED_LABEL_PRESETS = [
  { name: '琥珀', bg: '#E2A13C', fg: '#4A3413' },
  { name: '朱砂', bg: '#B8483C', fg: '#FFF3EC' },
  { name: '松绿', bg: '#3F6B52', fg: '#F1F7F0' },
  { name: '黛蓝', bg: '#3C5A7A', fg: '#EFF4FA' },
  { name: '藕荷', bg: '#7E5570', fg: '#FAF0F6' },
  { name: '墨玉', bg: '#3A3229', fg: '#F5EFE0' },
] as const;

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

/** 这个色是不是预设之一（用来判断书上的颜色是不是用户自己塞进来的野值）。 */
export function isPresetLabelColor(color: string | null | undefined): boolean {
  return findPreset(color) !== null;
}

/**
 * 这本书的角标该长什么样：没标记读完返回 null（调用方据此不渲染），
 * 否则把「按书覆盖 → 全局默认 → 常量」三层收敛成一个具体样式。
 * 颜色不是预设里的值时退回默认色，而不是按原样画——不认识的色多半是坏数据，
 * 与其画一块读不清的角标，不如回到已知可读的那个。
 */
export function resolveBookLabel(
  book: Pick<Book, 'finishedAt' | 'label'>,
  defaults: FinishedLabelDefaults = {
    text: DEFAULT_FINISHED_LABEL_TEXT,
    color: DEFAULT_FINISHED_LABEL_COLOR,
  },
): FinishedLabelStyle | null {
  if (!book.finishedAt) return null;

  const text =
    clampLabelText(book.label?.text ?? '') ||
    clampLabelText(defaults.text) ||
    DEFAULT_FINISHED_LABEL_TEXT;
  const preset = findPreset(book.label?.color) ?? findPreset(defaults.color) ?? FINISHED_LABEL_PRESETS[0];

  return { text, bg: preset.bg, fg: preset.fg };
}

/** 角标是否该显示——只跟「有没有标记读完」有关，与文案颜色无关。 */
export function isBookFinished(book: Pick<Book, 'finishedAt'>): boolean {
  return !!book.finishedAt;
}
