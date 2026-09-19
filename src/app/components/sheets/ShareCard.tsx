// ─── 摘录卡片本体 ─────────────────────────────────────────────────────────────
//
// 同一份卡片要在三个地方出现：舞台里的预览（缩放）、全屏预览（缩放）、以及
// 离屏的原尺寸导出节点（html2canvas 截图用）。三处必须长得一模一样，所以卡片
// 只有这一个实现，缩放交给外层的 wrapper —— 卡片自己永远按 270px 原尺寸排版。
//
// 注意：导出尺寸、字号分档、data-share-card-font / data-share-sticker 这两个
// 标记都是导出链路的契约，改动会直接改变出图结果。

import type { Quote } from '../../types';

/** 卡片排版宽度。导出时 scale=3，出图 810px 宽。 */
export const CARD_WIDTH = 270;

export interface ShareCardTheme {
  bgColor: string;
  textColor: string;
  accentColor: string;
}

export interface ShareCardProps {
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
  theme: ShareCardTheme;
  /** 正文的字体栈（子集就位 / 系统兜底 / 整套字体，由 ShareSheet 决定） */
  cardFamily: string;
  showThoughts: boolean;
  /** 当前贴纸的 SVG 源码；null = 不贴 */
  stickerSvg: string | null;
  /** 预览上给重一点的投影；导出用默认值，别动 */
  shadow?: string;
}

/**
 * 正文基准字号：按字数分档，越长越小 —— 长摘录靠缩字号而不是靠裁切来排下。
 * 分档边界与出图强相关，别随手调。
 */
export function quoteFontSize(text: string): number {
  const len = text.length;
  if (len <= 50) return 15;
  if (len <= 100) return 13.5;
  if (len <= 180) return 12;
  if (len <= 300) return 11;
  if (len <= 500) return 10;
  return 9;
}

const META_FONT = '-apple-system, BlinkMacSystemFont, sans-serif';

export default function ShareCard({
  quote,
  bookTitle,
  bookAuthor,
  theme,
  cardFamily,
  showThoughts,
  stickerSvg,
  shadow = '0 8px 40px rgba(0,0,0,0.12)',
}: ShareCardProps) {
  const size = quoteFontSize(quote.text);
  const markSize = Math.min(size * 1.8, 34);

  return (
    <div
      style={{
        width: CARD_WIDTH,
        padding: '28px 26px 22px',
        background: theme.bgColor,
        color: theme.textColor,
        borderRadius: 0,
        boxShadow: shadow,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <span
        data-share-card-font=""
        style={{
          fontFamily: cardFamily,
          fontSize: markSize,
          color: theme.accentColor,
          lineHeight: 0.7,
          opacity: 0.35,
          userSelect: 'none',
          marginBottom: 4,
        }}
      >
        &ldquo;
      </span>

      <p
        data-share-card-font=""
        style={{
          fontFamily: cardFamily,
          fontSize: size,
          lineHeight: 1.7,
          color: theme.textColor,
          margin: 0,
          padding: '0 2px',
          wordBreak: 'break-word',
          textAlign: 'justify',
          textJustify: 'inter-character' as never,
          lineBreak: 'strict' as never,
          whiteSpace: 'pre-wrap',
        }}
      >
        {quote.text}
      </p>

      <div style={{ textAlign: 'right', marginTop: 2 }}>
        <span
          data-share-card-font=""
          style={{
            fontFamily: cardFamily,
            fontSize: markSize,
            color: theme.accentColor,
            lineHeight: 0.7,
            opacity: 0.35,
            userSelect: 'none',
          }}
        >
          &rdquo;
        </span>
      </div>

      {showThoughts && quote.thought && (
        <div
          style={{
            fontSize: 10,
            lineHeight: 1.5,
            color: theme.textColor,
            opacity: 0.5,
            fontFamily: META_FONT,
            borderTop: `1px solid ${theme.accentColor}22`,
            paddingTop: 8,
            marginTop: 4,
            whiteSpace: 'pre-wrap',
          }}
        >
          {quote.thought}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginTop: 14,
          height: 55,
        }}
      >
        {stickerSvg ? (
          <div
            data-share-sticker=""
            dangerouslySetInnerHTML={{ __html: stickerSvg }}
            style={{
              height: 40,
              width: 40,
              overflow: 'hidden',
              opacity: 0.9,
              flex: 'none',
              lineHeight: 0,
              color: theme.textColor,
            }}
          />
        ) : (
          <div style={{ width: 40, flex: 'none' }} />
        )}

        <div style={{ textAlign: 'right', flex: 1 }}>
          <div style={{ fontSize: 9, fontFamily: META_FONT, color: theme.textColor, opacity: 0.6, lineHeight: 1.4 }}>
            {bookTitle}
          </div>
          <div style={{ fontSize: 9, fontFamily: META_FONT, color: theme.textColor, opacity: 0.6, lineHeight: 1.4 }}>
            {bookAuthor}
          </div>
          <div style={{ fontSize: 9, fontFamily: META_FONT, color: theme.textColor, opacity: 0.6, lineHeight: 1.4 }}>
            {quote.page != null && <span>{/^\d+$/.test(quote.page) ? `P.${quote.page}` : quote.page} · </span>}
            <span>{quote.date}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
