import { ChevronRight } from 'lucide-react';
import type { PointerEventHandler } from 'react';

const PILL_HIT_WIDTH = 88;
const PILL_HIT_HEIGHT = 33;

export interface CategoryHeadingProps {
  name: string;
  bookCount: number;
  onOpenCategory?: () => void;
  onCatDragPointerDown?: PointerEventHandler<HTMLElement>;
  isCatDragged?: boolean;
}

/**
 * 分类标题行：分类名 +「N books ›」+ 可选拖拽柄。
 *
 * 经典主题和书架 v2 共用同一份排版，避免切主题时标题行也跟着跳一下。
 */
export default function CategoryHeading({
  name,
  bookCount,
  onOpenCategory,
  onCatDragPointerDown,
  isCatDragged = false,
}: CategoryHeadingProps) {
  return (
    <div style={{ paddingLeft: 18, paddingTop: 14, paddingBottom: 10, paddingRight: 14, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <span
        style={{
          fontSize: 11,
          letterSpacing: 2,
          color: 'var(--color-text-accent)',
          fontFamily: 'var(--font-sans)',
          textTransform: 'uppercase',
          fontWeight: 600,
          // 计数入口现在占得更宽，分类名过长时要能收缩，不能把它挤出去
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingRight: 10,
        }}
      >
        {name}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* 书名计数器同时是入口：点开就是这一类的全部书籍网格页。
            字号/字距跟左边分类名一致，只靠颜色区分主次；负外边距把触点撑到
            30px 高，但视觉位置不动，也不会压到底下的封面。 */}
        <button
          onClick={onOpenCategory}
          disabled={!onOpenCategory}
          aria-label={`查看「${name}」的全部 ${bookCount} 本书`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 2,
            fontSize: 9,
            // 9px 的字配上 2px 字距太空，收到 1px（字之间还留着约 1.8px 空隙，
            // 不会挨到一起）
            letterSpacing: 1,
            minWidth: PILL_HIT_WIDTH,
            minHeight: PILL_HIT_HEIGHT,
            fontWeight: 600,
            textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-muted)',
            background: 'none',
            border: 'none',
            cursor: onOpenCategory ? 'pointer' : 'default',
            // 右对齐 + minWidth：盒子被右边的 ⠿ 顶住，多出来的宽度全往左长，
            // 文字位置一点不动
            padding: '8px 6px',
            margin: '-8px 0',
            transition: 'color 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-accent)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'; }}
        >
          {bookCount} books
          <ChevronRight size={10} strokeWidth={2.4} style={{ marginTop: 1 }} />
        </button>
        {onCatDragPointerDown && (
          <span
            onPointerDown={onCatDragPointerDown}
            style={{
              cursor: 'grab',
              userSelect: 'none',
              fontSize: 11,
              lineHeight: 1,
              color: isCatDragged ? 'var(--color-text-accent)' : 'var(--color-border)',
              padding: '2px 4px',
              borderRadius: 4,
              transition: 'color 0.15s, background 0.15s',
              touchAction: 'none',
            }}
            onMouseEnter={(e) => { if (!isCatDragged) (e.currentTarget as HTMLElement).style.color = 'var(--color-text-accent)'; }}
            onMouseLeave={(e) => { if (!isCatDragged) (e.currentTarget as HTMLElement).style.color = 'var(--color-border)'; }}
          >
            ⠿
          </span>
        )}
      </div>
    </div>
  );
}
