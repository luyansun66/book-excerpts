/**
 * @vitest-environment jsdom
 * 分类选择面板的两条硬约束：它是 iOS 风格的磨砂玻璃面板，而且点得到。
 *
 * 这里只守「坏了肉眼不一定马上发现」的东西：模态语义、玻璃材质、
 * 44px 的最小可点尺寸、缩放锚点。业务行为（选/删/建）在 AddBookSheet 的集成测试里。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import CategoryPicker, { scaleOriginFor } from '../CategoryPicker';
import type { Category } from '../../types';

afterEach(cleanup);

const categories: Category[] = [
  { id: 'cat-lit', name: '文学', isPreset: true, order: 0, createdAt: '' },
  { id: 'cat-phi', name: '哲学', isPreset: true, order: 1, createdAt: '' },
];

function open(overrides: Partial<Parameters<typeof CategoryPicker>[0]> = {}) {
  const props = {
    open: true,
    categories,
    selectedId: 'cat-lit',
    canDelete: true,
    anchorEl: null,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onCreate: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const utils = render(<CategoryPicker {...props} />);
  return { ...utils, props };
}

/** 可滚动的分类列表（标题底下那层）。 */
function list(container: HTMLElement) {
  return container.querySelector('.glass-scroll-fade') as HTMLElement | null;
}

/** jsdom 不做布局，滚动位置得自己塞进去，再手动派发 scroll。 */
function scrollList(container: HTMLElement, top: number) {
  const el = list(container);
  expect(el, '找不到可滚动的分类列表').not.toBeNull();
  Object.defineProperty(el!, 'scrollTop', { value: top, writable: true, configurable: true });
  fireEvent.scroll(el!);
  return el!;
}

/** 玻璃材质那层（面板的圆角容器）。 */
function glassPanel(container: HTMLElement) {
  const dialog = container.querySelector('[role="dialog"]') as HTMLElement | null;
  expect(dialog, '面板丢了 role="dialog"').not.toBeNull();
  return dialog!;
}

describe('分类面板：iOS 磨砂玻璃', () => {
  it('关闭时不渲染任何东西', () => {
    const { container } = open({ open: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('是带 aria-modal 的模态对话框，读屏知道焦点被它接管了', () => {
    const { container } = open();
    const panel = glassPanel(container);
    expect(panel.getAttribute('aria-modal')).toBe('true');
    expect(panel.getAttribute('aria-label')).toBe('选择分类');
  });

  it('面板底色是半透明玻璃令牌，而不是一块不透明的白', () => {
    const { container } = open();
    const style = glassPanel(container).style;
    expect(style.background).toContain('--color-glass');
    expect(style.backdropFilter).toContain('blur');
    // 代码里同时写了 -webkit-backdrop-filter（iOS 18 以下的 Safari 只认前缀版），
    // 但 jsdom 不认识这个前缀属性，会直接丢掉，所以这里断言不了。
  });

  it('上缘有一道内高光边，玻璃才有厚度', () => {
    const { container } = open();
    expect(glassPanel(container).style.border).toContain('--color-glass-edge');
  });

  it('行和删除按钮的可点区域都不小于 44px（iOS 最小可点尺寸）', () => {
    const { container } = open();
    const rows = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
    const nameRow = container.querySelector('button[aria-label="选择分类 文学"]') as HTMLElement;
    const del = container.querySelector('button[aria-label="删除分类 文学"]') as HTMLElement;

    for (const el of [nameRow, del]) {
      expect(parseFloat(el.style.minHeight), `${el.getAttribute('aria-label')} 太矮了`).toBeGreaterThanOrEqual(44);
    }
    expect(parseFloat(del.style.width)).toBeGreaterThanOrEqual(44);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('选中项用金色勾号 + 加粗，不靠加个框来区分', () => {
    const { container } = open();
    const selected = container.querySelector('button[aria-label="选择分类 文学"]') as HTMLElement;
    const other = container.querySelector('button[aria-label="选择分类 哲学"]') as HTMLElement;

    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(parseInt(selected.style.fontWeight, 10)).toBeGreaterThan(parseInt(other.style.fontWeight, 10));
    expect(selected.querySelector('svg')).not.toBeNull();
    expect(other.querySelector('svg')).toBeNull();
  });

  it('只剩一个分类时行尾按钮禁用', () => {
    const onDelete = vi.fn();
    const { container } = open({ canDelete: false, onDelete });
    const del = container.querySelector('button[aria-label="删除分类 文学"]') as HTMLButtonElement;

    expect(del.disabled).toBe(true);
    fireEvent.click(del);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('没滚动时不在标题底下加遮罩（否则第一行顶部会被削掉一块）', () => {
    const { container } = open();
    expect(list(container)!.getAttribute('data-scrolled')).toBe('false');
  });

  it('列表滚起来后，标题底下出现渐隐遮罩（iOS scroll edge effect）', () => {
    const { container } = open();
    scrollList(container, 24);
    expect(list(container)!.getAttribute('data-scrolled')).toBe('true');
  });

  it('滚回顶部就撤掉遮罩', () => {
    const { container } = open();
    scrollList(container, 24);
    scrollList(container, 0);
    expect(list(container)!.getAttribute('data-scrolled')).toBe('false');
  });

  it('刚滚一点点（<2px 的抖动）不算滚动，遮罩不该闪', () => {
    const { container } = open();
    scrollList(container, 1);
    expect(list(container)!.getAttribute('data-scrolled')).toBe('false');
  });

  it('Esc 关掉面板', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('缩放锚点', () => {
  const panel = { left: 40, top: 300, width: 320, height: 220 };

  it('锚在触发元素中心，换算成相对面板左上角的坐标', () => {
    // 触发元素中心 = (100+40, 500+22) = (140, 522)
    expect(scaleOriginFor(panel, { left: 100, top: 500, width: 80, height: 44 })).toBe('100px 222px');
  });

  it('触发元素比面板低时，锚点跟着往下走', () => {
    // 中心 = (140+40, 700+22) = (180, 722)；相对面板左上角 = (140, 422)
    expect(scaleOriginFor(panel, { left: 140, top: 700, width: 80, height: 44 })).toBe('140px 422px');
  });

  it('尺寸拿不到时返回 null，交给调用方兜底（否则会算出 NaN，面板整个渲染不出来）', () => {
    expect(scaleOriginFor({ ...panel, width: 0 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(scaleOriginFor(panel, { left: 0, top: 0, width: 80, height: 0 })).toBeNull();
  });
});
