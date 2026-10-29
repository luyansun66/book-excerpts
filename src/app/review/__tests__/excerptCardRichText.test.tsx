/**
 * @vitest-environment jsdom
 * 回顾卡的字号是「探针量、真卡用」，两边必须渲染同一棵树。
 *
 * 探针多了 / 少了一个 <mark>，量出来的行高就不同 —— 结果是真卡上字被切掉，
 * 或者短摘录被塞进小一号的字。所以这里断言两处 mark 数量一致。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ExcerptCard from '../rolodex/ExcerptCard';

afterEach(cleanup);

const quote = {
  id: 'q1',
  bookId: 'b1',
  text: '他说==要活下去==，==还要写下去==。',
  thought: '',
  page: '12',
  date: '2026-10-29',
  createdAt: '',
  updatedAt: '',
};

describe('回顾卡的高亮', () => {
  it('正文与探针渲染出同样多的 mark', () => {
    const { container } = render(<ExcerptCard quote={quote} book={null} />);
    const marks = container.querySelectorAll('mark');
    // 正文 2 个 + 探针 2 个
    expect(marks).toHaveLength(4);
  });

  it('高亮底色用卡片自己的纸色配色，不读主题变量', () => {
    const { container } = render(<ExcerptCard quote={quote} book={null} />);
    const mark = container.querySelector('mark')!;
    expect(mark.style.background).not.toContain('var(');
  });

  it('这条摘录设了颜色时，正文和探针用同一个底色', () => {
    const { container } = render(
      <ExcerptCard quote={{ ...quote, textMarkColor: '#CFE8D5' }} book={null} />,
    );
    const marks = Array.from(container.querySelectorAll('mark'));

    expect(marks).toHaveLength(4);
    expect(marks[0].style.background).toMatch(/rgb\(207, 232, 213\)|#CFE8D5/i);
    expect(marks[1].style.background).toBe(marks[0].style.background);
    expect(marks[2].style.background).toBe(marks[0].style.background);
    expect(marks[3].style.background).toBe(marks[0].style.background);
  });
});
