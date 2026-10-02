import { describe, expect, it } from 'vitest';
import { FONT_TIERS, MAX_LINES, guessTierIndex, pickTierIndex, weightedLength } from '../cardFit';

describe('估算文字宽度', () => {
  it('纯汉字按字数算', () => {
    expect(weightedLength('人生一世')).toBe(4);
  });

  it('西文按半个汉字折算，不会把英文摘录一律压到最小号', () => {
    expect(weightedLength('abcd')).toBeCloseTo(2.2);
    // 同样 20 个字符，中文明显比英文占宽
    expect(weightedLength('a'.repeat(20))).toBeLessThan(weightedLength('字'.repeat(20)));
  });

  it('空格更轻，换行按一整行算', () => {
    expect(weightedLength(' ')).toBeCloseTo(0.35);
    expect(weightedLength('\n')).toBe(MAX_LINES);
    expect(weightedLength('a\nb')).toBeCloseTo(0.55 + MAX_LINES + 0.55);
  });

  it('标点按全角算', () => {
    expect(weightedLength('。')).toBe(1);
  });

  it('空串是 0', () => {
    expect(weightedLength('')).toBe(0);
  });
});

describe('起手档位', () => {
  it('短句用最大号，超长用最小号', () => {
    expect(guessTierIndex('短。')).toBe(0);
    expect(guessTierIndex('字'.repeat(3000))).toBe(FONT_TIERS.length - 1);
  });

  it('越长档位越小，不会跳档', () => {
    let previous = -1;
    for (const n of [5, 60, 200, 500, 900, 1300, 2000, 4000]) {
      const tier = guessTierIndex('字'.repeat(n));
      expect(tier).toBeGreaterThanOrEqual(previous);
      previous = tier;
    }
  });
});

describe('实测选档', () => {
  it('从最大档往下取第一个放得下的', () => {
    // 只有第 2 档（含）之后才放得下
    expect(pickTierIndex((i) => i >= 2)).toBe(2);
    expect(pickTierIndex(() => true)).toBe(0);
  });

  it('全都放不下时用最小档，交给截断兜底', () => {
    expect(pickTierIndex(() => false)).toBe(FONT_TIERS.length - 1);
  });
});
