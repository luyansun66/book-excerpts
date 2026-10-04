// @vitest-environment jsdom
// 一次性清理：撤掉客户端缓存的 OCR 票之后，把已经落到用户浏览器里的那份删掉。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearLegacyOcrToken } from '../legacyStorage';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('clearLegacyOcrToken', () => {
  it('删掉遗留的票，别的键不动', () => {
    localStorage.setItem('ocr-access-token', JSON.stringify({ token: 'tok', expiresAt: 1 }));
    localStorage.setItem('其他键', '别删我');

    clearLegacyOcrToken();

    expect(localStorage.getItem('ocr-access-token')).toBeNull();
    expect(localStorage.getItem('其他键')).toBe('别删我');
  });

  it('没有残留时静默通过', () => {
    expect(() => clearLegacyOcrToken()).not.toThrow();
  });

  it('localStorage 抛异常时不连累启动', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearLegacyOcrToken()).not.toThrow();
  });
});
