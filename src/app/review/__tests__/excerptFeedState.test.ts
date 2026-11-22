import { describe, expect, it } from 'vitest';
import type { Quote } from '../../types';
import {
  anchoredIndex,
  createColdStartPreferences,
  createDwellClock,
  favoriteWriteNeeded,
  orderFilteredQuotes,
  pageQuoteIds,
  pairQuoteRows,
  randomOrderForQuotes,
  replaceQuotesKeepingSequence,
  sortQuotesLatest,
} from '../excerptFeedState';

function quote(id: string, overrides: Partial<Quote> = {}): Quote {
  return {
    id,
    bookId: 'book-1',
    text: `摘录 ${id}`,
    thought: '',
    page: null,
    date: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('回顾双列状态', () => {
  it('冷启动继承视图，重置筛选和收藏开关，并默认使用随机排序', () => {
    expect(createColdStartPreferences('feed')).toEqual({
      viewMode: 'feed',
      readFilter: 'all',
      favoritesOnly: false,
      sortMode: 'random',
    });
    expect(createColdStartPreferences('bad-value').viewMode).toBe('flip');
  });

  it('最新添加按 createdAt 倒序，同时间按 quoteId 稳定排序', () => {
    const items = [
      quote('b', { createdAt: '2026-02-02T00:00:00.000Z' }),
      quote('c', { createdAt: '2026-03-03T00:00:00.000Z' }),
      quote('a', { createdAt: '2026-02-02T00:00:00.000Z' }),
    ];
    expect(sortQuotesLatest(items).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('随机序列在分页中保持稳定，不重复也不遗漏', () => {
    const values = [0.2, 0.8, 0.1, 0.6, 0.4];
    let index = 0;
    const rng = () => values[index++ % values.length];
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => quote(id));
    const order = randomOrderForQuotes(items, rng);
    const repeated = orderFilteredQuotes(items, {
      readFilter: 'all',
      favoritesOnly: false,
      sortMode: 'random',
    }, order);
    expect(repeated.map((item) => item.id)).toEqual(order);
    expect(new Set(order).size).toBe(items.length);
    expect([...pageQuoteIds(order, 2), ...pageQuoteIds(order, 5).slice(2)]).toEqual(order);
  });

  it('收藏和未看筛选可以叠加，缺失字段按未收藏/未看处理', () => {
    const items = [
      quote('plain'),
      quote('fav', { isFavorite: true }),
      quote('seen', { viewedAt: '2026-02-01T00:00:00.000Z' }),
      quote('fav-seen', { isFavorite: true, viewedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    expect(orderFilteredQuotes(items, {
      readFilter: 'unread',
      favoritesOnly: true,
      sortMode: 'latest',
    }).map((item) => item.id)).toEqual(['fav']);
    expect(orderFilteredQuotes(items, {
      readFilter: 'viewed',
      favoritesOnly: true,
      sortMode: 'latest',
    }).map((item) => item.id)).toEqual(['fav-seen']);
  });

  it('取消收藏或标记看过只更新序列内对象，不立即移除当前卡片', () => {
    const original = [quote('a', { isFavorite: true }), quote('b', { isFavorite: true })];
    const updated = [{ ...original[0], isFavorite: false, viewedAt: '2026-03-01T00:00:00.000Z' }, original[1]];
    const retained = replaceQuotesKeepingSequence(original, updated);
    expect(retained.map((item) => item.id)).toEqual(['a', 'b']);
    expect(retained[0]).toMatchObject({ isFavorite: false, viewedAt: '2026-03-01T00:00:00.000Z' });
  });

  it('目标值收藏写入幂等', () => {
    expect(favoriteWriteNeeded(false, true)).toBe(true);
    expect(favoriteWriteNeeded(true, true)).toBe(false);
    expect(favoriteWriteNeeded(undefined, false)).toBe(false);
  });

  it('阅读弹窗满 2 秒才成立，后台或遮挡期间冻结累计值', () => {
    const clock = createDwellClock(2_000);
    clock.setActive(true, 0);
    expect(clock.reached(1_999)).toBe(false);
    clock.setActive(false, 1_200);
    expect(clock.elapsed(9_000)).toBe(1_200);
    clock.setActive(true, 9_000);
    expect(clock.reached(9_799)).toBe(false);
    expect(clock.reached(9_800)).toBe(true);
  });

  it('视图锚点优先恢复 currentQuoteId，不存在时回到第一张', () => {
    expect(anchoredIndex(['a', 'b', 'c'], 'b')).toBe(1);
    expect(anchoredIndex(['a', 'b', 'c'], 'missing')).toBe(0);
    expect(anchoredIndex(['a', 'b', 'c'], null)).toBe(0);
  });

  it('0/1/2/3 条数据按左右两格组织，右列空缺不挤动左列', () => {
    expect(pairQuoteRows([])).toEqual([]);
    expect(pairQuoteRows(['a'])).toEqual([['a']]);
    expect(pairQuoteRows(['a', 'b'])).toEqual([['a', 'b']]);
    expect(pairQuoteRows(['a', 'b', 'c'])).toEqual([['a', 'b'], ['c']]);
  });
});
