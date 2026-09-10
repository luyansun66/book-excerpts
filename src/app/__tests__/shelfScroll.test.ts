/**
 * @vitest-environment jsdom
 * 书架横向滚动的两条硬约束：
 * 1. 箭头翻页必须停在合法吸附位，不能停在"第一个格子空了"的半路；
 * 2. 全局的右滑返回拦截不能把书架的横向拖动一起压掉。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SHELF_COVER_STRIDE,
  SHELF_SIDE_PADDING,
  isInsideHorizontalScroller,
  measureShelfSnapOffsets,
  normalizeSnapOffsets,
  pickShelfScrollTarget,
  shelfTrailingSlack,
} from '../shelfScroll';

/** 复刻 ShelfRow 的布局：每本书占 148px，左右各 18px 内边距 */
function shelf(bookCount: number, viewport: number) {
  const contentWidth = SHELF_COVER_STRIDE * bookCount - SHELF_SIDE_PADDING;
  const maxScroll = Math.max(0, contentWidth - viewport);
  const snapOffsets = Array.from({ length: bookCount }, (_, i) => i * SHELF_COVER_STRIDE);
  return { maxScroll, snapOffsets };
}

function step(current: number, direction: 1 | -1, bookCount: number, viewport: number) {
  const { maxScroll, snapOffsets } = shelf(bookCount, viewport);
  return pickShelfScrollTarget({ current, direction, viewport, snapOffsets, maxScroll });
}

describe('normalizeSnapOffsets', () => {
  it('补上 0 和滚动末端，丢掉越界项', () => {
    expect(normalizeSnapOffsets([0, 148, 296], 144)).toEqual([0, 144]);
    expect(normalizeSnapOffsets([0, 148, 296, 444], 440)).toEqual([0, 148, 296, 440]);
  });

  it('去重并升序', () => {
    expect(normalizeSnapOffsets([296, 0, 148, 148, 0], 296)).toEqual([0, 148, 296]);
  });

  it('没有可滚动距离时只剩 0', () => {
    expect(normalizeSnapOffsets([0, 148], 0)).toEqual([0]);
  });
});

describe('pickShelfScrollTarget', () => {
  it('3 的倍数本书：一屏一屏走到末端再走回来', () => {
    expect(step(0, 1, 9, 430)).toBe(444);
    expect(step(444, 1, 9, 430)).toBe(884);
    expect(step(884, 1, 9, 430)).toBe(884);
    expect(step(884, -1, 9, 430)).toBe(444);
    expect(step(444, -1, 9, 430)).toBe(0);
    expect(step(0, -1, 9, 430)).toBe(0);
  });

  it('4 本书（不是 3 的倍数）：右翻到底、左翻回 0，不会停在中途', () => {
    expect(step(0, 1, 4, 430)).toBe(144);
    expect(step(144, -1, 4, 430)).toBe(0);
    expect(step(0, -1, 4, 430)).toBe(0);
  });

  it('6 本书：右翻落到末端，左翻回 0', () => {
    expect(step(0, 1, 6, 430)).toBe(440);
    expect(step(440, -1, 6, 430)).toBe(0);
  });

  it('1 至 12 本书来回翻都不会越界，也都停在合法位置', () => {
    for (let n = 1; n <= 12; n += 1) {
      const viewport = 430;
      const { maxScroll, snapOffsets } = shelf(n, viewport);
      const legal = new Set(normalizeSnapOffsets(snapOffsets, maxScroll));
      let current = 0;
      for (let i = 0; i < 20; i += 1) {
        current = pickShelfScrollTarget({ current, direction: 1, viewport, snapOffsets, maxScroll });
        expect(current).toBeGreaterThanOrEqual(0);
        expect(current).toBeLessThanOrEqual(maxScroll);
        expect(legal.has(current)).toBe(true);
      }
      // 一路右翻到底后，最后一本书必须完整露出来
      if (maxScroll > 0) {
        const lastBookRight = 18 + SHELF_COVER_STRIDE * (n - 1) + 94;
        expect(current + viewport).toBeGreaterThanOrEqual(lastBookRight);
      }
      for (let i = 0; i < 20; i += 1) {
        current = pickShelfScrollTarget({ current, direction: -1, viewport, snapOffsets, maxScroll });
        expect(legal.has(current)).toBe(true);
      }
      expect(current).toBe(0);
    }
  });

  it('翻回第一屏后，第一本书的左缘正好贴内容左边距', () => {
    const { maxScroll, snapOffsets } = shelf(4, 430);
    const target = pickShelfScrollTarget({ current: maxScroll, direction: -1, viewport: 430, snapOffsets, maxScroll });
    // 封面 0 的静态位置是 18px（paddingLeft），scrollLeft 归零即对齐
    expect(target).toBe(0);
  });
});

describe('shelfTrailingSlack', () => {
  it('补白之后滚动末端正好落在吸附位上', () => {
    for (let n = 1; n <= 12; n += 1) {
      for (const viewport of [390, 414, 430, 460, 500, 540]) {
        const contentWidth = SHELF_COVER_STRIDE * n - SHELF_SIDE_PADDING;
        const slack = shelfTrailingSlack(contentWidth, viewport);
        const maxScroll = contentWidth + slack - viewport;
        if (maxScroll <= 0) {
          expect(slack).toBe(0);
          continue;
        }
        expect(maxScroll % SHELF_COVER_STRIDE).toBe(0);
        expect(slack).toBeLessThan(SHELF_COVER_STRIDE);
      }
    }
  });

  it('内容装得下时不留白', () => {
    expect(shelfTrailingSlack(SHELF_COVER_STRIDE * 2, 430)).toBe(0);
    expect(shelfTrailingSlack(574, 600)).toBe(0);
  });

  it('4 本书在 460px 屏上补 34px，滑到底时第一本回到内容左边距', () => {
    const contentWidth = SHELF_COVER_STRIDE * 4 - SHELF_SIDE_PADDING; // 574
    const slack = shelfTrailingSlack(contentWidth, 460);
    expect(slack).toBe(34);
    const maxScroll = contentWidth + slack - 460; // 148
    expect(maxScroll).toBe(SHELF_COVER_STRIDE);
    // 第二本书的静态位置是 18 + 148 = 166，减掉 148 正好回到 18
    expect(SHELF_SIDE_PADDING + SHELF_COVER_STRIDE - maxScroll).toBe(SHELF_SIDE_PADDING);
  });
});

describe('measureShelfSnapOffsets', () => {
  it('用文案实测位置换算成吸附位', () => {
    const covers = [
      { left: 18 },
      { left: 166 },
      { left: 314 },
    ];
    const container = {
      scrollLeft: 60,
      getBoundingClientRect: () => ({ left: 10 }),
      querySelectorAll: () => covers.map((c) => ({ getBoundingClientRect: () => ({ left: c.left }) })),
    } as unknown as HTMLElement;

    // origin = 10 - 60 = -50；吸附位 = coverLeft - origin - 18
    expect(measureShelfSnapOffsets(container)).toEqual([18, 166, 314].map((l) => l + 50 - 18));
  });
});

describe('isInsideHorizontalScroller', () => {
  function scroller(width: number, scrollWidth: number) {
    const el = document.createElement('div');
    el.style.overflowX = 'auto';
    Object.defineProperty(el, 'clientWidth', { value: width });
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth });
    return el;
  }

  it('触点落在可横向滚动的容器里就放行', () => {
    const shelfEl = scroller(430, 574);
    const cover = document.createElement('div');
    shelfEl.appendChild(cover);
    document.body.appendChild(shelfEl);
    expect(isInsideHorizontalScroller(cover)).toBe(true);
  });

  it('普通内容（含只纵向滚动的）不豁免', () => {
    const plain = document.createElement('div');
    const inner = document.createElement('span');
    plain.appendChild(inner);
    document.body.appendChild(plain);
    expect(isInsideHorizontalScroller(inner)).toBe(false);

    const vertical = document.createElement('div');
    vertical.style.overflowX = 'hidden';
    Object.defineProperty(vertical, 'clientWidth', { value: 430 });
    Object.defineProperty(vertical, 'scrollWidth', { value: 900 });
    const child = document.createElement('span');
    vertical.appendChild(child);
    document.body.appendChild(vertical);
    expect(isInsideHorizontalScroller(child)).toBe(false);
  });

  it('overflow-x:auto 但没得滚也不算', () => {
    const noOverflow = scroller(430, 430);
    const child = document.createElement('span');
    noOverflow.appendChild(child);
    document.body.appendChild(noOverflow);
    expect(isInsideHorizontalScroller(child)).toBe(false);
  });
});

describe('App.tsx 接线', () => {
  const source = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

  it('全局右滑拦截放行横向滚动容器', () => {
    expect(source).toMatch(/deltaX > 5 && !isInsideHorizontalScroller\(e\.target\)/);
  });

  it('书架保持吸附对齐：封面标记 + scroll-snap + 左内边距', () => {
    expect(source).toContain('data-shelf-cover');
    expect(source).toContain("scrollSnapType: 'x mandatory'");
    expect(source).toContain('scrollPaddingLeft: SHELF_SIDE_PADDING');
    expect(source).toContain('paddingLeft: SHELF_SIDE_PADDING');
  });

  it('右侧补白用 shelfTrailingSlack，滑到底也停在吸附位', () => {
    expect(source).toContain('paddingRight: SHELF_SIDE_PADDING + trailingSlack');
    expect(source).toContain('shelfTrailingSlack(');
  });

  it('箭头翻页走 pickShelfScrollTarget，不再用写死的固定步长', () => {
    expect(source).toContain('pickShelfScrollTarget({');
    expect(source).not.toMatch(/scrollBy\(\{\s*left: direction \* \(COVER_W \+ 6\) \* 3/);
  });
});
