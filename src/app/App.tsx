import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Transition } from 'motion/react';
import SearchBar from './components/SearchBar';
import SearchResults from './components/SearchResults';
import AddBookSheet from './components/sheets/AddBookSheet';
import LibraryBuilding from './components/LibraryBuilding';
import BookCoverSurface from './components/BookCoverSurface';
import { useOpenTimerSheet } from './components/timer/ReadingTimerProvider';
import { useOpenMailbox } from './mailbox/MailboxProvider';
import ReadingTimerBar from './components/timer/ReadingTimerBar';
import { usePrefetchOnIdle } from './hooks/usePrefetchOnIdle';
import {
  SHELF_COVER_HEIGHT,
  SHELF_COVER_STRIDE,
  SHELF_COVER_WIDTH,
  SHELF_SIDE_PADDING,
  isInsideHorizontalScroller,
  measureShelfSnapOffsets,
  pickShelfScrollTarget,
  shelfTrailingSlack,
} from './shelfScroll';

import { useApp } from './store';
import { seedDemianBook } from './db';
import type { Book } from './types';
import type { SearchResult } from './db';
import { Settings2, ChevronLeft, ChevronRight } from 'lucide-react';

// 书详情页和设置页都只有用户点了才看得到，静态引入会让首页白背它们的代码。
// 改成按需加载，首页空闲时再预取（见 ShelfView 里的 usePrefetchOnIdle）。
const loadBookDetail = () =>
  import('./components/BookDetailPage').then((m) => ({ default: m.BookDetailPage }));
const loadSettings = () => import('./components/SettingsPage');
const loadCategoryBooks = () =>
  import('./components/CategoryBooksPage').then((m) => ({ default: m.CategoryBooksPage }));
const BookDetailPage = lazy(loadBookDetail);
const SettingsPage = lazy(loadSettings);
const CategoryBooksPage = lazy(loadCategoryBooks);
const prefetchPages = () => Promise.all([loadBookDetail(), loadSettings(), loadCategoryBooks()]);

const COVER_W = SHELF_COVER_WIDTH;
const COVER_H = SHELF_COVER_HEIGHT;
// 分类头那个计数胶囊的触点尺寸（视觉只有 9px 字，靠它撑出可点范围）。
// 用 minWidth/minHeight 写死，而不是靠 padding 凑：以后改文案或字号，
// 命中区域不会跟着缩水。
const PILL_HIT_WIDTH = 88;
const PILL_HIT_HEIGHT = 33;
// 长按激活拖拽前的容差：超过这个位移就认为用户在滑书，不进入拖拽
const DRAG_HOLD_SLOP = 8;
// 长按时长，以及到点后的复核窗口
const DRAG_HOLD_MS = 300;
const DRAG_HOLD_CONFIRM_MS = 120;
const APP_BASE_URL = import.meta.env.BASE_URL;
// ─── Book cover — adapted from original, uses real data ──────────────────────
function BookCover({ book, onSelect, dragActive }: { book: Book; onSelect: (b: Book) => void; dragActive?: boolean }) {
  const sharedStyle: React.CSSProperties = {
    width: COVER_W,
    height: COVER_H,
    borderRadius: '3px 4px 4px 3px',
    flexShrink: 0,
    boxShadow: '3px 4px 12px rgba(0,0,0,0.28), 1px 0 0 rgba(0,0,0,0.15) inset',
    cursor: dragActive ? 'grabbing' : 'pointer',
    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTouchCallout: 'none',
  };

  const handleClick = () => {
    if (dragActive) return;
    onSelect(book);
  };
  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px) scale(1.04)';
    (e.currentTarget as HTMLElement).style.boxShadow = '4px 12px 24px rgba(0,0,0,0.3)';
  };
  const handleMouseLeaveCancel = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.transform = '';
    (e.currentTarget as HTMLElement).style.boxShadow = sharedStyle.boxShadow as string;
  };

  return (
    <BookCoverSurface
      book={book}
      style={sharedStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeaveCancel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// ─── Decorative pattern header ────────────────────────────────────────────────
function PatternHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const openTimer = useOpenTimerSheet();
  const openMailbox = useOpenMailbox();

  return (
    <div style={{ padding: '0 20px', position: 'relative' }}>
      {/* Settings gear */}
      <button
        onClick={onOpenSettings}
        aria-label="设置与统计"
        title="设置与统计"
        style={{
          position: 'absolute',
          right: 14,
          top: 12,
          zIndex: 5,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-light)',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
        }}
      >
        <Settings2 size={16} strokeWidth={1.7} />
      </button>

      {/* Decorative pattern area */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0 2px',
        }}
      >
        {/* Library building illustration */}
        <LibraryBuilding onClockClick={openTimer} onMailboxClick={openMailbox} />

        {/* Tagline */}
        <p
          style={{
            margin: '2px 0 0',
            fontFamily: '"SnellRoundhand", "Snell Roundhand", "SnellRoundhand-Regular", cursive',
            fontSize: 18,
            color: 'var(--color-text-accent)',
            textAlign: 'center',
            lineHeight: 1.3,
            letterSpacing: 0.5,
            opacity: 0.7,
          }}
        >
          A book holds a house of gold
        </p>
      </div>
    </div>
  );
}

// ─── Shelf row (horizontal scroll with 3.5 books visible) ──────────────────────
function ShelfRow({
  name,
  books,
  bookCount,
  onSelect,
  onOpenCategory,
  onMoveBook,
  onCatDragPointerDown,
  isCatDragged,
}: {
  name: string;
  books: Book[];
  bookCount: number;
  onSelect: (b: Book) => void;
  onOpenCategory?: () => void;
  onMoveBook: (bookId: string, targetIndex: number) => void;
  onCatDragPointerDown?: (e: React.PointerEvent) => void;
  isCatDragged?: boolean;
}) {
  if (books.length === 0) return null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // 右侧补白，保证滚动末端也落在吸附位上（否则滑到底时左边会空出一截）
  const [trailingSlack, setTrailingSlack] = useState(0);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [books.length, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      // 内容自然宽度：每本书一个步长，最后一本后面没有书脊
      const naturalWidth = SHELF_COVER_STRIDE * books.length - SHELF_SIDE_PADDING;
      setTrailingSlack(shelfTrailingSlack(naturalWidth, el.clientWidth));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [books.length]);

  // 箭头翻一屏：先按可视宽度走，再吸附到最近的合法位置（封面左缘对齐内容左边距），
  // 并夹在 [0, maxScroll] 内。固定步长会在书数不是 3 的整数倍时停在半路，
  // 看起来就是"第一个格子空了"。
  const scrollBy = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const target = pickShelfScrollTarget({
      current: el.scrollLeft,
      direction,
      viewport: el.clientWidth,
      snapOffsets: measureShelfSnapOffsets(el),
      maxScroll,
    });
    el.scrollTo({ left: target, behavior: 'smooth' });
  };

  // ─── Drag-and-drop state and handlers ───────────────────────────────────
  const [dragState, setDragState] = useState<{
    index: number;
    targetIndex: number;
    startX: number;
  } | null>(null);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const holdTimerRef = useRef<number | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  // grabX = 手指按下的位置；startX = 拖拽真正"拿起"的位置（换位距离从它算起）
  const dragTracking = useRef<{
    grabX: number;
    startX: number;
    lastX: number;
    index: number;
    book: Book;
    /** 按下时书架的滚动位置：若长按期间书架已经滚动，说明这是滑书不是拖动 */
    scrollLeftAtGrab: number;
  } | null>(null);

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  };

  const displayBooks = useMemo(() => {
    if (!dragState) return books;
    const copy = [...books];
    const [item] = copy.splice(dragState.index, 1);
    copy.splice(dragState.targetIndex, 0, item);
    return copy;
  }, [books, dragState]);

  // ─── Drag processing helpers (used in both touch and mouse handlers) ────
  const processDragMove = (clientX: number) => {
    const state = dragStateRef.current;
    if (!state) return;
    const delta = clientX - state.startX;
    const threshold = SHELF_COVER_STRIDE;
    const idxShift = Math.round(delta / threshold);
    const targetIdx = Math.max(0, Math.min(books.length - 1, state.index + idxShift));
    if (targetIdx !== state.targetIndex) {
      setDragState((prev) => (prev ? { ...prev, targetIndex: targetIdx } : null));
    }
  };

  const commitDrag = () => {
    const state = dragStateRef.current;
    const tracked = dragTracking.current;
    if (state && state.targetIndex !== state.index && tracked) {
      onMoveBook(tracked.book.id, state.targetIndex);
    }
    setDragState(null);
    dragTracking.current = null;
    clearHold();
  };

  /**
   * 手指/鼠标移动的统一入口。
   *
   * 长按到点之前只要横向位移超过容差，就认定用户在滑书，取消这次长按 ——
   * 否则松手会静默换位（书架顺序被改掉，看起来就像"第一个位置空了"）。
   */
  const handlePointerMove = (clientX: number) => {
    if (dragStateRef.current) {
      processDragMove(clientX);
      return;
    }
    const tracked = dragTracking.current;
    if (!tracked) return;
    tracked.lastX = clientX;
    // 横向位移超过容差、或书架已经滚动 → 用户在滑书，取消这次长按
    const scrolled = Math.abs((scrollRef.current?.scrollLeft ?? 0) - tracked.scrollLeftAtGrab) > 2;
    if (Math.abs(clientX - tracked.grabX) > DRAG_HOLD_SLOP || scrolled) {
      dragTracking.current = null;
      clearHold();
    }
  };

  // Window mousemove/mouseup for desktop (mouse may leave the element during drag)
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragStateRef.current) e.preventDefault();
      handlePointerMove(e.clientX);
    };
    const handleUp = () => { commitDrag(); };
    window.addEventListener('mousemove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onMoveBook, books.length]);

  // Start drag hold (called from touch and mouse start on wrapper)
  const startDragHold = (clientX: number, book: Book, idx: number) => {
    dragTracking.current = {
      grabX: clientX,
      startX: clientX,
      lastX: clientX,
      index: idx,
      book,
      scrollLeftAtGrab: scrollRef.current?.scrollLeft ?? 0,
    };
    // 长按到点后不立刻拿起，留一个确认窗口：真机上 touchmove 可能比计时器晚到，
    // 这一小段时间足够把"其实在滑书"的手势拦下来。
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!dragTracking.current) return;
      confirmTimerRef.current = window.setTimeout(() => {
        confirmTimerRef.current = null;
        const tracked = dragTracking.current;
        if (!tracked) return;
        setDragState({ index: tracked.index, targetIndex: tracked.index, startX: tracked.lastX });
        // 触觉反馈（移动端，静默失败）
        if (typeof navigator.vibrate === 'function') {
          navigator.vibrate(10);
        }
      }, DRAG_HOLD_CONFIRM_MS);
    }, DRAG_HOLD_MS);
  };

  return (
    <div>
      {/* Category header */}
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

      {/* Scrollable shelf with arrow indicators */}
      <div style={{ position: 'relative' }}>
        {/* Inject scrollbar-hide CSS */}
        <style>{`.shelf-scroll-${bookCount}-${name.replace(/\s+/g, '')}::-webkit-scrollbar { display: none; }`}</style>

        {/* Left arrow indicator */}
        {canScrollLeft && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 34,
              background: 'linear-gradient(to right, rgba(246,240,231,0.9), transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              zIndex: 2,
              pointerEvents: 'none',
              paddingLeft: 4,
            }}
          >
            <button
              onClick={() => scrollBy(-1)}
              style={{
                background: 'rgba(255,255,255,0.75)',
                border: 'none',
                borderRadius: '50%',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                pointerEvents: 'auto',
                padding: 0,
                lineHeight: 1,
                transition: 'background 0.15s',
              }}
            >
              <ChevronLeft size={15} color="#8a7a60" strokeWidth={2} />
            </button>
          </div>
        )}

        {/* Books container */}
        <div
          ref={scrollRef}
          className={`shelf-scroll-${bookCount}-${name.replace(/\s+/g, '')}`}
          style={{
            display: 'flex',
            gap: 6,
            paddingLeft: SHELF_SIDE_PADDING,
            paddingRight: SHELF_SIDE_PADDING + trailingSlack,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory', scrollPaddingLeft: SHELF_SIDE_PADDING,
            position: 'relative',
          }}
        >
          {displayBooks.map((book, idx) => {
            const origIdx = books.findIndex((b) => b.id === book.id);
            const isDragged = dragState !== null && origIdx === dragState.index;
            return (
              <React.Fragment key={book.id}>
                {/* Book cover wrapper with drag support */}
                <div
                  data-shelf-cover=""
                  style={{
                    scrollSnapAlign: 'start',
                    flexShrink: 0,
                    opacity: isDragged ? 0.65 : 1,
                    transform: isDragged ? 'scale(1.08) translateY(-4px)' : undefined,
                    zIndex: isDragged ? 10 : 1,
                    transition: 'opacity 0.15s ease, transform 0.15s ease',
                    cursor: isDragged ? 'grabbing' : 'grab',
                    WebkitTouchCallout: 'none',
                  }}
                  onTouchStart={(e) => startDragHold(e.touches[0].clientX, book, origIdx)}
                  onTouchMove={(e) => {
                    // In drag mode: process the drag and prevent scroll
                    if (dragStateRef.current) e.preventDefault();
                    handlePointerMove(e.touches[0].clientX);
                  }}
                  onTouchEnd={() => { commitDrag(); }}
                  onTouchCancel={() => { commitDrag(); }}
                  onMouseDown={(e) => { if (e.button === 0) startDragHold(e.clientX, book, origIdx); }}
                >
                  <BookCover book={book} onSelect={onSelect} dragActive={isDragged} />
                </div>

                {/* Spine placeholders between covers */}
                {idx < displayBooks.length - 1 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-end',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{ width: 14, height: 95, borderRadius: '1px 1px 0 0', background: '#D0C8B8', opacity: 0.7, flexShrink: 0 }} />
                    <div style={{ width: 11, height: 111, borderRadius: '1px 1px 0 0', background: '#D0C8B8', opacity: 0.7, flexShrink: 0 }} />
                    <div style={{ width: 9, height: 85, borderRadius: '1px 1px 0 0', background: '#D0C8B8', opacity: 0.7, flexShrink: 0, transform: 'rotate(-4.8deg)', transformOrigin: 'bottom center', marginLeft: 4 }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Right arrow indicator */}
        {canScrollRight && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 34,
              background: 'linear-gradient(to left, rgba(246,240,231,0.9), transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              zIndex: 2,
              pointerEvents: 'none',
              paddingRight: 4,
            }}
          >
            <button
              onClick={() => scrollBy(1)}
              style={{
                background: 'rgba(255,255,255,0.75)',
                border: 'none',
                borderRadius: '50%',
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                pointerEvents: 'auto',
                padding: 0,
                lineHeight: 1,
                transition: 'background 0.15s',
              }}
            >
              <ChevronRight size={15} color="#8a7a60" strokeWidth={2} />
            </button>
          </div>
        )}
      </div>

      {/* Shelf surface */}
      <div style={{ margin: '4px 18px 0', height: 9, borderRadius: 4, background: 'linear-gradient(to bottom, rgba(234, 225, 202, 0.95) 6%, #BBAC8E 47%, #958A74 81%)', boxShadow: '0px 4px 6px 0px rgba(0, 0, 0, 0.2)' }} />
    </div>
  );
}

// ─── Long-press context menu ──────────────────────────────────────────────────

// ─── Shelf view (bookshelf page) ──────────────────────────────────────────────
function ShelfView({ onOpenCategory }: { onOpenCategory: (categoryId: string) => void }) {
  const { categories, books, initialLoading, selectBook, isSearching, selectBook: selectBookFromSearch, moveBookTo, moveCategoryTo, setTargetQuoteId } = useApp();
  const [showAddBook, setShowAddBook] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  usePrefetchOnIdle(prefetchPages);

  // ─── Category drag-and-drop ────────────────────────────────────────────
  const [catDragState, setCatDragState] = useState<{
    index: number;
    targetIndex: number;
    startY: number;
  } | null>(null);

  const handleCatDragStart = (e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return;
    setCatDragState({ index: idx, targetIndex: idx, startY: e.clientY });
  };

  // Window-level move/up/cancel listeners while dragging a category
  useEffect(() => {
    if (!catDragState) return;

    const handleMove = (e: PointerEvent) => {
      setCatDragState((prev) => {
        if (!prev) return null;
        const CAT_SLOT_HEIGHT = 190;
        const shift = Math.round((e.clientY - prev.startY) / CAT_SLOT_HEIGHT);
        const targetIdx = Math.max(0, Math.min(categories.length - 1, prev.index + shift));
        return targetIdx !== prev.targetIndex ? { ...prev, targetIndex: targetIdx } : prev;
      });
    };

    const handleEnd = () => {
      setCatDragState((prev) => {
        if (prev && prev.targetIndex !== prev.index) {
          const cat = categories[prev.index];
          if (cat) moveCategoryTo(cat.id, prev.targetIndex);
        }
        return null;
      });
    };

    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [catDragState, categories, moveCategoryTo]);

  const displayCats = useMemo(() => {
    if (!catDragState) return categories;
    const copy = [...categories];
    const [item] = copy.splice(catDragState.index, 1);
    copy.splice(catDragState.targetIndex, 0, item);
    return copy;
  }, [categories, catDragState]);

  // Auto-seed via URL param: ?seed=demian
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('seed') === 'demian') {
      (async () => {
        try {
          setSeedMsg('⏳ 正在导入《德米安》…');
          const result = await seedDemianBook();
          if (result === 'success') {
            setSeedMsg('✅ 《德米安》导入完成！页面即将刷新…');
            setTimeout(() => { window.location.href = APP_BASE_URL; }, 1200);
          } else if (result === 'exists') {
            setSeedMsg('ℹ️ 《德米安》已存在');
            setTimeout(() => { window.location.href = APP_BASE_URL; }, 1000);
          } else {
            setSeedMsg('❌ 导入失败：' + result);
          }
        } catch (e: any) {
          setSeedMsg('❌ 导入出错：' + (e?.message || e));
        }
        window.history.replaceState({}, '', window.location.pathname);
      })();
    }
  }, []);

  // For search result navigation
  const handleSearchResultSelect = async (result: SearchResult) => {
    const book = books.find((b) => b.id === result.quote.bookId);
    if (book) {
      selectBookFromSearch(book);
      // 延迟设置 targetQuoteId，等 BookDetailPage 挂载后再滚动
      setTimeout(() => {
        setTargetQuoteId(result.quote.id);
      }, 300);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Scrollable shelf content */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          paddingBottom: 130,
        } as React.CSSProperties}
      >
        {/* Search bar */}
        <SearchBar />

        {/* Background reading-timer status (centered, below search) */}
        <ReadingTimerBar />

        {/* Seed status message */}
        {seedMsg && (
          <div
            style={{
              margin: '8px 18px 0',
              padding: '10px 14px',
              borderRadius: 10,
              background: seedMsg.includes('✅') ? 'var(--color-success-bg)' : seedMsg.includes('❌') ? '#ffe8e0' : '#fff8e0',
              color: seedMsg.includes('✅') ? 'var(--color-success-text)' : seedMsg.includes('❌') ? '#a04030' : '#8a7a40',
              fontSize: 12,
              fontFamily: '-apple-system, sans-serif',
              textAlign: 'center',
              fontWeight: 500,
            }}
          >
            {seedMsg}
          </div>
        )}

        {/* Initial loading skeleton */}
        {initialLoading ? (
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Skeleton header */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0' }}>
              <div style={{ width: 240, height: 36, borderRadius: 6, background: 'linear-gradient(90deg, #ece4d8 25%, #f5efe4 50%, #ece4d8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
              <div style={{ width: 140, height: 14, borderRadius: 4, marginTop: 10, background: 'linear-gradient(90deg, #ece4d8 25%, #f5efe4 50%, #ece4d8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
            </div>
            {/* Skeleton shelf rows */}
            {[1, 2, 3].map((row) => (
              <div key={row}>
                <div style={{ width: 80, height: 11, borderRadius: 4, marginBottom: 10, background: 'linear-gradient(90deg, #ece4d8 25%, #f5efe4 50%, #ece4d8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4].map((b) => (
                    <div key={b} style={{ width: COVER_W, height: COVER_H, borderRadius: 4, flexShrink: 0, background: 'linear-gradient(90deg, #ece4d8 25%, #f5efe4 50%, #ece4d8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
                  ))}
                </div>
              </div>
            ))}
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
          </div>
        ) : isSearching ? (
          <SearchResults onSelectResult={handleSearchResultSelect} />
        ) : (
          <>
            <PatternHeader onOpenSettings={() => setShowSettings(true)} />

            {/* Decorative divider */}
            <div
              style={{
                margin: '4px 20px 12px',
                height: 1,
                background: 'linear-gradient(90deg, transparent 0%, #d4c4a0 30%, #d4c4a0 70%, transparent 100%)',
                opacity: 0.5,
              }}
            />

            {displayCats.map((cat) => {
              const catBooks = books.filter((b) => b.categoryId === cat.id);
              const origIdx = categories.findIndex((c) => c.id === cat.id);
              const isCatDragged = catDragState !== null && origIdx === catDragState.index;
              return (
                <div
                  key={cat.id}
                  style={{
                    opacity: isCatDragged ? 0.6 : 1,
                    transform: isCatDragged ? 'scale(0.98)' : undefined,
                    transition: 'opacity 0.15s ease, transform 0.15s ease',
                  }}
                >
                  <ShelfRow
                    name={cat.name}
                    books={catBooks}
                    bookCount={catBooks.length}
                    onSelect={selectBook}
                    onOpenCategory={() => onOpenCategory(cat.id)}
                    onMoveBook={moveBookTo}
                    onCatDragPointerDown={(e) => handleCatDragStart(e, origIdx)}
                    isCatDragged={isCatDragged}
                  />
                </div>
              );
            })}

            {/* Empty state */}
            {books.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 20px',
                  margin: '10px 0',
                  color: 'var(--color-text-muted)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    padding: '28px 32px',
                    borderRadius: 14,
                    background: 'var(--color-bg-card)',
                    boxShadow: 'var(--shadow-card)',
                    border: '1px solid var(--color-border-light)',
                  }}
                >
                  <div style={{ fontSize: 36, marginBottom: 10, lineHeight: 1 }}>📚</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    书架还是空的
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                    点击下方按钮添加你的第一本书吧
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Floating Add Books button (hidden while searching) */}
      {!isSearching && (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <button
            onClick={() => setShowAddBook(true)}
            className="glass-cta"
            style={{
              background: 'rgba(44, 34, 22, 0.55)',
              backdropFilter: 'blur(20px) saturate(160%)',
              WebkitBackdropFilter: 'blur(20px) saturate(160%)',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'var(--color-btn-text)',
              borderRadius: 20,
              paddingTop: 14,
              paddingBottom: 14,
              width: 128, textAlign: 'center',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
              letterSpacing: 0.5,
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px rgba(28,22,12,0.18)',
            }}
          >
            Add Books
          </button>
        </div>
      )}

      {/* Sheets */}
      <AddBookSheet open={showAddBook} onClose={() => setShowAddBook(false)} />

      {/* Settings page overlay */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            key="settings-page"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'var(--color-bg)' }}
          >
            <Suspense fallback={null}>
              <SettingsPage onBack={() => setShowSettings(false)} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
// 页面推入/推出的动效参数。
//
// 试过两版都不对：
// - 默认弹簧从静止起步，位移曲线是二次的，前 50ms 只走 3%，像"点了没反应"；
// - 换成缓动曲线 cubic-bezier(0.32, 0.72, 0, 1) 又反过来，它起步斜率 2.25 倍速，
//   前 100ms 就冲掉 74%，后 260ms 在那磨最后一点距离 —— 窜进来再爬，很生硬。
//
// 现在用弹簧直接调：ζ≈0.92（几乎临界阻尼，只压住不回弹），ω≈14.1。位移剖面大致是
// 16ms 2%、50ms 14%、100ms 41%、200ms 77%、300ms 93%、400ms 98%——
// 起步就有位移、中段不窜、后段拖着长尾巴收，全程没有一个"急停"的拐点。
const PAGE_SPRING: Transition = { type: 'spring', stiffness: 200, damping: 26, mass: 1 };
const PAGE_FADE: Transition = { duration: 0.2, ease: 'easeOut' };
// 被压在下面的那层往左退多少、压多深的暗色。Stacked 页面逐层后退+压暗，
// 层级关系才立得住，也不会出现"上面那层从一片空背景上滑进来"的割裂感。
const PAGE_PUSH_BACK = '-24%';
const PAGE_SCRIM = 'rgba(28, 22, 12, 0.18)';
// 推入页左缘的投影。页在位上时完全被自己盖住（看不见），只有滑动过程中才露出来，
// 用来把"新页面压在上层"这件事画实。
const PAGE_EDGE_SHADOW = '-12px 0 30px rgba(28, 22, 12, 0.22)';

export default function App() {
  const { selectedBook, selectBook } = useApp();
  // 打开的是「分类全部书籍」页；存 id 而不是名字，分类改名后标题跟着变
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  // 关掉动效的用户只做淡入淡出，不做整屏滑动
  const reduceMotion = useReducedMotion() ?? false;

  // Prevent accidental iOS swipe-back: only allow from left 20px edge
  useEffect(() => {
    let touchStartX = 0;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };

    const onTouchMove = (e: TouchEvent) => {
      const currentX = e.touches[0].clientX;
      const deltaX = currentX - touchStartX;
      // Block rightward swipe (back gesture) only when touch started outside left 20px.
      // 横向可滚动区域（书架）例外：它本来就靠左右拖动翻书，拦住就回不去了。
      if (touchStartX > 20 && deltaX > 5 && !isInsideHorizontalScroller(e.target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);


  const categoryOpen = openCategoryId !== null;
  const detailOpen = selectedBook !== null;

  // 推入：从右边进来；退出：原路返回右边（进出同一条路径）。
  const enter = reduceMotion ? { opacity: 0 } : { x: '100%' };
  const settled = reduceMotion ? { opacity: 1 } : { x: 0 };
  const leave = reduceMotion ? { opacity: 0 } : { x: '100%' };
  // 被盖住的那层：往左退一截。没被盖住就回到原位。
  const pushBack = (covered: boolean) =>
    reduceMotion ? { opacity: covered ? 0.55 : 1 } : { x: covered ? PAGE_PUSH_BACK : 0 };
  const transition = reduceMotion ? PAGE_FADE : PAGE_SPRING;

  /** 压在被盖住那层上的暗色，让"退到后面"读得出来 */
  const scrim = (covered: boolean) => (
    <motion.div
      aria-hidden
      initial={false}
      animate={{ opacity: covered ? 1 : 0 }}
      transition={transition}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        background: PAGE_SCRIM,
        pointerEvents: 'none',
      }}
    />
  );

  return (
    <div
      style={{
        height: '100dvh',
        width: '100%',
        background: 'var(--color-bg)',
        position: 'relative',
        overflow: 'hidden',
        margin: '0 auto',
      }}
    >
      {/* 书架常驻不卸载：它只"退到后面"而不消失。这样从分类页/详情页返回时
          滚动位置还在，而且推入过程中下面那层是有内容的——不再是先退干净、
          再让新页面从空背景上滑进来那种断成两拍的观感。 */}
      <motion.div
        data-page-layer="shelf"
        animate={pushBack(categoryOpen)}
        transition={transition}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: categoryOpen ? 'none' : 'auto',
        }}
        aria-hidden={categoryOpen || undefined}
      >
        <ShelfView onOpenCategory={setOpenCategoryId} />
        {scrim(categoryOpen)}
      </motion.div>

      <AnimatePresence>
        {openCategoryId && (
          <motion.div
            key={`category-${openCategoryId}`}
            data-page-layer="category"
            initial={enter}
            animate={pushBack(detailOpen)}
            exit={leave}
            transition={transition}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-bg)',
              boxShadow: PAGE_EDGE_SHADOW,
              pointerEvents: detailOpen ? 'none' : 'auto',
            }}
            aria-hidden={detailOpen || undefined}
          >
            <Suspense fallback={null}>
              <CategoryBooksPage categoryId={openCategoryId} onBack={() => setOpenCategoryId(null)} />
            </Suspense>
            {scrim(detailOpen)}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedBook && (
          <motion.div
            key={`detail-${selectedBook.id}`}
            data-page-layer="detail"
            initial={enter}
            animate={settled}
            exit={leave}
            transition={transition}
            style={{ position: 'absolute', inset: 0, background: 'var(--color-bg)', boxShadow: PAGE_EDGE_SHADOW }}
          >
            <Suspense fallback={null}>
              <BookDetailPage key={selectedBook.id} book={selectedBook} onBack={() => selectBook(null)} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
