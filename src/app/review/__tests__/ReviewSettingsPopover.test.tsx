/** @vitest-environment jsdom */
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ReviewSettingsPopover from '../ReviewSettingsPopover';
import type { ReviewPreferences } from '../excerptFeedState';

function Harness() {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<ReviewPreferences>({
    viewMode: 'flip',
    readFilter: 'all',
    favoritesOnly: false,
    sortMode: 'latest',
  });
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <button type="button">外部按钮</button>
      <ReviewSettingsPopover
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        preferences={preferences}
        onChange={setPreferences}
        onShuffle={() => undefined}
      />
      <output data-testid="view">{preferences.viewMode}</output>
      <output data-testid="sort">{preferences.sortMode}</output>
    </>
  );
}

beforeEach(() => {
  window.history.replaceState({}, '');
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '');
});

describe('ReviewSettingsPopover', () => {
  it('锚点图标打开浮层，选择立即生效且随机模式显示换一换', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开回顾视图与筛选' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: '回顾视图与筛选' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: '双列' }));
    expect(screen.getByTestId('view').textContent).toBe('feed');

    fireEvent.click(screen.getByRole('radio', { name: '随机' }));
    expect(screen.getByTestId('sort').textContent).toBe('random');
    expect(screen.getByRole('button', { name: '换一换' })).toBeTruthy();
  });

  it('Esc 关闭并把焦点恢复到滑杆按钮', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开回顾视图与筛选' });
    fireEvent.click(trigger);
    // 隔离 history 分支，专门验证键盘关闭和焦点恢复。
    window.history.replaceState({}, '');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
