/**
 * @vitest-environment jsdom
 * 分享面板上「看全图 / 存相册 / 关面板」这几下，用户是当系统行为来用的：
 *
 * - 点卡片上的任意位置都应该看全图。之前只有底下那颗「长图 · 可上下拖动 ·
 *   点按看全图」的药丸能点，点图片本身没反应 —— 跟那句提示自相矛盾。
 * - 全图里长按要能存到相册。卡片是 DOM 不是 <img>，系统那套「存储图像」不会
 *   自己出现，所以得自己计时跑一遍导出。
 * - 点卡片外的空白仍然要能关掉面板。预览区现在铺满整屏，原来顶上那条
 *   「点一下就关」的遮罩带没了，关闭靶子只剩舞台内边距那一圈，不能一起丢掉。
 *
 * 这几个手势都跟「滚动」抢同一片区域，所以这里重点守两件事：
 * 拖动滚屏不能误开全屏、也不能顺手把面板关掉；长按中途移动手指要作废
 * （否则用户想滚屏却存了张图）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ShareSheet from '../ShareSheet';

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  })),
}));

const quote = {
  id: 'q1',
  bookId: 'b1',
  text: '人生最大的幸运，是在合适的时间遇到一本合适的书。',
  thought: '记一笔',
  page: '128',
  date: '2026-09-19',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

// jsdom 里所有盒子都是 0 宽 0 高，量出来的几何全是 0，卡片就不会渲染。
// 给个手机尺寸的假盒子，让舞台和全屏都走真实那条分支。
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 900 });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  vi.restoreAllMocks();
});

const renderSheet = (onClose: () => void = () => {}) =>
  render(<ShareSheet open onClose={onClose} quote={quote} bookTitle="人间词话" bookAuthor="王国维" />);

/** 舞台（预览区）。全屏没打开时，页面上只有它带 hide-scrollbar。 */
const stage = () => document.body.querySelector('.hide-scrollbar') as HTMLElement;
/** 舞台里那张卡片 —— 点按的命中测试就是按它分的。 */
const stageCard = () => stage().firstElementChild as HTMLElement;
/** 全屏浮层。 */
const fullscreen = () => document.body.querySelector('div[style*="z-index: 110"]') as HTMLElement | null;
/** 全屏里那张卡片的外框（滚动区的唯一子节点）。 */
const fullscreenCard = () => fullscreen()!.querySelector('.hide-scrollbar')!.firstElementChild as HTMLElement;

const pointer = { pointerId: 1, pointerType: 'touch' as const };
const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { ...pointer, clientX: 195, clientY: 400 });
  fireEvent.pointerUp(el, { ...pointer, clientX: 195, clientY: 400 });
};

describe('分享面板 · 点卡片看全图', () => {
  it('点图片本身（不只是那颗药丸）就打开全屏', () => {
    renderSheet();
    expect(fullscreen()).toBeNull();

    tap(stageCard());

    expect(fullscreen()).not.toBeNull();
  });

  it('点卡片外的空白关掉面板，不是弹全屏', () => {
    const onClose = vi.fn();
    renderSheet(onClose);

    tap(stage());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fullscreen()).toBeNull();
  });

  it('拖动滚屏不会顺手弹出全屏', () => {
    const onClose = vi.fn();
    renderSheet(onClose);

    fireEvent.pointerDown(stageCard(), { ...pointer, clientX: 195, clientY: 700 });
    fireEvent.pointerMove(stageCard(), { ...pointer, clientX: 195, clientY: 640 });
    fireEvent.pointerMove(stageCard(), { ...pointer, clientX: 195, clientY: 400 });
    fireEvent.pointerUp(stageCard(), { ...pointer, clientX: 195, clientY: 400 });

    expect(fullscreen()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('滚动中浏览器发的 pointercancel 也算作废', () => {
    const onClose = vi.fn();
    renderSheet(onClose);

    fireEvent.pointerDown(stageCard(), { ...pointer, clientX: 195, clientY: 700 });
    fireEvent.pointerCancel(stageCard(), { ...pointer, clientX: 195, clientY: 700 });
    fireEvent.pointerUp(stageCard(), { ...pointer, clientX: 195, clientY: 700 });

    expect(fullscreen()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('分享面板 · 全屏里长按存相册', () => {
  const openFullscreen = () => {
    renderSheet();
    tap(stageCard());
    expect(fullscreen()).not.toBeNull();
  };

  it('按住不动够久就跑一遍导出，并把结果落盘', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:mock') as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    openFullscreen();

    fireEvent.pointerDown(fullscreenCard(), { ...pointer, clientX: 195, clientY: 400 });

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // 舞台和全屏共用一份 toast 文案，这里只要确认反馈真的出现在全屏浮层里
    // —— 之前 toast 只画在舞台那一层，全屏一盖就什么都看不见。
    await waitFor(() => {
      const toast = Array.from(fullscreen()!.querySelectorAll('div')).find(
        (d) => d.textContent === '已下载到本地',
      );
      expect(toast).toBeTruthy();
    });
  });

  it('长按中途移动手指 = 想滚屏，这次导出作废', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    openFullscreen();

    fireEvent.pointerDown(fullscreenCard(), { ...pointer, clientX: 195, clientY: 400 });
    fireEvent.pointerMove(fullscreenCard(), { ...pointer, clientX: 195, clientY: 300 });
    fireEvent.pointerUp(fullscreenCard(), { ...pointer, clientX: 195, clientY: 300 });

    await new Promise((r) => setTimeout(r, 900));
    expect(click).not.toHaveBeenCalled();
  });

  it('触摸长按时拦掉系统上下文菜单，鼠标右键放行', () => {
    openFullscreen();

    fireEvent.pointerDown(fullscreenCard(), { ...pointer, pointerType: 'touch' as never, clientX: 1, clientY: 1 });
    const touchMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fullscreenCard().dispatchEvent(touchMenu);
    expect(touchMenu.defaultPrevented).toBe(true);

    fireEvent.pointerUp(fullscreenCard(), { ...pointer });

    fireEvent.pointerDown(fullscreenCard(), { pointerId: 2, pointerType: 'mouse' as never, button: 0, clientX: 1, clientY: 1 });
    const mouseMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    fullscreenCard().dispatchEvent(mouseMenu);
    expect(mouseMenu.defaultPrevented).toBe(false);
  });
});
