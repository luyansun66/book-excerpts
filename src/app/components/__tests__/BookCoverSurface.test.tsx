/**
 * @vitest-environment jsdom
 * 封面「读完」角标的三条契约：
 * - 没标记读完就一个角标都不画（别把空角标画成一个小色块）。
 * - 图片封面这条分支必须有定位地基，否则角标会相对滚动容器乱跑。
 * - 尺寸跟着 artScale 走：网格里的封面放大后，角标不能还是书架那个大小。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Book } from '../../types';
import { FINISHED_LABEL_COLOR, withAlpha } from '../../bookLabel';
import BookCoverSurface from '../BookCoverSurface';

type CoverBook = Parameters<typeof BookCoverSurface>[0]['book'];

function cover(partial: Partial<CoverBook> = {}): CoverBook {
  const base = {
    title: '德米安',
    author: '赫尔曼·黑塞',
    coverType: null as Book['coverType'],
    coverData: null as string | null,
    createdAt: '',
    updatedAt: '',
    id: 'b1',
    categoryId: 'cat',
  };
  return { ...base, ...partial };
}

function ribbon(container: HTMLElement): HTMLElement | null {
  return container.querySelector('span[style*="border-bottom-left-radius"]') as HTMLElement | null;
}

afterEach(cleanup);

describe('书封「读完」角标', () => {
  it('没标记读完时不画角标', () => {
    const { container } = render(<BookCoverSurface book={cover()} />);
    expect(ribbon(container)).toBeNull();
  });

  it('finishedAt 为空字符串/null 也不画', () => {
    const { container } = render(<BookCoverSurface book={cover({ finishedAt: null })} />);
    expect(ribbon(container)).toBeNull();
  });

  it('标记读完后画默认文案与默认琥珀色', () => {
    const { container } = render(<BookCoverSurface book={cover({ finishedAt: '2026-01-01T00:00:00.000Z' })} />);
    const el = ribbon(container);
    expect(el?.textContent).toBe('读完');
    expect(el?.style.background).toBe(withAlpha(FINISHED_LABEL_COLOR));
    expect(el?.style.color).toBe('rgb(255, 255, 255)');
  });

  it('图片封面这条分支也有定位地基（角标不能跑出封面）', () => {
    const { container } = render(
      <BookCoverSurface
        book={cover({ coverType: 'url', coverData: 'https://example.com/cover.jpg', finishedAt: '2026-01-01T00:00:00.000Z' })}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe('relative');
    expect(ribbon(container)?.textContent).toBe('读完');
  });

  it('占位封面分支同样有角标且压在最后', () => {
    const { container } = render(<BookCoverSurface book={cover({ finishedAt: '2026-01-01T00:00:00.000Z' })} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.position).toBe('relative');
    expect(root.lastElementChild).toBe(ribbon(container));
  });

  it('角标不拦指针事件（别抢走封面的点击/长按拖拽）', () => {
    const { container } = render(<BookCoverSurface book={cover({ finishedAt: '2026-01-01T00:00:00.000Z' })} />);
    expect(ribbon(container)?.style.pointerEvents).toBe('none');
  });

  it('尺寸跟着 artScale 放大', () => {
    const { container: at1 } = render(<BookCoverSurface book={cover({ finishedAt: '2026-01-01T00:00:00.000Z' })} />);
    const { container: at2 } = render(
      <BookCoverSurface book={cover({ finishedAt: '2026-01-01T00:00:00.000Z' })} artScale={1.5} />,
    );
    expect(ribbon(at1)?.style.fontSize).toBe('8.5px');
    expect(ribbon(at2)?.style.fontSize).toBe('12.75px');
  });
});
