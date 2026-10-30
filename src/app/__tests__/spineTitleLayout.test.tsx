// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SPINE_ART, type SpineArtId } from '../shelf/spine/art';
import { SPINE_TITLE_MAX_PX, titleSpecOf } from '../shelf/spine/templatesArt';
import { SPINE_TEMPLATES, type SpineRenderContext } from '../shelf/spineTemplates';
import { unitsPerPx } from '../shelf/spine/zones';
import { MIN_SPINE_THICKNESS } from '../shelf/sizes';
import {
  SPINE_TEXT_ABS_MIN_PX,
  SPINE_TEXT_EDGE_PX,
  SPINE_TEXT_FLOOR_PX,
  SPINE_TITLE_GAP_PX,
  titleFit,
} from '../shelf/spine/shared';

/**
 * 书名排布标准（设计文档 §12）的可执行版本。
 *
 * 不测「大概齐」：把渲染出来的文字框、字号、字距重新算回书脊坐标，然后按标准逐条
 * 核对 —— 上下留白、离图案的固定间距、长书名缩字号之后还在安全区里。设计稿一改，
 * 这里就该红。
 */

const TOL = 0.05;
const AUTHOR = '林川';
const TITLES = ['潮汐之间', '看不见的城市', '额尔古纳河右岸', '也许你该找个人聊聊'];
const SIZES = [
  { thickness: 19, length: 132 },
  { thickness: 26, length: 139 },
  { thickness: 32, length: 145 },
] as const;

interface Block {
  /** 文字块沿长轴占的那一段（px，0 = 书脊首端） */
  start: number;
  end: number;
  /** 文字框（= 安全区）那一段 */
  frameStart: number;
  frameEnd: number;
  size: number;
}

/** 样式的长度：模版给的是百分比就是书脊长的比例，给数字就是 px */
function axisPx(value: string, lengthPx: number): number {
  const n = parseFloat(value);
  return value.trim().endsWith('%') ? (lengthPx * n) / 100 : n;
}

/**
 * 把一个字块还原成书脊坐标。文字框就是安全区，块在框里按 flex 对齐排：
 * 竖放对齐看 alignItems，横放看 justifyContent（都是行主轴上的那一套）。
 */
function blockOf(glyph: HTMLElement, vertical: boolean, lengthPx: number): Block {
  const frame = glyph.parentElement as HTMLElement;
  const size = parseFloat(glyph.style.fontSize);
  const tracking = parseFloat(glyph.style.letterSpacing) || 0;
  const textLength = Array.from(glyph.textContent ?? '').length * (size + tracking);

  // 文字框可以只钉一头再给长度（经典压印的作者行就是这么摆的），另一头推出来
  const [headKey, tailKey, sizeKey] = vertical
    ? (['top', 'bottom', 'height'] as const)
    : (['left', 'right', 'width'] as const);
  const head =
    frame.style[headKey] !== ''
      ? axisPx(frame.style[headKey], lengthPx)
      : lengthPx - axisPx(frame.style[tailKey], lengthPx) - axisPx(frame.style[sizeKey], lengthPx);
  const tail =
    frame.style[tailKey] !== ''
      ? lengthPx - axisPx(frame.style[tailKey], lengthPx)
      : head + axisPx(frame.style[sizeKey], lengthPx);
  const align = vertical ? frame.style.alignItems : frame.style.justifyContent;
  const start =
    align === 'flex-end'
      ? tail - textLength
      : align === 'flex-start'
        ? head
        : head + (tail - head - textLength) / 2;

  return { start, end: start + textLength, frameStart: head, frameEnd: tail, size };
}

/**
 * 文字框在横跨方向上的整体平移（px）。框铺满整个厚度、框里再居中，所以这个数就是
 * 书名那一列相对书脊中线的偏移 —— 十二套稿子量下来每一列都在中间（偏移 ≤0.05），
 * 于是它只该用来抹稿子的取整误差，不该把书名推歪。
 */
function crossShiftPx(frame: HTMLElement, thickness: number): number {
  const shift = /translate[XY]\(([-\d.]+)%\)/.exec(frame.style.transform);
  return shift ? (parseFloat(shift[1]) / 100) * thickness : 0;
}

function renderSpine(id: string, title: string, thickness: number, length: number, vertical: boolean) {
  const template = SPINE_TEMPLATES.find((entry) => entry.id === id)!;
  const ctx: SpineRenderContext = {
    book: { title, author: AUTHOR } as unknown as SpineRenderContext['book'],
    width: vertical ? thickness : length,
    height: vertical ? length : thickness,
    vertical,
    thickness,
  };
  const view = render(<div>{template.render(ctx)}</div>);
  const glyphs = Array.from(view.container.querySelectorAll('span[title]')) as HTMLElement[];
  const glyph = glyphs.find((node) => node.textContent === title);
  expect(glyph, `${id} 没渲染出书名`).toBeTruthy();
  return { glyph: glyph!, author: glyphs.find((node) => node.textContent === AUTHOR) };
}

afterEach(cleanup);

describe('书名排布标准', () => {
  describe.each(TITLES)('%s', (title) => {
    it.each(SIZES.flatMap((size) => [true, false].map((vertical) => ({ ...size, vertical }))))(
      '$thickness×$length 竖放=$vertical',
      ({ thickness, length, vertical }) => {
        for (const id of Object.keys(SPINE_ART)) {
          const art = SPINE_ART[id as keyof typeof SPINE_ART];
          const { glyph } = renderSpine(id, title, thickness, length, vertical);
          const block = blockOf(glyph, vertical, length);
          const unit = unitsPerPx(art, length);

          // 1. 上下（横放时左右）一定留出固定边距，书名不顶边
          expect(block.start, `${id} 顶到了书脊首端`).toBeGreaterThanOrEqual(SPINE_TEXT_EDGE_PX - TOL);
          expect(block.end, `${id} 顶到了书脊尾端`).toBeLessThanOrEqual(length - SPINE_TEXT_EDGE_PX + TOL);

          // 2. 离稿子里图案的最外沿保持固定间距，一格都不重叠
          for (const [from, to] of art.decor) {
            const near = Math.min(Math.abs(block.start - to / unit), Math.abs(from / unit - block.end));
            const clear = block.end <= from / unit - SPINE_TITLE_GAP_PX + TOL || block.start >= to / unit + SPINE_TITLE_GAP_PX - TOL;
            expect(clear, `${id} 的书名压到了图案 [${from}, ${to}] 上`).toBe(true);
            expect(near, `${id} 离图案太近`).toBeGreaterThanOrEqual(SPINE_TITLE_GAP_PX - TOL - 0.01);
          }

          // 3. 长书名靠缩字号解决：缩完必须还在安全区里
          expect(block.end - block.start, `${id} 缩了字号还是排不进安全区`).toBeLessThanOrEqual(
            block.frameEnd - block.frameStart + TOL,
          );

          // 4. 字号落在绝对下限与该模版的字号上限之间
          //    样字尺寸可能被逐套覆盖过（见 SPINE_TITLE_SIZE_PX），上限也可能被
          //    逐套压过（见 SPINE_TITLE_MAX_PX），两个都以覆盖后的为准
          const derived = (titleSpecOf(id as SpineArtId).size * 32) / art.width;
          const capped = SPINE_TITLE_MAX_PX[id as SpineArtId];
          const max = capped === undefined ? derived : Math.min(derived, capped);
          expect(block.size).toBeGreaterThanOrEqual(SPINE_TEXT_ABS_MIN_PX - TOL);
          expect(block.size).toBeLessThanOrEqual(max + TOL);

          cleanup();
        }
      },
    );
  });

  it('墨绿烫金那八套的上限统一压在 14.3px', () => {
    // 这八套的书名都按 16.2px 定区间，纯按厚度推到最厚会到 19.2px，比 app 的
    // 栏目小标题还大，并排时明显不齐 —— 这是产品决定，钉住它。
    expect(SPINE_TITLE_MAX_PX).toEqual({
      goldgreen: 14.3,
      indigo: 14.3,
      matte: 14.3,
      deep: 14.3,
      dusk: 14.3,
      pine: 14.3,
      ash: 14.3,
      amber: 14.3,
    });
    for (const id of ['goldgreen', 'indigo', 'matte', 'deep', 'dusk', 'pine', 'ash', 'amber'] as const) {
      // 样字尺寸以覆盖后的为准：第二批那五套靠 SPINE_TITLE_SIZE_PX 抬到 16.2 才有
      // [11.4, …] 这个下限（见 templatesArt.tsx）
      const fit = titleFit(
        { size: titleSpecOf(id).size, width: SPINE_ART[id].width },
        32,
        0,
        SPINE_TITLE_MAX_PX[id],
      );
      expect(fit.max, `${id} 的上限没压到 14.3`).toBeCloseTo(14.3, 2);
      // 最厚的书脊上就该正好用这个上限，而不是被推成 19.2
      const { glyph } = renderSpine(id, '潮汐之间', 32, 145, true);
      expect(parseFloat(glyph.style.fontSize), `${id} 最厚书脊上的字号`).toBeCloseTo(14.3, 2);
      cleanup();
    }
  });

  /**
   * 第二批的五套（深海 / 暮色 / 松林 / 灰烬 / 琥珀）：稿子只有渐变底与柱面光影，
   * 没有图案可避，所以书名在书脊上水平、垂直都居中；字号区间按产品要求收在
   * [11.4, 14.3]（下限靠 SPINE_TITLE_SIZE_PX 抬、上限靠 SPINE_TITLE_MAX_PX 压）。
   */
  it('第二批五套：书名两轴居中，字号区间 [11.4, 14.3]', () => {
    const SECOND_BATCH = ['deep', 'dusk', 'pine', 'ash', 'amber'] as const;

    for (const id of SECOND_BATCH) {
      const art = SPINE_ART[id];
      // 稿子里没有局部图案：安全区就是首尾各退 12px 之后的整条书脊
      expect(art.decor, `${id} 的稿子不该有图案`).toEqual([]);

      const fit = titleFit(
        { size: titleSpecOf(id).size, width: art.width },
        MIN_SPINE_THICKNESS,
        0,
        SPINE_TITLE_MAX_PX[id],
      );
      expect(fit.min, `${id} 的字号下限`).toBeCloseTo(11.4, 2);

      for (const thickness of [19, 26, 32]) {
        for (const vertical of [true, false]) {
          const { glyph } = renderSpine(id, '潮汐之间', thickness, 145, vertical);
          const block = blockOf(glyph, vertical, 145);
          // 垂直（横放时水平）居中：文字块的中点就是书脊的中点
          expect((block.start + block.end) / 2, `${id} 没居中`).toBeCloseTo(145 / 2, 1);
          // 横跨方向也居中
          expect(
            Math.abs(crossShiftPx(glyph.parentElement as HTMLElement, thickness)),
            `${id} 横跨方向没居中`,
          ).toBeLessThan(0.3);
          cleanup();
        }
      }

      // 最厚的书脊上正好用这条上限
      const { glyph } = renderSpine(id, '潮汐之间', 32, 145, true);
      expect(parseFloat(glyph.style.fontSize), `${id} 最厚书脊上的字号`).toBeCloseTo(14.3, 2);
      cleanup();
    }
  });

  it('正常长度的书名不跌破这套模版的下限，只有超长书名才继续缩', () => {
    for (const id of Object.keys(SPINE_ART)) {
      const art = SPINE_ART[id as keyof typeof SPINE_ART];
      const { glyph } = renderSpine(id, '潮汐之间', 19, 132, true);
      const fit = titleFit({ size: titleSpecOf(id as SpineArtId).size, width: art.width }, 19, 0);
      expect(parseFloat(glyph.style.fontSize), `${id} 四字书名缩过了头`).toBeCloseTo(fit.min, 2);
      expect(fit.min).toBeGreaterThanOrEqual(SPINE_TEXT_FLOOR_PX);
      cleanup();
    }
  });

  it.each(SIZES)('经典压印 $thickness×$length 的书名与作者各守一段', ({ thickness, length }) => {
    const { glyph, author } = renderSpine('default', '潮汐之间', thickness, length, true);
    const block = blockOf(glyph, true, length);
    // 书名与作者都被两条压印带（距首尾 12px、厚 2px）挡在里面
    expect(block.start).toBeGreaterThanOrEqual(SPINE_TEXT_EDGE_PX + 2 + SPINE_TITLE_GAP_PX - TOL);
    expect(block.end).toBeLessThanOrEqual(length - SPINE_TEXT_EDGE_PX + TOL);
    if (!author) return;
    const authorBlock = blockOf(author, true, length);
    expect(authorBlock.start).toBeGreaterThanOrEqual(SPINE_TEXT_EDGE_PX + 2 + SPINE_TITLE_GAP_PX - TOL);
    expect(block.end).toBeLessThanOrEqual(authorBlock.start - SPINE_TITLE_GAP_PX + TOL);
  });

  it('横放的经典压印同样守边距', () => {
    const { glyph } = renderSpine('default', '也许你该找个人聊聊', 32, 145, false);
    const block = blockOf(glyph, false, 145);
    expect(block.start).toBeGreaterThanOrEqual(SPINE_TEXT_EDGE_PX + 2 + SPINE_TITLE_GAP_PX - TOL);
    expect(block.end).toBeLessThanOrEqual(145 - SPINE_TEXT_EDGE_PX + TOL);
  });

  it('避让模版贴着图案那一侧排，居中模版摆在中点上', () => {
    const stone = renderSpine('stone', '潮汐之间', 26, 139, true);
    const stoneBlock = blockOf(stone.glyph, true, 139);
    const stoneArt = SPINE_ART.stone;
    const stoneMotif = (stoneArt.decor[0][0] / unitsPerPx(stoneArt, 139)) as number;
    expect(stoneBlock.end).toBeCloseTo(stoneMotif - SPINE_TITLE_GAP_PX, 1);

    const matte = renderSpine('matte', '潮汐之间', 26, 139, true);
    const matteBlock = blockOf(matte.glyph, true, 139);
    expect((matteBlock.start + matteBlock.end) / 2).toBeCloseTo(139 / 2, 1);
  });

  /**
   * 陶土：稿子样字画小了（七个字挤一列），照稿推出 [8, 8.7] 比并排的几套小一大截；
   * 位置原来跟着 avoid 贴住底部那道弧，书名被按在下半段。两条都改在标准里钉住。
   */
  it('陶土：书名在书脊中点上居中，字号和素石/藏青/板岩同一档', () => {
    const art = SPINE_ART.clay;
    const thickness = 27;
    const length = 145;

    for (const title of ['书名', '潮汐之间', '额尔古纳河右岸']) {
      const { glyph } = renderSpine('clay', title, thickness, length, true);
      const block = blockOf(glyph, true, length);

      // 水平、垂直都居中：文字块的中点就是书脊的中点
      expect((block.start + block.end) / 2, `${title} 没居中`).toBeCloseTo(length / 2, 1);

      // 仍然不碰图案：离底部那道弧至少 SPINE_TITLE_GAP_PX
      const [from] = art.decor[0];
      const motif = from / unitsPerPx(art, length);
      expect(block.end, `${title} 压到了图案上`).toBeLessThanOrEqual(motif - SPINE_TITLE_GAP_PX + TOL);

      cleanup();
    }

    // 字号标准抬到和素石/藏青/板岩一致的那一档
    const clayFit = titleFit({ size: titleSpecOf('clay').size, width: art.width }, thickness, 0);
    expect(titleSpecOf('clay').size).toBe(11.34);
    expect(clayFit.max).toBeCloseTo(13.4, 1);
    expect(clayFit.base).toBeCloseTo(11.34, 1);
  });

  /**
   * 横跨方向的居中：书名那一列必须落在书脊的中线上。这条盯的是「平移修正」用错
   * 尺寸的坑 —— 陶土的字号从稿子的 7.36 覆盖到 11.34，如果平移还按覆盖后的字号
   * 算，字列中心会跟着右移 ~2 个单位，书名就偏出中线了。
   */
  it('十二套模版的书名在横跨方向上都落在书脊中线上', () => {
    for (const id of Object.keys(SPINE_ART)) {
      for (const thickness of [19, 27, 32]) {
        for (const vertical of [true, false]) {
          const { glyph } = renderSpine(id, '潮汐之间', thickness, 145, vertical);
          const frame = glyph.parentElement as HTMLElement;
          expect(
            Math.abs(crossShiftPx(frame, thickness)),
            `${id} 在 ${thickness} 厚度、竖放=${vertical} 下横跨方向没居中`,
          ).toBeLessThan(0.3);
          cleanup();
        }
      }
    }
    // 陶土：字号确实被覆盖了，但横跨方向仍然在正中间
    const { glyph } = renderSpine('clay', '潮汐之间', 27, 145, true);
    expect(parseFloat(glyph.style.fontSize)).toBeCloseTo(11.34, 1);
    expect(crossShiftPx(glyph.parentElement as HTMLElement, 27)).toBeCloseTo(0, 2);
  });
});
