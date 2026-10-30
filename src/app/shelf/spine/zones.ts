import type { SpineArt } from './art';
import { SPINE_TEXT_EDGE_PX, SPINE_TITLE_GAP_PX } from './shared';

/**
 * 书名安全区（设计文档 §12）。
 *
 * 稿子里的图案是「沿长轴占了哪几段」，由 scripts/build-spine-art.py 从
 * design/*.svg 量出来写进 art.tsx 的 `decor`（满幅的底色和晕染不算图案）。
 * 这里只在长轴上做区间运算，产出书名可排的那一段：
 *
 *   书脊全长 ── 挖掉图案 ──→ 空白区 ── 靠首尾退边距、靠图案退间距 ──→ 安全区
 *
 * 长度全部用设计稿单位算（0 = 书脊靠上/靠左那一端，art.height = 书脊全长），
 * 只在需要像素时才除以 unitsPerPx。间距和边距是绝对像素，所以厚度变了安全区
 * 跟着微调，稿子本身不用改。
 */

/** 沿长轴的一段（设计稿单位） */
export interface Span {
  start: number;
  end: number;
}

/** 书名可排的那一段，以及块在段里靠哪边 */
export interface TitleZone {
  span: Span;
  /**
   * center = 段里居中（书名水平、垂直都居中）；
   * start / end = 贴着图案那一侧，往远离图案的那头长。
   */
  anchor: 'start' | 'end' | 'center';
}

/** 1px 折成多少设计稿单位（沿长轴） */
export function unitsPerPx(art: SpineArt, lengthPx: number): number {
  return art.height / lengthPx;
}

/** 稿子里没被图案占住的空白区，升序、互不相邻 */
export function freeSpans(art: SpineArt): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  for (const [start, end] of art.decor) {
    if (start > cursor) spans.push({ start: cursor, end: start });
    cursor = Math.max(cursor, end);
  }
  if (cursor < art.height) spans.push({ start: cursor, end: art.height });
  return spans;
}

/**
 * 空白区再退掉两条固定留白：靠书脊首尾的那边退边距，靠图案的那边退间距。
 * 退完不剩什么的碎块直接丢掉 —— 不值得为它把书名缩成蚂蚁。
 */
export function safeSpans(art: SpineArt, lengthPx: number): Span[] {
  const unit = unitsPerPx(art, lengthPx);
  const edge = SPINE_TEXT_EDGE_PX * unit;
  const gap = SPINE_TITLE_GAP_PX * unit;
  const spans: Span[] = [];
  for (const span of freeSpans(art)) {
    const start = Math.max(span.start <= 0 ? 0 : span.start + gap, edge);
    const end = Math.min(span.end >= art.height ? art.height : span.end - gap, art.height - edge);
    if (end - start > 0.5) spans.push({ start, end });
  }
  return spans;
}

function widest(spans: Span[]): Span | null {
  let best: Span | null = null;
  for (const span of spans) {
    if (!best || span.end - span.start > best.end - best.start) best = span;
  }
  return best;
}

/** 安全区的长度（px）—— 书名缩字号时用的那条「装得下的长度」 */
export function zoneLengthPx(art: SpineArt, lengthPx: number, span: Span): number {
  return ((span.end - span.start) * lengthPx) / art.height;
}

/**
 * 排一块书名的安全区。
 *
 *   · 'avoid'  —— 稿子上下有几何图形/线圈：在空白区里排，和图案各占一头 ——
 *      书名贴着图案那一侧（离图案正好 SPINE_TITLE_GAP_PX），长了往远离图案的
 *      那头长；两头都有图案（包豪斯）就摆在中间。
 *   · 'center' —— 稿子只有底色/晕染：以书脊中点为心取最大的对称区间，书名居中。
 *      中点必须落在区间里，所以「避开上下预留边距之后的中心」是构造出来的，不是巧合。
 */
export function titleZone(art: SpineArt, lengthPx: number, mode: 'avoid' | 'center'): TitleZone {
  const safe = safeSpans(art, lengthPx);
  const mid = art.height / 2;

  if (mode === 'center') {
    const host = safe.find((span) => span.start <= mid && mid <= span.end) ?? widest(safe);
    if (!host) return { span: { start: 0, end: art.height }, anchor: 'center' };
    const radius = Math.min(mid - host.start, host.end - mid);
    return { span: { start: mid - radius, end: mid + radius }, anchor: 'center' };
  }

  const host = widest(safe);
  if (!host) return { span: { start: 0, end: art.height }, anchor: 'center' };
  // 图案在空白区的哪一侧，书名就贴着哪一侧排：图案在下方的（素石、藏青、板岩……）
  // 贴空白区的下沿，图案在上方的（等高线）贴上沿，上下都有图案的（包豪斯）摆中间。
  const above = art.decor.some(([, end]) => end <= host.start + 0.5);
  const below = art.decor.some(([start]) => start >= host.end - 0.5);
  return { span: host, anchor: above && below ? 'center' : above ? 'start' : 'end' };
}
