/**
 * 「读完」角标的显示规则。
 *
 * 状态不单独存一个字段：`finishedAt` 有值就是已读完，没值就是正在阅读。
 * 所以这里既没有按书覆盖、也没有全局默认——一份文案一份颜色，封面上画的
 * 和详情页按钮用的是同一个值，不会出现「设置里选了 A、书封上画的是 B」。
 *
 * 角标**只在已读完时画**。正在阅读不给封面加东西：否则书架上每本没读完的书
 * 都得顶一块角标，「只有读完才有标记」这件事就不成立了。正在阅读只体现在
 * 详情页按钮的状态和分类页的筛选条上。
 */
import type { Book } from './types';

/** 角标文案。 */
export const FINISHED_LABEL_TEXT = '读完';

/** 角标底色（不透明 hex）。画到封面上时才转半透明，色值和浓淡同源。 */
export const FINISHED_LABEL_COLOR = '#E2A13C';

/** 角标字色。 */
export const FINISHED_LABEL_TEXT_COLOR = '#FFFFFF';

/** 角标底色不透明度：留一点透，压在书封上不至于像贴了块实心胶布。 */
export const FINISHED_LABEL_BG_ALPHA = 0.8;

export interface FinishedLabelStyle {
  text: string;
  /** 已经带上 `FINISHED_LABEL_BG_ALPHA` 透明度的 CSS 颜色，直接拿去当 background */
  bg: string;
  fg: string;
}

/** #RRGGBB → rgba(r, g, b, alpha)。 */
export function withAlpha(hex: string, alpha: number = FINISHED_LABEL_BG_ALPHA): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 角标长什么样。跟「哪本书」无关，所以就是一份常量。
 * 详情页那个开关也用它：未读完时边框和圆点取的就是「点下去会变成的颜色」，
 * 不用回头去书架上确认。
 */
export const FINISHED_LABEL_STYLE: FinishedLabelStyle = {
  text: FINISHED_LABEL_TEXT,
  bg: withAlpha(FINISHED_LABEL_COLOR),
  fg: FINISHED_LABEL_TEXT_COLOR,
};

/** 这本书算不算读完。空串/null/undefined 一律算没读完。 */
export function isBookFinished(book: Pick<Book, 'finishedAt'>): boolean {
  return !!book.finishedAt;
}

/** 封面右上角该画什么：没标记读完返回 null，调用方据此不渲染。 */
export function resolveBookLabel(book: Pick<Book, 'finishedAt'>): FinishedLabelStyle | null {
  return isBookFinished(book) ? FINISHED_LABEL_STYLE : null;
}
