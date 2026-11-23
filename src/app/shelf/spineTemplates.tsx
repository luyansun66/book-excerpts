import type { CSSProperties, ReactNode } from 'react';
import type { Book } from '../types';
import { placeholderColorFor } from '../components/BookCoverSurface';
import { SPINE_ART_TEMPLATES } from './spine/templatesArt';
import { DEFAULT_SPINE_TEMPLATE_ID } from './bookLayout';
import { useCoverPalette } from './useCoverPalette';
import {
  authorFit,
  canShowSpineAuthor,
  SPINE_TEXT_EDGE_PX,
  SPINE_TITLE_GAP_PX,
  SpineAuthor,
  SpineShell,
  SpineTitle,
  titleFit,
} from './spine/shared';

export { DEFAULT_SPINE_TEMPLATE_ID };

/**
 * 书脊模版注册表（设计文档 §8.1 / §8.2）。
 *
 * 模版清单集中在 `SPINE_TEMPLATES`，排布引擎和三种摆放形态的渲染代码都不用改。
 */
export interface SpineRenderContext {
  book: Book;
  /** 竖放 = T；横放 = L */
  width: number;
  /** 竖放 = L；横放 = T */
  height: number;
  /** true 竖排文字 / false 横排文字 */
  vertical: boolean;
  /** 书脊厚 T，字号按它推（与方向无关） */
  thickness: number;
}

export interface SpineTemplate {
  id: string;
  name: string;
  render(ctx: SpineRenderContext): ReactNode;
}

const SPINE_FONT = "'Songti SC','STSong','Noto Serif SC',serif";

/** 压印带：距书脊首尾 12px、厚 2px。它们就是这套「稿子」的图案 */
const EMBOSS_INSET = 12;
const EMBOSS_THICKNESS = 2;

/**
 * 文字的首尾留白：取「通用边距」与「压印带内侧再退开固定间距」里靠里的那个 ——
 * 书名/作者既不顶边，也不会压在压印带上（§12：带图案的模版都要跟图案留固定间距）。
 */
const EMBOSS_CLEARANCE = EMBOSS_INSET + EMBOSS_THICKNESS + SPINE_TITLE_GAP_PX;
const DEFAULT_TEXT_INSET = Math.max(
  SPINE_TEXT_EDGE_PX,
  EMBOSS_CLEARANCE,
);

/** 作者行的框长：书脊长的一成九 */
const AUTHOR_FRAME_RATIO = 0.19;

/**
 * 经典压印没有设计稿，字号一直按厚度的四成推；折到 app 的厚度区间（19–32）
 * 就是 7.6～12.8px，下限由 shared.titleFit 兜到 8px。
 */
const DEFAULT_TITLE_SPEC = { size: 10.8, width: 27 };

/**
 * 两条 2px 压印带。竖放时是横带（距上下边 12px、左右缩进 18%），
 * 横放时整体转 90°（距左右边 12px、上下缩进 18%）。
 */
function EmbossBand({
  vertical,
  atEnd,
  ink,
}: {
  vertical: boolean;
  atEnd: boolean;
  ink: string;
}) {
  const common: CSSProperties = {
    position: 'absolute',
    background: vertical
      ? `linear-gradient(90deg, transparent, ${ink}, transparent)`
      : `linear-gradient(180deg, transparent, ${ink}, transparent)`,
    opacity: 0.55,
    pointerEvents: 'none',
    boxShadow: '0 1px 1px rgba(42,37,32,.30)',
  };

  if (vertical) {
    return (
      <div
        style={{
          ...common,
          left: '18%',
          right: '18%',
          height: 2,
          top: atEnd ? undefined : 12,
          bottom: atEnd ? 12 : undefined,
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...common,
        top: '18%',
        bottom: '18%',
        width: 2,
        left: atEnd ? undefined : 12,
        right: atEnd ? 12 : undefined,
      }}
    />
  );
}

function ClassicSpine({ ctx }: { ctx: SpineRenderContext }) {
  const { book, vertical } = ctx;
  const palette = useCoverPalette(book.coverData, placeholderColorFor(book));
  const lightDirection = vertical ? '90deg' : '180deg';

  /**
   * 这一套是居中模版：书名在「首尾留白 + 作者那一栏」之外剩下的区域里居中。
   * 长轴就是书脊长（竖放是上下、横放是左右），所以两个方向只在映射上不同。
   */
  const length = vertical ? ctx.height : ctx.width;
  const authorLength = canShowSpineAuthor(ctx) ? length * AUTHOR_FRAME_RATIO : 0;
  const titleEnd = Math.max(
    DEFAULT_TEXT_INSET + 1,
    length - DEFAULT_TEXT_INSET - (authorLength ? authorLength + SPINE_TITLE_GAP_PX : 0),
  );

  return (
    <SpineShell
      ctx={ctx}
      background={[
        `linear-gradient(${lightDirection}, rgba(19,16,13,.28), ${palette.highlight} 29%, rgba(19,16,13,.04) 62%, rgba(19,16,13,.25))`,
        `radial-gradient(72% 22% at 50% 72%, ${palette.accentWash}, transparent 78%)`,
        `linear-gradient(170deg, ${palette.top} 0%, ${palette.base} 62%, ${palette.bottom} 100%)`,
      ].join(', ')}
      family={SPINE_FONT}
    >
      <EmbossBand vertical={vertical} atEnd={false} ink={palette.mutedInk} />
      <EmbossBand vertical={vertical} atEnd ink={palette.mutedInk} />
      <SpineTitle
        ctx={ctx}
        color={palette.ink}
        letterSpacing={vertical ? 1.5 : 0.6}
        fit={titleFit(DEFAULT_TITLE_SPEC, ctx.thickness, titleEnd - DEFAULT_TEXT_INSET)}
        style={vertical
          ? { top: DEFAULT_TEXT_INSET, bottom: length - titleEnd, left: 0, right: 0 }
          : { left: DEFAULT_TEXT_INSET, right: length - titleEnd, top: 0, bottom: 0 }}
      />
      <SpineAuthor
        ctx={ctx}
        color={palette.mutedInk}
        fit={authorFit(ctx.thickness, authorLength)}
        style={vertical
          ? { bottom: DEFAULT_TEXT_INSET, left: 0, right: 0, height: authorLength }
          : { right: DEFAULT_TEXT_INSET, top: 0, bottom: 0, width: authorLength }}
      />
    </SpineShell>
  );
}

function defaultRender(ctx: SpineRenderContext): ReactNode {
  return <ClassicSpine ctx={ctx} />;
}
const defaultTemplate: SpineTemplate = {
  id: DEFAULT_SPINE_TEMPLATE_ID,
  name: '经典压印',
  render: defaultRender,
};

/**
 * 模版顺序 = 书脊样式的展示顺序：**按布面的感知亮度从深到浅**。
 *
 * 经典压印排在最前，是因为它是最稳定、默认选中、且会自动跟随真实封面取色的样式。
 * 剩下 17 套仍是固定的设计稿，排序依据见 `SPINE_ART_TEMPLATES` 的注释。
 */
export const SPINE_TEMPLATES: SpineTemplate[] = [
  defaultTemplate,
  ...SPINE_ART_TEMPLATES,
];

export function getSpineTemplate(id?: string): SpineTemplate {
  return SPINE_TEMPLATES.find((template) => template.id === id) ?? defaultTemplate;
}
