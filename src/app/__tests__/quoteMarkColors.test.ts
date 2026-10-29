import { describe, expect, it } from 'vitest';
import { MARK_COLOR_PRESETS, normalizeMarkColor } from '../quoteMarkColors';

describe('每条摘录的高亮色', () => {
  it('只接受六位十六进制色值', () => {
    expect(normalizeMarkColor('#123abc')).toBe('#123abc');
    expect(normalizeMarkColor('  #ABCDEF  ')).toBe('#ABCDEF');
    expect(normalizeMarkColor('')).toBeUndefined();
    expect(normalizeMarkColor(undefined)).toBeUndefined();
    expect(normalizeMarkColor('red')).toBeUndefined();
    expect(normalizeMarkColor('#123')).toBeUndefined();
    expect(normalizeMarkColor('rgb(1,2,3)')).toBeUndefined();
  });

  it('默认项用空值，交给主题亮暗模式各自决定', () => {
    expect(MARK_COLOR_PRESETS[0]).toEqual({ id: 'theme', name: '默认', color: '' });
  });
});
