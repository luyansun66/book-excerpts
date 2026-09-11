import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useApp } from '../store';
import { CATEGORY_GRID_COLUMNS, filterCategoryBooks } from '../categoryBooks';
import { SHELF_COVER_HEIGHT, SHELF_COVER_WIDTH } from '../shelfScroll';
import BookCoverSurface from './BookCoverSurface';

/**
 * 某个分类下的全部书籍网格页。
 *
 * 分类里的书多起来之后，书架那一条横向滑动翻起来很累，所以书架分类头右侧的
 * 计数变成了入口，点开推入这一页：先搜索，再一屏看到全部封面。
 * 点封面直接进摘录列表（BookDetailPage 本身就是摘录列表）。
 */

const GRID_PADDING = 18;
// 列间距给得比行间距宽：封面在三列里本来就够大，留点竖缝，一行三本才不至于
// 挤成一整块，也顺便把单本封面的宽度收窄一档。
const GRID_GAP = 32;

interface CategoryBooksPageProps {
  categoryId: string;
  onBack: () => void;
}

export function CategoryBooksPage({ categoryId, onBack }: CategoryBooksPageProps) {
  const { categories, books, selectBook } = useApp();
  const [query, setQuery] = useState('');

  const category = categories.find((c) => c.id === categoryId);
  const categoryBooks = useMemo(
    () => books.filter((b) => b.categoryId === categoryId),
    [books, categoryId],
  );
  const shownBooks = useMemo(() => filterCategoryBooks(categoryBooks, query), [categoryBooks, query]);

  // 封面等比放大后，占位封面里的字号也得跟着放大，否则标题在宽封面上会缩成一小坨。
  const gridRef = useRef<HTMLDivElement>(null);
  const [artScale, setArtScale] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (!width) return;
      const cell =
        (width - GRID_PADDING * 2 - GRID_GAP * (CATEGORY_GRID_COLUMNS - 1)) / CATEGORY_GRID_COLUMNS;
      setArtScale(cell / SHELF_COVER_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [categoryId]);

  // 列表滚起来之后标题底下那道渐隐遮罩才出现（iOS 的 scroll edge effect）
  const [scrolled, setScrolled] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .cat-books-cell {
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cat-books-cell:active { transform: scale(0.96); }
      `}</style>

      {/* Top navigation bar */}
      <div
        style={{
          paddingTop: 'clamp(30px, env(safe-area-inset-top), 35px)',
          paddingLeft: 14,
          paddingRight: 18,
          paddingBottom: 2,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <button
          onClick={onBack}
          aria-label="返回书架"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: '#7a6a50',
            padding: '4px 0',
            zIndex: 1,
          }}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }}>
            书架
          </span>
        </button>
        <span
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: 15,
            fontWeight: 'bold',
            color: 'var(--color-text)',
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: '45%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {category?.name ?? '分类'}
        </span>
      </div>

      {/* In-category search */}
      <div style={{ flexShrink: 0, padding: '12px 18px 12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.55)',
            borderRadius: 10,
            padding: '8px 12px',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Search size={14} color="#9a8a6a" strokeWidth={2} />
          <input
            type="text"
            placeholder="搜索书名或作者…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: 13,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
              color: 'var(--color-text)',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="清空搜索"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', lineHeight: 1 }}
            >
              <X size={14} color="#9a8a6a" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Cover grid */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          onScroll={(e) => {
            const next = e.currentTarget.scrollTop > 4;
            setScrolled((prev) => (prev === next ? prev : next));
          }}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            paddingBottom: 48,
          }}
        >
          {shownBooks.length > 0 ? (
            <div
              ref={gridRef}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${CATEGORY_GRID_COLUMNS}, 1fr)`,
                gap: `22px ${GRID_GAP}px`,
                padding: `2px ${GRID_PADDING}px 0`,
              }}
            >
              {shownBooks.map((book) => (
                <button
                  key={book.id}
                  className="cat-books-cell"
                  onClick={() => selectBook(book)}
                  aria-label={`打开《${book.title}》的摘录`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 7,
                    width: '100%',
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                  }}
                >
                  <BookCoverSurface
                    book={book}
                    artScale={artScale}
                    style={{
                      width: '100%',
                      aspectRatio: `${SHELF_COVER_WIDTH} / ${SHELF_COVER_HEIGHT}`,
                      borderRadius: '3px 4px 4px 3px',
                      boxShadow: '2px 4px 12px rgba(0,0,0,0.22), 1px 0 0 rgba(0,0,0,0.12) inset',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.3,
                      color: 'var(--color-text)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {book.title}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 10,
                      letterSpacing: 0.2,
                      color: 'var(--color-text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {book.author}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: '88px 32px',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 10, lineHeight: 1 }}>📖</div>
              {query ? (
                <>没有找到和「{query}」有关的书</>
              ) : (
                <>这个分类下还没有书</>
              )}
            </div>
          )}
        </div>

        {/* Scroll edge fade — 只在列表滚起来之后出现 */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 16,
            pointerEvents: 'none',
            opacity: scrolled ? 1 : 0,
            transition: 'opacity 0.2s ease',
            background: 'linear-gradient(to bottom, var(--color-bg), transparent)',
          }}
        />
      </div>
    </div>
  );
}

export default CategoryBooksPage;
