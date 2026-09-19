/**
 * 浮层挂载契约：所有 position: fixed 的浮层都必须挂到 document.body 下。
 *
 * 背景：应用里每个页面层都是带 transform 的 motion.div（翻页 / 滑动返回用的 x），
 * transform 会把 position: fixed 的包含块从视口改成那一层；而 body 上有
 * padding-top: env(safe-area-inset-top)，于是浮层整体被顶下去一个状态栏的高度，
 * 顶部那条安全区露出 body 的米白底色 —— PWA 上就是「顶部一层米白遮罩」。
 * 挂到 body 下，fixed 才重新相对视口，遮罩才能盖满整屏。
 *
 * 这个契约肉眼不一定马上发现，所以这里按源码守着：新增浮层时要么走 overlayPortal，
 * 要么就会在这条测试上挂掉。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** 每一个自己画 fixed 遮罩的浮层。 */
const OVERLAY_FILES = [
  'src/app/components/sheets/ShareSheet.tsx',
  'src/app/components/sheets/AddQuoteSheet.tsx',
  'src/app/components/sheets/AddBookSheet.tsx',
  'src/app/components/BookDetailPage.tsx',
  'src/app/components/ConfirmDialog.tsx',
  'src/app/components/CategoryPicker.tsx',
  'src/app/components/ImageCropper.tsx',
  'src/app/components/timer/ReadingTimerSheet.tsx',
];

describe('浮层的挂载位置', () => {
  it.each(OVERLAY_FILES)('%s 走 overlayPortal，不再自己 createPortal', (file) => {
    const code = src(file);
    expect(code).toMatch(/import \{ overlayPortal \} from '\.{1,2}\/overlayPortal'/);
    expect(code).toContain('return overlayPortal(');
    expect(code).not.toContain('createPortal(');
  });

  it('overlayPortal 挂在 document.body 上', () => {
    const helper = src('src/app/components/overlayPortal.ts');
    expect(helper).toContain("import { createPortal } from 'react-dom'");
    expect(helper).toContain('createPortal(node, document.body)');
  });

  it('盖到屏幕顶端的浮层让开状态栏', () => {
    expect(src('src/app/components/sheets/ShareSheet.tsx')).toContain(
      'calc(18px + env(safe-area-inset-top, 0px))',
    );
    expect(src('src/app/components/ImageCropper.tsx')).toContain(
      'calc(16px + env(safe-area-inset-top, 28px))',
    );
  });

  it('贴着屏幕底边的面板让开 Home 指示条', () => {
    expect(src('src/app/components/sheets/AddQuoteSheet.tsx')).toContain('env(safe-area-inset-bottom');
    expect(src('src/app/components/sheets/AddBookSheet.tsx')).toContain('env(safe-area-inset-bottom');
    expect(src('src/app/components/BookDetailPage.tsx')).toContain('env(safe-area-inset-bottom');
  });
});
