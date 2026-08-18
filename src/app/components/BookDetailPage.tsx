import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Edit3, Trash2, Share2 } from 'lucide-react';
import { useApp } from '../store';
import { getQuotesByBook, addQuote as dbAddQuote, updateQuote as dbUpdateQuote, deleteQuote as dbDeleteQuote } from '../db';
import AddQuoteSheet from './sheets/AddQuoteSheet';
import ShareSheet from './sheets/ShareSheet';
import ConfirmDialog from './ConfirmDialog';
import type { Book, Quote } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lighten(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(r + 28, 255)},${Math.min(g + 28, 255)},${Math.min(b + 28, 255)})`;
}

// ─── Book editor dialog ───────────────────────────────────────────────────────
function EditBookSheet({ open, onClose, book }: { open: boolean; onClose: () => void; book: Book }) {
  const { categories, updateBook, deleteBook, selectBook } = useApp();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [categoryId, setCategoryId] = useState(book.categoryId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setTitle(book.title);
    setAuthor(book.author);
    setCategoryId(book.categoryId);
    setShowDeleteConfirm(false);
  }, [book]);

  const handleSave = async () => {
    if (!title.trim() || !author.trim()) return;
    await updateBook(book.id, { title: title.trim(), author: author.trim(), categoryId });
    onClose();
  };

  const handleDelete = async () => {
    await deleteBook(book.id);
    selectBook(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          background: 'var(--color-bg)',
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          padding: '14px 20px 28px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
        </div>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 'bold', color: 'var(--color-text)' }}>
          编辑书籍
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            placeholder="书名"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: 'var(--color-text)' }}
          />
          <input
            type="text"
            placeholder="作者"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: 'var(--color-text)' }}
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #d4c4a0', background: '#fffcf5', fontSize: 13, outline: 'none', fontFamily: '-apple-system, sans-serif', color: 'var(--color-text)' }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                padding: '11px 0',
                borderRadius: 8,
                border: 'none',
                background: 'var(--color-btn)',
                color: 'var(--color-btn-text)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              保存
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '11px 16px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: 'transparent',
                color: 'var(--color-danger)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              删除
            </button>
          </div>

          {showDeleteConfirm && (
            <div style={{ background: 'var(--color-danger-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#8a3a30', fontFamily: '-apple-system, sans-serif', lineHeight: 1.6 }}>
              <strong>确认删除此书籍？</strong>
              该操作不可撤销，该书下的所有摘录也将被删除。
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleDelete}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'var(--color-danger)',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  确认删除
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid #d4c4a0',
                    background: 'transparent',
                    color: 'var(--color-text-secondary)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small book cover ─────────────────────────────────────────────────────────
function SmallBookCover({ book }: { book: Book }) {
  const W = 96, H = 146;

  if (book.coverType && book.coverData) {
    return (
      <div
        style={{
          width: W,
          height: H,
          borderRadius: '3px 5px 5px 3px',
          overflow: 'hidden',
          flexShrink: 0,
          boxShadow: '3px 5px 16px rgba(0,0,0,0.22), 1px 0 3px rgba(0,0,0,0.1)',
        }}
      >
        <img
          src={book.coverData}
          alt={book.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  const bgColors = ['#3D2E1E', '#2A3528', '#342A3D', '#243040', '#3A2A20', '#2E3A34', '#3A2C3D', '#2A3A34', '#3D2828', '#28343D'];
  const colorIdx = book.title.length % bgColors.length;
  const bg = bgColors[colorIdx];

  return (
    <div
      style={{
        width: W,
        height: H,
        background: `linear-gradient(160deg, ${lighten(bg)} 0%, ${bg} 60%)`,
        borderRadius: '3px 5px 5px 3px',
        flexShrink: 0,
        boxShadow: '3px 5px 16px rgba(0,0,0,0.22), 1px 0 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 6px',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', inset: 4, border: '1px solid var(--color-gold-light)', borderRadius: 1, pointerEvents: 'none' }} />
      <p style={{ color: '#d4a840', fontSize: 10, fontFamily: 'Georgia, "Times New Roman", serif', textAlign: 'center', lineHeight: 1.35, margin: 0, fontWeight: 'bold', zIndex: 1, whiteSpace: 'pre-line' }}>
        {book.title.length > 12 ? book.title.slice(0, 10) + '…' : book.title}
      </p>
      <div style={{ width: 20, height: 1, background: 'rgba(200,151,42,0.45)', margin: '4px 0', zIndex: 1 }} />
      <p style={{ color: 'rgba(200,151,42,0.6)', fontSize: 8, fontFamily: 'Georgia, serif', textAlign: 'center', margin: 0, zIndex: 1 }}>
        {book.author.length > 8 ? book.author.slice(0, 7) + '…' : book.author}
      </p>
    </div>
  );
}

// ─── Quote card ───────────────────────────────────────────────────────────────
function QuoteCard({
  quote,
  onEdit,
  onDelete,
  onShare,
}: {
  quote: Quote;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      data-quote-id={quote.id}
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 16,
        padding: '18px 16px 13px 13px',
        borderLeft: '3px solid var(--color-quote-accent)',
        boxShadow: 'var(--shadow-card)',
        position: 'relative',
        cursor: 'default',
        transition: 'box-shadow var(--transition-fast)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setTimeout(() => setHovered(false), 1500)}
    >
      <div style={{ position: 'relative', paddingLeft: 16, paddingRight: 8 }}>
        <span style={{ position: 'absolute', top: -12, left: -4, fontFamily: 'Georgia, serif', fontSize: 40, color: 'var(--color-quote-mark)', lineHeight: 1, userSelect: 'none' }}>
          &#x201C;
        </span>
        <p style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 13.5, lineHeight: 1.78, color: 'var(--color-text)', margin: 0, paddingTop: 8 }}>
          {quote.text}
        </p>
        <div style={{ textAlign: 'right', marginTop: -4 }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 40, color: 'var(--color-quote-mark)', lineHeight: 1, userSelect: 'none' }}>
            &#x201D;
          </span>
        </div>
      </div>

      {quote.thought && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingLeft: 2 }}>
          <span style={{ color: 'var(--color-quote-mark)', fontSize: 13, lineHeight: 1, marginTop: 3, flexShrink: 0, userSelect: 'none' }}>
            ↳
          </span>
          <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif', fontSize: 11.5, lineHeight: 1.65, color: 'var(--color-quote-thought)', margin: '2px 0 0', background: 'var(--color-bg-thought)', padding: '6px 10px', borderRadius: 6 }}>
            {quote.thought}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 13 }}>
        <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 9.5, color: 'var(--color-text-muted)', letterSpacing: 0.15 }}>
          {quote.page != null ? `P.${quote.page}` : ''}{quote.page != null && quote.date ? ' · ' : ''}{quote.date || ''}
        </span>
        <div style={{ display: 'flex', gap: 11, opacity: hovered ? 0.6 : 0.4, transition: 'opacity 0.2s ease' }}>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }} onClick={onEdit} title="编辑">
            <Edit3 size={12} color="var(--color-quote-icon)" strokeWidth={1.6} />
          </button>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }} onClick={onDelete} title="删除">
            <Trash2 size={12} color="var(--color-quote-icon)" strokeWidth={1.6} />
          </button>
          <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1 }} onClick={onShare} title="分享">
            <Share2 size={12} color="var(--color-quote-icon)" strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail page ──────────────────────────────────────────────────────────────
interface BookDetailPageProps {
  book: Book;
  onBack: () => void;
}

export function BookDetailPage({ book, onBack }: BookDetailPageProps) {
  const { targetQuoteId, setTargetQuoteId } = useApp();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Sheet states
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [shareQuote, setShareQuote] = useState<Quote | null>(null);
  const [showEditBook, setShowEditBook] = useState(false);
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  // ─── Direct DB query — no store indirection, no useCallback chain ────────
  // Use isMounted ref to prevent state updates after unmount
  const isMounted = useRef(true);

  // Scroll to target quote when navigating from search results
  useEffect(() => {
    if (!targetQuoteId || loading) return;
    const el = document.querySelector(`[data-quote-id="${targetQuoteId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight briefly
      (el as HTMLElement).style.transition = 'box-shadow 0.3s ease';
      (el as HTMLElement).style.boxShadow = '0 0 0 3px rgba(212,168,48,0.5)';
      setTimeout(() => {
        (el as HTMLElement).style.boxShadow = '';
      }, 2000);
    }
    setTargetQuoteId(null);
  }, [targetQuoteId, loading]);

  const loadQuotes = async (isRetry = false) => {
    if (!isMounted.current) return;
    setLoading(true);
    setError('');
    try {
      console.log('[BookDetailPage] LoadQuotes for book.id:', book.id, isRetry ? '(retry)' : '');
      const qs = await getQuotesByBook(book.id);
      if (isMounted.current) {
        console.log('[BookDetailPage] Loaded', qs.length, 'quotes');
        setQuotes(qs);
        setLoading(false);
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      console.error('[BookDetailPage] loadQuotes error:', msg);

      // Retry once after 1 second (only on first load, not on manual retry)
      if (!isRetry) {
        console.log('[BookDetailPage] Retrying loadQuotes in 1s…');
        await new Promise(r => setTimeout(r, 1000));
        if (!isMounted.current) return;
        loadQuotes(true);
        return;
      }

      if (isMounted.current) {
        setError('加载摘录失败: ' + msg.slice(0, 80));
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    loadQuotes();
    return () => {
      isMounted.current = false;
    };
  }, [book.id, retryTrigger]);

  // ─── Add quote (direct DB write + optimistic local update) ──────────────
  const handleAddQuote = async (data: { text: string; thought: string; page: number | null; date: string }) => {
    try {
      const newQuote = await dbAddQuote({
        bookId: book.id,
        text: data.text.trim(),
        thought: data.thought.trim(),
        page: data.page,
        date: data.date,
      });
      if (isMounted.current) {
        setQuotes(prev => [newQuote, ...prev]);
      }
    } catch (e: any) {
      console.error('[BookDetailPage] addQuote error:', e?.message || e);
      if (isMounted.current) {
        setError('保存摘录失败，请重试');
      }
      throw e;
    }
  };

  // ─── Edit quote ─────────────────────────────────────────────────────────
  const handleEditQuote = async (data: { text: string; thought: string; page: number | null; date: string }) => {
    if (!editQuote) return;
    try {
      await dbUpdateQuote(editQuote.id, {
        text: data.text.trim(),
        thought: data.thought.trim(),
        page: data.page,
        date: data.date,
      });
      if (isMounted.current) {
        setQuotes(prev => prev.map(q =>
          q.id === editQuote.id ? { ...q, text: data.text, thought: data.thought, page: data.page, date: data.date, updatedAt: new Date().toISOString() } : q,
        ));
        setEditQuote(null);
      }
    } catch (e: any) {
      console.error('[BookDetailPage] updateQuote error:', e?.message || e);
      if (isMounted.current) {
        setError('编辑摘录失败，请重试');
      }
    }
  };

  // ─── Delete quote ──────────────────────────────────────────────────────
  const handleDeleteQuote = async (quoteId: string) => {
    try {
      await dbDeleteQuote(quoteId);
      if (isMounted.current) {
        setQuotes(prev => prev.filter(q => q.id !== quoteId));
      }
    } catch (e: any) {
      console.error('[BookDetailPage] deleteQuote error:', e?.message || e);
      if (isMounted.current) {
        setError('删除摘录失败，请重试');
      }
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const delta = e.changedTouches[0].clientX - swipeStartX.current;
        const deltaY = e.changedTouches[0].clientY - swipeStartY.current;
        if (delta > 70 && Math.abs(delta) > Math.abs(deltaY)) {
          onBack();
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top navigation bar */}
      <div
        style={{
          paddingTop: 10,
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 2,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: '#7a6a50',
            padding: '4px 0',
          }}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }}>
            书架
          </span>
        </button>
        <button
          onClick={() => setShowEditBook(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)',
            fontSize: 11, fontFamily: '-apple-system, sans-serif', padding: '4px 6px',
          }}
        >
          编辑
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            margin: '4px 14px 0', padding: '8px 12px', borderRadius: 8,
            background: 'var(--color-danger-bg)', color: '#a04030', fontSize: 11,
            fontFamily: '-apple-system, sans-serif', textAlign: 'center',
          }}
        >
          {error}
          <button
            onClick={() => setRetryTrigger(v => v + 1)}
            style={{
              marginLeft: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: '#a04030', fontWeight: 600, fontSize: 11,
              verticalAlign: 'middle',
            }}
          >
            重试
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          paddingBottom: 130,
        } as React.CSSProperties}
      >
        {/* Book header card */}
        <div style={{ display: 'flex', gap: 15, padding: '10px 18px 20px', alignItems: 'flex-start' }}>
          <SmallBookCover book={book} />
          <div style={{ flex: 1, paddingTop: 6 }}>
            <h2 style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 17, fontWeight: 'bold', color: 'var(--color-text)', lineHeight: 1.3, margin: '0 0 7px' }}>
              {book.title}
            </h2>
            <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 12, color: 'var(--color-text-secondary)', margin: '0 0 5px', fontWeight: 400 }}>
              {book.author}
            </p>
            <p style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 11, color: '#aaa090', margin: 0, fontWeight: 400 }}>
              {quotes.length} 条摘录
            </p>
          </div>
          {/* Decorative quill icon */}
          <img
            src="icon-quill.svg"
            alt=""
            style={{
              height: 84,
              width: 'auto',
              opacity: 0.35,
              flexShrink: 0,
              marginTop: 24,
              marginRight: 20,
            }}
          />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, #d4c4a0 30%, #d4c4a0 70%, transparent 100%)', marginLeft: 18, marginRight: 18, marginBottom: 18 }} />

        {/* Quote cards or empty state */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 12, fontFamily: '-apple-system, sans-serif' }}>
            加载中…
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 12, lineHeight: 1.8 }}>
            还没有摘录
            <br />
            点击下方按钮添加第一条
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 14, paddingRight: 14 }}>
            {quotes.map((q) => (
              <QuoteCard
                key={q.id}
                quote={q}
                onEdit={() => setEditQuote(q)}
                onDelete={() => {
                  setDeleteQuoteId(q.id);
                }}
                onShare={() => setShareQuote(q)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Fixed Add Quote button */}
      <div style={{ position: 'absolute', bottom: 80, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <button
          onClick={() => setShowAddSheet(true)}
          style={{
            background: 'rgba(44, 34, 22, 0.85)', color: 'var(--color-btn-text)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
            paddingTop: 14, paddingBottom: 14, width: 108, textAlign: 'center',
            fontSize: 15, fontWeight: 700,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif',
            cursor: 'pointer', letterSpacing: 0.4, pointerEvents: 'auto',
            boxShadow: '0 4px 18px rgba(0,0,0,0.2)',
          }}
        >
          Add Quotes
        </button>
      </div>

      {/* Sheets */}
      <AddQuoteSheet open={showAddSheet} onClose={() => setShowAddSheet(false)} onSave={handleAddQuote} />
      <AddQuoteSheet open={editQuote !== null} onClose={() => setEditQuote(null)} onSave={handleEditQuote} editQuote={editQuote} />

      {shareQuote && (
        <ShareSheet open={shareQuote !== null} onClose={() => setShareQuote(null)} quote={shareQuote} bookTitle={book.title} bookAuthor={book.author} />
      )}

      <EditBookSheet open={showEditBook} onClose={() => setShowEditBook(false)} book={book} />

      <ConfirmDialog
        open={deleteQuoteId !== null}
        title="确认删除此摘录？"
        message="该操作不可撤销，删除后无法恢复。"
        onConfirm={() => {
          if (deleteQuoteId) {
            handleDeleteQuote(deleteQuoteId);
            setDeleteQuoteId(null);
          }
        }}
        onCancel={() => setDeleteQuoteId(null)}
      />
    </div>
  );
}
