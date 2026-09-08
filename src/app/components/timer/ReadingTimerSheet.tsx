import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Book } from '../../types';
import { useReadingTimer } from './ReadingTimerProvider';
import { formatClock, formatMinutesHuman } from './format';

const SOLID = '#2C2216';
const GLASS_BG = 'var(--color-glass)';
const GLASS_EDGE = 'var(--color-glass-edge)';
const GLASS_FILTER = 'blur(14px) saturate(160%)';

function BookPicker({
  books,
  selectedBookId,
  onSelect,
}: {
  books: Book[];
  selectedBookId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="hide-scrollbar" style={{ maxHeight: '28vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {books.map((book) => {
        const active = book.id === selectedBookId;
        return (
          <button
            key={book.id}
            onClick={() => onSelect(book.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px 14px',
              borderRadius: 14,
              border: active ? '1.5px solid rgba(200, 154, 42, 0.55)' : `1px solid ${GLASS_EDGE}`,
              background: active ? 'rgba(200, 154, 42, 0.14)' : GLASS_BG,
              backdropFilter: GLASS_FILTER,
              WebkitBackdropFilter: GLASS_FILTER,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              boxShadow: active ? '0 8px 20px rgba(200, 154, 42, 0.18)' : '0 2px 10px rgba(28, 22, 12, 0.06)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif' }}>
              {book.title}
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>
              {book.author || '未知作者'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ReadingTimerSheet() {
  const {
    status,
    bookId,
    sheetOpen,
    summary,
    notice,
    books,
    elapsedMs,
    startTimer,
    pauseTimer,
    resumeTimer,
    endTimer,
    closeSheet,
    dismissSummary,
  } = useReadingTimer();

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (status === 'idle' && !selectedBookId && books.length > 0) {
      setSelectedBookId(books[0].id);
    }
  }, [status, books, selectedBookId]);

  useEffect(() => {
    if (!sheetOpen) {
      setSearchOpen(false);
      setSearchQuery('');
    }
  }, [sheetOpen]);

  if (!sheetOpen) return null;

  const currentBook = books.find((b) => b.id === bookId) ?? null;
  const query = searchQuery.trim().toLowerCase();
  const filteredBooks = query
    ? books.filter((b) => b.title.toLowerCase().includes(query) || (b.author || '').toLowerCase().includes(query))
    : books;
  const activeBook = filteredBooks.find((b) => b.id === selectedBookId) ?? null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={closeSheet}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />

      <div
        className="hide-scrollbar"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 340,
          maxHeight: '80vh',
          background: 'var(--color-glass)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: '1px solid var(--color-glass-edge)',
          borderRadius: 20,
          overflowY: 'auto',
          padding: '20px 20px 24px',
          boxShadow: '0 18px 48px rgba(28,22,12,0.28)',
        }}
      >
        {summary ? (
          <>
            <h3 style={{ margin: '8px 0 4px', textAlign: 'center', fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 'bold', color: 'var(--color-text)' }}>
              本次阅读完成
            </h3>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 38, fontWeight: 'bold', fontFamily: 'var(--font-serif)', color: 'var(--color-text)', lineHeight: 1.1 }}>
                {formatMinutesHuman(summary.minutes)}
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: '-apple-system, sans-serif' }}>
                今日累计 {formatMinutesHuman(summary.todayMinutes)}
              </div>
            </div>
            <button
              onClick={dismissSummary}
              style={{
                width: '100%',
                padding: '13px 0',
                borderRadius: 16,
                border: 'none',
                background: SOLID,
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: '-apple-system, sans-serif',
                cursor: 'pointer',
              }}
            >
              完成
            </button>
          </>
        ) : status === 'idle' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'Georgia, serif', fontWeight: 'bold', color: 'var(--color-text)' }}>
                阅读计时
              </h3>
              {books.length > 0 && (
                <button
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-label="搜索书籍"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: `1px solid ${GLASS_EDGE}`,
                    background: GLASS_BG,
                    backdropFilter: GLASS_FILTER,
                    WebkitBackdropFilter: GLASS_FILTER,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#7a6a50',
                  }}
                >
                  {searchOpen ? <X size={17} strokeWidth={2} /> : <Search size={17} strokeWidth={2} />}
                </button>
              )}
            </div>

            {books.length > 0 && searchOpen && (
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索书名或作者"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${GLASS_EDGE}`,
                  background: GLASS_BG,
                  backdropFilter: GLASS_FILTER,
                  WebkitBackdropFilter: GLASS_FILTER,
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: '-apple-system, sans-serif',
                  color: 'var(--color-text)',
                  marginBottom: 12,
                }}
              />
            )}

            {books.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif', lineHeight: 1.6 }}>
                  还没有书籍，请先添加一本书再开始计时。
                </p>
                <button
                  onClick={closeSheet}
                  style={{
                    width: '100%',
                    padding: '13px 0',
                    borderRadius: 16,
                    border: `1px solid ${GLASS_EDGE}`,
                    background: GLASS_BG,
                    backdropFilter: GLASS_FILTER,
                    WebkitBackdropFilter: GLASS_FILTER,
                    color: 'var(--color-text-secondary)',
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: '-apple-system, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  关闭
                </button>
              </div>
            ) : filteredBooks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', fontSize: 13, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>
                暂无匹配书籍
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#a09070', fontFamily: '-apple-system, sans-serif', fontWeight: 600, marginBottom: 8 }}>
                  {searchOpen ? '搜索结果' : '选择书籍'}
                </div>
                <BookPicker books={filteredBooks} selectedBookId={selectedBookId} onSelect={setSelectedBookId} />
                <button
                  onClick={() => activeBook && startTimer(activeBook.id)}
                  disabled={!activeBook}
                  style={{
                    marginTop: 18,
                    width: '100%',
                    padding: '14px 0',
                    borderRadius: 16,
                    border: activeBook ? '1px solid rgba(255, 255, 255, 0.18)' : `1px solid ${GLASS_EDGE}`,
                    background: activeBook ? 'rgba(44, 34, 22, 0.72)' : 'rgba(224, 216, 200, 0.38)',
                    backdropFilter: 'blur(18px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                    color: activeBook ? '#FFF8E0' : 'var(--color-text-muted)',
                    fontSize: 16,
                    fontWeight: 700,
                    fontFamily: '-apple-system, sans-serif',
                    cursor: activeBook ? 'pointer' : 'not-allowed',
                    boxShadow: activeBook ? '0 10px 24px rgba(28, 22, 12, 0.22)' : 'none',
                  }}
                >
                  开始计时
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', margin: '4px 0 2px' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: '-apple-system, sans-serif' }}>
                {currentBook ? `《${currentBook.title}》` : '阅读计时'}
              </span>
            </div>

            <div
              style={{
                textAlign: 'center',
                fontSize: 46,
                fontWeight: 'bold',
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-text)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 1,
                padding: '12px 0',
                lineHeight: 1,
              }}
            >
              {formatClock(elapsedMs)}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 12px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: '-apple-system, sans-serif',
                  background: status === 'running' ? '#eef5ee' : '#f5efe0',
                  color: status === 'running' ? '#4a7a52' : '#8a7a40',
                }}
              >
                {status === 'running' ? '计时中' : '已暂停'}
              </span>
            </div>

            {notice && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: '#fff8e0',
                  color: '#8a7a40',
                  fontSize: 12,
                  fontFamily: '-apple-system, sans-serif',
                  textAlign: 'center',
                }}
              >
                {notice}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              {status === 'running' ? (
                <button
                  onClick={pauseTimer}
                  style={{
                    flex: 1,
                    padding: '14px 0',
                    borderRadius: 16,
                    border: `1px solid ${GLASS_EDGE}`,
                    background: GLASS_BG,
                    backdropFilter: GLASS_FILTER,
                    WebkitBackdropFilter: GLASS_FILTER,
                    color: 'var(--color-text)',
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: '-apple-system, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  暂停
                </button>
              ) : (
                <button
                  onClick={resumeTimer}
                  style={{
                    flex: 1,
                    padding: '14px 0',
                    borderRadius: 16,
                    border: `1px solid ${GLASS_EDGE}`,
                    background: GLASS_BG,
                    backdropFilter: GLASS_FILTER,
                    WebkitBackdropFilter: GLASS_FILTER,
                    color: 'var(--color-text)',
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: '-apple-system, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  继续
                </button>
              )}

              <button
                onClick={endTimer}
                style={{
                  flex: 1,
                  padding: '14px 0',
                  borderRadius: 16,
                  border: 'none',
                  background: SOLID,
                  color: '#FFFFFF',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: '-apple-system, sans-serif',
                  cursor: 'pointer',
                }}
              >
                结束计时
              </button>
            </div>

            <button
              onClick={closeSheet}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '10px 0',
                background: 'none',
                border: 'none',
                color: 'var(--color-text-muted)',
                fontSize: 13,
                fontFamily: '-apple-system, sans-serif',
                cursor: 'pointer',
              }}
            >
              收起，后台继续计时
            </button>
          </>
        )}
      </div>
    </div>
  );
}
