/**
 * @vitest-environment jsdom
 * 富文本必须渲染成「单一文本块」：所有产物都是行内元素。
 *
 * 原因：折叠用 -webkit-line-clamp，它的裁剪边界跟着块级子元素走 —— 一旦出现
 * ul / li / p，裁剪就不再落在行边界上，底部会漏出半截字（感悟那处踩过）。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import RichText from '../RichText';

afterEach(cleanup);

describe('RichText', () => {
  it('高亮渲染成 mark，加粗渲染成 strong', () => {
    const { container } = render(<RichText text={'==重点== 和 **加粗**'} scope="thought" />);
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toBe('重点 和 加粗');
  });

  it('不产生任何块级子元素', () => {
    const { container } = render(<RichText text={'- 一\n- 二\n==三=='} scope="thought" />);
    expect(container.querySelector('div,ul,ol,li,p,section,article')).toBeNull();
  });

  it('换行仍是字面的 \\n，交给 pre-wrap 排版', () => {
    const { container } = render(<RichText text={'第一行\n第二行'} scope="quote" />);
    expect(container.textContent).toBe('第一行\n第二行');
  });

  it('行首的 - 原样显示，不再换成列表前缀', () => {
    const { container } = render(<RichText text={'- 甲'} scope="thought" />);
    expect(container.textContent).toBe('- 甲');
  });

  it('摘录原文里的 == 之外不动：** 保持字面', () => {
    const { container } = render(<RichText text={'**不粗**'} scope="quote" />);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('**不粗**');
  });

  it('显式传 markBackground 时不依赖 CSS 变量', () => {
    const { container } = render(
      <RichText text={'==a=='} scope="quote" markBackground="rgba(1,2,3,0.2)" />,
    );
    const mark = container.querySelector('mark')!;
    expect(mark.style.background).toBe('rgba(1, 2, 3, 0.2)');
  });
});
