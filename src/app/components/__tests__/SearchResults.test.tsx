/**
 * @vitest-environment jsdom
 * 搜索结果条目里显示的应该是「干净正文」：用户不该在自己写的高亮周围看到 == 符号。
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { SearchResult } from '../../db';

let results: SearchResult[] = [];
vi.mock('../../store', () => ({
  useApp: () => ({ searchResults: results, searchQuery: '要活下去' }),
}));

const SearchResults = (await import('../SearchResults')).default;

afterEach(cleanup);

describe('搜索结果', () => {
  it('正文里的高亮标记不会显示成 ==', () => {
    results = [
      {
        quote: {
          id: 'q1',
          bookId: 'b1',
          text: '他说==要活下去==。',
          thought: '',
          page: null,
          date: '2026-10-29',
          createdAt: '',
          updatedAt: '',
        },
        bookTitle: '书',
        bookAuthor: '作者',
      },
    ];

    const { container } = render(<SearchResults onSelectResult={() => {}} />);
    expect(container.textContent).not.toContain('==');
    expect(container.textContent).toContain('他说要活下去。');
  });
});
