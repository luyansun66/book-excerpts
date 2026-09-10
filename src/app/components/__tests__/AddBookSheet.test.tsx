/**
 * @vitest-environment jsdom
 * 「添加书籍」弹窗里的分类行：能直接新建分类，也能直接删分类。
 *
 * 关键契约：
 * - 建完立刻选中新分类（否则这个功能就白加了），同名不重复建。
 * - 每个分类后面都有删除按钮，且点它不会顺带改变当前选中的分类。
 * - 删除必须先过确认框，确认后调 store 的 deleteCategory。
 * - 只剩一个分类时删除按钮禁用（删光了新书就没地方放）。
 *
 * 注意弹窗头部本身也有一个「添加」（保存书籍）按钮，所以定位新建分类的按钮时
 * 必须走结构（新分类输入框的同级按钮），不能按文字「添加」全文档去捞。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';

// 分类列表在测试里是活的：addCategory / deleteCategory 会改动它，
// 模拟真实 store 里 refreshCategories 之后的重新渲染。
let categories: Array<{ id: string; name: string; isPreset: boolean; order: number; createdAt: string }> = [];
const addCategory = vi.fn(async (name: string) => {
  const cat = { id: `cat-${name}`, name, isPreset: false, order: categories.length, createdAt: '' };
  categories = [...categories, cat];
  return cat;
});
const deleteCategory = vi.fn(async (id: string) => {
  categories = categories.filter((c) => c.id !== id);
});
const addBook = vi.fn(async () => undefined);

vi.mock('../../store', () => ({
  useApp: () => ({ categories, addBook, addCategory, deleteCategory }),
}));

const AddBookSheet = (await import('../sheets/AddBookSheet')).default;

afterEach(cleanup);

beforeEach(() => {
  categories = [
    { id: 'cat-lit', name: '文学', isPreset: true, order: 0, createdAt: '' },
    { id: 'cat-phi', name: '哲学', isPreset: true, order: 1, createdAt: '' },
  ];
  addCategory.mockClear();
  deleteCategory.mockClear();
  addBook.mockClear();
});

const NEW_CAT_INPUT = 'input[placeholder="新分类名称"]';

function open() {
  const { container } = render(<AddBookSheet open onClose={() => {}} />);
  const plus = container.querySelector('button[aria-label="新建分类"]') as HTMLButtonElement;
  expect(plus, '分类行里没有「新建分类」入口').not.toBeNull();
  return { container, plus };
}

function chip(container: HTMLElement, name: string) {
  return container.querySelector(`button[aria-label="选择分类 ${name}"]`) as HTMLButtonElement;
}

function chipDelete(container: HTMLElement, name: string) {
  return container.querySelector(`button[aria-label="删除分类 ${name}"]`) as HTMLButtonElement;
}

/** 当前选中的分类 id（选中态的分类按钮带 data-category-id）。 */
function selectedCategoryId(container: HTMLElement) {
  const active = container.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement | null;
  expect(active, '没有任何分类处于选中态').not.toBeNull();
  return active!.getAttribute('data-category-id');
}

/** 展开输入框，并返回它和它旁边那个「添加」按钮（不是弹窗头部那个）。 */
function openCreator(container: HTMLElement, plus: HTMLElement) {
  fireEvent.click(plus);
  const input = container.querySelector(NEW_CAT_INPUT) as HTMLInputElement;
  expect(input, '点了加号却没出现新分类输入框').not.toBeNull();
  const submit = input.parentElement!.querySelector('button') as HTMLButtonElement;
  expect(submit, '新分类输入框旁边没有提交按钮').not.toBeNull();
  return { input, submit };
}

/** 删除确认框的根节点。弹窗自己也有一级标题，所以按标题文字认出确认框再往上找。 */
function confirmDialog(container: HTMLElement) {
  const heading = Array.from(container.querySelectorAll('h3')).find((h) => h.textContent === '删除分类');
  expect(heading, '没有弹出删除确认框').toBeTruthy();
  const root = heading!.closest('div[style*="z-index: 200"]') as HTMLElement | null;
  expect(root, '确认框根节点结构变了').not.toBeNull();
  return root!;
}

function dialogButton(container: HTMLElement, text: string) {
  const btn = Array.from(confirmDialog(container).querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement | undefined;
  expect(btn, `确认框里没有「${text}」按钮`).toBeTruthy();
  return btn!;
}

describe('添加书籍弹窗里新建分类', () => {
  it('默认不显示输入框，点加号才出现', () => {
    const { container, plus } = open();
    expect(container.querySelector(NEW_CAT_INPUT)).toBeNull();

    fireEvent.click(plus);
    expect(container.querySelector(NEW_CAT_INPUT)).not.toBeNull();
  });

  it('新建后立刻选中这个新分类', async () => {
    const { container, plus } = open();
    const { input, submit } = openCreator(container, plus);

    fireEvent.change(input, { target: { value: '历史' } });
    fireEvent.click(submit);

    await waitFor(() => expect(addCategory).toHaveBeenCalledWith('历史'));
    await waitFor(() => expect(selectedCategoryId(container)).toBe('cat-历史'));
  });

  it('回车也能提交', async () => {
    const { container, plus } = open();
    const { input } = openCreator(container, plus);

    fireEvent.change(input, { target: { value: '传记' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(addCategory).toHaveBeenCalledWith('传记'));
    await waitFor(() => expect(selectedCategoryId(container)).toBe('cat-传记'));
  });

  it('名字为空时提交按钮不可点，也不会建空分类', () => {
    const { container, plus } = open();
    const { input, submit } = openCreator(container, plus);

    expect(submit.disabled).toBe(true);

    fireEvent.change(input, { target: { value: '   ' } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(addCategory).not.toHaveBeenCalled();
  });

  it('已有同名分类时直接选用，不重复建', async () => {
    const { container, plus } = open();
    const { input, submit } = openCreator(container, plus);

    fireEvent.change(input, { target: { value: '文学' } });
    fireEvent.click(submit);

    await waitFor(() => expect(selectedCategoryId(container)).toBe('cat-lit'));
    expect(addCategory).not.toHaveBeenCalled();
  });

  it('名字前后带空格也能建，存的是去掉空格的名字', async () => {
    const { container, plus } = open();
    const { input, submit } = openCreator(container, plus);

    fireEvent.change(input, { target: { value: '  心理学  ' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    await waitFor(() => expect(addCategory).toHaveBeenCalledWith('心理学'));
    expect(selectedCategoryId(container)).toBe('cat-心理学');
  });
});

describe('添加书籍弹窗里删除分类', () => {
  it('每个分类后面都有一个删除按钮', () => {
    const { container } = open();
    expect(chipDelete(container, '文学')).not.toBeNull();
    expect(chipDelete(container, '哲学')).not.toBeNull();
  });

  it('点分类名是选中当前分类，不会误删', () => {
    const { container } = open();
    fireEvent.click(chip(container, '哲学'));
    expect(selectedCategoryId(container)).toBe('cat-phi');
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  it('点删除按钮先弹确认框，此时还没删', () => {
    const { container } = open();
    fireEvent.click(chipDelete(container, '哲学'));

    expect(deleteCategory).not.toHaveBeenCalled();
    expect(confirmDialog(container).textContent).toContain('哲学');
  });

  it('确认框里说清楚书会搬到哪儿，而不是「也被删掉」', () => {
    const { container } = open();
    fireEvent.click(chipDelete(container, '哲学'));

    expect(confirmDialog(container).textContent).toContain('文学');
    expect(confirmDialog(container).textContent).toContain('摘录');
  });

  it('删的是第一个分类时，文案说的接盘分类不是它自己', () => {
    const { container } = open();
    fireEvent.click(chipDelete(container, '文学'));

    const text = confirmDialog(container).textContent ?? '';
    expect(text).toContain('哲学');
  });

  it('确认后才真的删，删的是这个分类', async () => {
    const { container } = open();
    fireEvent.click(chipDelete(container, '哲学'));
    fireEvent.click(dialogButton(container, '删除分类'));

    await waitFor(() => expect(deleteCategory).toHaveBeenCalledTimes(1));
    expect(deleteCategory).toHaveBeenCalledWith('cat-phi');
  });

  it('取消就什么也不删，确认框收起来', () => {
    const { container } = open();
    fireEvent.click(chipDelete(container, '哲学'));
    fireEvent.click(dialogButton(container, '取消'));

    expect(deleteCategory).not.toHaveBeenCalled();
    expect(container.querySelectorAll('h3').length).toBe(1); // 只剩弹窗自己的标题
  });

  it('点删除按钮不会顺带改掉当前选中的分类', () => {
    const { container } = open();
    expect(selectedCategoryId(container)).toBe('cat-lit');

    fireEvent.click(chipDelete(container, '哲学'));

    expect(selectedCategoryId(container)).toBe('cat-lit');
  });

  it('删掉的正是当前选中的分类时，选中态回落到剩下的第一个', async () => {
    const { container } = open();
    fireEvent.click(chip(container, '哲学'));
    expect(selectedCategoryId(container)).toBe('cat-phi');

    fireEvent.click(chipDelete(container, '哲学'));
    fireEvent.click(dialogButton(container, '删除分类'));

    await waitFor(() => expect(selectedCategoryId(container)).toBe('cat-lit'));
  });

  it('只剩一个分类时删除按钮禁用，点不动', () => {
    categories = [{ id: 'cat-lit', name: '文学', isPreset: true, order: 0, createdAt: '' }];
    const { container } = open();

    const del = chipDelete(container, '文学');
    expect(del.disabled).toBe(true);
    fireEvent.click(del);
    expect(deleteCategory).not.toHaveBeenCalled();
  });
});
