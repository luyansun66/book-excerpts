/**
 * @vitest-environment jsdom
 * 摘录正文超过半屏就折起来，点「展开」看全文。
 *
 * jsdom 没有排版引擎，量不出真实高度，所以这里把 scrollHeight / clientHeight 装成
 * 可控的值 —— 测的是「测量的结论怎么影响渲染」，不是测量本身。真实排版（-webkit-line-clamp
 * 配 pre-wrap 到底截不截得住、裁剪有没有落在行边界上）只能在浏览器里看，别拿这个文件当证明。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import CollapsibleQuoteText, { quoteBodyMaxLines, QUOTE_BODY_LINE_PX } from '../CollapsibleQuoteText';

/** jsdom 的 window.innerHeight 是 768，半屏就是 384px。 */
const DEFAULT_PAGE_HEIGHT = 768;
/** 折叠后可见区 200px，溢出时内容 4000px —— 只用来给测量一个「超没超」的基准。 */
const COLLAPSED_HEIGHT = 200;
const OVERFLOWING_HEIGHT = 4000;
const LONG = '长'.repeat(500);

let pageHeight = DEFAULT_PAGE_HEIGHT;

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

/** 元素宽度。组件用它判断「宽度是不是真的变了」，jsdom 里得自己给个数。 */
let elementWidth = 390;

const clampOf = (root: HTMLElement) =>
  root.querySelector('p')!.style.getPropertyValue('-webkit-line-clamp');

beforeEach(() => {
  pageHeight = DEFAULT_PAGE_HEIGHT;
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    get: () => pageHeight,
  });
  // 默认装成「没溢出」；要测截断的用例自己再装一次
  stubHeights(COLLAPSED_HEIGHT);
  elementWidth = 390;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => elementWidth,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

describe('半屏折算成几行', () => {
  it('按行高取整，算出来的高度不越过半屏', () => {
    expect(QUOTE_BODY_LINE_PX).toBeCloseTo(25.81, 2);
    // 384 / 25.81 = 14.87，取 14 整行（15 行就 387px，越界了）
    expect(quoteBodyMaxLines(DEFAULT_PAGE_HEIGHT)).toBe(14);
    expect(quoteBodyMaxLines(1000)).toBe(19);
    expect(quoteBodyMaxLines(DEFAULT_PAGE_HEIGHT) * QUOTE_BODY_LINE_PX).toBeLessThanOrEqual(
      DEFAULT_PAGE_HEIGHT / 2,
    );
  });

  it('屏幕再矮也留 1 行：正文不该被折成空气', () => {
    expect(quoteBodyMaxLines(40)).toBe(1);
    expect(quoteBodyMaxLines(0)).toBe(1);
  });
});

describe('CollapsibleQuoteText', () => {
  it('半屏放得下就整段显示，不给按钮', () => {
    const { queryByText, container } = render(<CollapsibleQuoteText text="短摘录" />);

    expect(queryByText('展开')).toBeNull();
    expect(clampOf(container)).toBe('');
  });

  // 正文两端对齐：跟回顾卡、分享图同一套（见 TEXT_STYLE 的注释）。左对齐会退回行尾不齐。
  it('正文两端对齐，中文按字伸缩、标点不掉行首', () => {
    const { container } = render(<CollapsibleQuoteText text="短摘录" />);
    const body = container.querySelector('p')!;

    expect(body.style.textAlign).toBe('justify');
    expect(body.style.textJustify).toBe('inter-character');
    expect(body.style.lineBreak).toBe('strict');
  });

  it('超过半屏就折到半屏的行数，并给出「展开」', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { getByText, container } = render(<CollapsibleQuoteText text={LONG} />);

    expect(clampOf(container)).toBe('14');
    expect(getByText('展开').getAttribute('aria-expanded')).toBe('false');
  });

  it('点开后不再截断，按钮变「收起」', () => {
    stubHeights(OVERFLOWING_HEIGHT);

    const { getByText, container } = render(<CollapsibleQuoteText text={LONG} />);
    fireEvent.click(getByText('展开'));

    expect(getByText('收起').getAttribute('aria-expanded')).toBe('true');
    expect(clampOf(container)).toBe('');
  });

  // 感悟那套整理（去开头空行、压连续空行）不能顺手挪到摘录上：摘录是原文照抄，
  // 折叠态也得是原样，不能替用户重排他的引文。
  it('正文一个字都不改：折叠态也不动空行', () => {
    stubHeights(OVERFLOWING_HEIGHT);
    const text = '\n\n第一段\n\n\n\n第二段';

    const { container } = render(<CollapsibleQuoteText text={text} />);

    expect(clampOf(container)).toBe('14');
    expect(container.querySelector('p')!.textContent).toBe(text);
  });

  // 这一条是踩过的坑：整段渲染时 scrollHeight 恒等于 clientHeight，先量后裁永远量不出溢出。
  it('量的时候必须已经截断：量的是折叠态，不是整段', () => {
    const reads: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get(this: HTMLElement) {
        reads.push(this.style.getPropertyValue('-webkit-line-clamp') || '整段态');
        return OVERFLOWING_HEIGHT;
      },
    });

    render(<CollapsibleQuoteText text={LONG} />);

    expect(reads[0]).toBe('14');
  });

  it('页面变矮，半屏跟着变窄：结论作废、按新的行数重折', () => {
    const { getByText, queryByText, container } = render(<CollapsibleQuoteText text={LONG} />);
    expect(queryByText('展开')).toBeNull(); // 这一档放得下

    stubHeights(OVERFLOWING_HEIGHT);
    pageHeight = 300; // 150 / 25.81 = 5.81 → 5 行
    fireEvent(window, new Event('resize'));

    expect(clampOf(container)).toBe('5');
    expect(getByText('展开')).not.toBeNull();
  });

  it('页面高度没变就不重算：手机上地址栏收放会连发一长串 resize', () => {
    const { queryByText } = render(<CollapsibleQuoteText text={LONG} />);
    expect(queryByText('展开')).toBeNull();

    stubHeights(OVERFLOWING_HEIGHT); // 内容没变，只是这一档放得下
    fireEvent(window, new Event('resize'));

    expect(queryByText('展开')).toBeNull();
  });

  it('元素变窄也算上限变了：只拖宽度的窗口边不会改页面高度', () => {
    const { getByText, queryByText, container } = render(<CollapsibleQuoteText text={LONG} />);
    expect(queryByText('展开')).toBeNull();

    stubHeights(OVERFLOWING_HEIGHT);
    elementWidth = 200;
    fireEvent(window, new Event('resize'));

    expect(clampOf(container)).toBe('14');
    expect(getByText('展开')).not.toBeNull();
  });

  it('正文里的高程标记渲染成 mark，且折叠行数不变', () => {
    stubHeights(OVERFLOWING_HEIGHT);
    const { container } = render(<CollapsibleQuoteText text={LONG + '==重点=='} />);

    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')!.textContent).toBe('重点');
    expect(clampOf(container)).toBe('14');
  });

  it('这条摘录自己的高亮色优先于主题默认', () => {
    const { container } = render(
      <CollapsibleQuoteText text="他说==要活下去==。" markColor="#CFE8D5" />,
    );

    expect(container.querySelector('mark')!.style.background).toMatch(/rgb\(207, 232, 213\)|#CFE8D5/i);
  });
});
