/**
 * 页面层堆叠契约：书架 / 分类 / 详情三层都必须写死 z-index。
 *
 * 背景：这三层是兄弟节点，谁在上面本来只靠挂载顺序。但书架层带着 motion 的 x，
 * 停在原位时 shelfShift 是 '0%'，motion 会把 transform 优化成 none —— 那一刻
 * 书架层不再是层叠上下文，里面 z-index ≥ 1 的元素（右上角「设置与统计」按钮是
 * z-index 5、拖动中的封面是 z-index 10）就直接落到根层叠上下文，把 z-index: auto
 * 的详情层反盖住：二级页面上多出一个设置按钮，封面的影子也会透出来。
 *
 * 这种问题只在"书架层恰好没有位移"时出现（从书架直接进详情会，从分类页进不会），
 * 肉眼看一眼容易漏，所以这里按源码守着。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appSrc = readFileSync(path.resolve(process.cwd(), 'src/app/App.tsx'), 'utf8');

/** 取某一层的 style 对象源码（从 data-page-layer 起，到下一个 data-page-layer 或结束） */
const layerBlock = (name: string) => {
  const start = appSrc.indexOf(`data-page-layer="${name}"`);
  expect(start, `找不到 ${name} 层`).toBeGreaterThan(-1);
  const next = appSrc.indexOf('data-page-layer="', start + 1);
  return appSrc.slice(start, next === -1 ? undefined : next);
};

describe('页面层堆叠次序', () => {
  it('三层各自用常量写死 z-index，不靠挂载顺序', () => {
    expect(layerBlock('shelf')).toMatch(/zIndex:\s*LAYER_Z_SHELF/);
    expect(layerBlock('category')).toMatch(/zIndex:\s*LAYER_Z_CATEGORY/);
    expect(layerBlock('detail')).toMatch(/zIndex:\s*LAYER_Z_DETAIL/);
  });

  it('z-index 常量按 书架 < 分类 < 详情 排好', () => {
    const value = (name: string) => {
      const m = appSrc.match(new RegExp(`const ${name} = (-?\\d+);`));
      expect(m, `找不到 ${name}`).not.toBeNull();
      return Number(m![1]);
    };
    const shelf = value('LAYER_Z_SHELF');
    const category = value('LAYER_Z_CATEGORY');
    const detail = value('LAYER_Z_DETAIL');
    expect(shelf).toBeLessThan(category);
    expect(category).toBeLessThan(detail);
  });

  it('书架层内部的暗色遮罩用层内的小 z-index，没有跟着升级成页面级', () => {
    // 书架被盖住时那层 scrim 只需要压住书架自己的内容，所以是层内的 z-index: 1；
    // 写成页面级常量的话它会盖到分类页/详情页上面去。
    const shelf = layerBlock('shelf');
    expect(shelf).toMatch(/background:\s*PAGE_SCRIM/);
    expect(shelf).toMatch(/zIndex:\s*1,/);
    expect(shelf).not.toMatch(/zIndex:\s*LAYER_Z_CATEGORY|zIndex:\s*LAYER_Z_DETAIL/);
  });
});
