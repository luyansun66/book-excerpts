/**
 * @vitest-environment jsdom
 * 邮筒的点击命中范围。
 * 根因：插画里邮筒只有「屋顶 + 身子 + 细杆 + 底座」几笔实体，笔之间的空隙点不到；
 * 投信口里的信纸原先还挂在 #time-mailbox 外面，手指正好戳在信纸上完全没反应。
 * 修复：信纸并进 #time-mailbox，并给邮筒补一块透明命中矩形撑到 48×48 CSS px。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import LibraryBuilding from '../LibraryBuilding';

// 插画里有 #time-mailbox 这类 id，测试之间不清 DOM 的话，文档里会残留多份同名 id，
// jsdom 对 `#id 后代选择器` 会走 id 快查路径命中上一份残留，querySelector 直接返回 null。
afterEach(cleanup);

function renderBuilding() {
  const onMailboxClick = vi.fn();
  const onClockClick = vi.fn();
  const { container } = render(
    <LibraryBuilding onMailboxClick={onMailboxClick} onClockClick={onClockClick} />
  );
  return { container, onMailboxClick, onClockClick };
}

describe('LibraryBuilding 邮筒点击', () => {
  it('给邮筒补上透明命中区，边长不小于 48px', () => {
    const { container } = renderBuilding();
    const hit = container.querySelector('#time-mailbox [data-mailbox-hit]');

    expect(hit).not.toBeNull();
    expect(hit!.getAttribute('fill')).toBe('transparent');
    expect(hit!.getAttribute('pointer-events')).toBe('all');
    expect(Number(hit!.getAttribute('width'))).toBeGreaterThanOrEqual(48);
    expect(Number(hit!.getAttribute('height'))).toBeGreaterThanOrEqual(48);
  });

  it('StrictMode 下重复渲染只补一块命中区', () => {
    const { container } = renderBuilding();
    renderBuilding();
    expect(container.querySelectorAll('[data-mailbox-hit]').length).toBe(1);
  });

  it('点到投信口里的信纸也能打开邮箱', () => {
    const { container, onMailboxClick } = renderBuilding();
    const letter = container.querySelector('#time-mailbox rect.st9') as Element;
    expect(letter).not.toBeNull();

    fireEvent.click(letter);
    expect(onMailboxClick).toHaveBeenCalledTimes(1);
  });

  it('点到邮筒以外的空白不会误触', () => {
    const { container, onMailboxClick, onClockClick } = renderBuilding();
    fireEvent.click(container.querySelector('svg')!);
    expect(onMailboxClick).not.toHaveBeenCalled();
    expect(onClockClick).not.toHaveBeenCalled();
  });

  it('挂钟依然可点', () => {
    const { container, onClockClick } = renderBuilding();
    fireEvent.click(container.querySelector('#reading-clock rect')!);
    expect(onClockClick).toHaveBeenCalledTimes(1);
  });
});
