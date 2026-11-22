import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Star } from 'lucide-react';
import type { Book, Quote } from '../types';
import RichText from '../components/RichText';
import BookCoverSurface from '../components/BookCoverSurface';
import { normalizeMarkColor } from '../quoteMarkColors';
import { stripRichText } from '../richText';
import { formatReviewDate, isQuoteFavorite } from './excerptFeedState';
import { useViewDwell } from './useViewDwell';

interface Props {
  quote: Quote;
  book: Book | null;
  favoritePending: boolean;
  shareOpen: boolean;
  onBack: () => void;
  onToggleFavorite: (quote: Quote) => void;
  onShare: (quote: Quote) => void;
  onViewed: (quote: Quote) => void;
}

export default function ExcerptReader({
  quote,
  book,
  favoritePending,
  shareOpen,
  onBack,
  onToggleFavorite,
  onShare,
  onViewed,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const copyTimerRef = useRef<number | undefined>(undefined);
  const longPressRef = useRef<{ timer: number; x: number; y: number; pointerId: number } | null>(null);
  const edgeGestureRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const favorite = isQuoteFavorite(quote);
  const author = book?.author?.trim() || '作者未知';
  const reviewedQuoteRef = useRef(onViewed);
  reviewedQuoteRef.current = onViewed;

  useViewDwell({
    active: true,
    occluded: shareOpen,
    onReached: () => reviewedQuoteRef.current(quote),
  });

  useEffect(() => {
    headingRef.current?.focus();
    return () => window.clearTimeout(copyTimerRef.current);
  }, []);

  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  };

  const copyQuote = async () => {
    const text = stripRichText(quote.text, 'quote');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand?.('copy');
        area.remove();
      }
      showToast('已复制摘录');
      if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
    } catch {
      showToast('复制失败，请手动选择文字');
    }
  };

  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  const onCopyPointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelLongPress();
    longPressRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      timer: window.setTimeout(() => {
        longPressRef.current = null;
        void copyQuote();
      }, 520),
    };
  };

  const onCopyPointerMove = (event: React.PointerEvent) => {
    const current = longPressRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - current.x) > 8 || Math.abs(event.clientY - current.y) > 8) {
      cancelLongPress();
    }
  };

  const onEdgeDown = (event: React.PointerEvent) => {
    if (event.clientX > 28) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    edgeGestureRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Safari 在少数场景不提供 pointer capture；仍可依靠普通 pointerup。
    }
  };

  const onEdgeUp = (event: React.PointerEvent) => {
    const start = edgeGestureRef.current;
    edgeGestureRef.current = null;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = Math.abs(event.clientY - start.y);
    if (dx > 70 && Math.abs(dx) > dy) onBack();
  };

  return (
    <section
      className="review-reader"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        event.stopPropagation();
        onBack();
      }}
    >
      <div
        className="review-reader-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-reader-heading"
        onPointerDown={onEdgeDown}
        onPointerUp={onEdgeUp}
        onPointerCancel={() => { edgeGestureRef.current = null; }}
      >
        <header className="review-reader-header">
          <button type="button" className="review-reader-back" onClick={onBack} aria-label="返回双列流">
            <ArrowLeft size={20} strokeWidth={1.8} />
          </button>
        </header>

        <div className="review-reader-scroll hide-scrollbar">
          <article className="review-reader-article">
            <h1
              id="review-reader-heading"
              ref={headingRef}
              tabIndex={-1}
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                margin: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {(book?.title || '未知书目')}的完整摘录
            </h1>

            <header className="review-reader-masthead">
              <div className="review-reader-identity">
                <ReaderBookCover book={book} />
                <div className="review-reader-identity-copy">
                  <h2 className="review-reader-book-title">《{book?.title?.trim() || '未知书目'}》</h2>
                  <p className="review-reader-brand-cn">折角书摘</p>
                  <p className="review-reader-brand-en">DOGEAR · BOOK EXCERPT</p>
                </div>
              </div>

              <div className="review-reader-meta-strip">
                <section className="review-reader-meta-item review-reader-meta-item--author" aria-label="作者">
                  <span className="review-reader-meta-label">作者</span>
                  <div className="review-reader-meta-value review-reader-meta-value--author">
                    <span className="review-reader-meta-author">{author}</span>
                  </div>
                </section>

                <span className="review-reader-meta-divider" aria-hidden="true" />

                <section className="review-reader-meta-item review-reader-meta-item--date" aria-label="摘录时间">
                  <span className="review-reader-meta-label">摘录时间</span>
                  <time className="review-reader-meta-value" dateTime={quote.date || quote.createdAt}>
                    {formatTemplateDate(quote.date || quote.createdAt)}
                  </time>
                </section>
              </div>
            </header>
            <div className="review-reader-body">
              <div
                className="review-reader-quote"
                onPointerDown={onCopyPointerDown}
                onPointerMove={onCopyPointerMove}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cancelLongPress();
                }}
              >
                <RichText
                  text={quote.text}
                  scope="quote"
                  markBackground={normalizeMarkColor(quote.textMarkColor)}
                />
              </div>

              {quote.thought?.trim() && (
                <section className="review-reader-thought" aria-labelledby="review-reader-thought-heading">
                  <h2 id="review-reader-thought-heading">我的想法</h2>
                  <p>
                    <RichText
                      text={quote.thought}
                      scope="thought"
                      markBackground={normalizeMarkColor(quote.thoughtMarkColor)}
                    />
                  </p>
                </section>
              )}
            </div>

            <footer className="review-reader-actions-bar">
              <div className="review-reader-actions">
                <button
                  type="button"
                  className="review-reader-action"
                  aria-pressed={favorite}
                  aria-label={favorite ? '取消收藏此摘录' : '收藏此摘录'}
                  disabled={favoritePending}
                  onClick={() => onToggleFavorite(quote)}
                >
                  <Star size={18} strokeWidth={1.6} fill={favorite ? 'var(--review-favorite-gold)' : 'none'} />
                  {favorite ? '已收藏' : '收藏'}
                </button>
                <button
                  type="button"
                  className="review-reader-action"
                  onClick={() => onShare(quote)}
                  aria-label="打开图片编辑器分享此摘录"
                >
                  <ArrowUpRight size={18} strokeWidth={1.7} />
                  分享
                </button>
              </div>
            </footer>
            </article>
          </div>
        </div>
      {toast && <div className="review-toast" role="status" aria-live="polite">{toast}</div>}
    </section>
  );
}

function formatTemplateDate(value: string): string {
  const formatted = formatReviewDate(value);
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(formatted);
  return match ? `${match[1]} 年 ${match[2]} 月 ${match[3]} 日` : formatted;
}

function ReaderBookCover({ book }: { book: Book | null }) {
  if (book) {
    const coverBook = book.coverData && !book.coverType
      ? {
          ...book,
          coverType: book.coverData.startsWith('data:') || book.coverData.startsWith('blob:')
            ? 'upload' as const
            : 'url' as const,
        }
      : book;

    return (
      <div className="review-reader-cover" aria-hidden="true">
        <BookCoverSurface
          book={coverBook}
          artScale={0.92}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 2,
          }}
        />
      </div>
    );
  }

  return (
    <div className="review-reader-cover" aria-hidden="true">
      <div className="review-reader-cover-placeholder">
        <span>未知书目</span>
      </div>
    </div>
  );
}
