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
  useApp: () => ({ categories, books, selectBook, finishedLabel: { text: '读完', color: '#E2A13C' } }),
}));

const { CategoryBooksPage } = await import('../CategoryBooksPage');

function book(
  id: string,
  title: string,
  author: string,
  categoryId = 'cat-lit',
  extra: Partial<Book> = {},
): Book {
  return {
    id,
    title,
    author,
    categoryId,
    coverType: null,
    coverData: null,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

/** 按可见文案找一个筛选/排序按钮 */
function buttonByText(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label) as
    | HTMLButtonElement
    | undefined;
}

/** 网格里封面的 aria-label 顺序 */
function cellTitles(container: HTMLElement) {
  return cells(container).map((c) => c.getAttribute('aria-label') ?? '');
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

describe('分类书籍网格页 · 读完筛选与排序', () => {
  beforeEach(() => {
    books = [
      book('b1', '德米安', '赫尔曼·黑塞'),
      book('b2', '局外人', '阿尔贝·加缪', 'cat-lit', { finishedAt: '2026-03-01T00:00:00.000Z' }),
      book('b3', '悉达多', '赫尔曼·黑塞', 'cat-lit', { finishedAt: '2026-05-01T00:00:00.000Z' }),
    ];
  });

  it('默认「全部 + 自定义顺序」，顺序就是传进来的顺序', () => {
    const { container } = open();
    expect(cellTitles(container)).toEqual([
      '打开《德米安》的摘录',
      '打开《局外人》的摘录',
      '打开《悉达多》的摘录',
    ]);
  });

  it('切到「已读完」只剩标记过的书', () => {
    const { container } = open();
    fireEvent.click(buttonByText(container, '已读完') as HTMLElement);
    expect(cellTitles(container)).toEqual(['打开《局外人》的摘录', '打开《悉达多》的摘录']);
  });

  it('切到「未读完」只剩没标记的', () => {
    const { container } = open();
    fireEvent.click(buttonByText(container, '未读完') as HTMLElement);
    expect(cellTitles(container)).toEqual(['打开《德米安》的摘录']);
  });

  it('切到「最近读完」把刚读完的排前面，没读完的沉底', () => {
    const { container } = open();
    fireEvent.click(buttonByText(container, '自定义顺序') as HTMLElement);
    expect(cellTitles(container)).toEqual([
      '打开《悉达多》的摘录',
      '打开《局外人》的摘录',
      '打开《德米安》的摘录',
    ]);
    expect(buttonByText(container, '最近读完')).toBeTruthy();
  });

  it('筛选后一条都没有时，空态说的是筛选而不是搜索', () => {
    books = [book('b1', '德米安', '赫尔曼·黑塞')];
    const { container } = open();
    fireEvent.click(buttonByText(container, '已读完') as HTMLElement);
    expect(container.textContent).toContain('这个分类下还没有读完的书');
  });

  it('书全读完时，「未读完」的空态是另一句话', () => {
    books = [book('b1', '德米安', '赫尔曼·黑塞', 'cat-lit', { finishedAt: '2026-03-01T00:00:00.000Z' })];
    const { container } = open();
    fireEvent.click(buttonByText(container, '未读完') as HTMLElement);
    expect(container.textContent).toContain('这个分类下的书都读完了');
  });

  it('搜索没命中时仍然优先说搜索', () => {
    const { container } = open();
    fireEvent.click(buttonByText(container, '已读完') as HTMLElement);
    fireEvent.change(searchBox(container), { target: { value: '不存在的书' } });
    expect(container.textContent).toContain('没有找到');
  });

  it('分类里一本书都没有时不显示筛选栏', () => {
    const { container } = render(<CategoryBooksPage categoryId="cat-none" onBack={() => {}} />);
    expect(buttonByText(container, '已读完')).toBeUndefined();
    expect(buttonByText(container, '自定义顺序')).toBeUndefined();
  });
});
