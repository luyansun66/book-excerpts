import React, { useState } from 'react';
import type { Book } from '../types';
import { resolveBookLabel } from '../bookLabel';

/**
 * 封面的视觉本体：图片封面（加载失败时退化）或者带书名作者的占位封面。
 *
 * 书架和分类网格都要画同一本封面，只是尺寸和交互不同，所以这里只管「长什么样」，
 * 交互（拖拽、hover、点击）一律由调用方通过 props 传进来，避免两处封面长得不一样。
 * 「读完」角标也归在这里：两处封面都要有，而且必须长得一样。
 */

type CoverBook = Pick<Book, 'title' | 'author' | 'coverType' | 'coverData' | 'finishedAt'>;

export interface BookCoverSurfaceProps {
  book: CoverBook;
  style?: React.CSSProperties;
  /**
   * 占位封面内部字号的缩放系数。书架的封面是 94px 宽（系数 1），
   * 网格里的封面更宽，按 实际宽度 / 94 传进来，标题才不会显得缩成一小坨。
   */
  artScale?: number;
  onClick?: () => void;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
}

function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(r + 28, 255)},${Math.min(g + 28, 255)},${Math.min(b + 28, 255)})`;
}

const PLACEHOLDER_BG = [
  '#3D2E1E', '#2A3528', '#342A3D', '#243040',
  '#3A2A20', '#2E3A34', '#3A2C3D', '#2A3A34',
  '#3D2828', '#28343D',
];

export default function BookCoverSurface({
  book,
  style,
  artScale = 1,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onContextMenu,
}: BookCoverSurfaceProps) {
  // 图片型封面加载失败（比如 blob: 地址早就失效）时，封面框会是全透明的，
  // 书架上就只剩一个"空位"。这里退回到带书名的占位封面。
  const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null);
  const s = artScale;

  const finishedLabel = resolveBookLabel(book);

  /**
   * 右上角的「读完」角标。刻意不给 z-index：它就是封面里最后一个子节点，
   * DOM 顺序天然压住纸纹和金线；一旦写上 z-index，就会像之前摘录卡那样
   * 被提升到页面级、盖住浮层。
   *
   * 字号/内边距都跟着 artScale 走，否则网格里放大的封面会顶着一个迷你角标。
   */
  const ribbon = finishedLabel ? (
    <span
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        maxWidth: '58%',
        padding: `${2 * s}px ${5.5 * s}px`,
        background: finishedLabel.bg,
        color: finishedLabel.fg,
        fontFamily: 'var(--font-sans)',
        fontSize: 8.5 * s,
        fontWeight: 600,
        letterSpacing: 0.3,
        lineHeight: 1,
        borderBottomLeftRadius: 2.5 * s,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }}
    >
      {finishedLabel.text}
    </span>
  ) : null;

  if (book.coverType && book.coverData && failedCoverSrc !== book.coverData) {
    return (
      <div
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        // position: relative 是角标的地基：少了它，absolute 的角标会直接
        // 相对滚动容器定位，跑到别的地方去（占位封面分支一直都有，这里补齐）。
        style={{ ...style, position: 'relative', overflow: 'hidden' }}
      >
        <img
          src={book.coverData}
          alt={book.title}
          onError={() => setFailedCoverSrc(book.coverData ?? null)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {ribbon}
      </div>
    );
  }

  const bg = PLACEHOLDER_BG[book.title.length % PLACEHOLDER_BG.length];

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={onContextMenu}
      style={{
        ...style,
        background: `linear-gradient(170deg, ${lighten(bg)} 0%, ${bg} 70%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${8 * s}px ${5 * s}px`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Paper texture overlay */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 2.5px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.4) 2px, rgba(0,0,0,0.4) 2.5px)',
        }}
      />
      {/* Subtle grain noise */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.04,
          background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.1) 0%, transparent 50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 4 * s,
          border: '1px solid var(--color-gold-light)',
          borderRadius: 1,
          pointerEvents: 'none',
        }}
      />
      {['0,0', '0,auto', 'auto,0', 'auto,auto'].map((pos, i) => {
        const [top, bottom] = pos.split(',');
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: top === '0' ? 6 * s : undefined,
              bottom: bottom === '0' ? 6 * s : undefined,
              left: i < 2 ? 6 * s : undefined,
              right: i >= 2 ? 6 * s : undefined,
              width: 6 * s,
              height: 6 * s,
              borderTop: top === '0' ? '1.5px solid var(--color-gold-light)' : undefined,
              borderBottom: bottom === '0' ? '1.5px solid var(--color-gold-light)' : undefined,
              borderLeft: i < 2 ? '1.5px solid var(--color-gold-light)' : undefined,
              borderRight: i >= 2 ? '1.5px solid var(--color-gold-light)' : undefined,
            }}
          />
        );
      })}
      <p
        style={{
          color: '#d4a840',
          fontSize: 10 * s,
          fontFamily: 'Georgia, "Times New Roman", serif',
          textAlign: 'center',
          lineHeight: 1.35,
          margin: 0,
          fontWeight: 'bold',
          letterSpacing: 0.3,
          whiteSpace: 'pre-line',
          zIndex: 1,
        }}
      >
        {book.title.length > 14 ? book.title.slice(0, 12) + '…' : book.title}
      </p>
      <div
        style={{ width: 22 * s, height: Math.max(1, s), background: 'rgba(200,151,42,0.45)', margin: `${4 * s}px 0`, zIndex: 1 }}
      />
      <p
        style={{
          color: 'rgba(200,151,42,0.6)',
          fontSize: 9 * s,
          fontFamily: 'Georgia, "Times New Roman", serif',
          textAlign: 'center',
          margin: 0,
          zIndex: 1,
          letterSpacing: 0.2,
        }}
      >
        {book.author.length > 10 ? book.author.slice(0, 9) + '…' : book.author}
      </p>
      {ribbon}
    </div>
  );
}
