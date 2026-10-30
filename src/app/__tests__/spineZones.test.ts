import { describe, expect, it } from 'vitest';
import type { SpineArt } from '../shelf/spine/art';
import { freeSpans, safeSpans, titleZone, unitsPerPx, zoneLengthPx } from '../shelf/spine/zones';
import { SPINE_TEXT_EDGE_PX, SPINE_TITLE_GAP_PX } from '../shelf/spine/shared';

/** 只关心沿长轴的量，其余字段填不影响运算的值 */
function art(height: number, decor: Array<[number, number]>): SpineArt {
  return { height, width: 27, decor } as unknown as SpineArt;
}

const LENGTH = 145;

describe('spine zones', () => {
  it('把图案从书脊全长里挖掉，得到升序、互不相邻的空白区', () => {
    expect(freeSpans(art(100, [[30, 50], [80, 100]]))).toEqual([
      { start: 0, end: 30 },
      { start: 50, end: 80 },
    ]);
    expect(freeSpans(art(100, []))).toEqual([{ start: 0, end: 100 }]);
  });

  it('重叠的图案段按并集处理，不会把中间那段当成空白', () => {
    expect(freeSpans(art(100, [[30, 60], [50, 70]]))).toEqual([{ start: 0, end: 30 }, { start: 70, end: 100 }]);
  });

  it('空白区两头按绝对像素退边距，靠图案那头再退固定间距', () => {
    const design = art(LENGTH, [[60, 100]]);
    const span = safeSpans(design, LENGTH)[0];
    expect(span.start).toBeCloseTo(SPINE_TEXT_EDGE_PX, 6);
    expect(span.end).toBeCloseTo(60 - SPINE_TITLE_GAP_PX, 6);
  });

  it('书脊变短时边距还是那些像素，安全区跟着短', () => {
    const design = art(LENGTH, [[60, 100]]);
    const longer = safeSpans(design, LENGTH)[0];
    const shorter = safeSpans(design, 120)[0];
    const unit = unitsPerPx(design, 120);
    expect(shorter.start / unit).toBeCloseTo(SPINE_TEXT_EDGE_PX, 6);
    expect((60 - shorter.end) / unit).toBeCloseTo(SPINE_TITLE_GAP_PX, 6);
    expect(zoneLengthPx(design, 120, shorter)).toBeLessThan(zoneLengthPx(design, LENGTH, longer));
  });

  it('退完不剩什么的碎块直接丢掉', () => {
    // 图案铺到离书脊尾端只剩 5px：退掉边距和间距之后是负数，这段不值得排书名
    const design = art(LENGTH, [[0, 140]]);
    expect(safeSpans(design, LENGTH)).toHaveLength(0);
  });

  it('居中模版：以书脊中点为心取最大的对称区间，中点一定在区间里', () => {
    const design = art(LENGTH, [[134, 138]]);
    const zone = titleZone(design, LENGTH, 'center');
    expect(zone.anchor).toBe('center');
    expect((zone.span.start + zone.span.end) / 2).toBeCloseTo(LENGTH / 2, 6);
    // 靠图案那头退到固定间距为止，另一头由对称性决定
    expect(zone.span.end).toBeCloseTo(134 - SPINE_TITLE_GAP_PX, 6);
    expect(zone.span.start).toBeCloseTo(LENGTH / 2 - (134 - SPINE_TITLE_GAP_PX - LENGTH / 2), 6);
  });

  it('居中模版没有图案时，安全区就是「退掉上下边距」的那一段', () => {
    const zone = titleZone(art(LENGTH, []), LENGTH, 'center');
    expect(zone.span.start).toBeCloseTo(SPINE_TEXT_EDGE_PX, 6);
    expect(zone.span.end).toBeCloseTo(LENGTH - SPINE_TEXT_EDGE_PX, 6);
  });

  it('避让模版：图案在下方时贴安全区下沿，图案在上方时贴上沿', () => {
    const below = titleZone(art(LENGTH, [[80, 130]]), LENGTH, 'avoid');
    expect(below.anchor).toBe('end');
    expect(below.span.end).toBeCloseTo(80 - SPINE_TITLE_GAP_PX, 6);

    const above = titleZone(art(LENGTH, [[20, 70]]), LENGTH, 'avoid');
    expect(above.anchor).toBe('start');
    expect(above.span.start).toBeCloseTo(70 + SPINE_TITLE_GAP_PX, 6);
  });

  it('避让模版：上下都有图案时摆在中间的空白区里', () => {
    const zone = titleZone(art(LENGTH, [[4, 24], [126, 130]]), LENGTH, 'avoid');
    expect(zone.anchor).toBe('center');
    expect(zone.span.start).toBeCloseTo(24 + SPINE_TITLE_GAP_PX, 6);
    expect(zone.span.end).toBeCloseTo(126 - SPINE_TITLE_GAP_PX, 6);
  });
});
