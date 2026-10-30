/**
 * @vitest-environment jsdom
 * 感悟超长时折叠到 3 行，点「展开」看全文。
 *
 * jsdom 没有排版引擎，量不出真实高度，所以这里把 scrollHeight / clientHeight 装成
 * 可控的值 —— 测的是「测量的结论怎么影响渲染」，不是测量本身。真实排版（-webkit-line-clamp
 * 配 pre-wrap 到底截不截得住）只能在浏览器里看，别拿这个文件当那件事的证明。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import CollapsibleThought, { collapseBlankLines, THOUGHT_MAX_LINES } from '../CollapsibleThought';
import { canSkipMeasurement, isOverflowing } from '../../hooks/useClampCollapse';

/** 三行 × 20.6px，和渲染时的高度无关，只是给测量一个「折叠后多高」的基准。 */
const COLLAPSED_HEIGHT = 62;
const OVERFLOWING_HEIGHT = 400;
const LONG = '长'.repeat(500);

function stubHeights(scrollHeight: number, clientHeight = COLLAPSED_HEIGHT) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

const clampOf = (root: HTMLElement) =>
  root.querySelector('p')!.style.getPropertyValue('-webkit-line-clamp');

/** 灰框宽度。组件用它判断「宽度是不是真的变了」，jsdom 里得自己给个数。 */
let boxWidth = 390;

beforeEach(() => {
  // 默认装成「没溢出」；要测截断的用例自己再装一次
  stubHeights(COLLAPSED_HEIGHT);
  boxWidth = 390;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => boxWidth,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

describe('折叠判定', () => {
  it('多出 1px 不算溢出：亚像素误差不该给短感悟挂上按钮', () => {
    expect(isOverflowing(COLLAPSED_HEIGHT + 1, COLLAPSED_HEIGHT)).toBe(false);
    expect(isOverflowing(COLLAPSED_HEIGHT + 21, COLLAPSED_HEIGHT)).toBe(true);
  });

  it('短且没有换行就不用量', () => {
    const lines = THOUGHT_MAX_LINES;
    expect(canSkipMeasurement('记一笔', lines)).toBe(true);
    expect(canSkipMeasurement('a'.repeat(30), lines)).toBe(true);
    expect(canSkipMeasurement('a'.repeat(31), lines)).toBe(false);
    // 字数不多但换行多，照样会超
    expect(canSkipMeasurement('短\n有换行', lines)).toBe(false);
  });

  it('折叠态压掉多余空行，但段落间距留着', () => {
    expect(collapseBlankLines('一\n\n\n\n二')).toBe('一\n\n二');
    expect(collapseBlankLines('一\n\n二')).toBe('一\n\n二');
  });

  it('折叠态去掉开头的空行：否则 3 行全被空行吃光，看着像个空灰框', () => {
    expect(collapseBlankLines('\n\n\n\n正文')).toBe('正文');
    expect(collapseBlankLines('\n\n正文')).toBe('正文');
  });
});

describe('CollapsibleThought', () => {
  it('不溢出时整段显示，不给按钮', () => {
    const { queryByText, container } = render(<CollapsibleThought thought="记一笔" />);

    expect(queryByText('展开')).toBeNull();
    expect(clampOf(container)).toBe('');
  });

  it('溢出时折叠到 3 行，并给出「展开」', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { getByText, container } = render(<CollapsibleThought thought={LONG} />);

    expect(clampOf(container)).toBe(String(THOUGHT_MAX_LINES));
    expect(getByText('展开').getAttribute('aria-expanded')).toBe('false');
  });

  it('点开后不再截断，按钮变「收起」', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { getByText, container } = render(<CollapsibleThought thought={LONG} />);
    fireEvent.click(getByText('展开'));

    expect(getByText('收起').getAttribute('aria-expanded')).toBe('true');
    expect(clampOf(container)).toBe('');
  });

  it('把长文改成短句之后，按钮自己撤销', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { queryByText, rerender } = render(<CollapsibleThought thought={LONG} />);
    expect(queryByText('展开')).not.toBeNull();

    stubHeights(COLLAPSED_HEIGHT);
    rerender(<CollapsibleThought thought="改短了" />);

    expect(queryByText('展开')).toBeNull();
  });

  // 这一条是踩过的坑：整段渲染时 scrollHeight 恒等于 clientHeight，先量后裁永远量不出溢出，
  // 结果就是功能静默失效 —— 千字感悟一张都没折，还没人看得出来。
  it('量的时候必须已经截断：量的是折叠态，不是整段', () => {
    const reads: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        reads.push(this.style.getPropertyValue('-webkit-line-clamp') || '整段态');
        return OVERFLOWING_HEIGHT;
      },
    });

    render(<CollapsibleThought thought={LONG} />);

    expect(reads[0]).toBe(String(THOUGHT_MAX_LINES));
  });

  it('量出「放得下」就不再截断：折叠是默认，不是结论', () => {
    const { queryByText, container } = render(<CollapsibleThought thought={LONG} />);

    expect(clampOf(container)).toBe('');
    expect(queryByText('展开')).toBeNull();
  });

  it('变窄之后结论作废、重新量：宽屏放得下，收窄就该截断给按钮', () => {
    const realResizeObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

    try {
      const { getByText, queryByText, container } = render(<CollapsibleThought thought={LONG} />);
      expect(queryByText('展开')).toBeNull();

      stubHeights(OVERFLOWING_HEIGHT); // 窄了：这一档确实放不下
      boxWidth = 200;
      fireEvent(window, new Event('resize'));

      expect(clampOf(container)).toBe(String(THOUGHT_MAX_LINES));
      expect(getByText('展开')).not.toBeNull();
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = realResizeObserver;
    }
  });

  // 被截断的元素自己带内边距的话，line-clamp 的裁剪边界（padding box）会在底部留出一条缝，
  // 下一行的字头正好从缝里漏出来。底色和内边距必须挂在外层灰框上。
  it('截断元素自己不带内边距和底色，灰框在外层', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { container } = render(<CollapsibleThought thought={LONG} />);
    const clampedEl = container.querySelector('p')!;

    expect(clampedEl.style.padding).toBe('');
    expect(clampedEl.style.background).toBe('');
    expect(clampedEl.parentElement!.style.padding).toBe('6px 10px');
    expect(clampedEl.parentElement!.style.background).toContain('--color-bg-thought');
  });

  it('感悟里的加粗按行内元素渲染，行首符号原样保留，不产生块级子元素', () => {
    const { container } = render(<CollapsibleThought thought={'- **读**完了\n- 第二点'} />);

    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toContain('- 读完了');
    expect(container.querySelector('ul,ol,li')).toBeNull();
  });

  it('感悟使用自己那条摘录选的高亮色', () => {
    const { container } = render(
      <CollapsibleThought thought="==记一笔==" markColor="#F3D3D8" />,
    );

    expect(container.querySelector('mark')!.style.background).toMatch(/rgb\(243, 211, 216\)|#F3D3D8/i);
  });
});
