/**
 * 主题色块那一行的两条约束，都是「肉眼不一定马上发现、但一眼就能看出丑」的：
 *
 * - 色块是纯色圆，里面不写字。选中了哪个主题由上面的「主题 · 灰蓝」说明，
 *   圆里再塞一个「字」只是噪声。
 * - 选中态那圈环画在圆的**外面**（box-shadow 外扩 4px），所以这一行必须给环
 *   留出上下各 4px。rowStyle 是 overflowY: hidden，留不出就会把环的顶部切平。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  path.resolve(process.cwd(), 'src/app/components/sheets/ShareSheet.tsx'),
  'utf8',
);

/** 主题色块那一段（从 COLOR_THEMES.map 到「字体」小节）。 */
const swatchBlock = src.slice(src.indexOf('COLOR_THEMES.map'), src.indexOf('{/* 字体 */}'));

describe('分享面板的主题色块', () => {
  it('色块里不写字，主题名只出现在小节标题上', () => {
    expect(swatchBlock).not.toContain('字');
    expect(swatchBlock).toContain('aria-label={`主题 ${t.name}`}');
  });

  it('给选中态外扩的环留出上下空间，环不会被 overflowY 切掉', () => {
    expect(src).toContain('style={swatchRowStyle}');
    const style = src.slice(src.indexOf('const swatchRowStyle'), src.indexOf('const swatchRing'));
    expect(style).toContain("padding: '4px 20px 6px'");
    expect(style).toContain("margin: '-4px -20px 0'");
  });
});
