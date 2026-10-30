// @vitest-environment jsdom
/**
 * 书架 v2 单行分类的渲染（回归：空分类先挂载、后加书）。
 *
 * 线上实测过一条：新建分类「社会学」时这一行是空的，组件整块不渲染内容，
 * 于是测量用的 div 也不在 DOM 里 —— effect 拿不到 element 直接 return，
 * ResizeObserver 挂不上；之后再往这个分类里加书时 effect 不会重跑，
 * containerWidth 一直停在 0，排布引擎拿到 rowWidth=0 就返回空数组，
 * 表现是「分类标题有了、书一本都不显示」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ShelfRowV2 from '../shelf/ShelfRowV2';
import type { Book } from '../types';

/** 随便一个正经的容器宽度，够摆下一本书就行 */
const CONTAINER_WIDTH = 756;

class FakeResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function makeBook(id: string, title: string, categoryId = 'cat-soc'): Book {
  return {
    id,
    title,
    author: '佚名',
    categoryId,
    coverType: null,
    coverData: null,
    // 显式竖放：排布引擎不再靠随机数挑朝向，断言才稳定
    layout: 'spine',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  // jsdom 里所有元素的 rect 都是 0，不 stub 就量不出宽度
  const rect = {
    width: CONTAINER_WIDTH,
    height: 0,
    top: 0,
    left: 0,
    right: CONTAINER_WIDTH,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ShelfRowV2', () => {
  it('刚挂载就有书时，标题和书脊都要渲染出来', () => {
    render(
      <ShelfRowV2 name="文学" books={[makeBook('b1', '潮汐')]} bookCount={1} onSelect={() => {}} />,
    );

    expect(screen.getByText('文学')).toBeTruthy();
    expect(screen.getByText('潮汐')).toBeTruthy();
  });

  it('空分类不渲染内容（不占高度）', () => {
    render(<ShelfRowV2 name="社会学" books={[]} bookCount={0} onSelect={() => {}} />);

    expect(screen.queryByText('社会学')).toBeNull();
  });

  it('先以空分类挂载、之后才加进第一本书，搁板也要排出来', () => {
    const { rerender } = render(
      <ShelfRowV2 name="社会学" books={[]} bookCount={0} onSelect={() => {}} />,
    );

    rerender(
      <ShelfRowV2 name="社会学" books={[makeBook('b1', '潮汐')]} bookCount={1} onSelect={() => {}} />,
    );

    expect(screen.getByText('社会学')).toBeTruthy();
    expect(screen.getByText('潮汐')).toBeTruthy();
  });
});
