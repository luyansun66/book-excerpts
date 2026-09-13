/**
 * @vitest-environment jsdom
 * 周期阅读明细：默认收起，点击标题行展开；切换周期自动收起；无数据时只给一句提示。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import PeriodBookList from '../sections/PeriodBookList';
import type { PeriodBookReading } from '../../db/readingTime';

afterEach(cleanup);

const books: PeriodBookReading[] = [
  { bookId: 'b1', title: '万历十五年', minutes: 77 },
  { bookId: 'b2', title: '咀嚼人生', minutes: 38 },
];

describe('PeriodBookList', () => {
  it('默认收起，只显示书目数量', () => {
    const { container, queryByText } = render(<PeriodBookList books={books} period="week" />);

    expect(queryByText('本周阅读 · 2 本书')).not.toBeNull();
    expect(queryByText('万历十五年')).toBeNull();
    expect(container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('点击标题行展开明细，再点收起', () => {
    const { queryByText } = render(<PeriodBookList books={books} period="week" />);
    const toggle = queryByText('本周阅读 · 2 本书')!.closest('button')!;

    fireEvent.click(toggle);
    expect(queryByText('万历十五年')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('切换周期时自动收起，并换成对应周期的文案', () => {
    const { queryByText, rerender } = render(<PeriodBookList books={books} period="week" />);
    const weekToggle = queryByText('本周阅读 · 2 本书')!.closest('button')!;
    fireEvent.click(weekToggle);
    expect(weekToggle.getAttribute('aria-expanded')).toBe('true');

    rerender(<PeriodBookList books={books} period="month" />);

    const monthToggle = queryByText('本月阅读 · 2 本书')!.closest('button')!;
    expect(monthToggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('没有记录时按周期给出提示，且不渲染折叠开关', () => {
    const { queryByText, queryByRole } = render(<PeriodBookList books={[]} period="all" />);

    expect(queryByText('还没有阅读记录')).not.toBeNull();
    expect(queryByRole('button')).toBeNull();
  });
});
