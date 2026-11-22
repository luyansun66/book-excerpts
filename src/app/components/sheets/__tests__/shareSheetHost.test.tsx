/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ShareSheetHost from '../ShareSheetHost';

afterEach(cleanup);

const props = {
  open: true,
  onClose: vi.fn(),
  quote: {
    id: 'q1',
    bookId: 'b1',
    text: '正文',
    thought: '',
    page: null,
    date: '2026-11-20',
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  },
  bookTitle: '书名',
  bookAuthor: '作者',
};

describe('ShareSheetHost', () => {
  it('动态模块加载期间显示可感知的状态，不再静默留白', async () => {
    const loader = vi.fn(() => new Promise<never>(() => {}));
    render(<ShareSheetHost {...props} loader={loader} />);

    expect(screen.getByRole('dialog', { name: '正在打开图片编辑器' })).toBeTruthy();
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
  });

  it('加载完成后挂载现有分享编辑器并传递默认模板', async () => {
    const MockSheet = ({ initialTemplate }: { initialTemplate?: string }) => (
      <div>当前模板：{initialTemplate}</div>
    );
    render(<ShareSheetHost {...props} loader={vi.fn(async () => ({ default: MockSheet }))} />);

    expect(await screen.findByText('当前模板：original')).toBeTruthy();
  });

  it('回顾阅读入口可把日历模板传给同一个编辑器', async () => {
    const MockSheet = ({ initialTemplate }: { initialTemplate?: string }) => (
      <div>当前模板：{initialTemplate}</div>
    );
    render(
      <ShareSheetHost
        {...props}
        initialTemplate="calendar"
        loader={vi.fn(async () => ({ default: MockSheet }))}
      />,
    );

    expect(await screen.findByText('当前模板：calendar')).toBeTruthy();
  });

  it('加载失败时显示可恢复提示，并可返回阅读弹窗', async () => {
    const onClose = vi.fn();
    render(
      <ShareSheetHost
        {...props}
        onClose={onClose}
        loader={vi.fn(async () => { throw new Error('chunk failed'); })}
      />,
    );

    expect(await screen.findByText('图片编辑器加载失败')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回阅读' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
