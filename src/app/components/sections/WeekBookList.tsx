import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import type { WeekBookReading } from '../../db/readingTime';
import { formatMinutesHuman } from '../timer/format';

interface WeekBookListProps {
  books: WeekBookReading[];
}

/** 本周阅读明细：按书拆分用时，默认收起，点击标题行展开。 */
export default function WeekBookList({ books }: WeekBookListProps) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();

  if (books.length === 0) {
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--color-border-light)',
          fontSize: 11,
          color: 'var(--color-text-muted)',
          fontFamily: '-apple-system, sans-serif',
          textAlign: 'center',
        }}
      >
        本周还没有阅读记录
      </div>
    );
  }

  const maxMinutes = Math.max(...books.map((book) => book.minutes), 1);

  const rows = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingTop: 12 }}>
      {books.map((book) => (
        <div key={book.bookId} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 12.5,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-serif)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {book.title}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                color: 'var(--color-text-secondary)',
                fontFamily: '-apple-system, sans-serif',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatMinutesHuman(book.minutes)}
            </span>
          </div>
          <div style={{ height: 3, background: 'var(--color-bg-skeleton)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max((book.minutes / maxMinutes) * 100, 4)}%`,
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-soft))',
                transition: 'width var(--transition-normal)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative', marginTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: 0,
          paddingTop: 12,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', letterSpacing: 0.4 }}>
          本周阅读 · {books.length} 本书
        </span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-normal)',
            color: 'var(--color-text-muted)',
          }}
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {reduceMotion ? (
        expanded && rows
      ) : (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="week-books"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              style={{ overflow: 'hidden' }}
            >
              {rows}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
