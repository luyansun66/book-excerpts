/**
 * @vitest-environment jsdom
 * 分类书籍网格页的三条契约：
 * - 一屏把这一类所有书铺成网格（这是它存在的理由：书多时不用横向翻）。
 * - 搜索框只筛这一类的书，书名/作者都能命中，清空后回到全部。
 * - 点封面直接进摘录列表（调 store 的 selectBook），不用再套一层详情页。
 *
 * store 用 mock，真实 store 一开始就要连 IndexedDB，jsdom 里没有。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { Book } from '../../types';

const selectBook = vi.fn();
let books: Book[] = [];
const categories = [
  { id: 'cat-lit', name: '文学', isPreset: true, order: 0, createdAt: '' },
  { id: 'cat-phi', name: '哲学', isPreset: true, order: 1, createdAt: '' },
];

vi.mock('../../store', () => ({
  useApp: () => ({ categories, books, selectBook }),
}));

const { CategoryBooksPage } = await import('../CategoryBooksPage');

function book(id: string, title: string, author: string, categoryId = 'cat-lit'): Book {
  return {
    id,
    title,
    author,
    categoryId,
    coverType: null,
    coverData: null,
    createdAt: '',
    updatedAt: '',
  };
}

beforeEach(() => {
  books = [
    book('b1', '德米安', '赫尔曼·黑塞'),
    book('b2', '局外人', '阿尔贝·加缪'),
    book('b3', 'Siddhartha', 'Hermann Hesse'),
    book('b4', '存在与时间', '马丁·海德格尔', 'cat-phi'),
  ];
  selectBook.mockClear();
});

afterEach(cleanup);

function open(categoryId = 'cat-lit') {
  return render(<CategoryBooksPage categoryId={categoryId} onBack={() => {}} />);
}

/** 网格里的封面按钮（每个是一本书） */
function cells(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label^="打开"]'));
}

function searchBox(container: HTMLElement) {
  return container.querySelector('input[placeholder="搜索书名或作者…"]') as HTMLInputElement;
}

describe('分类书籍网格页', () => {
  it('把这一类的书全部铺出来，不掺别的分类', () => {
    const { container } = open();
    expect(cells(container)).toHaveLength(3);
    expect(container.textContent).toContain('德米安');
    expect(container.textContent).not.toContain('存在与时间');
  });

  it('标题栏只显示分类名，不再挂书籍数量', () => {
    const { container } = open();
    expect(container.textContent).toContain('文学');
    expect(container.textContent).not.toMatch(/\d+ books/);
  });

  it('搜索书名可以过滤', () => {
    const { container } = open();
    fireEvent.change(searchBox(container), { target: { value: '局外' } });
    expect(cells(container)).toHaveLength(1);
    expect(container.textContent).toContain('局外人');
  });

  it('搜索作者也能过滤', () => {
    const { container } = open();
    fireEvent.change(searchBox(container), { target: { value: '黑塞' } });
    expect(cells(container)).toHaveLength(1);
    expect(container.textContent).toContain('德米安');
  });

  it('搜不到时给空态，并且不显示任何封面', () => {
    const { container } = open();
    fireEvent.change(searchBox(container), { target: { value: '不存在的书' } });
    expect(cells(container)).toHaveLength(0);
    expect(container.textContent).toContain('没有找到');
  });

  it('清空搜索后回到全部', () => {
    const { container } = open();
    fireEvent.change(searchBox(container), { target: { value: '局外' } });
    expect(cells(container)).toHaveLength(1);
    fireEvent.click(container.querySelector('button[aria-label="清空搜索"]') as HTMLElement);
    expect(cells(container)).toHaveLength(3);
  });

  it('点封面直接进这本书的摘录列表', () => {
    const { container } = open();
    fireEvent.click(cells(container)[0]);
    expect(selectBook).toHaveBeenCalledTimes(1);
    expect(selectBook.mock.calls[0][0].id).toBe('b1');
  });

  it('分类为空时给出空态而不是空白页', () => {
    const { container } = render(<CategoryBooksPage categoryId="cat-none" onBack={() => {}} />);
    expect(container.textContent).toContain('这个分类下还没有书');
  });
});
