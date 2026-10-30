import type { CSSProperties, ReactNode } from 'react';
import type { SpineRenderContext, SpineTemplate } from '../spineTemplates';
import { SPINE_ART, type SpineArt, type SpineArtId, type SpineTextSpec } from './art';
import { SpineShell, SpineTitle, titleFit } from './shared';
import { titleZone, zoneLengthPx, type TitleZone } from './zones';

/**
 * 十七个「设计稿模版」。几何全部来自 `art.tsx`（由 scripts/build-spine-art.py
 * 从 src/app/shelf/spine/design/*.svg 生成），这里只负责把设计稿摆到 app 的书脊上：
 *
 *   1. 画板就是一枚 27.3 × 145 的书脊，内联的 SVG 靠 preserveAspectRatio 做非等比
 *      缩放——横跨跟着书脊厚度走、沿长跟着书高走，任何厚度都不变形；
 *   2. 书名排进稿子留出的安全区（见 zones.ts 与下面这张 TITLE_MODE 表），字号
 *      按书脊厚度推、按安全区的长度缩，稿子里的样字只贡献位置与字号基准；
 *   3. 柱面光影单独一层压在文字之上，和 Illustrator 里的层级一致——设计稿就是
 *      拿这层半透明黑把字压出弧面感的。
 *
 * 十七套稿子都只画了书名，没有作者行（art.author 全是 null），所以这里不排作者。
 * 哪天有稿子补了作者行，得照 §12 的留白标准给它另划一段，别直接塞回设计稿基线。
 */

const SANS = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const SERIF = "'Songti SC','STSong','Noto Serif SC',serif";

/**
 * 书名的排法，一套稿子一种（设计文档 §12）。
 *
 *   · avoid —— 图案压在长轴某一端的六套：书名排在图案之外的空白区里，距图案固定
 *      8px，往远离图案的那头长；
 *   · center —— 其余的：书名在「首尾留白之后」的区域里水平居中、垂直居中。
 *
 * 陶土按 avoid 排会把书名按到下半段去：它的图案只是最下面一道弧，空白区一直顶到
 * 书脊的七成八，而「贴着图案」就是贴着那道弧。改成 center 之后，书名落在书脊中点
 * 上，离那道弧还有 15px 以上 —— 和并排的素石/藏青/板岩一个观感。
 */
export const SPINE_TITLE_MODE: Record<SpineArtId, 'avoid' | 'center'> = {
  matte: 'center',
  contour: 'avoid',
  indigo: 'center',
  bauhaus: 'avoid',
  navy: 'avoid',
  leather: 'center',
  goldgreen: 'center',
  pine: 'center',
  deep: 'center',
  aura: 'center',
  ash: 'center',
  slate: 'avoid',
  dusk: 'center',
  clay: 'center',
  amber: 'center',
  sage: 'avoid',
  stone: 'avoid',
};

/**
 * 逐套的书名样字尺寸（设计稿单位，覆盖稿子里写的那个值）。
 *
 * 默认口径是「稿子的样字画多大，就按多大折到 app 的厚度区间上」。陶土的稿子把样字
 * 画小了：7.36px 是七个字挤在一列里的尺寸，而同样画板宽（27）的素石/藏青/板岩都是
 * 11.34px。照稿推出来这套的区间只有 [8, 8.7]，和并排的几套差一大截 —— 这是稿子样
 * 字长度的差别，不是模版想要的效果，所以这里把它的字号标准抬回同一档。
 *
 * 只动字号：稿子里的几何图形、留白、颜色一个字都没改。
 */
export const SPINE_TITLE_SIZE_PX: Partial<Record<SpineArtId, number>> = {
  clay: 11.34,
  /**
   * 第二批的五套稿子样字画的是 12.42px，照它推到最薄只有 8.7px，够不着产品定的
   * 11.4px 下限。按 16.2px 抬上来 —— 和墨绿烫金那一批同档：最薄的书脊正好 11.4，
   * 最厚的由 SPINE_TITLE_MAX_PX 压在 14.3。只动字号，稿子的几何与配色不改。
   */
  pine: 16.2,
  deep: 16.2,
  ash: 16.2,
  dusk: 16.2,
  amber: 16.2,
};

/**
 * 逐套压的书名上限（px，没登记的就是按稿子推出来的那个值）。
 *
 * 墨绿烫金、靛蓝烫银、哑光黑这三套稿子的书名是 16.2px 画的，按厚度推到最厚会到
 * 19.2px —— 比 app 里的栏目小标题（14px）还大，和旁边几套书脊并排时明显不齐。
 * 统一压到 14.3，正好和皮革烫金那一档的上限齐平。
 *
 * 第二批那五套按 16.2px 定区间（见 SPINE_TITLE_SIZE_PX）之后同样会推到 19.2px，
 * 也压在 14.3 —— 于是这八套的区间都是 [11.4, 14.3]，并排时字号齐平。
 */
export const SPINE_TITLE_MAX_PX: Partial<Record<SpineArtId, number>> = {
  matte: 14.3,
  indigo: 14.3,
  goldgreen: 14.3,
  pine: 14.3,
  deep: 14.3,
  ash: 14.3,
  dusk: 14.3,
  amber: 14.3,
};

const ANCHOR: Record<TitleZone['anchor'], CSSProperties['alignItems']> = {
  start: 'flex-start',
  end: 'flex-end',
  center: 'center',
};

/**
 * 设计稿写死的字体多半没装机，只能按它是什么体退回系统字：方正云顶那种粗黑退
 * 回无衬线，宋代刻本味的书名（墨绿烫金）退回宋体。
 */
function titleFontOf(family: string): string {
  return /Hei|Yun|PingFang/i.test(family) ? SANS : SERIF;
}

/** 设计稿坐标 → 沿长方向（画板高 = 书高） */
function along(art: SpineArt, value: number): string {
  return `${(value / art.height) * 100}%`;
}

/** 设计稿坐标 → 横跨方向（画板宽 = 书脊厚） */
function across(art: SpineArt, value: number): string {
  return `${(value / art.width) * 100}%`;
}

/**
 * 横跨方向的对齐：文字框铺满整个厚度、框里居中，再整体平移到「设计稿里那一列字
 * 的中心」上。
 *
 * 那一列的中心 = across + size/2（设计稿里每个字一个 <text>，锚点 x 是那列字的左
 * 边缘），用的是**稿子自己的样字尺寸**，不是当前这套模版实际要用的字号 —— 十二套
 * 稿子量下来这一列都在书脊正中间（偏移 ≤0.05），所以这条平移基本只用来抹掉稿子的
 * 取整误差。拿覆盖后的字号去算，就会把「字列中心本该在正中间」的模版推歪：
 * 陶土的字号从稿子的 7.36 覆盖到 11.34，字列中心会跟着右移 2 个单位，书名就不在
 * 书脊的正中间了。
 */
function shift(art: SpineArt): string {
  const center = art.title.across + art.title.size / 2;
  return across(art, center - art.width / 2);
}

/**
 * 设计稿的字距：基线间距减掉字号那一份，剩下的交给 letter-spacing —— 竖排/横排
 * 一个字就是一格（一个字号宽），line-height 只管另一条轴，不参与排字。设计稿
 * 单位就是「画板厚 27.3（或 27）时的像素」，所以按厚度缩放。
 *
 * 上限在 shared.tsx 里（字号的 12%），设计稿给得太松的地方会被它收住。
 */
function tracking(ctx: SpineRenderContext, art: SpineArt, spec: SpineTextSpec): number {
  return Math.max(spec.advance - spec.size, 0) * (ctx.thickness / art.width);
}

/** 安全区 → 文字框：竖放时长轴是框的上下，横放时是框的左右 */
function zoneStyle(ctx: SpineRenderContext, art: SpineArt, zone: TitleZone): CSSProperties {
  const start = along(art, zone.span.start);
  const end = along(art, art.height - zone.span.end);
  return ctx.vertical
    ? {
        top: start,
        bottom: end,
        left: 0,
        right: 0,
        alignItems: ANCHOR[zone.anchor],
        transform: `translateX(${shift(art)})`,
      }
    : {
        left: start,
        right: end,
        top: 0,
        bottom: 0,
        justifyContent: ANCHOR[zone.anchor],
        transform: `translateY(${shift(art)})`,
      };
}

function artLayer(ctx: SpineRenderContext, art: SpineArt, which: 'art' | 'shade'): ReactNode {
  const style: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ctx.width,
    height: ctx.height,
    /** 纹样铺在文字之下，柱面光影压在文字之上 */
    zIndex: which === 'art' ? 2 : 40,
    pointerEvents: 'none',
  };
  if (!ctx.vertical) {
    /**
     * 横放：沿长方向躺到水平轴上、横跨落到竖直轴上。两轴长度不同，光 rotate
     * 不够（那会转出画布），直接给矩阵：设计稿的 x 走 y，设计稿的 y 走 x。
     */
    style.transformOrigin = '0 0';
    style.transform = `matrix(0, ${ctx.height / ctx.width}, ${ctx.width / ctx.height}, 0, 0, 0)`;
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={art.viewBox}
      preserveAspectRatio="none"
      width={ctx.width}
      height={ctx.height}
      style={style}
    >
      {which === 'art' ? art.art : art.shade}
    </svg>
  );
}

/**
 * 这套模版实际用的样字：字号可能被逐套覆盖，字距（基线间距）按同一比例跟着走，
 * 免得字号抬上去了、行距还停在稿子里那个小样上。
 */
export function titleSpecOf(id: SpineArtId): SpineTextSpec {
  const art = SPINE_ART[id];
  const size = SPINE_TITLE_SIZE_PX[id];
  if (size === undefined) return art.title;
  return { ...art.title, size, advance: art.title.advance * (size / art.title.size) };
}

function render(ctx: SpineRenderContext, id: SpineArtId): ReactNode {
  const art = SPINE_ART[id];
  const title = titleSpecOf(id);
  /** 长轴的长度：竖放是书高，横放是书脊躺平后的宽 */
  const lengthPx = ctx.vertical ? ctx.height : ctx.width;
  const zone = titleZone(art, lengthPx, SPINE_TITLE_MODE[id]);

  return (
    <SpineShell ctx={ctx} background={art.base}>
      {artLayer(ctx, art, 'art')}
      <SpineTitle
        ctx={ctx}
        style={zoneStyle(ctx, art, zone)}
        color={title.ink}
        fit={titleFit(
          { size: title.size, width: art.width },
          ctx.thickness,
          zoneLengthPx(art, lengthPx, zone.span),
          SPINE_TITLE_MAX_PX[id],
        )}
        fontFamily={titleFontOf(title.family)}
        fontWeight={700}
        letterSpacing={tracking(ctx, art, title)}
      />
      {artLayer(ctx, art, 'shade')}
    </SpineShell>
  );
}

/**
 * 顺序 = BookAppearanceFields 里书脊样式的排布顺序：**按布面的感知亮度从深到浅**。
 *
 * 亮度不是拍脑袋定的：把 src/app/shelf/spine/design/*.svg 各自栅格化、去掉稿子里
 * 那行样字（样字是动态的，白字压在深布面上会把平均值抬亮），再按 CIE 的 L* 取整条
 * 书脊的平均。量出来的 L* 值逐个写在 scripts/build-spine-art.py 的 DESIGNS 表上，
 * 改顺序就照那张表改。
 */
export const SPINE_ART_TEMPLATES: SpineTemplate[] = [
  { id: 'matte', name: '哑光黑', render: (ctx) => render(ctx, 'matte') },
  { id: 'contour', name: '等高线', render: (ctx) => render(ctx, 'contour') },
  { id: 'indigo', name: '靛蓝烫银', render: (ctx) => render(ctx, 'indigo') },
  { id: 'bauhaus', name: '包豪斯', render: (ctx) => render(ctx, 'bauhaus') },
  { id: 'navy', name: '藏青', render: (ctx) => render(ctx, 'navy') },
  { id: 'leather', name: '皮革烫金', render: (ctx) => render(ctx, 'leather') },
  { id: 'goldgreen', name: '墨绿烫金', render: (ctx) => render(ctx, 'goldgreen') },
  { id: 'pine', name: '松林', render: (ctx) => render(ctx, 'pine') },
  { id: 'deep', name: '深海', render: (ctx) => render(ctx, 'deep') },
  { id: 'aura', name: '晕染', render: (ctx) => render(ctx, 'aura') },
  { id: 'ash', name: '灰烬', render: (ctx) => render(ctx, 'ash') },
  { id: 'slate', name: '板岩', render: (ctx) => render(ctx, 'slate') },
  { id: 'dusk', name: '暮色', render: (ctx) => render(ctx, 'dusk') },
  { id: 'clay', name: '陶土', render: (ctx) => render(ctx, 'clay') },
  { id: 'amber', name: '琥珀', render: (ctx) => render(ctx, 'amber') },
  { id: 'sage', name: '苔绿', render: (ctx) => render(ctx, 'sage') },
  { id: 'stone', name: '素石', render: (ctx) => render(ctx, 'stone') },
];
