import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookDetailPage } from './components/BookDetailPage';
import SearchBar from './components/SearchBar';
import SearchResults from './components/SearchResults';
import AddBookSheet from './components/sheets/AddBookSheet';
import CategoryManager from './components/sheets/CategoryManager';
import LibraryBuilding from './components/LibraryBuilding';
import StatsPage from './components/StatsPage';
import { useApp } from './store';
import { seedDemianBook } from './db';
import type { Book } from './types';
import type { SearchResult } from './db';
import { Settings, ChevronLeft, ChevronRight, BarChart3 } from 'lucide-react';
import { warmup } from './ocr';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(r + 28, 255)},${Math.min(g + 28, 255)},${Math.min(b + 28, 255)})`;
}

const COVER_W = 96;
const COVER_H = 148;
const CATEGORY_DISPLAY_MAP: Record<string, string> = {
  '文学': 'Literature', '社会学': 'Sociology', '哲学': 'Philosophy', '小说': 'Fiction',
};

// ─── Book cover — adapted from original, uses real data ──────────────────────
function BookCover({ book, onSelect, onLongPress }: { book: Book; onSelect: (b: Book) => void; onLongPress: (b: Book) => void }) {
  const sharedStyle: React.CSSProperties = {
    width: COVER_W,
    height: COVER_H,
    borderRadius: '3px 4px 4px 3px',
    flexShrink: 0,
    boxShadow: '3px 4px 12px rgba(0,0,0,0.28), 1px 0 0 rgba(0,0,0,0.15) inset',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  // ── Long press detection ──────────────────────────────────────────────
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const startLongPress = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress(book);
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    onSelect(book);
  };
  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px) scale(1.03)';
    (e.currentTarget as HTMLElement).style.boxShadow = '4px 8px 20px rgba(0,0,0,0.35)';
  };
  const handleMouseLeaveCancel = (e: React.MouseEvent<HTMLElement>) => {
    (e.currentTarget as HTMLElement).style.transform = '';
    (e.currentTarget as HTMLElement).style.boxShadow = sharedStyle.boxShadow as string;
    cancelLongPress();
  };

  // Has cover image
  if (book.coverType && book.coverData) {
    return (
      <div
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeaveCancel}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onContextMenu={(e) => { e.preventDefault(); onLongPress(book); }}
        style={{ ...sharedStyle, overflow: 'hidden' }}
      >
        <img
          src={book.coverData}
          alt={book.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  // No cover: generate styled placeholder with book title
  const bgColors = ['#4a3528', '#2e3d35', '#3a2e4a', '#28384a', '#2c3a4a', '#4a3828', '#3a2c48', '#2a4038', '#4a2e2e', '#2e3a4a'];
  const colorIdx = book.title.length % bgColors.length;
  const bg = bgColors[colorIdx];

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeaveCancel}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onContextMenu={(e) => { e.preventDefault(); onLongPress(book); }}
      style={{
        ...sharedStyle,
        background: `linear-gradient(160deg, ${lighten(bg)} 0%, ${bg} 60%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 5px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 4,
          border: '1px solid rgba(200,151,42,0.55)',
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
              top: top === '0' ? 6 : undefined,
              bottom: bottom === '0' ? 6 : undefined,
              left: i < 2 ? 6 : undefined,
              right: i >= 2 ? 6 : undefined,
              width: 5,
              height: 5,
              borderTop: top === '0' ? '1px solid rgba(200,151,42,0.5)' : undefined,
              borderBottom: bottom === '0' ? '1px solid rgba(200,151,42,0.5)' : undefined,
              borderLeft: i < 2 ? '1px solid rgba(200,151,42,0.5)' : undefined,
              borderRight: i >= 2 ? '1px solid rgba(200,151,42,0.5)' : undefined,
            }}
          />
        );
      })}
      <p
        style={{
          color: '#d4a840',
          fontSize: 7,
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
        style={{ width: 22, height: 1, background: 'rgba(200,151,42,0.45)', margin: '4px 0', zIndex: 1 }}
      />
      <p
        style={{
          color: 'rgba(200,151,42,0.6)',
          fontSize: 6,
          fontFamily: 'Georgia, "Times New Roman", serif',
          textAlign: 'center',
          margin: 0,
          zIndex: 1,
          letterSpacing: 0.2,
        }}
      >
        {book.author.length > 10 ? book.author.slice(0, 9) + '…' : book.author}
      </p>
    </div>
  );
}

// ─── Decorative pattern header ────────────────────────────────────────────────
function PatternHeader({ onManageCategories, onOpenStats }: { onManageCategories: () => void; onOpenStats: () => void }) {
  return (
    <div style={{ padding: '6px 20px 0', position: 'relative' }}>
      {/* Statistics button */}
      <button
        onClick={onOpenStats}
        style={{
          position: 'absolute',
          right: 52,
          top: 14,
          zIndex: 5,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
          display: 'flex',
          opacity: 0.45,
        }}
      >
        <BarChart3 size={15} color="#2c2416" strokeWidth={1.8} />
      </button>
      {/* Settings gear */}
      <button
        onClick={onManageCategories}
        style={{
          position: 'absolute',
          right: 26,
          top: 14,
          zIndex: 5,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 4,
          lineHeight: 1,
          display: 'flex',
          opacity: 0.45,
        }}
      >
        <Settings size={15} color="#2c2416" strokeWidth={1.8} />
      </button>

      {/* Decorative pattern area */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '18px 0 4px',
        }}
      >
        {/* Subtle dot pattern overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.04,
            backgroundImage: `
              radial-gradient(circle at 20% 50%, #d4a830 1px, transparent 1px),
              radial-gradient(circle at 60% 30%, #d4a830 1px, transparent 1px),
              radial-gradient(circle at 80% 70%, #d4a830 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px, 90px 90px, 70px 70px',
          }}
        />

        {/* Library building illustration */}
        <LibraryBuilding />

        {/* Tagline */}
        <p
          style={{
            margin: '6px 0 0',
            fontFamily: '"SnellRoundhand", "Snell Roundhand", "SnellRoundhand-Regular", cursive',
            fontSize: 20,
            color: '#b8a87a',
            textAlign: 'center',
            lineHeight: 1.3,
            letterSpacing: 0.5,
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
  onLongPress,
}: {
  name: string;
  books: Book[];
  bookCount: number;
  onSelect: (b: Book) => void;
  onLongPress: (b: Book) => void;
}) {
  if (books.length === 0) return null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
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

  const scrollBy = (direction: number) => {
    scrollRef.current?.scrollBy({
      left: direction * (COVER_W + 10) * 3,
      behavior: 'smooth',
    });
  };

  const displayName = CATEGORY_DISPLAY_MAP[name] || name;

  return (
    <div>
      {/* Category header */}
      <div style={{ paddingLeft: 18, paddingTop: 12, paddingBottom: 6, paddingRight: 18 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: 2,
            color: '#9a8a6a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          {displayName}
        </span>
        <span
          style={{
            float: 'right',
            fontSize: 9,
            color: '#b8ae9a',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            marginTop: 2,
          }}
        >
          {bookCount} books
        </span>
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
            gap: 10,
            paddingLeft: 18,
            paddingRight: 18,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory',
            position: 'relative',
          }}
        >
          {books.map((book, index) => (
            <React.Fragment key={book.id}>
              {/* Book cover — snap point */}
              <div style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
                <BookCover book={book} onSelect={onSelect} onLongPress={onLongPress} />
              </div>

              {/* Hidden book placeholders between covers (3 beige rectangle "spines") */}
              {index < books.length - 1 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 3,
                    alignItems: 'flex-end',
                    flexShrink: 0,
                    paddingBottom: 3,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 104,
                      borderRadius: '1px 1px 0 0',
                      background: '#e0d5c5',
                      opacity: 0.55,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      width: 7,
                      height: 92,
                      borderRadius: '1px 1px 0 0',
                      background: '#e0d5c5',
                      opacity: 0.4,
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      width: 6,
                      height: 98,
                      borderRadius: '1px 1px 0 0',
                      background: '#e0d5c5',
                      opacity: 0.28,
                      flexShrink: 0,
                    }}
                  />
                </div>
              )}
            </React.Fragment>
          ))}
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

      {/* Physical shelf surface */}
      <div style={{ margin: '10px 18px 0', height: 5, borderRadius: 2, background: 'linear-gradient(180deg, #c4ae84 0%, #b89e72 60%, #a88e62 100%)', borderTop: '1px solid rgba(255,255,255,0.35)' }} />
      <div style={{ height: 4, background: 'linear-gradient(180deg, rgba(120,90,50,0.12) 0%, transparent 100%)' }} />
    </div>
  );
}

// ─── Long-press context menu ──────────────────────────────────────────────────
function BookContextMenu({ book, onClose, onEdit, onDelete }: { book: Book; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const { categories, updateBook } = useApp();

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(book.title);
  const [editAuthor, setEditAuthor] = useState(book.author);
  const [editCategoryId, setEditCategoryId] = useState(book.categoryId);

  // Reset edit form when book changes
  useEffect(() => {
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditCategoryId(book.categoryId);
    setShowConfirm(false);
    setEditing(false);
  }, [book]);

  if (editing) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        onClick={() => { setEditing(false); onClose(); }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative', width: '100%', background: '#F6F0E7',
            borderRadius: '20px 20px 0 0', overflow: 'hidden',
            padding: '14px 20px 28px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d4c4a0' }} />
          </div>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 'bold', color: '#2c2416' }}>
            编辑书籍
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" placeholder="书名" value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: '#2c2416' }} />
            <input type="text" placeholder="作者" value={editAuthor}
              onChange={(e) => setEditAuthor(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: '#2c2416' }} />
            <select value={editCategoryId} onChange={(e) => setEditCategoryId(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: '#2c2416' }}>
              {categories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={async () => {
                if (!editTitle.trim() || !editAuthor.trim()) return;
                await updateBook(book.id, { title: editTitle.trim(), author: editAuthor.trim(), categoryId: editCategoryId });
                setEditing(false); onClose();
              }} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: '#2a1e0e', color: '#f0e8d4', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                保存
              </button>
              <button onClick={() => setEditing(false)}
                style={{ padding: '11px 16px', borderRadius: 8, border: '1px solid #d4c4a0', background: 'transparent', color: '#8a7a60', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showConfirm) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
        onClick={() => { setShowConfirm(false); }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative', width: '100%', background: '#F6F0E7',
            borderRadius: '20px 20px 0 0', overflow: 'hidden',
            padding: '14px 20px 28px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d4c4a0' }} />
          </div>
          <div style={{ background: '#fff0ee', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, fontFamily: '-apple-system, sans-serif', color: '#8a3a30' }}>
              确认删除此书？
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 12, color: '#b06050', fontFamily: '-apple-system, sans-serif', lineHeight: 1.6 }}>
              该书下的所有摘录也将被删除，此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={async () => { onDelete(); }}
                style={{ padding: '10px 28px', borderRadius: 8, border: 'none', background: '#c0392b', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                确认删除
              </button>
              <button onClick={() => setShowConfirm(false)}
                style={{ padding: '10px 28px', borderRadius: 8, border: '1px solid #d4c4a0', background: 'transparent', color: '#8a7a60', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', background: '#F6F0E7',
          borderRadius: '20px 20px 0 0', overflow: 'hidden',
          padding: '14px 20px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d4c4a0' }} />
        </div>

        {/* Book preview row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{
            width: 36, height: 54, borderRadius: 2, flexShrink: 0,
            background: book.coverData
              ? `url(${book.coverData}) center/cover`
              : `linear-gradient(160deg, ${lighten(['#4a3528','#2e3d35','#3a2e4a','#28384a','#2c3a4a','#4a3828','#3a2c48','#2a4038','#4a2e2e','#2e3a4a'][book.title.length % 10])} 0%, ${['#4a3528','#2e3d35','#3a2e4a','#28384a','#2c3a4a','#4a3828','#3a2c48','#2a4038','#4a2e2e','#2e3a4a'][book.title.length % 10]} 60%)`,
            boxShadow: '1px 2px 6px rgba(0,0,0,0.2)',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 'bold', fontFamily: 'Georgia, serif', color: '#2c2416', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {book.title}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8a7a60', fontFamily: '-apple-system, sans-serif' }}>
              {book.author}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button onClick={() => setEditing(true)}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: 'none', background: '#fffcf5', fontSize: 13, fontWeight: 600, color: '#2c2416', cursor: 'pointer', textAlign: 'center', fontFamily: '-apple-system, sans-serif' }}>
            编辑
          </button>
          <button onClick={() => setShowConfirm(true)}
            style={{ width: '100%', padding: '13px 16px', borderRadius: 10, border: 'none', background: '#fffcf5', fontSize: 13, fontWeight: 600, color: '#c0392b', cursor: 'pointer', textAlign: 'center', fontFamily: '-apple-system, sans-serif' }}>
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shelf view (bookshelf page) ──────────────────────────────────────────────
function ShelfView() {
  const { categories, books, initialLoading, selectBook, isSearching, selectBook: selectBookFromSearch, deleteBook, showStats, setShowStats } = useApp();
  const [showAddBook, setShowAddBook] = useState(false);
  const [showCatManager, setShowCatManager] = useState(false);
  const [contextBook, setContextBook] = useState<Book | null>(null);
  const [seedMsg, setSeedMsg] = useState('');

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
            setTimeout(() => { window.location.href = '/'; }, 1200);
          } else if (result === 'exists') {
            setSeedMsg('ℹ️ 《德米安》已存在');
            setTimeout(() => { window.location.href = '/'; }, 1000);
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

        {/* Seed status message */}
        {seedMsg && (
          <div
            style={{
              margin: '8px 18px 0',
              padding: '10px 14px',
              borderRadius: 10,
              background: seedMsg.includes('✅') ? '#e8f5e0' : seedMsg.includes('❌') ? '#ffe8e0' : '#fff8e0',
              color: seedMsg.includes('✅') ? '#2d6a30' : seedMsg.includes('❌') ? '#a04030' : '#8a7a40',
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
                <div style={{ display: 'flex', gap: 10 }}>
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
            <PatternHeader onManageCategories={() => setShowCatManager(true)} onOpenStats={() => setShowStats(true)} />

            {/* Decorative divider */}
            <div
              style={{
                margin: '4px 20px 2px',
                height: 1,
                background: 'linear-gradient(90deg, transparent 0%, #d4c4a0 30%, #d4c4a0 70%, transparent 100%)',
                opacity: 0.5,
              }}
            />

            {categories.map((cat) => {
              const catBooks = books.filter((b) => b.categoryId === cat.id);
              return (
                <ShelfRow
                  key={cat.id}
                  name={cat.name}
                  books={catBooks}
                  bookCount={catBooks.length}
                  onSelect={selectBook}
                  onLongPress={setContextBook}
                />
              );
            })}

            {/* Empty state */}
            {books.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#b8ae9a',
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 12,
                }}
              >
                书架还是空的，点击下方按钮添加书籍吧
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
            style={{
              background: '#2a1e0e',
              color: '#f0e8d4',
              border: 'none',
              borderRadius: 20,
              paddingTop: 14,
              paddingBottom: 14,
              paddingLeft: 36,
              paddingRight: 36,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
              letterSpacing: 0.5,
              cursor: 'pointer',
              pointerEvents: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            Add Books
          </button>
        </div>
      )}

      {/* Sheets */}
      <AddBookSheet open={showAddBook} onClose={() => setShowAddBook(false)} />
      <CategoryManager open={showCatManager} onClose={() => setShowCatManager(false)} />

      {/* Long-press context menu */}
      {contextBook && (
        <BookContextMenu
          book={contextBook}
          onClose={() => setContextBook(null)}
          onEdit={() => { selectBook(contextBook); setContextBook(null); }}
          onDelete={async () => {
            await deleteBook(contextBook.id);
            setContextBook(null);
          }}
        />
      )}

      {/* Stats page overlay */}
      <AnimatePresence>
        {showStats && (
          <motion.div
            key="stats-page"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#F6F0E7' }}
          >
            <StatsPage onBack={() => setShowStats(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { selectedBook, selectBook } = useApp();

  // 后台预热 Tesseract OCR（下载语言包、初始化 Worker）
  useEffect(() => { warmup(); }, []);

  return (
    <div
      style={{
        height: '100dvh',
        width: '100%',
        background: '#F6F0E7',
        position: 'relative',
        overflow: 'hidden',
        margin: '0 auto',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {selectedBook ? (
          <motion.div
            key="detail"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <BookDetailPage key={selectedBook.id} book={selectedBook} onBack={() => selectBook(null)} />
          </motion.div>
        ) : (
          <motion.div
            key="shelf"
            initial={{ x: '-30%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-30%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <ShelfView />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
