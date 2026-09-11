/**
 * 推入页「右滑返回」的手势数学。
 *
 * 单独抽出来，是因为这里全是"肉眼看不出对错、手感却全靠它"的数字：跟手时的
 * 橡皮筋阻尼、松手时按动量投影算落点、以及走还是回的判定。做成纯函数才测得动，
 * 也免得以后调手感时把判定条件顺手改坏。
 */

/** 一次指针采样：位置（px）与时间（ms） */
export interface SwipePoint {
  x: number;
  t: number;
}

/** 橡皮筋系数，越小越沉 */
const RUBBER_BAND_CONSTANT = 0.55;

/**
 * 手指位移 → 页面实际位移。
 * 往右（要返回的方向）1:1 跟手；往左页面已经在位了，只给一点阻尼余量——
 * 越拉越沉但不硬停（硬停会像撞墙）。
 */
export function resistedSwipeOffset(offset: number, width: number): number {
  if (offset >= 0 || width <= 0) return offset;
  const distance = -offset;
  return -(distance * width * RUBBER_BAND_CONSTANT) / (width + RUBBER_BAND_CONSTANT * distance);
}

/** 页面位移 → 返回进度 0..1（拖过头按 1 算） */
export function swipeProgress(offset: number, width: number): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, offset / width));
}

/** 算速度只看最近这一段采样：只取最后两点太跳，抓一小段更稳 */
export const VELOCITY_WINDOW_MS = 100;

/** 用最近 100ms 的采样算速度（px/s）。松手前先停住不动的话得 0，别把旧速度算进去 */
export function swipeVelocity(points: SwipePoint[]): number {
  if (points.length < 2) return 0;
  const last = points[points.length - 1];
  let first = last;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    if (last.t - points[i].t > VELOCITY_WINDOW_MS) break;
    first = points[i];
  }
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return ((last.x - first.x) / dt) * 1000;
}

/**
 * iOS 的减速率：松手之后页面还会滑多远。
 * 投影落点 = 当前位置 + (v/1000)·d/(1−d)，d≈0.998 时后半段约等于 0.5·v ——
 * 也就是"速度一屏/秒，松手还能再滑半屏"。
 */
export const SWIPE_DECELERATION = 0.998;

export function projectSwipeProgress(progress: number, velocity: number): number {
  const d = SWIPE_DECELERATION;
  return progress + (velocity / 1000) * (d / (1 - d));
}

/**
 * 松手时的取舍：不看手指停在哪儿，看按动量投影之后会落到哪儿——过半就退回去。
 * 速度的方向天然含在投影里，所以"拖出去大半再往回一顿"也能把页面拽回来。
 */
export function shouldDismissOnSwipe(progress: number, velocity: number): boolean {
  return projectSwipeProgress(progress, velocity) >= 0.5;
}
