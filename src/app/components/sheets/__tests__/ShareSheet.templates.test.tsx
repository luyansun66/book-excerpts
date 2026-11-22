/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ShareSheet from '../ShareSheet';

vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({
    toBlob: (cb: (value: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' })),
  })),
}));

const quote = {
  id: 'quote-template-1',
  bookId: 'book-template-1',
  text: '同一份摘录可以在原版与日历书摘之间自由切换。',
  thought: '保留两种模板各自的编辑状态。',
  chapter: '',
  page: null,
  date: '2026-11-21',
  createdAt: '2026-11-21T00:00:00.000Z',
  updatedAt: '2026-11-21T00:00:00.000Z',
};

function renderSheet(initialTemplate?: 'original' | 'calendar') {
  return render(
    <ShareSheet
      open
      onClose={() => {}}
      quote={quote}
      bookTitle="折角"
      bookAuthor="测试作者"
      initialTemplate={initialTemplate}
    />,
  );
}

function editorCardRoot(): HTMLElement {
  return document.querySelector('[data-share-editor-template] > div') as HTMLElement;
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 900 });
});

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  vi.restoreAllMocks();
});

describe('ShareSheet 双模板入口', () => {
  it('用「主题」和「背景」区分模板与配色分组', () => {
    renderSheet();

    expect(screen.getByText('主题')).toBeTruthy();
    expect(screen.getByText((_, element) =>
      element?.tagName === 'DIV' &&
      (element as HTMLElement).style.fontSize === '11px' &&
      Boolean(element.textContent?.startsWith('背景 ·')),
    )).toBeTruthy();
    expect(screen.queryByText('模板')).toBeNull();
  });

  it('书籍摘录入口默认原版，并完整保留贴纸与原有默认选择', () => {
    renderSheet();

    const classicButton = screen.getByRole('button', { name: '经典书摘' });
    expect(classicButton.getAttribute('aria-pressed')).toBe('true');
    expect(classicButton.style.height).toBe('44px');
    expect((classicButton.firstElementChild as HTMLElement).style.height).toBe('38px');
    expect(screen.getByRole('button', { name: '日历书摘' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: '主题 灰蓝' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '系统默认' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '贴纸 Kitty' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '包含感悟' }).getAttribute('aria-pressed')).toBe('true');
    expect(editorCardRoot().style.width).toBe('270px');
  });

  it('回顾阅读入口默认日历书摘，隐藏贴纸并允许字体、颜色和想法', () => {
    renderSheet('calendar');

    expect(screen.getByRole('button', { name: '日历书摘' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '主题 日历米棕' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '思源宋体' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '包含想法' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('自定义图片背景颜色')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '贴纸 Kitty' })).toBeNull();
    expect(editorCardRoot().style.width).toBe('360px');
    expect(editorCardRoot().getAttribute('data-share-card-template')).toBe('calendar-book-excerpt');
  });

  it('来回切换时分别保留原版和日历模板的编辑选择', () => {
    renderSheet();

    fireEvent.click(screen.getByRole('button', { name: '主题 灰蓝' }));
    fireEvent.click(screen.getByRole('button', { name: '无贴纸' }));
    fireEvent.click(screen.getByRole('button', { name: '包含感悟' }));

    fireEvent.click(screen.getByRole('button', { name: '日历书摘' }));
    fireEvent.click(screen.getByRole('button', { name: '仓耳今楷' }));
    fireEvent.click(screen.getByRole('button', { name: '包含想法' }));
    fireEvent.change(screen.getByLabelText('自定义图片背景颜色'), {
      target: { value: '#123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: '经典书摘' }));
    expect(screen.getByRole('button', { name: '主题 灰蓝' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '系统默认' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '无贴纸' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '包含感悟' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: '日历书摘' }));
    expect(screen.getByRole('button', { name: '仓耳今楷' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '包含想法' }).getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByLabelText('自定义图片背景颜色') as HTMLInputElement).value).toBe('#123456');
  });
});
