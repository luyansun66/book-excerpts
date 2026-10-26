import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { canSkipMeasurement, useClampCollapse } from '../hooks/useClampCollapse';

// ─── 摘录正文：超过半屏就折起来 ────────────────────────────────────────────────
//
// 正文长度完全不受控：从 Kindle 上整段复制、OCR 一整页，都是常事。一条几千字的摘录
// 能把卡片撑满好几屏，后面的摘录看着就像不存在。所以给它一个上限：最多占半屏，超出的
// 部分折起来，想看就地展开。
//
// 上限按「行数」算，不直接给 max-height —— max-height 会把下一行从中间切开，底部挂
// 半截字（感悟那处踩过同一个坑，见 CollapsibleThought）。按行高折算出整行数交给
// -webkit-line-clamp，裁剪边界正好落在行边界上。
//
// 半屏是页面高度的半屏，所以这里要量、也要跟着变的是 window.innerHeight。

/** 正文最多占页面的多少。一半：一屏至少还能看见下一条摘录的开头。 */
export const QUOTE_BODY_MAX_PAGE_RATIO = 0.5;

/** 正文那一行的字号和行高（Georgia）。折算行数要用，所以和 style 里必须是同一个数。 */
export const QUOTE_BODY_FONT_SIZE = 14.5;
export const QUOTE_BODY_LINE_HEIGHT = 1.78;
export const QUOTE_BODY_LINE_PX = QUOTE_BODY_FONT_SIZE * QUOTE_BODY_LINE_HEIGHT;

/**
 * 半屏放得下几整行，至少 1 行 —— 屏幕再矮也不该把正文折成空气。
 * 按 jsdom 的 window.innerHeight（768）算就是 14 行。
 */
export function quoteBodyMaxLines(pageHeight: number): number {
  return Math.max(1, Math.floor((pageHeight * QUOTE_BODY_MAX_PAGE_RATIO) / QUOTE_BODY_LINE_PX));
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';

const TEXT_STYLE: CSSProperties = {
  fontFamily: SERIF,
  fontSize: QUOTE_BODY_FONT_SIZE,
  lineHeight: QUOTE_BODY_LINE_HEIGHT,
  color: 'var(--color-text)',
  margin: 0,
  // 给左上角那个 40px 的引号让位（“ 绝对定位在块外面）
  paddingTop: 8,
  whiteSpace: 'pre-wrap',
  // 长英文单词 / URL 不会自己断行，会把卡片横向顶出去
  overflowWrap: 'anywhere',
  // 两端对齐，跟回顾卡（review/rolodex/ExcerptCard.tsx）和分享图（sheets/ShareCard.tsx）同一套：
  // 中文靠拉开字距顶齐右边缘，而不是像西文那样去拉词距；lineBreak: strict 让标点不掉到行首。
  // 折叠测量（useClampCollapse）按行数算，对齐方式不改行数。改这里要连那两处一起看。
  textAlign: 'justify',
  textJustify: 'inter-character' as never,
  lineBreak: 'strict' as never,
};

const MARK_STYLE: CSSProperties = {
  fontFamily: 'Georgia, serif',
  fontSize: 40,
  color: 'var(--color-quote-mark)',
  lineHeight: 1,
  userSelect: 'none',
  // 没有按钮的时候靠它把收尾的引号推到右边
  marginLeft: 'auto',
};

// 和感悟那个「展开 / 收起」同一个模样：同一张卡片里两个折叠控件不该长得不一样
const TOGGLE_STYLE: CSSProperties = {
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: SANS,
  fontSize: 11,
  lineHeight: 1.4,
  color: 'var(--color-quote-thought)',
  opacity: 0.75,
};

/** 页面高度没变就不重算 —— 手机上地址栏收放会连着发一长串 resize。 */
function usePageHeight(): number {
  const [pageHeight, setPageHeight] = useState(() => window.innerHeight);
  const heightRef = useRef(pageHeight);

  useEffect(() => {
    const onResize = () => {
      const next = window.innerHeight;
      if (next === heightRef.current) return;
      heightRef.current = next;
      setPageHeight(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return pageHeight;
}

export default function CollapsibleQuoteText({ text }: { text: string }) {
  const pageHeight = usePageHeight();
  const maxLines = quoteBodyMaxLines(pageHeight);
  const skippable = canSkipMeasurement(text, maxLines);
  const { clamped, truncated, expanded, toggle, measureRef, invalidate } =
    useClampCollapse<HTMLParagraphElement>({ contentKey: text, skippable });

  // 转屏、地址栏收放、桌面拖窗口都会改「半屏」有多高：手上有结论的都作废、重量一次
  useEffect(() => {
    if (!skippable) invalidate();
  }, [invalidate, skippable, maxLines]);

  return (
    <>
      <p
        ref={measureRef}
        style={
          clamped
            ? {
                ...TEXT_STYLE,
                display: '-webkit-box',
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }
            : TEXT_STYLE
        }
      >
        {text}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: -4 }}>
        {truncated === true && (
          <button type="button" aria-expanded={expanded} onClick={toggle} style={TOGGLE_STYLE}>
            {expanded ? '收起' : '展开'}
          </button>
        )}
        <span style={MARK_STYLE}>&#x201D;</span>
      </div>
    </>
  );
}
