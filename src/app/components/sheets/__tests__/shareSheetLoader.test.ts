// 分享面板的加载契约：ShareSheet 和 html2canvas 都必须是按需加载的，而且空闲预取
// 要一次把两块都拿到。
//
// 背景：首访第一次导出图片时，按钮会先在「准备中…」上停住 —— 那一刻在等 html2canvas
// （197KB）下载。它原先只在面板打开时才去取，首访还得跟字体抢带宽。这里把「预取必须
// 覆盖两块」钉成断言，避免以后有人只改回预取 ShareSheet 而悄悄退化。
import { describe, expect, it, vi } from 'vitest';

const loaded = vi.hoisted(() => ({
  shareSheet: vi.fn(),
  html2canvas: vi.fn(),
}));

vi.mock('../ShareSheet', () => {
  loaded.shareSheet();
  return { default: () => null };
});

vi.mock('html2canvas', () => {
  loaded.html2canvas();
  return { default: () => Promise.resolve(null) };
});

const { loadShareSheet, prefetchShareSheet } = await import('../shareSheetLoader');

describe('shareSheetLoader', () => {
  it('loadShareSheet 只取 ShareSheet，不顺手拖上 html2canvas', async () => {
    await loadShareSheet();
    expect(loaded.shareSheet).toHaveBeenCalled();
    expect(loaded.html2canvas).not.toHaveBeenCalled();
  });

  it('prefetchShareSheet 一次取回 ShareSheet 与 html2canvas', async () => {
    await prefetchShareSheet();
    expect(loaded.shareSheet).toHaveBeenCalled();
    expect(loaded.html2canvas).toHaveBeenCalled();
  });
});
