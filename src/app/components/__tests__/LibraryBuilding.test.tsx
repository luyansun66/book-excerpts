/**
 * @vitest-environment jsdom
 * 插画里两处可点对象的命中范围。
 * 根因：邮筒只有「旗子 + 身子 + 细杆 + 底座」几笔实体，笔之间的空隙点不到；投信口里的
 * 信纸一旦挂在 #time-mailbox 外面，手指正好戳在信纸上就完全没反应；挂钟墨迹只有约
 * 19×23 CSS px，也远小于最小点击尺寸。
 * 修复：信纸并进 #time-mailbox，两个对象各补一块透明命中矩形撑到 48×48 CSS px。
 *
 * 注意：插画每轮重绘都会换掉 Illustrator 自动生成的 st* class 名，所以这里按结构定位
 * （`> rect`）而不是按 class，只有 #reading-clock / #time-mailbox 这几个 id 是稳定的。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import LibraryBuilding from '../LibraryBuilding';

// 插画里有 #time-mailbox 这类 id，测试之间不清 DOM 的话，文档里会残留多份同名 id，
// jsdom 对 `#id 后代选择器` 会走 id 快查路径命中上一份残留，querySelector 直接返回 null。
afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

/** 假的 matchMedia：既能读 matches，也能手动触发 change 事件。 */
function stubColorScheme(matches: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => media));
  return (next: boolean) => {
    media.matches = next;
    act(() => listeners.forEach((cb) => cb()));
  };
}

function renderBuilding(props: { hasUnreadLetter?: boolean } = {}) {
  const onMailboxClick = vi.fn();
  const onClockClick = vi.fn();
  const { container } = render(
    <LibraryBuilding onMailboxClick={onMailboxClick} onClockClick={onClockClick} {...props} />
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

  it('插画整体不接收指针事件，能点到东西的只有两块热区', () => {
    const { container } = renderBuilding();
    const svg = container.querySelector('svg')!;

    // 夜版插画有几层装饰（月亮光晕）画在挂钟上层，不关掉整张插画的指针事件，
    // 点击就会被光晕抢走，closest('#reading-clock') 落空。
    expect(svg.style.pointerEvents).toBe('none');
    for (const selector of ['#time-mailbox', '#reading-clock']) {
      const hit = hitArea(container, selector);
      expect(hit.getAttribute('pointer-events')).toBe('all');
      expect(hit.getAttribute('style')).toContain('cursor');
    }
  });

  it('点到投信口里的信纸也能打开邮箱', () => {
    const { container, onMailboxClick } = renderBuilding();
    const letter = container.querySelector('#time-mailbox > rect')!;
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
    fireEvent.click(container.querySelector('#reading-clock > rect')!);
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

// 未读气泡：今天还没拆信时挂在邮筒右上角。
// 位置全部用百分比，跟着插画缩放；圆心落在邮筒右上方外侧，与小黄旗不重叠。
describe('LibraryBuilding 未读气泡', () => {
  it('没有未读时不渲染气泡', () => {
    const { container } = renderBuilding();
    expect(container.querySelector('[data-unread-badge]')).toBeNull();
  });

  it('有未读时渲染气泡，且落在邮筒右上角', () => {
    const { container } = renderBuilding({ hasUnreadLetter: true });
    const badge = container.querySelector<HTMLElement>('[data-unread-badge]');

    expect(badge).not.toBeNull();
    // 邮筒墨迹在 viewBox 里占 x 82.4%~90.3%、y 74.6%~93.3%；气泡圆心要落在它的右上方外侧
    expect(parseFloat(badge!.style.left)).toBeGreaterThan(90.3);
    expect(parseFloat(badge!.style.top)).toBeLessThan(74.6);
    // 直径 13px @ 320px 宽的插画
    expect(parseFloat(badge!.style.width)).toBeCloseTo(13 / 320 * 100, 3);
  });

  it('气泡不吃指针事件，邮筒照常能点开', () => {
    const { container, onMailboxClick } = renderBuilding({ hasUnreadLetter: true });
    const badge = container.querySelector<HTMLElement>('[data-unread-badge]')!;

    expect(badge.style.pointerEvents).toBe('none');
    fireEvent.click(hitArea(container, '#time-mailbox'));
    expect(onMailboxClick).toHaveBeenCalledTimes(1);
  });
});

// 深色模式换成夜版插画。判据是组件注入时自己打的 data-art（见 LibraryBuilding.tsx）——
// 导出的 class 名、甚至飘带文字的写法每轮都会变，只有这个标记是稳定的。
// 两版导出共用同一套 id 和坐标，所以热区逻辑不用为深色再写一套，只需要确认 id 补全了。
describe('LibraryBuilding 深色模式插画', () => {
  it('系统是浅色时用日版插画', () => {
    stubColorScheme(false);
    const { container } = renderBuilding();

    expect(container.querySelector('[data-art="light"]')).not.toBeNull();
    expect(container.querySelector('[data-art="dark"]')).toBeNull();
  });

  it('系统是深色时用夜版插画，且热区照样补上', () => {
    stubColorScheme(true);
    const { container, onClockClick, onMailboxClick } = renderBuilding();

    expect(container.querySelector('[data-art="dark"]')).not.toBeNull();
    expect(container.querySelector('[data-art="light"]')).toBeNull();

    for (const selector of ['#time-mailbox', '#reading-clock']) {
      const hit = hitArea(container, selector);
      expect(Number(hit.getAttribute('width'))).toBeGreaterThanOrEqual(48);
      expect(Number(hit.getAttribute('height'))).toBeGreaterThanOrEqual(48);
    }

    fireEvent.click(container.querySelector('#time-mailbox > rect')!);
    fireEvent.click(container.querySelector('#reading-clock > rect')!);
    expect(onMailboxClick).toHaveBeenCalledTimes(1);
    expect(onClockClick).toHaveBeenCalledTimes(1);
  });

  it('切换系统外观时插画跟着换', () => {
    const setDark = stubColorScheme(false);
    const { container } = renderBuilding();
    expect(container.querySelector('[data-art="light"]')).not.toBeNull();

    setDark(true);
    expect(container.querySelector('[data-art="dark"]')).not.toBeNull();
    // 换了插画，命中区要重新补在新的 DOM 上
    expect(container.querySelectorAll('[data-tap-hit]').length).toBe(2);
  });
});
