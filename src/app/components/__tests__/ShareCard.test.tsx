/**
 * @vitest-environment jsdom
 * 分享图按纯文本导出：不出现标记符号，也不为了标记额外加粗/上底色。
 * 字体子集同理 —— 只该收「真字」，不能把 == ** 塞进子集请求里。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { stripRichText } from '../../richText';
import ShareCard from '../sheets/ShareCard';

afterEach(cleanup);

const theme = {
  bgColor: '#fdfcf9',
  textColor: '#20232a',
  accentColor: '#b8860b',
};

const quote = {
  id: 'q1',
  bookId: 'b1',
  text: '他说==要活下去==。',
  thought: '- **第一点**',
  page: '12',
  date: '2026-10-29',
  createdAt: '',
  updatedAt: '',
};

describe('分享卡', () => {
  it('正文与感悟按纯文本渲染，标记符号不出现', () => {
    const { container } = render(
      <ShareCard
        quote={quote}
        bookTitle="书"
        bookAuthor="作者"
        theme={theme}
        cardFamily="serif"
        showThoughts
        stickerSvg={null}
      />,
    );
    expect(container.querySelectorAll('mark, strong')).toHaveLength(0);
    expect(container.textContent).toContain('他说要活下去。');
    expect(container.textContent).toContain('- 第一点');
    expect(container.textContent).not.toContain('==');
    expect(container.textContent).not.toContain('**');
  });
});

describe('字体子集文本', () => {
  it('strip 之后不含任何标记符号', () => {
    const stripped = stripRichText(quote.text, 'quote');
    expect(stripped).toBe('他说要活下去。');
    expect(stripped).not.toContain('=');
  });
});
