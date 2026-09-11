/**
 * @vitest-environment jsdom
 * 邮筒未读气泡的状态来源：只认 LetterBox.lastReceiveDate 是不是今天。
 * 之前没有任何「已读」字段 —— 收信时 obtainLetter() 才写入 lastReceiveDate，
 * 所以点开邮箱气泡必须立刻消失，跨天后又要自己亮回来。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MailboxProvider, useOpenMailbox, useUnreadLetter } from '../MailboxProvider';
import { beijingDateKey } from '../dates';

const hoisted = vi.hoisted(() => ({
  letterBox: { current: null as { id: string; receivedCount: number; lastReceiveDate: string; quoteId: string } | null },
  obtainLetter: vi.fn(),
}));

vi.mock('../../db', () => ({
  LETTER_BOX_KEY: 'main',
  getLetterBox: () => Promise.resolve(hoisted.letterBox.current),
}));

vi.mock('../letterLogic', () => ({
  obtainLetter: () => hoisted.obtainLetter(),
}));

vi.mock('../letterImage', () => ({
  rasterizeLetter: () => Promise.resolve(new Blob([], { type: 'image/png' })),
  warmLetterAssets: () => Promise.resolve(),
  downloadBlob: () => {},
  letterImageFilename: () => 'letter.png',
}));

vi.mock('../../hooks/usePrefetchOnIdle', () => ({ usePrefetchOnIdle: () => {} }));

function Probe() {
  const hasUnread = useUnreadLetter();
  const openMailbox = useOpenMailbox();
  return (
    <>
      <span data-testid="unread">{hasUnread ? 'yes' : 'no'}</span>
      <button onClick={openMailbox}>拆信</button>
    </>
  );
}

const renderProbe = () =>
  render(
    <MailboxProvider>
      <Probe />
    </MailboxProvider>,
  );

const today = beijingDateKey();
const letter = (lastReceiveDate: string) => ({
  id: 'main',
  receivedCount: 1,
  lastReceiveDate,
  quoteId: 'q1',
});

beforeEach(() => {
  hoisted.letterBox.current = null;
  hoisted.obtainLetter.mockReset();
  hoisted.obtainLetter.mockResolvedValue({
    number: 1, quoteText: '正文', bookTitle: '书名', bookAuthor: '作者', svg: '<svg/>',
  });
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe('邮筒未读气泡', () => {
  it('从没收过信 → 未读', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('yes'));
  });

  it('今天已经拆过 → 不是未读', async () => {
    hoisted.letterBox.current = letter(today);
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('no'));
  });

  it('上次收信是昨天 → 重新算未读', async () => {
    hoisted.letterBox.current = letter('2020-01-01');
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('yes'));
  });

  it('点开邮箱拆完信，气泡立刻消失', async () => {
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('yes'));

    // 收信写入 lastReceiveDate 之后，读到的就是今天
    hoisted.letterBox.current = letter(today);
    fireEvent.click(screen.getByRole('button', { name: '拆信' }));

    await waitFor(() => expect(screen.getByTestId('unread').textContent).toBe('no'));
    expect(hoisted.obtainLetter).toHaveBeenCalledTimes(1);
  });
});
