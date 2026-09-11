/**
 * 分类书籍网格页的搜索逻辑。
 *
 * 这一页存在的理由就是「分类里书太多，翻不动」→ 所以要能搜。搜索的契约很小，
 * 但每条都容易在改搜索框时被无意破坏：作者也能搜到、大小写不敏感、
 * 首尾空格不算数、无关键词时顺序不动。
 */
import { describe, it, expect } from 'vitest';
import { filterCategoryBooks, matchesBookQuery, normalizeBookQuery } from '../categoryBooks';
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
