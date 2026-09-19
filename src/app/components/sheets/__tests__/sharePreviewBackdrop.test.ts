/**
 * 预览区的底色：卡片后面不能再垫一层米白。
 *
 * 背景：面板原本整块是 var(--color-bg)（#F4EFE6），卡片就坐在这一大块米白上，
 * 加上 24px 的圆角，看上去像「卡片被装进一个米白容器里」—— 卡片自己的边界
 * 反而不清楚了。现在底色只属于下面的控制面板，上面那截透明，卡片直接浮在
 * 压暗的页面上。
 *
 * 这是个很容易在改样式时被顺手加回去的东西（面板看起来「缺个底色」），
 * 所以按源码守着。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  path.resolve(process.cwd(), 'src/app/components/sheets/ShareSheet.tsx'),
  'utf8',
);

/** 整块面板：从高度声明到舞台注释之间。 */
const sheetBlock = src.slice(src.indexOf("height: '88vh'"), src.indexOf('{/* ─── 舞台'));
/** 控制面板：从「控制面板」注释到把手注释之间。 */
const panelBlock = src.slice(src.indexOf('{/* ─── 控制面板'), src.indexOf('{/* 把手'));

describe('分享面板的预览底色', () => {
  it('卡片那一层是透明的，米白不再包住卡片', () => {
    expect(sheetBlock).toContain("background: 'transparent'");
    expect(sheetBlock).not.toContain('var(--color-bg)');
  });

  it('米白和圆角都挪到控制面板上，面板仍然像一张底部抽屉', () => {
    expect(panelBlock).toContain("background: 'var(--color-bg)'");
    expect(panelBlock).toContain("borderRadius: '24px 24px 0 0'");
    // 透明底之后上面那条分割线没有意义，还会横穿圆角
    expect(panelBlock).not.toContain('borderTop');
  });
});
