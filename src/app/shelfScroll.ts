/**
 * 书架横向滚动的位置计算。
 *
 * 书架一行里每本书占一个固定步长（封面 + 封面之间那组书脊），封面左缘与内容
 * 左边距对齐的位置就是 CSS scroll-snap 的吸附位。箭头翻页最终停在哪个
 * scrollLeft、以及"翻回来以后第一个格子空着"这类问题，都只跟这个位置有关，
 * 所以这里把它们抽成纯函数，方便回归。
 */

/** 内容区左右内边距，与 ShelfRow 的 paddingLeft / paddingRight 保持一致 */
export const SHELF_SIDE_PADDING = 18;

/** 封面尺寸，与书架 BookCover 一致；分类网格页按它换算封面内部字号 */
export const SHELF_COVER_WIDTH = 94;
export const SHELF_COVER_HEIGHT = 145;

/** 相邻两本书封面左缘之间的距离：94 封面 + 6 间距 + 42 书脊 + 6 间距 */
export const SHELF_COVER_STRIDE = 148;

export interface ShelfScrollQuery {
  /** 当前 scrollLeft */
  current: number;
  /** 1 = 向后翻，-1 = 向前翻 */
  direction: 1 | -1;
  /** 可视宽度，通常取 clientWidth */
  viewport: number;
  /** 所有吸附位（封面左缘对齐内容左边距时的 scrollLeft 值） */
  snapOffsets: number[];
  /** 最大可滚动距离 scrollWidth - clientWidth */
  maxScroll: number;
}

/**
 * 把吸附位规整成一份可用的候选列表：补上 0 和滚动末端，丢掉越界的，
 * 四舍五入去重后升序排列。滚动末端一定要在列表里 —— 否则最后一屏
 * （比如 4 本书时 maxScroll = 144）会因为吸附位 148 越界而落不到底。
 */
export function normalizeSnapOffsets(snapOffsets: number[], maxScroll: number): number[] {
  const max = Math.max(0, maxScroll);
  const set = new Set<number>([0, max]);
  for (const offset of snapOffsets) {
    if (!Number.isFinite(offset)) continue;
    const value = Math.round(offset);
    if (value >= 0 && value <= max) set.add(value);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * 箭头翻页的落点：先按"一屏"走，再吸附到最近的合法位置。
 * 结果保证在 [0, maxScroll] 内、且一定是吸附位，所以不会出现
 * 停在没有书对齐内容左边距的位置（也就是用户看到的"第一个位置空了"）。
 */
export function pickShelfScrollTarget({
  current,
  direction,
  viewport,
  snapOffsets,
  maxScroll,
}: ShelfScrollQuery): number {
  const candidates = normalizeSnapOffsets(snapOffsets, maxScroll);
  const max = Math.max(0, maxScroll);
  const desired = Math.min(Math.max(current + direction * viewport, 0), max);

  let best = candidates[0];
  for (const candidate of candidates) {
    if (Math.abs(candidate - desired) < Math.abs(best - desired) - 0.001) best = candidate;
  }
  return best;
}

/**
 * 让"滑到底"这一下也停在吸附位上所需要的右侧留白。
 *
 * 书架的滚动末端天然等于 contentWidth - viewport。它一般不是步长的整数倍，
 * 于是滑到底时左边会空出一截，看着就像"第一个位置空了"。把右侧留白补成
 * 一格的余数，末端就正好落在吸附位上，第一本永远贴齐内容左边距。
 */
export function shelfTrailingSlack(
  contentWidth: number,
  viewport: number,
  stride: number = SHELF_COVER_STRIDE,
): number {
  const overflow = contentWidth - viewport;
  if (overflow <= 1) return 0;
  const remainder = overflow % stride;
  return remainder === 0 ? 0 : stride - remainder;
}

/**
 * 读出容器里每个封面「左缘对齐内容左边距」时对应的 scrollLeft。
 * 用 getBoundingClientRect 而不是 offsetLeft，避免受 offsetParent / border 影响。
 */
export function measureShelfSnapOffsets(container: HTMLElement): number[] {
  const origin = container.getBoundingClientRect().left - container.scrollLeft;
  const offsets: number[] = [];
  container.querySelectorAll<HTMLElement>('[data-shelf-cover]').forEach((cover) => {
    offsets.push(cover.getBoundingClientRect().left - origin - SHELF_SIDE_PADDING);
  });
  return offsets;
}

/**
 * 触点是否落在「可以横向滚动」的容器里。
 *
 * 全局的 touchmove 拦截是为了压掉 iOS 的右滑返回手势，但它会连书架一起
 * 压掉——书架本身就要靠横向拖动翻书。所以碰到横向滚动容器直接放行。
 */
export function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  const win = typeof window !== 'undefined' ? window : undefined;
  let el: Element | null = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const overflowX = win?.getComputedStyle(el).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      return true;
    }
    el = el.parentElement;
  }
  return false;
}
