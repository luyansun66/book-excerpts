import type { CSSProperties } from 'react';
import { parseRichText, type RichScope } from '../richText';

// ─── 把轻量标记渲染成行内元素 ────────────────────────────────────────────────
//
// 只返回行内内容（span / strong / mark），不包任何块级元素、不自己开 <p>：
// 调用方继续拿原来的容器（<p>、带 line-clamp 的 div）包住它。
// 理由见设计文档 §5.2 —— 折叠裁剪的边界必须继续落在行边界上。

interface RichTextProps {
  text: string;
  scope: RichScope;
  /**
   * 高亮底色。默认走主题令牌；回顾卡是固定纸色的实物（配色全在 rolodex/tokens.ts），
   * 那边显式传 COLORS.highlightBg，不跟主题联动。
   */
  markBackground?: string;
}

const MARK_STYLE: CSSProperties = {
  background: 'var(--color-quote-mark-bg)',
  color: 'inherit',
  borderRadius: 2,
  padding: '0 1px',
  // 高亮跨行时每一行都要画上底，否则第二行开始是断的
  boxDecorationBreak: 'clone' as never,
  WebkitBoxDecorationBreak: 'clone' as never,
};

export default function RichText({ text, scope, markBackground }: RichTextProps) {
  const lines = parseRichText(text, scope);
  const markStyle = markBackground ? { ...MARK_STYLE, background: markBackground } : MARK_STYLE;

  return (
    <>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? '\n' : ''}
          {line.map((run, runIndex) => {
            if (run.kind === 'strong') return <strong key={runIndex}>{run.text}</strong>;
            if (run.kind === 'mark') {
              return (
                <mark key={runIndex} style={markStyle}>
                  {run.text}
                </mark>
              );
            }
            return <span key={runIndex}>{run.text}</span>;
          })}
        </span>
      ))}
    </>
  );
}
