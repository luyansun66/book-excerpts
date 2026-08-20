/**
 * @vitest-environment jsdom
 * TDD: 验证 ImageCropper 阻止 click 事件冒泡，touch 事件通过 prop 通知父组件禁用手势
 * 根因：BookDetailPage 有右滑返回手势，裁剪时 touch 事件冒泡触发 onBack
 * 修复：touch 事件正常冒泡，BookDetailPage 通过 isCropping ref 检查是否跳过手势
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

  it('阻止 click 事件冒泡到父组件', () => {
    const outerHandler = vi.fn();
    const { container } = render(
      <div onClick={outerHandler}>
        <ImageCropper {...defaultProps} />
      </div>
    );

    const cropperRoot = container.querySelector('[style*="position: fixed"]') as HTMLElement;
    expect(cropperRoot).not.toBeNull();

    fireEvent.click(cropperRoot!);

    expect(outerHandler).not.toHaveBeenCalled();
  });

  it('touch 事件正常冒泡到父组件，由父组件通过 isCropping 判断是否处理', () => {
    const outerHandler = vi.fn();
    const { container } = render(
      <div onTouchStart={outerHandler}>
        <ImageCropper {...defaultProps} />
      </div>
    );

    const cropperRoot = container.querySelector('[style*="position: fixed"]') as HTMLElement;
    expect(cropperRoot).not.toBeNull();

    fireEvent.touchStart(cropperRoot!, { touches: [{ clientX: 100, clientY: 200 }] });

    // touch 事件正常冒泡——父组件应收到事件，但通过 isCropping ref 判断是否处理
    expect(outerHandler).toHaveBeenCalled();
  });
});
