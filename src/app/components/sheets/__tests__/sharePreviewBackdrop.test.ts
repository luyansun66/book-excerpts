/**
 * 预览区的几何：卡片后面不垫米白，而且上下要能一直滑到屏幕边缘。
 *
 * 背景两件事：
 *
 * 1. 面板原本整块是 var(--color-bg)（#F4EFE6），卡片就坐在这一大块米白上，
 *    加上 24px 的圆角，看上去像「卡片被装进一个米白容器里」—— 卡片自己的
 *    边界反而不清楚了。现在底色只属于下面的控制面板，上面那截透明。
 *
 * 2. 整块面板原本只有 88vh，预览区的顶边落在屏幕上方 12% 的位置：卡片往上
 *    滑到那里就被一条线切住（微信读书那种「整屏都能滑」的形态做不到）。
 *    现在面板铺满整屏，预览区顶到 y=0，滚动时卡片一直滑到屏幕最顶上才被裁掉。
 *
 * 都是改样式时很容易被顺手改回去的东西（面板看起来「缺个底色」「太高了」），
 * 所以按源码守着。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  path.resolve(process.cwd(), 'src/app/components/sheets/ShareSheet.tsx'),
  'utf8',
);

/** 整块面板：从尺寸声明到舞台注释之间。 */
const sheetBlock = src.slice(src.indexOf("width: '100%',\n            height: '100%',"), src.indexOf('{/* ─── 舞台'));
/** 控制面板：从「控制面板」注释到把手注释之间。 */
const panelBlock = src.slice(src.indexOf('{/* ─── 控制面板'), src.indexOf('{/* 把手'));

describe('分享面板的预览底色', () => {
  it('卡片那一层是透明的，米白不再包住卡片', () => {
    expect(sheetBlock).toContain("background: 'transparent'");
    expect(sheetBlock).not.toContain('var(--color-bg)');
  });

  it('面板铺满整屏，预览区顶到屏幕最顶上', () => {
    expect(sheetBlock).toContain("height: '100%'");
    expect(sheetBlock).not.toContain('88vh');
  });

  it('米白和圆角都挪到控制面板上，面板仍然像一张底部抽屉', () => {
    expect(panelBlock).toContain("background: 'var(--color-bg)'");
    expect(panelBlock).toContain("borderRadius: '24px 24px 0 0'");
    // 透明底之后上面那条分割线没有意义，还会横穿圆角
    expect(panelBlock).not.toContain('borderTop');
  });

  it('舞台内边距顶部让开状态栏，卡片才不会一上来就压着时间', () => {
    const padStyle = src.slice(src.indexOf('const stagePadStyle'), src.indexOf('const toastBubbleStyle'));
    expect(padStyle).toContain('env(safe-area-inset-top, 0px)');
    expect(src).toContain('padding: stagePadStyle,');
  });

  it('可用高按实测内边距算，不能拿常量估 —— 会多算一个状态栏', () => {
    expect(src).toContain('const availH = Math.max(0, stageBox.h - stagePad.top - stagePad.bottom);');
    expect(src).toContain("const top = parseFloat(cs.paddingTop) || 0;");
  });
});
