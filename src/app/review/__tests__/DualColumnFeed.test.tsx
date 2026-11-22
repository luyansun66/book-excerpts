/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DualColumnFeed from '../DualColumnFeed';
import type { Book, Quote } from '../../types';
import type { ReviewPreferences } from '../excerptFeedState';

const preferences: ReviewPreferences = {
  viewMode: 'feed',
  readFilter: 'all',
  favoritesOnly: false,
  sortMode: 'latest',
};

const book: Book = {
  id: 'book-1',
  title: '一本很长的书名',
  author: '某位作者',
  categoryId: 'cat',
  coverType: null,
  coverData: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function quote(id: string, overrides: Partial<Quote> = {}): Quote {
  return {
    id,
    bookId: book.id,
    text: `这是 ${id} 的摘录正文，用来验证双列卡片。`,
    thought: '',
    page: null,
    date: '2026-01-01',
    createdAt: `2026-01-0${id.length}T00:00:00.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DualColumnFeed', () => {
  it('点击收藏只触发收藏，不展开卡片', () => {
    const onOpenQuote = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <DualColumnFeed
        quotes={[quote('a')]}
        books={new Map([[book.id, book]])}
        preferences={preferences}
        randomOrder={[]}
        initialQuoteId="a"
        favoritePendingIds={new Set()}
        onOpenQuote={onOpenQuote}
        onToggleFavorite={onToggleFavorite}
        onCurrentQuoteChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收藏此摘录' }));
    expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(onOpenQuote).not.toHaveBeenCalled();
  });

  it('卡片主体可键盘打开，书名与作者仍在信息区各占一行', () => {
    const onOpenQuote = vi.fn();
    render(
      <DualColumnFeed
        quotes={[quote('a'), quote('b'), quote('c')]}
        books={new Map([[book.id, book]])}
        preferences={preferences}
        randomOrder={[]}
        initialQuoteId="a"
        favoritePendingIds={new Set()}
        onOpenQuote={onOpenQuote}
        onToggleFavorite={vi.fn()}
        onCurrentQuoteChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /^打开摘录：/ })[0]);
    expect(onOpenQuote).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'feed');
    expect(screen.getAllByText(book.author)).toHaveLength(3);
  });

  it('筛选为空时显示明确空状态', () => {
    render(
      <DualColumnFeed
        quotes={[]}
        books={new Map()}
        preferences={{ ...preferences, favoritesOnly: true }}
        randomOrder={[]}
        initialQuoteId={null}
        favoritePendingIds={new Set()}
        onOpenQuote={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCurrentQuoteChange={vi.fn()}
      />,
    );
    expect(screen.getByText('还没有收藏的摘录')).toBeTruthy();
  });

  it('只显示书名和作者，笔记状态为纯图标，缺作者时不显示占位文字', () => {
    render(
      <DualColumnFeed
        quotes={[quote('a', { thought: '这是只应在阅读弹窗展示的想法', chapter: '第二十一章' })]}
        books={new Map([[book.id, { ...book, author: '' }]])}
        preferences={preferences}
        randomOrder={[]}
        initialQuoteId="a"
        favoritePendingIds={new Set()}
        onOpenQuote={vi.fn()}
        onToggleFavorite={vi.fn()}
        onCurrentQuoteChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('第二十一章')).toBeNull();
    expect(screen.queryByText('有想法')).toBeNull();
    expect(screen.queryByText('作者未知')).toBeNull();
    expect(screen.getByLabelText('有我的想法').textContent).toBe('');
    const openLabel = screen.getByRole('button', { name: /^打开摘录：.*一本很长的书名/ }).getAttribute('aria-label');
    expect(openLabel).toContain('未看');
    expect(openLabel).not.toContain('作者未知');
  });

});
