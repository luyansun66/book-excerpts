/**
 * @vitest-environment jsdom
 * 插画里两处可点对象的命中范围。
 * 根因：邮筒只有「屋顶 + 身子 + 细杆 + 底座」几笔实体，笔之间的空隙点不到；投信口里的
 * 信纸原先还挂在 #time-mailbox 外面，手指正好戳在信纸上完全没反应；挂钟墨迹只有约
 * 22×27 CSS px，也远小于最小点击尺寸。
 * 修复：信纸并进 #time-mailbox，两个对象各补一块透明命中矩形撑到 48×48 CSS px。
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

function hitArea(container: HTMLElement, selector: string) {
  const hit = container.querySelector(`${selector} [data-tap-hit]`);
  expect(hit, `${selector} 没有命中区`).not.toBeNull();
  return hit!;
}

describe('LibraryBuilding 点击命中范围', () => {
  it('邮筒补上透明命中区，边长不小于 48px', () => {
    const { container } = renderBuilding();
    const hit = hitArea(container, '#time-mailbox');

    expect(hit.getAttribute('fill')).toBe('transparent');
    expect(hit.getAttribute('pointer-events')).toBe('all');
    expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(48);
    expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(48);
  });

  it('挂钟补上透明命中区，边长不小于 48px', () => {
    const { container } = renderBuilding();
    const hit = hitArea(container, '#reading-clock');

    expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(48);
    expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(48);
  });

  it('命中区以墨迹中心为中心，不会偏出画布', () => {
    const { container } = renderBuilding();
    const svg = container.querySelector('svg')!;
    const view = svg.viewBox.baseVal;

    for (const selector of ['#time-mailbox', '#reading-clock']) {
      const hit = hitArea(container, selector);
      const x = Number(hit.getAttribute('x'));
      const y = Number(hit.getAttribute('y'));
      const width = Number(hit.getAttribute('width'));
      const height = Number(hit.getAttribute('height'));

      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(view.width);
      expect(y + height).toBeLessThanOrEqual(view.height);
    }
  });

  it('重复渲染只补一块命中区', () => {
    const { container } = renderBuilding();
    renderBuilding();
    expect(container.querySelectorAll('[data-tap-hit]').length).toBe(2);
  });

  it('点到投信口里的信纸也能打开邮箱', () => {
    const { container, onMailboxClick } = renderBuilding();
    const letter = container.querySelector('#time-mailbox rect.st9')!;
    expect(letter).not.toBeNull();

    fireEvent.click(letter);
    expect(onMailboxClick).toHaveBeenCalledTimes(1);
  });

  it('点到邮筒的空白边缘（命中区本身）也能打开邮箱', () => {
    const { container, onMailboxClick } = renderBuilding();
    fireEvent.click(hitArea(container, '#time-mailbox'));
    expect(onMailboxClick).toHaveBeenCalledTimes(1);
  });

  it('挂钟墨迹与它扩出来的空白边缘都能开计时器', () => {
    const { container, onClockClick } = renderBuilding();
    fireEvent.click(container.querySelector('#reading-clock rect.st5')!);
    fireEvent.click(hitArea(container, '#reading-clock'));
    expect(onClockClick).toHaveBeenCalledTimes(2);
  });

  it('点到邮筒以外的空白不会误触', () => {
    const { container, onMailboxClick, onClockClick } = renderBuilding();
    fireEvent.click(container.querySelector('svg')!);
    expect(onMailboxClick).not.toHaveBeenCalled();
    expect(onClockClick).not.toHaveBeenCalled();
  });
});
