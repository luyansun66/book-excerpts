import type { CSSProperties } from 'react';
import { canSkipMeasurement, useClampCollapse } from '../hooks/useClampCollapse';

// ─── 摘录下方的感悟：过长时折叠 ────────────────────────────────────────────────
//
// 感悟是用户随手写的分析，长度不受控：一篇千字长文挂在摘录下面，能把一张卡片撑满
// 好几屏，后面的摘录全被顶出视野。这里给它一个默认高度上限，想看全文就地展开。
//
// 截断交给 CSS（-webkit-line-clamp），由浏览器按真实排版算，中英混排、标点避头尾、
// 换行都算得准 —— 项目里已经用在分类网格的书名和复习卡片正文上。
//
// 「先按会被截断渲染、再量」这套测量逻辑和摘录正文共用，在 useClampCollapse 里，
// 连同当年踩过的坑一起。

/** 折叠时最多显示几行。改动请连卡片整体高度一起看，别顺手往上加。 */
export const THOUGHT_MAX_LINES = 3;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';

/**
 * 折叠态专用的整理：`pre-wrap` 下空行是实打实的一行，而折叠后总共只有几行 ——
 * 一段以几个空行开头的感悟，不加处理会变成一个「空的灰框 + 展开按钮」。
 * 所以开头的空行直接去掉，中间连续空行压成一个（段落间隔还在）。
 * 只作用于折叠态：展开后是用户写的原文，一个字都不动。
 */
export function collapseBlankLines(text: string): string {
  return text.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

/**
 * 灰框：底色和内边距归这一层。
 *
 * 内边距不能写在被截断的那个元素上 —— `-webkit-line-clamp` 的裁剪边界是 padding box
 * 而不是行边界，底部内边距会变成一条「缝」：下一行的字头正好从缝里漏出来，看着就是
 * 一行被腰斩的字（无头 Chrome 逐行扫像素实测，6px 内边距漏出 3px 字头）。
 * 分开之后，被截断的元素自己没有内边距，裁剪边界和行边界重合，缝就没了。
 */
const BOX_STYLE: CSSProperties = {
  margin: '2px 0 0',
  background: 'var(--color-bg-thought)',
  padding: '6px 10px',
  borderRadius: 6,
};

const TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 12.5,
  lineHeight: 1.65,
  color: 'var(--color-quote-thought)',
  whiteSpace: 'pre-wrap',
  // 长英文单词 / URL 不会自己断行，会把卡片横向顶出去
  overflowWrap: 'anywhere',
  overflow: 'hidden',
};

const ARROW_STYLE: CSSProperties = {
  color: 'var(--color-quote-mark)',
  fontSize: 13,
  lineHeight: 1,
  marginTop: 3,
  flexShrink: 0,
  userSelect: 'none',
};

const TOGGLE_STYLE: CSSProperties = {
  margin: '4px 0 0 10px',
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

interface CollapsibleThoughtProps {
  thought: string;
  maxLines?: number;
}

export default function CollapsibleThought({
  thought,
  maxLines = THOUGHT_MAX_LINES,
}: CollapsibleThoughtProps) {
  const skippable = canSkipMeasurement(thought, maxLines);
  const { clamped, truncated, expanded, toggle, measureRef } =
    useClampCollapse<HTMLParagraphElement>({ contentKey: thought, skippable });

  if (!thought) return null;

  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingLeft: 2 }}>
      <span style={ARROW_STYLE}>↳</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={BOX_STYLE}>
          <p
            ref={measureRef}
            style={
              clamped
                ? {
                    ...TEXT_STYLE,
                    display: '-webkit-box',
                    WebkitLineClamp: maxLines,
                    WebkitBoxOrient: 'vertical',
                  }
                : TEXT_STYLE
            }
          >
            {clamped ? collapseBlankLines(thought) : thought}
          </p>
        </div>
        {truncated === true && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={toggle}
            style={TOGGLE_STYLE}
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
    </div>
  );
}
