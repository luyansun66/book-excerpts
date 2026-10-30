// @vitest-environment jsdom
/**
 * 书架主题偏好（设计文档 §5.5 / §11.2 第 11 条）。
 *
 * 主题只存在 localStorage：没存过要回经典，存不进去也不能把点击炸掉。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHELF_THEME_KEY, readShelfTheme, writeShelfTheme } from '../shelf/shelfTheme';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readShelfTheme', () => {
  it('没有存过主题时回 classic', () => {
    expect(localStorage.getItem(SHELF_THEME_KEY)).toBeNull();
    expect(readShelfTheme()).toBe('classic');
  });
});

describe('writeShelfTheme', () => {
  it('localStorage 抛错时不炸', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => writeShelfTheme('shelfV2')).not.toThrow();
  });
});
