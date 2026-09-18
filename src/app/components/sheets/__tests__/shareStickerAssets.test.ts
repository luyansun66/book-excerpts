// @vitest-environment jsdom
// 贴纸资源的加载契约。
//
// 背景：20 张贴纸的 SVG 合计 768KB，原先全被打进 ShareSheet chunk —— 首访点「分享」
// 的人必须先下完它们，哪怕卡片上只用得到一张（这正是首访导出慢的一大块）。现在
// 只有默认那张是静态的，其余各是一个独立 chunk；选择器只吃 48×48 的 PNG 蒙版。
// 这几个断言钉住的就是「别再把 SVG 塞回主 chunk」。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STICKERS, eagerStickerSvg, findSticker, loadStickerSvg } from '../stickers';
import { applyCardSticker } from '../shareCardExport';

const sheetsDir = path.resolve(process.cwd(), 'src/app/components/sheets');
const indexSrc = readFileSync(path.join(sheetsDir, 'stickers/index.ts'), 'utf8');
const sheetSrc = readFileSync(path.join(sheetsDir, 'ShareSheet.tsx'), 'utf8');

describe('贴纸资源按需加载', () => {
  it('20 张贴纸里只有默认那张是静态引入的', () => {
    expect(STICKERS).toHaveLength(20);
    const eager = STICKERS.filter((s) => eagerStickerSvg(s.id) !== null).map((s) => s.id);
    expect(eager).toEqual(['kitty']);
  });

  it('分享面板默认选中的正是那张静态贴纸，卡片首帧不用等 chunk', () => {
    expect(STICKERS[0].id).toBe('kitty');
    expect(sheetSrc).toMatch(/const \[stickerIndex, setStickerIndex\] = useState\(1\)/);
  });

  it('生成物里恰好 1 次静态 ?raw 引入，另外 19 次都是 import()', () => {
    const statics = [...indexSrc.matchAll(/^import \w+Svg from '\.\/\d+-[\w-]+\.svg\?raw';$/gm)];
    const dynamics = [...indexSrc.matchAll(/import\('\.\/\d+-[\w-]+\.svg\?raw'\)/g)];
    expect(statics).toHaveLength(1);
    expect(dynamics).toHaveLength(19);
  });

  it('按需贴纸能真的取到 SVG，大块头（138KB 的 jester）也不是静态的', async () => {
    expect(eagerStickerSvg('jester')).toBeNull();
    const svg = await loadStickerSvg('jester');
    expect(svg).toContain('<svg');
    expect(svg.length).toBeGreaterThan(1000);
  });

  it('未知 id 直接拒绝，而不是静默返回空贴纸', async () => {
    expect(findSticker('nope')).toBeUndefined();
    await expect(loadStickerSvg('nope')).rejects.toThrow(/未知贴纸/);
  });

  it('每张贴纸都带缩略图，选择器不必为了画图标去拉 SVG', () => {
    for (const s of STICKERS) {
      expect(s.thumb).toBeTruthy();
      expect(typeof s.load).toBe('function');
    }
  });
});

describe('选择器用 PNG 蒙版，卡片才用真 SVG', () => {
  it('选择器不再内联 SVG', () => {
    expect(sheetSrc).not.toContain('__html: s.svg');
    expect(sheetSrc).toContain('maskImage: `url(${s.thumb})`');
    // Safari 只认 -webkit- 前缀，两个都得在。
    expect(sheetSrc).toContain('WebkitMaskImage: `url(${s.thumb})`');
    // 蒙版是黑色 PNG，颜色靠 background-color 给，才能跟着主题走。
    expect(sheetSrc).toContain('backgroundColor: color.textColor');
  });

  it('卡片仍然渲染真 SVG（矢量 + currentColor 跟随主题色）', () => {
    expect(sheetSrc).toContain("__html: stickerSvg ?? ''");
    expect(sheetSrc).toContain('data-share-sticker=""');
  });
});

describe('导出路径必须先拿到贴纸再截图', () => {
  it('贴纸和字体子集并行 await，首访不叠加等待', () => {
    expect(sheetSrc).toContain('Promise.all([resolveCardFont(), resolveStickerSvg()])');
    expect(sheetSrc).toContain('await Promise.all');
  });

  it('贴纸被钉在克隆 DOM 上，不赌 setState 的渲染时序', () => {
    expect(sheetSrc).toContain('applyCardSticker(doc, stickerMarkup)');
  });

  it('贴纸拉不到时导出照常走，只是没有贴纸', () => {
    // resolveStickerSvg 自己吞掉异常，绝不让整次导出失败。
    expect(sheetSrc).toMatch(/const resolveStickerSvg = async[\s\S]*?catch[\s\S]*?return null;/);
  });
});

describe('applyCardSticker — 把贴纸写进克隆文档', () => {
  it('markup 写进宿主，null 则清空（「没贴纸」也是确定结果）', () => {
    const host = document.createElement('div');
    host.setAttribute('data-share-sticker', '');
    document.body.appendChild(host);

    applyCardSticker(document, '<svg data-test="1"></svg>');
    expect(host.innerHTML).toBe('<svg data-test="1"></svg>');

    applyCardSticker(document, null);
    expect(host.innerHTML).toBe('');
  });

  it('宿主不存在时不炸（没选贴纸时卡片里就没有这个节点）', () => {
    expect(() => applyCardSticker(document, '<svg/>')).not.toThrow();
  });
});
