/**
 * @vitest-environment jsdom
 * TDD: 验证 ImageCropper 阻止 touch 事件冒泡
 * 根因：BookDetailPage 有右滑返回手势，裁剪时 touch 事件冒泡触发 onBack
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ImageCropper from '../ImageCropper';

describe('ImageCropper', () => {
  const defaultProps = {
    src: 'data:image/jpeg;base64,test',
    onCrop: vi.fn(),
    onCancel: vi.fn(),
  };

  it('阻止 touchStart 事件冒泡', () => {
    const outerHandler = vi.fn();
    const { container } = render(
      <div onTouchStart={outerHandler}>
        <ImageCropper {...defaultProps} />
      </div>
    );

    const cropperRoot = container.querySelector('[style*="position: fixed"]') as HTMLElement;
    expect(cropperRoot).not.toBeNull();

    fireEvent.touchStart(cropperRoot!, { touches: [{ clientX: 100, clientY: 200 }] });

    expect(outerHandler).not.toHaveBeenCalled();
  });

  it('阻止 touchEnd 事件冒泡', () => {
    const outerHandler = vi.fn();
    const { container } = render(
      <div onTouchEnd={outerHandler}>
        <ImageCropper {...defaultProps} />
      </div>
    );

    const cropperRoot = container.querySelector('[style*="position: fixed"]') as HTMLElement;
    expect(cropperRoot).not.toBeNull();

    fireEvent.touchEnd(cropperRoot!, { changedTouches: [{ clientX: 150, clientY: 200 }] });

    expect(outerHandler).not.toHaveBeenCalled();
  });

  it('阻止 touchMove 事件冒泡', () => {
    const outerHandler = vi.fn();
    const { container } = render(
      <div onTouchMove={outerHandler}>
        <ImageCropper {...defaultProps} />
      </div>
    );

    const cropperRoot = container.querySelector('[style*="position: fixed"]') as HTMLElement;
    expect(cropperRoot).not.toBeNull();

    fireEvent.touchMove(cropperRoot!, { touches: [{ clientX: 120, clientY: 200 }] });

    expect(outerHandler).not.toHaveBeenCalled();
  });
});
