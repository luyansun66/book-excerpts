/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ExcerptReader from '../ExcerptReader';
import type { Book, Quote } from '../../types';

vi.mock('../useViewDwell', () => ({
  useViewDwell: vi.fn(),
}));

const book: Book = {
  id: 'book-1',
  title: '你的夏天还好吗',
  author: '金爱烂',
  categoryId: 'cat',
  coverType: 'url',
  coverData: 'https://example.com/cover.jpg',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const quote: Quote = {
  id: 'quote-1',
  bookId: book.id,
  text: '我相信，每个人都有自己的“八平米”。',
  thought: '这一段让我想到自己的独处空间。',
  chapter: '第五章 八平米',
  page: null,
  date: '2026-11-20',
  createdAt: '2026-11-20T09:00:00.000Z',
  updatedAt: '2026-11-20T09:00:00.000Z',
};

afterEach(() => {
  cleanup();
});

function renderReader(overrides: Partial<Quote> = {}, bookOverride: Book | null = book) {
  const onBack = vi.fn();
  const onToggleFavorite = vi.fn();
  const onShare = vi.fn();
  const onViewed = vi.fn();
  const result = render(
    <ExcerptReader
      quote={{ ...quote, ...overrides }}
      book={bookOverride}
      favoritePending={false}
      shareOpen={false}
      onBack={onBack}
      onToggleFavorite={onToggleFavorite}
      onShare={onShare}
      onViewed={onViewed}
    />,
  );
  return { ...result, onBack, onToggleFavorite, onShare, onViewed };
}

describe('ExcerptReader', () => {
  it('按书摘模板显示真实封面、书名、品牌、作者与日期', () => {
    const { container } = renderReader();

    expect(screen.getByText('《你的夏天还好吗》')).toBeTruthy();
    expect(screen.getByText('折角书摘')).toBeTruthy();
    expect(screen.getByText('DOGEAR · BOOK EXCERPT')).toBeTruthy();
    const authorCard = screen.getByLabelText('作者');
    expect(within(authorCard).getByText('金爱烂')).toBeTruthy();
    expect(authorCard.textContent).not.toContain('第五章 八平米');
    expect(screen.getByText('2026 年 11 月 20 日')).toBeTruthy();
    expect(screen.getByText('我的想法')).toBeTruthy();
    const cover = container.querySelector('.review-reader-cover img');
    expect(cover?.getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('兼容旧数据中缺少 coverType 但有封面地址的书籍', () => {
    const { container } = renderReader({}, { ...book, coverType: null });
    const cover = container.querySelector('.review-reader-cover img');
    expect(cover?.getAttribute('src')).toBe('https://example.com/cover.jpg');
  });

  it('无封面时使用书架同款生成封面，无想法时不渲染想法区块', () => {
    renderReader({ thought: '' }, { ...book, coverType: null, coverData: null });

    expect(screen.getByText('你的夏天还好吗')).toBeTruthy();
    expect(screen.queryByText('我的想法')).toBeNull();
  });

  it('点击遮罩关闭，但按下遮罩本身不会提前关闭并穿透到卡片', () => {
    const { container, onBack } = renderReader();

    expect(screen.getByRole('dialog', { name: '你的夏天还好吗的完整摘录' })).toBeTruthy();
    expect(container.querySelector('.review-reader-dialog')).toBeTruthy();

    const overlay = container.querySelector('.review-reader')!;
    fireEvent.pointerDown(overlay);
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('收藏和分享仍使用现有回调，返回按钮可关闭阅读弹窗', () => {
    const { onBack, onToggleFavorite, onShare } = renderReader();

    fireEvent.click(screen.getByRole('button', { name: '收藏此摘录' }));
    fireEvent.click(screen.getByRole('button', { name: '打开图片编辑器分享此摘录' }));
    fireEvent.click(screen.getByRole('button', { name: '返回双列流' }));

    expect(onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'quote-1' }));
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 'quote-1' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
