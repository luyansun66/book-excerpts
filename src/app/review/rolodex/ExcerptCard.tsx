// 一张摘录卡：正文衬线、落款手写体。
//
// 卡片尺寸是固定的，字号反过来迁就文字：先用字数猜一个档位（cardFit.ts），再拿一张
// 隐藏的探针卡按真实排版量一遍，从大往小挑第一个放得下的。量出来的档位按摘录 id 缓存 ——
// 同一张卡会在翻页过程中同时挂 2~3 份（翻页片的正反面 + 上下槽），不缓存就是白量三次。

import { memo, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Book, Quote } from '../../types';
import { FONT_TIERS, LINE_HEIGHT_RATIO, guessTierIndex, pickTierIndex } from '../cardFit';
import { CARD_H, CARD_W, COLORS, HEI_STACK, SERIF_STACK } from './tokens';

interface Fit {
  tierIndex: number;
  truncated: boolean;
  /** 量的时候正文区多高。舞台尺寸变了（理论上不会）就重测。 */
  bodyHeight: number;
}

const fitCache = new Map<string, Fit>();

/** 落款区三行（书名 / 作者 / 日期）的信息量，正文区要让出这么多。 */
const FOOT_SIZE = 11;
const FOOT_LINE = 1.25;
/** 落款行与行之间的额外间距 */
const FOOT_GAP = 3;
const FOOT_BOTTOM = 14;
const FOOT_HEIGHT = FOOT_SIZE * FOOT_LINE * 3 + FOOT_GAP * 2;

const BODY_INSET = { top: 20, left: 22, right: 22, bottom: Math.ceil(FOOT_BOTTOM + FOOT_HEIGHT) + 4 };
const BODY_HEIGHT = CARD_H - BODY_INSET.top - BODY_INSET.bottom;
const BODY_WIDTH = CARD_W - BODY_INSET.left - BODY_INSET.right;

/**
 * 正文框按「整行」给高度，返回这个字号下真正能用的高度和行数。
 *
 * 正文区高度是算出来的，几乎不会正好是行高的整数倍；直接拿它当 height 的话，框底会多出
 * 一段不足一行的地方，浏览器就把下一行的字头画进去，看起来像渲染坏了。测量和渲染都得用
 * 这里的结果，否则量出来「放得下」的字，真渲染时会被这半行切掉。
 */
function fitWholeLines(fontSize: number) {
  const lineHeight = fontSize * LINE_HEIGHT_RATIO;
  const lines = Math.max(1, Math.floor(BODY_HEIGHT / lineHeight + 1e-6));
  return { lines, lineHeight, height: lines * lineHeight };
}

/**
 * 正文和探针必须共用同一套排版参数，否则量出来的行数和真渲染对不上。
 *
 * 对齐方式跟「分享图片」的卡片（components/sheets/ShareCard.tsx）保持一致：两端对齐 +
 * 字间伸缩，中文靠拉开字距去顶齐右边缘，而不是像西文那样去拉词距；lineBreak: strict
 * 让标点不掉到行首。改这里要连 ShareCard 一起改。
 */
const TEXT_STYLE: CSSProperties = {
  fontFamily: SERIF_STACK,
  letterSpacing: 0.3,
  color: COLORS.ink,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  whiteSpace: 'pre-wrap',
  textAlign: 'justify',
  textJustify: 'inter-character' as never,
  lineBreak: 'strict' as never,
};

/** 落款每行只给一行的高度：书名太长就省略号，挤下去会顶到正文。 */
const ELLIPSIS: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

interface Props {
  quote: Quote;
  book?: Book | null;
  onOpenFull?: (quote: Quote) => void;
}

function ExcerptCardImpl({ quote, book, onOpenFull }: Props) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit | null>(() => fitCache.get(quote.id) ?? null);

  useLayoutEffect(() => {
    const cached = fitCache.get(quote.id);
    if (cached && Math.abs(cached.bodyHeight - BODY_HEIGHT) < 1) {
      setFit((prev) => (prev === cached ? prev : cached));
      return;
    }

    const probe = probeRef.current;
    if (!probe) return;

    probe.style.width = `${BODY_WIDTH}px`;
    const fits = (index: number) => {
      probe.style.fontSize = `${FONT_TIERS[index]}px`;
      const { height, lineHeight } = fitWholeLines(FONT_TIERS[index]);
      probe.style.lineHeight = `${lineHeight}px`;
      return probe.scrollHeight <= height;
    };

    const tierIndex = pickTierIndex(fits);
    const next: Fit = { tierIndex, truncated: !fits(tierIndex), bodyHeight: BODY_HEIGHT };
    fitCache.set(quote.id, next);
    setFit((prev) => (prev && prev.tierIndex === next.tierIndex && prev.truncated === next.truncated ? prev : next));
  }, [quote.id]);

  const tierIndex = fit?.tierIndex ?? guessTierIndex(quote.text);
  const fontSize = FONT_TIERS[tierIndex];
  const body = fitWholeLines(fontSize);
  // 第三行只显示添加日期，写成 2026/10/01。date 多数是「YYYY-MM-DD」，同步/导入进来的
  // 可能是带时间的完整 ISO，所以只认前面那段年月日；认不出来就原样显示，别把日期吃掉。
  const rawDate = quote.date ?? '';
  const ymd = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const day = ymd ? `${ymd[1]}/${ymd[2]}/${ymd[3]}` : rawDate;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 12,
        background: COLORS.paper,
        overflow: 'hidden',
        boxShadow: '0 10px 22px rgba(18,20,26,0.16), inset 0 1px 0 rgba(255,255,255,0.8)',
      }}
    >
      {/* 打孔圆点 */}
      <span
        style={{
          position: 'absolute',
          top: 13,
          right: 13,
          width: 9,
          height: 9,
          borderRadius: '50%',
          background: 'rgba(32,35,42,0.10)',
        }}
      />

      {/* 正文 */}
      <div
        style={{
          ...TEXT_STYLE,
          position: 'absolute',
          left: BODY_INSET.left,
          right: BODY_INSET.right,
          top: BODY_INSET.top,
          height: body.height,
          display: '-webkit-box',
          WebkitLineClamp: body.lines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize,
          // lineHeight 在 React 里属于「不带单位」的属性，数字会被当成倍数，必须显式给 px。
          lineHeight: `${body.lineHeight}px`,
        }}
      >
        {quote.text}
      </div>

      {/* 量字用的探针：同宽同字体，只换字号，永远不进视野 */}
      <div
        ref={probeRef}
        aria-hidden="true"
        style={{
          ...TEXT_STYLE,
          position: 'absolute',
          top: 0,
          left: -10000,
          visibility: 'hidden',
          pointerEvents: 'none',
          height: 'auto',
        }}
      >
        {quote.text}
      </div>

      {/* 落款：书名 / 作者 / 日期。三行同字号、同颜色、同字体，靠行序而不是靠大小和深浅
          去分主次——卡片尺寸固定，省下来的那点高度留给正文。 */}
      <div
        style={{
          position: 'absolute',
          left: BODY_INSET.left,
          right: BODY_INSET.right,
          bottom: FOOT_BOTTOM,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 10,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: HEI_STACK,
            fontSize: FOOT_SIZE,
            lineHeight: FOOT_LINE,
            color: COLORS.inkSoft,
          }}
        >
          <div style={ELLIPSIS}>{book?.title || '未知书目'}</div>
          {book?.author && <div style={{ marginTop: FOOT_GAP, ...ELLIPSIS }}>{book.author}</div>}
          {day && <div style={{ marginTop: FOOT_GAP, ...ELLIPSIS }}>{day}</div>}
        </div>

        {fit?.truncated && (
          <button
            type="button"
            data-no-pan=""
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenFull?.(quote);
            }}
            style={{
              flex: '0 0 auto',
              padding: '5px 11px',
              borderRadius: 999,
              border: `1px solid rgba(32,35,42,0.18)`,
              background: 'rgba(32,35,42,0.05)',
              color: COLORS.inkSoft,
              fontFamily: HEI_STACK,
              fontSize: 12.5,
              letterSpacing: 0.6,
              cursor: 'pointer',
            }}
          >
            全文
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(ExcerptCardImpl);
