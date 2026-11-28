import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Book, Category, Quote } from '../../types';

const state = vi.hoisted(() => ({
  upserts: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
  deletedBookIds: [] as string[],
  quoteSchemaError: null as { message: string } | null,
  upsertFailure: null as { table: string; message: string } | null,
  deleteFailure: null as { message: string } | null,
}));

vi.mock('../client', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'user-1',
    email: 'reader@example.com',
  })),
  supabase: {
    from: vi.fn((table: string) => ({
      upsert: async (rows: Array<Record<string, unknown>>) => {
        state.upserts.push({ table, rows });
        if (state.upsertFailure?.table === table) {
          return { error: { message: state.upsertFailure.message } };
        }
        return { error: null };
      },
      select: () => ({
        limit: async () => ({
          data: [],
          error: state.quoteSchemaError,
        }),
      }),
      delete: () => ({
        in: async (_column: string, bookIds: string[]) => {
          state.deletedBookIds.push(...bookIds);
          if (state.deleteFailure) {
            return { error: state.deleteFailure };
          }
          return { error: null };
        },
      }),
    })),
  },
}));

import { pushAllData } from '../sync';

function makeCategory(index: number): Category {
  return {
    id: `cat-${index}`,
    name: `分类 ${index}`,
    isPreset: false,
    order: index,
    createdAt: '2026-11-28T00:00:00.000Z',
  };
}

function makeBook(index: number): Book {
  return {
    id: `book-${index}`,
    title: `书 ${index}`,
    author: `作者 ${index}`,
    categoryId: 'cat-0',
    coverType: null,
    coverData: null,
    sortOrder: index,
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
  };
}

function makeQuote(index: number): Quote {
  return {
    id: `quote-${index}`,
    bookId: 'book-0',
    text: `摘录 ${index}`,
    thought: '',
    page: null,
    date: '2026-11-28',
    createdAt: '2026-11-28T00:00:00.000Z',
    updatedAt: '2026-11-28T00:00:00.000Z',
  };
}

function batchSizes(table: string): number[] {
  return state.upserts
    .filter((call) => call.table === table)
    .map((call) => call.rows.length);
}

beforeEach(() => {
  state.upserts.length = 0;
  state.deletedBookIds.length = 0;
  state.quoteSchemaError = null;
  state.upsertFailure = null;
  state.deleteFailure = null;
});

describe('pushAllData', () => {
  it('uploads each table in bounded batches instead of one request per row', async () => {
    const categories = Array.from({ length: 101 }, (_, index) => makeCategory(index));
    const books = Array.from({ length: 21 }, (_, index) => makeBook(index));
    const quotes = Array.from({ length: 201 }, (_, index) => makeQuote(index));

    await pushAllData(categories, books, quotes);

    expect(batchSizes('categories')).toEqual([100, 1]);
    expect(batchSizes('books')).toEqual([20, 1]);
    expect(batchSizes('quotes')).toEqual([100, 100, 1]);
    expect(state.deletedBookIds).toEqual(books.map((book) => book.id));
  });

  it('stops on a failed category batch and explains which backup stage failed', async () => {
    state.upsertFailure = {
      table: 'categories',
      message: 'permission denied',
    };

    await expect(
      pushAllData([makeCategory(0)], [makeBook(0)], [makeQuote(0)])
    ).rejects.toThrow('云端分类备份失败：permission denied');

    expect(state.upserts).toHaveLength(1);
    expect(batchSizes('books')).toEqual([]);
    expect(batchSizes('quotes')).toEqual([]);
  });

  it('stops before replacing quotes when old cloud quotes cannot be deleted', async () => {
    state.deleteFailure = {
      message: 'network timeout',
    };

    await expect(
      pushAllData([makeCategory(0)], [makeBook(0)], [makeQuote(0)])
    ).rejects.toThrow('云端摘录清理失败：network timeout');

    expect(state.deletedBookIds).toEqual(['book-0']);
    expect(batchSizes('quotes')).toEqual([]);
  });
});
