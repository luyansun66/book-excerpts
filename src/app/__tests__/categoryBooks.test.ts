/**
 * 分类书籍网格页的搜索逻辑。
 *
 * 这一页存在的理由就是「分类里书太多，翻不动」→ 所以要能搜。搜索的契约很小，
 * 但每条都容易在改搜索框时被无意破坏：作者也能搜到、大小写不敏感、
 * 首尾空格不算数、无关键词时顺序不动。
 */
import { describe, it, expect } from 'vitest';
import {
  arrangeCategoryBooks,
  filterByFinished,
  filterCategoryBooks,
  matchesBookQuery,
  normalizeBookQuery,
  sortBooks,
} from '../categoryBooks';
import type { Book } from '../types';

function book(partial: Partial<Book> & { title: string }): Book {
  return {
    id: partial.title,
    author: '',
    categoryId: 'cat',
    coverType: null,
    coverData: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

const library = [
  book({ title: '德米安', author: '赫尔曼·黑塞' }),
  book({ title: '局外人', author: '阿尔贝·加缪' }),
  book({ title: 'Siddhartha', author: 'Hermann Hesse' }),
];

describe('normalizeBookQuery', () => {
  it('去掉首尾空格并统一小写', () => {
    expect(normalizeBookQuery('  黑塞 ')).toBe('黑塞');
    expect(normalizeBookQuery('  Hesse ')).toBe('hesse');
  });
});

describe('matchesBookQuery', () => {
  it('空关键词命中所有书', () => {
    expect(matchesBookQuery(library[0], '')).toBe(true);
    expect(matchesBookQuery(library[0], '   ')).toBe(true);
  });

  it('书名命中', () => {
    expect(matchesBookQuery(library[0], '德米')).toBe(true);
  });

  it('作者命中（搜作者也能找到书）', () => {
    expect(matchesBookQuery(library[0], '黑塞')).toBe(true);
    expect(matchesBookQuery(library[1], '加缪')).toBe(true);
  });

  it('英文书名与作者都不区分大小写', () => {
    expect(matchesBookQuery(library[2], 'siddhartha')).toBe(true);
    expect(matchesBookQuery(library[2], 'HESSE')).toBe(true);
  });

  it('关键词带空格时按去空格后的内容匹配', () => {
    expect(matchesBookQuery(library[0], '  德米安  ')).toBe(true);
  });

  it('都不包含就不命中', () => {
    expect(matchesBookQuery(library[1], '黑塞')).toBe(false);
  });
});

describe('filterCategoryBooks', () => {
  it('无关键词时原样返回入参数组（顺序不动，也不复制）', () => {
    expect(filterCategoryBooks(library, '')).toBe(library);
    expect(filterCategoryBooks(library, '   ')).toBe(library);
  });

  it('按书名或作者过滤，并保持原有顺序', () => {
    // 「尔」同时出现在两本书的作者里，用来守「过滤不打乱原顺序」
    const result = filterCategoryBooks(library, '尔');
    expect(result.map((b) => b.title)).toEqual(['德米安', '局外人']);
    expect(filterCategoryBooks(library, '黑塞').map((b) => b.title)).toEqual(['德米安']);
  });

  it('没有命中时返回空数组', () => {
    expect(filterCategoryBooks(library, '不存在的书')).toEqual([]);
  });

  it('只搜分类内的书（调用方已经切好），不会跨类带出别的书', () => {
    const subset = library.filter((b) => b.title !== '局外人');
    expect(filterCategoryBooks(subset, '加缪')).toEqual([]);
  });
});

// ─── 「读完」筛选 / 排序 ──────────────────────────────────────────────────────
// 这一组守的是「筛选和排序只改看的角度」：不改入参、不动 sortOrder。
// 一旦有人把排序结果写回 sortOrder，用户手动拖的书序就被冲掉了，
// 而且这种回归在界面上要过几天才看得出来。

const shelf = [
  book({ id: 'a', title: '甲', sortOrder: 0 }),
  book({ id: 'b', title: '乙', sortOrder: 1, finishedAt: '2026-03-01T00:00:00.000Z' }),
  book({ id: 'c', title: '丙', sortOrder: 2 }),
  book({ id: 'd', title: '丁', sortOrder: 3, finishedAt: '2026-05-01T00:00:00.000Z' }),
];

const ids = (list: { id: string }[]) => list.map((b) => b.id);

describe('filterByFinished', () => {
  it('all 原样返回入参（不复制）', () => {
    expect(filterByFinished(shelf, 'all')).toBe(shelf);
  });

  it('finished 只留标记过读完的，顺序不变', () => {
    expect(ids(filterByFinished(shelf, 'finished'))).toEqual(['b', 'd']);
  });

  it('unfinished 只留没读完的，顺序不变', () => {
    expect(ids(filterByFinished(shelf, 'unfinished'))).toEqual(['a', 'c']);
  });

  it('一条都没有读完时返回空数组，而不是 undefined', () => {
    expect(filterByFinished([shelf[0], shelf[2]], 'finished')).toEqual([]);
  });
});

describe('sortBooks', () => {
  it('custom 原样返回入参（那就是用户的拖拽顺序）', () => {
    expect(sortBooks(shelf, 'custom')).toBe(shelf);
  });

  it('recentFinished 把最近读完的排前面，没读完的沉底', () => {
    expect(ids(sortBooks(shelf, 'recentFinished'))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('同组内保持调用方给的相对顺序', () => {
    const twice = sortBooks(shelf, 'recentFinished');
    const unfinished = twice.filter((b) => !b.finishedAt);
    expect(ids(unfinished)).toEqual(['a', 'c']);
  });

  it('同一时刻读完的两本，保持调用方给的先后（兜底比较是写下标，不靠 sort 稳定性）', () => {
    const sameMoment = [
      book({ id: 'p', title: 'P', finishedAt: '2026-05-01T00:00:00.000Z' }),
      book({ id: 'q', title: 'Q', finishedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(ids(sortBooks(sameMoment, 'recentFinished'))).toEqual(['p', 'q']);
    expect(ids(sortBooks([sameMoment[1], sameMoment[0]], 'recentFinished'))).toEqual(['q', 'p']);
  });

  it('不修改入参数组的顺序，也不动 sortOrder（排序是视图，不是数据）', () => {
    const before = shelf.map((b) => ({ id: b.id, sortOrder: b.sortOrder }));
    sortBooks(shelf, 'recentFinished');
    expect(shelf.map((b) => ({ id: b.id, sortOrder: b.sortOrder }))).toEqual(before);
    expect(ids(shelf)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('finishedAt 是坏字符串时按没读完处理，不插进读完那一组', () => {
    const messy = [
      book({ id: 'x', title: 'X', finishedAt: '不是日期' }),
      book({ id: 'y', title: 'Y', finishedAt: '2026-05-01T00:00:00.000Z' }),
    ];
    expect(ids(sortBooks(messy, 'recentFinished'))).toEqual(['y', 'x']);
  });
});

describe('arrangeCategoryBooks', () => {
  it('搜索 → 筛选 → 排序依次生效', () => {
    const result = arrangeCategoryBooks(shelf, { query: '', finished: 'finished', sort: 'recentFinished' });
    expect(ids(result)).toEqual(['d', 'b']);
  });

  it('搜索和筛选同时为空命中时，回到「什么都没有」而不是全部', () => {
    const result = arrangeCategoryBooks(shelf, { query: '丙', finished: 'finished', sort: 'recentFinished' });
    expect(result).toEqual([]);
  });

  it('查询命中后仍按筛选与排序收口', () => {
    const result = arrangeCategoryBooks(shelf, { query: '乙', finished: 'unfinished', sort: 'recentFinished' });
    expect(result).toEqual([]);
  });
});
