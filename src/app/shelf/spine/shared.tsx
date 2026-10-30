import type { CSSProperties, ReactNode } from 'react';
import type { SpineRenderContext } from '../spineTemplates';
import { MAX_SPINE_THICKNESS, MIN_SPINE_THICKNESS } from '../sizes';

export const SPINE_TEXT_MIN_WIDTH = 14;
export const SPINE_AUTHOR_MIN_THICKNESS = 30;
export const SPINE_SERIF = "'Songti SC','STSong','Noto Serif SC',serif";

/**
 * 书名的两条固定留白（px，绝对值，不随厚度缩放）。设计文档 §12 定的口径：
 *
 *   · 边距 —— 书脊首尾各留这么宽，书名（作者行同理）不顶边；
 *   · 间距 —— 书名离稿子里图案这么远，图案是几何图形/线圈的模版都照这条排。
 *
 * 位置按「绝对像素」量，是因为稿子里的图案是按比例拉伸到 app 尺寸的：厚度变了，
 * 图案在长轴上的位置其实不动，留白也就该跟着不动。
 */
export const SPINE_TEXT_EDGE_PX = 12;
export const SPINE_TITLE_GAP_PX = 8;

/** 书名的字号下限：再小就认不出来了，宁可溢出一点也只缩到这里 */
export const SPINE_TITLE_MIN_PX = 8;
/** 作者行的字号下限 */
export const SPINE_AUTHOR_MIN_PX = 7;

/**
 * 长书名继续缩字号的硬下限。上面那两条是「标准」的下限 —— 正常长度的书名不会
 * 跌破它；书名太长时按 §12 的口径优先继续缩字号，缩到这条线为止。再往下就真的
 * 认不出来了，宁可让最后几个字压一点间距。
 */
export const SPINE_TEXT_FLOOR_PX = 6;

/**
 * 字距上限：设计稿给的字距再松，也不超过字号的这个比例。竖排一个字就是一格，
 * 字距跟着字号一起缩，长书名才有地方排。
 */
export const SPINE_TRACKING_RATIO = 0.12;

/**
 * 字号的绝对下限。硬下限（6px）也装不下的超长书名会被挤到这里；再小就是一团
 * 灰，不如让它多占一点边距 —— 无论如何都不会压到图案上。
 */
export const SPINE_TEXT_ABS_MIN_PX = 4;

const INK = 'rgba(42,37,32,';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 一行字的排布参数：从哪个字号起、能缩到哪、缩到装不下为止的那条长度。
 *
 * 字号区间是每套模版自己的：设计稿的字号折到 app 的厚度区间上 —— 最薄的书脊给
 * 下限、最厚的给上限；长书名就在这段区间里缩，不跨模版统一。
 */
export interface SpineTextFit {
  /** 按当前厚度推出来的起点字号 */
  base: number;
  /** 这套模版的字号下限（标准） */
  min: number;
  /** 字号上限 */
  max: number;
  /** 长书名继续缩字号的硬下限 */
  floor: number;
  /** 沿长轴的可用长度（px） */
  budget: number;
}

/** 一行文字最后落到 CSS 上的两个数：字号与字距 */
export interface SpineTextPlan {
  size: number;
  letterSpacing: number;
}

export function canShowSpineText(ctx: SpineRenderContext): boolean {
  return ctx.width >= SPINE_TEXT_MIN_WIDTH;
}

export function canShowSpineAuthor(ctx: SpineRenderContext): boolean {
  return canShowSpineText(ctx) && ctx.thickness >= SPINE_AUTHOR_MIN_THICKNESS;
}

/**
 * 书名的字号：设计稿字号 × (书脊厚 / 设计稿的横跨宽)，然后夹进这套模版的区间。
 * 下限还兜一个可读性底线 —— 稿子本来就画得小的（晕染 7.0px、包豪斯 7.9px），薄书脊
 * 上再按比例缩就成蚂蚁了。稿子样字尺寸标错了的（陶土）在 templatesArt.tsx 里逐套覆盖。
 *
 * `maxPx` 是这套模版自己的上限覆盖：稿子里字号画得大的（16.2px 那三套）按厚度推
 * 到最厚会到 19.2px，比 app 里的栏目小标题还大，和别的书脊并排像没对齐，所以逐套
 * 压一条线（见 templatesArt.tsx 的 SPINE_TITLE_MAX_PX）。覆盖值低于下限时抬回下限，
 * 保证区间不会倒过来。
 */
export function titleFit(
  spec: { size: number; width: number },
  thickness: number,
  budget: number,
  maxPx?: number,
): SpineTextFit {
  const at = (value: number) => (spec.size * value) / spec.width;
  const min = round1(Math.max(SPINE_TITLE_MIN_PX, at(MIN_SPINE_THICKNESS)));
  const derived = round1(Math.max(min, at(MAX_SPINE_THICKNESS)));
  const max = maxPx === undefined ? derived : round1(Math.max(min, Math.min(derived, maxPx)));
  return { base: clamp(at(thickness), min, max), min, max, floor: SPINE_TEXT_FLOOR_PX, budget };
}

/** 作者行：比书名小一档，同样随厚度走。只有经典压印那一套有作者行 */
export function authorFit(thickness: number, budget: number): SpineTextFit {
  const min = SPINE_AUTHOR_MIN_PX;
  const max = round1(Math.max(min, 0.4 * MAX_SPINE_THICKNESS - 3));
  return { base: clamp(0.4 * thickness - 3, min, max), min, max, floor: SPINE_TEXT_FLOOR_PX, budget };
}

/**
 * 实际会落到 CSS 上的字距：设计稿的字距随厚度走，但不超过字号的 12%。
 * 缩字号的时候字距跟着一起缩，所以这里和 glyphStyle 用的是同一个函数。
 */
export function effectiveTracking(letterSpacing: number, size: number): number {
  return letterSpacing > 0 ? Math.min(letterSpacing, size * SPINE_TRACKING_RATIO) : letterSpacing;
}

/**
 * 一行文字沿长轴占多长（px）：每个字占一个字号，字后跟一份字距。
 * 西文也按一格算 —— 估宽了顶多排小一点，估窄了会撞上图案，宁可小也不撞。
 */
export function lineLengthPx(text: string, size: number, letterSpacing: number): number {
  return Math.max(Array.from(text).length, 1) * (size + Math.max(letterSpacing, 0));
}

/** 从 top 往下按 0.25px 试，返回第一个装得下的字号；一路到底都装不下就是 null */
function descend(top: number, floor: number, fits: (size: number) => boolean): number | null {
  const steps = Math.max(Math.floor((top - floor) / 0.25), 0);
  for (let step = 0; step < steps; step += 1) {
    const size = top - step * 0.25;
    if (fits(size)) return size;
  }
  return fits(floor) ? floor : null;
}

/**
 * 书名太长时优先缩字号（§12）：
 *
 *   1. 从这套模版随厚度推出来的字号往下降，第一个装得下的就是它；
 *   2. 降到模版下限（标准）还装不下，长书名继续降，直到硬下限；
 *   3. 硬下限也装不下，先把字距收到 0 再降字号 —— 这一步兜住十几字的超长书名，
 *      走到这里基本都能停在安全区里，不会顶边、不会压到图案。
 */
export function fitSpineText(text: string, fit: SpineTextFit, letterSpacing: number): SpineTextPlan {
  const top = clamp(fit.base, fit.min, Math.max(fit.min, fit.max));
  const spaced = descend(top, fit.floor, (size) => {
    const ls = effectiveTracking(letterSpacing, size);
    return lineLengthPx(text, size, ls) <= fit.budget;
  });
  if (spaced !== null) return { size: spaced, letterSpacing: effectiveTracking(letterSpacing, spaced) };

  const tight = descend(
    fit.floor,
    Math.min(SPINE_TEXT_ABS_MIN_PX, fit.floor),
    (size) => lineLengthPx(text, size, 0) <= fit.budget,
  );
  return { size: tight ?? SPINE_TEXT_ABS_MIN_PX, letterSpacing: 0 };
}

function textFrame(style: CSSProperties): CSSProperties {
  return {
    position: 'absolute',
    zIndex: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    pointerEvents: 'none',
    minWidth: 0,
    minHeight: 0,
    ...style,
  };
}

function glyphStyle(
  ctx: SpineRenderContext,
  color: string,
  fontSize: number,
  letterSpacing: number,
): CSSProperties {
  return {
    display: 'block',
    boxSizing: 'border-box',
    overflow: 'visible',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    writingMode: ctx.vertical ? 'vertical-rl' : 'horizontal-tb',
    color,
    fontSize,
    lineHeight: 1.08,
    letterSpacing: effectiveTracking(letterSpacing, fontSize),
  };
}

/**
 * 书名。文字框由模版摆好（框就是「安全区」），这里只负责字号和字距：按厚度推
 * 起点，再用安全区的长度把手里的书名缩进去（缩到哪、字距收到多少见 fitSpineText）。
 */
export function SpineTitle({
  ctx,
  style,
  color,
  fit,
  fontFamily = SPINE_SERIF,
  fontWeight = 400,
  letterSpacing = 0.8,
}: {
  ctx: SpineRenderContext;
  style: CSSProperties;
  color: string;
  fit: SpineTextFit;
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: number;
}): ReactNode {
  if (!canShowSpineText(ctx)) return null;
  const plan = fitSpineText(ctx.book.title, fit, letterSpacing);
  return (
    <div style={textFrame(style)}>
      <span
        title={ctx.book.title}
        style={{
          ...glyphStyle(ctx, color, plan.size, plan.letterSpacing),
          fontFamily,
          fontWeight,
        }}
      >
        {ctx.book.title}
      </span>
    </div>
  );
}

export function SpineAuthor({
  ctx,
  style,
  color,
  fit,
  fontFamily = SPINE_SERIF,
  fontWeight = 400,
}: {
  ctx: SpineRenderContext;
  style: CSSProperties;
  color: string;
  fit: SpineTextFit;
  fontFamily?: string;
  fontWeight?: number;
}): ReactNode {
  if (!canShowSpineAuthor(ctx)) return null;
  const plan = fitSpineText(ctx.book.author, fit, 0.5);
  return (
    <div style={textFrame(style)}>
      <span
        title={ctx.book.author}
        style={{
          ...glyphStyle(ctx, color, plan.size, plan.letterSpacing),
          fontFamily,
          fontWeight,
          opacity: 0.92,
        }}
      >
        {ctx.book.author}
      </span>
    </div>
  );
}

export function SpineShell({
  ctx,
  background,
  children,
  family = SPINE_SERIF,
}: {
  ctx: SpineRenderContext;
  background: string;
  children: ReactNode;
  family?: string;
}): ReactNode {
  const axis = ctx.vertical ? '90deg' : '180deg';
  const veil = `linear-gradient(${axis}, ${INK}.045) 0%, transparent 12%, transparent 88%, ${INK}.055) 100%)`;

  return (
    <div
      style={{
        position: 'relative',
        width: ctx.width,
        height: ctx.height,
        overflow: 'hidden',
        boxSizing: 'border-box',
        background,
        fontFamily: family,
        color: '#2B2420',
      }}
    >
      {children}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 18,
          pointerEvents: 'none',
          background: veil,
        }}
      />
    </div>
  );
}
