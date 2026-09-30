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

// ─── 「读完」筛选 ──────────────────────────────────────────────────────
// 这一组守的是「筛选只改看的角度」：不改入参、不动 sortOrder。
// 一旦有人拿筛选当借口顺手重排并写回 sortOrder，用户手动拖的书序就被冲掉了，
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

describe('arrangeCategoryBooks', () => {
  it('先搜索、再筛读完', () => {
    const result = arrangeCategoryBooks(shelf, { query: '', finished: 'finished' });
    expect(ids(result)).toEqual(['b', 'd']);
  });

  it('搜索和筛选同时为空命中时，回到「什么都没有」而不是全部', () => {
    const result = arrangeCategoryBooks(shelf, { query: '丙', finished: 'finished' });
    expect(result).toEqual([]);
  });

  it('只筛不排：顺序还是调用方给的那份（用户拖出来的 sortOrder）', () => {
    const result = arrangeCategoryBooks(shelf, { query: '', finished: 'all' });
    expect(ids(result)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).toBe(shelf);
  });
});
