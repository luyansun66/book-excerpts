/**
 * 「右滑返回」手势数学。
 *
 * 这些数字调起来全靠手感，但错了会错得很具体：橡皮筋写反了往左一拖页面就飞出去、
 * 速度窗口算错了一停手松开会误判成快速甩动、投影公式漏了减速率就变成"必须拖满一屏
 * 才回得去"。所以每条规则都钉在测试里。
 */
import { describe, it, expect } from 'vitest';
import {
  resistedSwipeOffset,
  swipeProgress,
  swipeVelocity,
  projectSwipeProgress,
  shouldDismissOnSwipe,
} from '../pageSwipeBack';

const W = 400;

describe('resistedSwipeOffset', () => {
  it('往右 1:1 跟手', () => {
    expect(resistedSwipeOffset(0, W)).toBe(0);
    expect(resistedSwipeOffset(37, W)).toBe(37);
    expect(resistedSwipeOffset(W, W)).toBe(W);
    expect(resistedSwipeOffset(W * 1.5, W)).toBe(W * 1.5);
  });

  it('往左只给阻尼余量，不硬停也不位移过大', () => {
    const at = (pull: number) => Math.abs(resistedSwipeOffset(-pull, W));
    expect(resistedSwipeOffset(-100, W)).toBeLessThan(0);
    expect(at(100)).toBeLessThan(100);
    expect(at(300)).toBeGreaterThan(at(100));
    // 越拉越沉：每多拉 100px，换来的位移越来越少
    const first = at(100);
    const second = at(200) - at(100);
    const third = at(300) - at(200);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it('宽度为 0 时不动手', () => {
    expect(resistedSwipeOffset(-50, 0)).toBe(-50);
  });
});

describe('swipeProgress', () => {
  it('把位移换算成 0..1 的进度', () => {
    expect(swipeProgress(0, W)).toBe(0);
    expect(swipeProgress(W / 4, W)).toBe(0.25);
    expect(swipeProgress(W / 2, W)).toBe(0.5);
  });

  it('拖过头按 1 算，反向按 0 算', () => {
    expect(swipeProgress(W * 3, W)).toBe(1);
    expect(swipeProgress(-80, W)).toBe(0);
  });
});

describe('swipeVelocity', () => {
  it('按最近 100ms 的采样算速度', () => {
    // 100ms 走了 100px → 1000px/s
    expect(
      swipeVelocity([
        { x: 0, t: 0 },
        { x: 50, t: 50 },
        { x: 100, t: 100 },
      ]),
    ).toBe(1000);
  });

  it('松手前停住不动就是 0，不把旧速度带出来', () => {
    expect(
      swipeVelocity([
        { x: 0, t: 0 },
        { x: 300, t: 100 },
        { x: 300, t: 400 },
      ]),
    ).toBe(0);
  });

  it('采样不足两点算 0', () => {
    expect(swipeVelocity([])).toBe(0);
    expect(swipeVelocity([{ x: 10, t: 10 }])).toBe(0);
  });

  it('往回甩是负速度', () => {
    expect(
      swipeVelocity([
        { x: 200, t: 0 },
        { x: 100, t: 100 },
      ]),
    ).toBe(-1000);
  });
});

describe('projectSwipeProgress', () => {
  it('松手速度越大，落点越远', () => {
    expect(projectSwipeProgress(0.2, 0)).toBeCloseTo(0.2, 5);
    expect(projectSwipeProgress(0.2, 1)).toBeGreaterThan(0.5);
    expect(projectSwipeProgress(0.2, -1)).toBeLessThan(0.2);
  });
});

describe('shouldDismissOnSwipe', () => {
  it('慢慢拖过半屏就返回', () => {
    expect(shouldDismissOnSwipe(0.6, 0)).toBe(true);
  });

  it('只拖了一点又没速度就弹回去', () => {
    expect(shouldDismissOnSwipe(0.3, 0)).toBe(false);
  });

  it('轻轻甩一下也算返回，不必拖满半屏', () => {
    expect(shouldDismissOnSwipe(0.1, 1)).toBe(true);
  });

  it('往回甩能把已经拖出去大半的页面拽回来', () => {
    expect(shouldDismissOnSwipe(0.8, -2)).toBe(false);
  });
});
