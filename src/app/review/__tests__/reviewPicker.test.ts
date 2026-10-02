import { describe, expect, it } from 'vitest';
import type { Quote } from '../../types';
import {
  COOLDOWN_HOURS,
  MAX_WEIGHT_DAYS,
  MIN_WEIGHT_DAYS,
  PickRoundOptions,
  daysSinceReview,
  isCooling,
  pickRound,
  reviewWeight,
  weightedSample,
} from '../reviewPicker';

const NOW = new Date('2026-10-01T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;

function quote(id: string, reviewedDaysAgo: number | null): Quote {
  return {
    id,
    bookId: 'b1',
    text: `摘录 ${id}`,
    thought: '',
    page: null,
    date: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastReviewedAt:
      reviewedDaysAgo === null ? null : new Date(NOW.getTime() - reviewedDaysAgo * DAY).toISOString(),
    reviewCount: reviewedDaysAgo === null ? 0 : 3,
  };
}

/** 按顺序吐出预设值，用光后循环。测确定性用。 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('回顾权重', () => {
  it('从没回顾过按上限算', () => {
    expect(daysSinceReview(quote('a', null), NOW)).toBeNull();
    expect(reviewWeight(quote('a', null), NOW)).toBe(MAX_WEIGHT_DAYS);
  });

  it('越久没看权重越高，超过一年封顶', () => {
    expect(reviewWeight(quote('a', 1), NOW)).toBeCloseTo(1);
    expect(reviewWeight(quote('a', 30), NOW)).toBeCloseTo(30);
    expect(reviewWeight(quote('a', 400), NOW)).toBe(MAX_WEIGHT_DAYS);
  });

  it('刚翻过的落到下限而不是 0 —— 否则库里卡不够时这一轮永远填不满', () => {
    expect(reviewWeight(quote('a', 0), NOW)).toBe(MIN_WEIGHT_DAYS);
    expect(reviewWeight(quote('a', 0.001), NOW)).toBe(MIN_WEIGHT_DAYS);
  });

  it('时间戳坏掉时当成没回顾过，不抛异常', () => {
    const broken = { ...quote('a', null), lastReviewedAt: '不是日期' };
    expect(daysSinceReview(broken, NOW)).toBeNull();
    expect(reviewWeight(broken, NOW)).toBe(MAX_WEIGHT_DAYS);
    expect(isCooling(broken, NOW.getTime())).toBe(false);
  });
});

describe('加权无放回抽样', () => {
  it('数量、去重、顺序稳定', () => {
    const items = ['a', 'b', 'c', 'd'];
    const picked = weightedSample(items, 3, () => 1, seqRng([0.9, 0.1, 0.5, 0.7]));
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    // key = ln(u)/1，u 越大 key 越大
    expect(picked).toEqual(['a', 'd', 'c']);
  });

  it('数量超过池子时全给，不会重复', () => {
    expect(weightedSample(['a', 'b'], 10, () => 1, seqRng([0.5]))).toEqual(['a', 'b']);
  });

  it('count 为 0 或池子为空时给空数组', () => {
    expect(weightedSample(['a'], 0, () => 1)).toEqual([]);
    expect(weightedSample([], 3, () => 1)).toEqual([]);
  });

  it('是抽样不是排序：权重低的也有机会排在前面', () => {
    // Efraimidis–Spirakis 下两项时 P(轻的在前) 正好是 w轻/(w重+w轻) = 1/5。
    const items = ['重', '轻'];
    const weights: Record<string, number> = { 重: 4, 轻: 1 };

    let lightFirst = 0;
    const trials = 400;
    for (let i = 0; i < trials; i += 1) {
      if (weightedSample(items, 1, (k) => weights[k])[0] === '轻') lightFirst += 1;
    }

    expect(lightFirst).toBeGreaterThan(trials * 0.1);
    expect(lightFirst).toBeLessThan(trials * 0.32);
  });
});

describe('抽一轮', () => {
  const options = (over: Partial<PickRoundOptions> = {}) => ({ now: NOW, rng: seqRng([0.5]), ...over });

  it('空库返回空数组', () => {
    expect(pickRound([], options())).toEqual([]);
  });

  it('每轮最多 size 张，且不重复', () => {
    const all = Array.from({ length: 40 }, (_, i) => quote(`q${i}`, null));
    const picked = pickRound(all, options({ size: 15 }));
    expect(picked).toHaveLength(15);
    expect(new Set(picked.map((q) => q.id)).size).toBe(15);
  });

  it('库里不够时有多少给多少', () => {
    const all = Array.from({ length: 5 }, (_, i) => quote(`q${i}`, null));
    expect(pickRound(all, options({ size: 15 }))).toHaveLength(5);
  });

  it('冷却期内的卡不进新一轮（当新鲜卡够用）', () => {
    const fresh = Array.from({ length: 12 }, (_, i) => quote(`old${i}`, 30 + i));
    const recent = Array.from({ length: 12 }, (_, i) => quote(`new${i}`, 1 / 24));
    const picked = pickRound([...fresh, ...recent], options({ size: 12 }));

    expect(picked).toHaveLength(12);
    expect(picked.every((q) => q.id.startsWith('old'))).toBe(true);
  });

  it('新鲜卡不够时把冷却期的放回来补齐，并把它们挤到队尾', () => {
    const fresh = [quote('old0', 90), quote('old1', 60)];
    const recent = Array.from({ length: 8 }, (_, i) => quote(`new${i}`, 1 / 24));
    const picked = pickRound([...fresh, ...recent], options({ size: 10, rng: () => 0.5 }));

    expect(picked).toHaveLength(10);
    // 权重差距悬殊，两张陈卡必在前两位
    expect(picked.slice(0, 2).map((q) => q.id)).toEqual(['old0', 'old1']);
    expect(picked.slice(2).every((q) => q.id.startsWith('new'))).toBe(true);
  });

  it('冷却窗口可调', () => {
    const twoHoursAgo = { ...quote('a', null), lastReviewedAt: new Date(NOW.getTime() - 2 * HOUR).toISOString() };
    expect(isCooling(twoHoursAgo, NOW.getTime(), COOLDOWN_HOURS)).toBe(true); // 2h < 24h → 还在冷却
    expect(isCooling(twoHoursAgo, NOW.getTime(), 1)).toBe(false); // 2h > 1h → 已经出冷却
  });
});
