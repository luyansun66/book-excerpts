/**
 * 「读完」角标的文案/取色规则。
 *
 * 这几条都是「改设置页或加预设时容易顺手弄坏、但肉眼不立刻看得出来」的契约：
 * 没标记就不画、按书覆盖优先于全局默认、空文案回落而不是画个空角标、
 * 不认识的色退回默认而不是照原样画一块读不清的。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FINISHED_LABEL_COLOR,
  DEFAULT_FINISHED_LABEL_TEXT,
  FINISHED_LABEL_PRESETS,
  MAX_LABEL_TEXT_LENGTH,
  clampLabelText,
  isBookFinished,
  isPresetLabelColor,
  normalizeLabelText,
  resolveBookLabel,
} from '../bookLabel';

const amber = FINISHED_LABEL_PRESETS[0];
const crimson = FINISHED_LABEL_PRESETS[1];

describe('normalizeLabelText / clampLabelText', () => {
  it('去掉首尾空白', () => {
    expect(normalizeLabelText('  已读 ')).toBe('已读');
  });

  it('null/undefined/空白都归一成空串', () => {
    expect(normalizeLabelText(null)).toBe('');
    expect(normalizeLabelText(undefined)).toBe('');
    expect(normalizeLabelText('   ')).toBe('');
  });

  it('超长文案截到 4 个字', () => {
    expect(clampLabelText('这本书我读完了')).toHaveLength(MAX_LABEL_TEXT_LENGTH);
    expect(clampLabelText('这本书我读完了')).toBe('这本书我');
  });
});

describe('isPresetLabelColor', () => {
  it('认得出预设色', () => {
    expect(isPresetLabelColor(amber.bg)).toBe(true);
    expect(isPresetLabelColor(crimson.bg)).toBe(true);
  });

  it('非预设色一律不认（含空值）', () => {
    expect(isPresetLabelColor('#123456')).toBe(false);
    expect(isPresetLabelColor(null)).toBe(false);
    expect(isPresetLabelColor(undefined)).toBe(false);
  });
});

describe('isBookFinished', () => {
  it('finishedAt 有值才算读完', () => {
    expect(isBookFinished({ finishedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
    expect(isBookFinished({ finishedAt: null })).toBe(false);
    expect(isBookFinished({})).toBe(false);
  });
});

describe('resolveBookLabel', () => {
  it('没标记读完时不返回角标', () => {
    expect(resolveBookLabel({ finishedAt: null })).toBeNull();
    expect(resolveBookLabel({})).toBeNull();
  });

  it('标记读完但没自定义时用默认文案与默认色', () => {
    const label = resolveBookLabel({ finishedAt: '2026-01-01T00:00:00.000Z' });
    expect(label).toEqual({ text: DEFAULT_FINISHED_LABEL_TEXT, bg: amber.bg, fg: amber.fg });
  });

  it('按书覆盖优先于全局默认', () => {
    const label = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z', label: { text: '已读', color: crimson.bg } },
      { text: '读完啦', color: amber.bg },
    );
    expect(label).toEqual({ text: '已读', bg: crimson.bg, fg: crimson.fg });
  });

  it('按书只覆盖一项时，另一项仍走全局默认', () => {
    const onlyText = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z', label: { text: '已读' } },
      { text: '默认文案', color: crimson.bg },
    );
    expect(onlyText).toEqual({ text: '已读', bg: crimson.bg, fg: crimson.fg });

    const onlyColor = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z', label: { color: crimson.bg } },
      { text: '默认文案', color: amber.bg },
    );
    expect(onlyColor).toEqual({ text: '默认文案', bg: crimson.bg, fg: crimson.fg });
  });

  it('空文案/空白的按书文案不生效，回落到全局默认', () => {
    const label = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z', label: { text: '   ' } },
      { text: '已读', color: amber.bg },
    );
    expect(label?.text).toBe('已读');
  });

  it('全局默认文案也是空的时候回落到内置文案，不画空角标', () => {
    const label = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z' },
      { text: '  ', color: amber.bg },
    );
    expect(label?.text).toBe(DEFAULT_FINISHED_LABEL_TEXT);
  });

  it('角标文案被截到上限', () => {
    const label = resolveBookLabel({
      finishedAt: '2026-01-01T00:00:00.000Z',
      label: { text: '这本书我读完了' },
    });
    expect(label?.text).toHaveLength(MAX_LABEL_TEXT_LENGTH);
  });

  it('不认识的按书颜色退回默认色，而不是按原样画', () => {
    const label = resolveBookLabel({
      finishedAt: '2026-01-01T00:00:00.000Z',
      label: { color: '#123456' },
    });
    expect(label).toEqual({ text: DEFAULT_FINISHED_LABEL_TEXT, bg: amber.bg, fg: amber.fg });
  });

  it('全局默认色不是预设时也退回默认色', () => {
    const label = resolveBookLabel(
      { finishedAt: '2026-01-01T00:00:00.000Z' },
      { text: DEFAULT_FINISHED_LABEL_TEXT, color: 'oklch(0.7 0.1 60)' },
    );
    expect(label?.bg).toBe(DEFAULT_FINISHED_LABEL_COLOR);
  });

  it('每个预设都能被解析出来，且底色/字色成对', () => {
    for (const preset of FINISHED_LABEL_PRESETS) {
      const label = resolveBookLabel({
        finishedAt: '2026-01-01T00:00:00.000Z',
        label: { text: preset.name, color: preset.bg },
      });
      expect(label).toEqual({ text: preset.name, bg: preset.bg, fg: preset.fg });
    }
  });

  it('6 个预设的角标文案都是 4 字以内，色值互不相同', () => {
    expect(FINISHED_LABEL_PRESETS).toHaveLength(6);
    const colors = FINISHED_LABEL_PRESETS.map((p) => p.bg);
    expect(new Set(colors).size).toBe(colors.length);
    for (const preset of FINISHED_LABEL_PRESETS) {
      expect(preset.name.length).toBeLessThanOrEqual(MAX_LABEL_TEXT_LENGTH);
    }
  });
});
