/**
 * @vitest-environment jsdom
 * 本周阅读明细列表：默认收起，点击标题行展开；无数据时只给一句提示。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import WeekBookList from '../sections/WeekBookList';
import type { WeekBookReading } from '../../db/readingTime';

afterEach(cleanup);

const books: WeekBookReading[] = [
  { bookId: 'b1', title: '万历十五年', minutes: 77 },
  { bookId: 'b2', title: '咀嚼人生', minutes: 38 },
];

describe('WeekBookList', () => {
  it('默认收起，只显示书目数量', () => {
    const { container, queryByText } = render(<WeekBookList books={books} />);

    expect(queryByText('本周阅读 · 2 本书')).not.toBeNull();
    expect(queryByText('万历十五年')).toBeNull();
    expect(container.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('点击标题行展开明细，再点收起', () => {
    const { queryByText } = render(<WeekBookList books={books} />);
    const toggle = queryByText('本周阅读 · 2 本书')!.closest('button')!;

    fireEvent.click(toggle);
    expect(queryByText('万历十五年')).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('本周没有记录时不渲染折叠开关', () => {
    const { queryByText, queryByRole } = render(<WeekBookList books={[]} />);

    expect(queryByText('本周还没有阅读记录')).not.toBeNull();
    expect(queryByRole('button')).toBeNull();
  });
});
