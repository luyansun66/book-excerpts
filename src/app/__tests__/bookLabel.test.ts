/**
 * 「读完」角标的显示规则。
 *
 * 只有两条契约，但都容易被顺手改坏：
 * - 没标记读完就一个角标都不画。「正在阅读」是默认态，不能给封面留东西，
 *   否则书架上每本没读完的书都顶着一块角标。
 * - 文案和颜色只有一份（没有按书覆盖、没有全局默认），底色半透明、色号本身
 *   仍是 hex：详情页那个开关和封面角标取的是同一个值，不会两处不一样。
 */
import { describe, it, expect } from 'vitest';
import {
  FINISHED_LABEL_BG_ALPHA,
  FINISHED_LABEL_COLOR,
  FINISHED_LABEL_STYLE,
  FINISHED_LABEL_TEXT,
  FINISHED_LABEL_TEXT_COLOR,
  isBookFinished,
  resolveBookLabel,
  withAlpha,
} from '../bookLabel';

describe('isBookFinished', () => {
  it('finishedAt 有值才算读完', () => {
    expect(isBookFinished({ finishedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(isBookFinished({ finishedAt: null })).toBe(false);
    expect(isBookFinished({ finishedAt: '' })).toBe(false);
    expect(isBookFinished({})).toBe(false);
  });
});

describe('resolveBookLabel', () => {
  it('没标记读完时不返回角标（正在阅读不留痕）', () => {
    expect(resolveBookLabel({ finishedAt: null })).toBeNull();
    expect(resolveBookLabel({})).toBeNull();
  });

  it('标记读完后给的就是唯一那份样式', () => {
    expect(resolveBookLabel({ finishedAt: '2026-01-01T00:00:00.000Z' })).toBe(FINISHED_LABEL_STYLE);
    expect(FINISHED_LABEL_STYLE.text).toBe('读完');
    expect(FINISHED_LABEL_STYLE.bg).toBe('rgba(226, 161, 60, 0.8)');
    expect(FINISHED_LABEL_STYLE.fg).toBe('#FFFFFF');
  });
});

describe('角标的观感参数', () => {
  it('底色按 80% 不透明画，色号本身保持不透明（hex）', () => {
    expect(FINISHED_LABEL_BG_ALPHA).toBe(0.8);
    expect(FINISHED_LABEL_COLOR).toBe('#E2A13C');
    expect(FINISHED_LABEL_COLOR).toMatch(/^#[0-9A-F]{6}$/);
    expect(withAlpha(FINISHED_LABEL_COLOR)).toBe('rgba(226, 161, 60, 0.8)');
  });

  it('角标文案是短的，字色是白的', () => {
    expect(FINISHED_LABEL_TEXT.length).toBeLessThanOrEqual(4);
    expect(FINISHED_LABEL_TEXT_COLOR).toBe('#FFFFFF');
  });

  it('withAlpha 支持自定义透明度，且不改色号', () => {
    expect(withAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
  });
});
