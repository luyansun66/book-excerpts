/**
 * @vitest-environment jsdom
 * 「添加摘录」的两栏格式按钮：作用于选区、再点一次去标记、插入后光标还在原处。
 *
 * 摘录原文只给「高亮」一个按钮（原文是引用，加粗会把文献里的 ** 读走样），
 * 感悟给「加粗 / 高亮」两个。
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../ocr', () => ({
  recognizeText: vi.fn(async () => ''),
  compressImage: vi.fn(async () => ''),
}));

const AddQuoteSheet = (await import('../sheets/AddQuoteSheet')).default;

afterEach(cleanup);

const sheet = () =>
  render(<AddQuoteSheet open onClose={() => {}} onSave={async () => {}} />);

const areas = () => Array.from(document.querySelectorAll('textarea')) as HTMLTextAreaElement[];

describe('格式工具栏', () => {
  it('摘录原文只有「高亮」一个格式按钮', () => {
    sheet();
    expect(screen.getAllByRole('button', { name: '高亮' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '加粗' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '无序列表' })).toBeNull();
    expect(screen.queryByRole('button', { name: '有序列表' })).toBeNull();
  });

  it('选中文字点高亮，包上 == 并保持选中', () => {
    sheet();
    const [quote] = areas();
    fireEvent.change(quote, { target: { value: '读完了' } });
    quote.setSelectionRange(0, 3);
    fireEvent.select(quote);

    fireEvent.click(screen.getAllByRole('button', { name: '高亮' })[0]);

    expect(quote.value).toBe('==读完了==');
    expect(quote.selectionStart).toBe(2);
    expect(quote.selectionEnd).toBe(5);
  });

  it('再点一次去掉标记', () => {
    sheet();
    const [quote] = areas();
    fireEvent.change(quote, { target: { value: '==读完了==' } });
    quote.setSelectionRange(2, 5);
    fireEvent.select(quote);

    fireEvent.click(screen.getAllByRole('button', { name: '高亮' })[0]);

    expect(quote.value).toBe('读完了');
  });

  it('感悟栏的加粗与高亮各自生效', () => {
    sheet();
    const [, thought] = areas();
    fireEvent.change(thought, { target: { value: '第一点' } });
    thought.setSelectionRange(0, 3);
    fireEvent.select(thought);

    fireEvent.click(screen.getByRole('button', { name: '加粗' }));
    expect(thought.value).toBe('**第一点**');

    fireEvent.change(thought, { target: { value: '第一点' } });
    thought.setSelectionRange(0, 3);
    fireEvent.select(thought);
    fireEvent.click(screen.getAllByRole('button', { name: '高亮' })[1]);
    expect(thought.value).toBe('==第一点==');
  });

  it('点击工具栏不会丢焦点（mousedown 被拦下）', () => {
    sheet();
    areas();
    const button = screen.getAllByRole('button', { name: '高亮' })[0];
    const event = fireEvent.mouseDown(button);
    // fireEvent 返回 false 表示默认行为被 preventDefault 拦掉了
    expect(event).toBe(false);
  });

  it('两栏各自选高亮色，保存时分别透传', async () => {
    const onSave = vi.fn(async () => {});
    render(<AddQuoteSheet open onClose={() => {}} onSave={onSave} />);

    const [quote, thought] = areas();
    fireEvent.change(quote, { target: { value: '==原文==' } });
    fireEvent.change(thought, { target: { value: '==感悟==' } });

    const quoteColors = screen.getByRole('group', { name: '摘录原文高亮颜色' });
    fireEvent.click(within(quoteColors).getByRole('button', { name: '薄荷' }));

    const thoughtColors = screen.getByRole('group', { name: '我的感悟高亮颜色' });
    fireEvent.click(within(thoughtColors).getByRole('button', { name: '浅粉' }));

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      text: '==原文==',
      thought: '==感悟==',
      textMarkColor: '#CFE8D5',
      thoughtMarkColor: '#F3D3D8',
    }));
  });

  it('自定义色只影响当前栏', async () => {
    const onSave = vi.fn(async () => {});
    render(<AddQuoteSheet open onClose={() => {}} onSave={onSave} />);
    fireEvent.change(areas()[0], { target: { value: '正文' } });

    const quoteColors = screen.getByRole('group', { name: '摘录原文高亮颜色' });
    fireEvent.change(within(quoteColors).getByLabelText('摘录原文自定义高亮颜色'), {
      target: { value: '#123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      textMarkColor: '#123456',
      thoughtMarkColor: undefined,
    }));
  });

  it('编辑旧摘录时回显两栏各自的颜色', () => {
    render(
      <AddQuoteSheet
        open
        onClose={() => {}}
        onSave={async () => {}}
        editQuote={{
          id: 'q1',
          bookId: 'b1',
          text: '原文',
          thought: '感悟',
          page: null,
          date: '2026-10-29',
          textMarkColor: '#CFE8D5',
          thoughtMarkColor: '#F3D3D8',
          createdAt: '',
          updatedAt: '',
        }}
      />,
    );

    const quoteColors = screen.getByRole('group', { name: '摘录原文高亮颜色' });
    const thoughtColors = screen.getByRole('group', { name: '我的感悟高亮颜色' });
    expect(within(quoteColors).getByRole('button', { name: '薄荷' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(thoughtColors).getByRole('button', { name: '浅粉' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('一键清除本栏所有高亮，保留文字、加粗和另一栏', () => {
    sheet();
    const [quote, thought] = areas();
    fireEvent.change(quote, { target: { value: '==一== 和 ==二==' } });
    fireEvent.change(thought, { target: { value: '**粗** ==感悟==' } });

    fireEvent.click(screen.getByRole('button', { name: '清除摘录原文全部高亮' }));
    expect(quote.value).toBe('一 和 二');
    expect(thought.value).toBe('**粗** ==感悟==');

    fireEvent.click(screen.getByRole('button', { name: '清除我的感悟全部高亮' }));
    expect(thought.value).toBe('**粗** 感悟');
    expect(quote.value).toBe('一 和 二');
  });

  it('没有高亮时「清除」按钮不可点', () => {
    sheet();
    expect((screen.getByRole('button', { name: '清除摘录原文全部高亮' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '清除我的感悟全部高亮' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
