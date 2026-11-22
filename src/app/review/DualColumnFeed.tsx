import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Bookmark, Star } from 'lucide-react';
import type { Book, Quote } from '../types';
import {
  FEED_PAGE_SIZE,
  pageQuoteIds,
  pairQuoteRows,
  orderFilteredQuotes,
  isQuoteViewed,
  isQuoteFavorite,
} from './excerptFeedState';
import { stripRichText } from '../richText';
import type { ReviewPreferences } from './excerptFeedState';

interface Props {
  quotes: Quote[];
  books: Map<string, Book>;
  preferences: ReviewPreferences;
  randomOrder: string[];
  initialQuoteId: string | null;
  favoritePendingIds: Set<string>;
  onOpenQuote: (quote: Quote, source: 'feed') => void;
  onToggleFavorite: (quote: Quote) => void;
  onCurrentQuoteChange: (quoteId: string) => void;
}

export default function DualColumnFeed({
  quotes,
  books,
  preferences,
  randomOrder,
  initialQuoteId,
  favoritePendingIds,
  onOpenQuote,
  onToggleFavorite,
  onCurrentQuoteChange,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const quotesRef = useRef(quotes);
  quotesRef.current = quotes;
  const initialQuoteRef = useRef(initialQuoteId);
  const didInitialAnchorRef = useRef(false);
  const currentObserverRef = useRef<IntersectionObserver | null>(null);
  const glassNodesRef = useRef(new Map<string, HTMLElement>());
  const [visibleCount, setVisibleCount] = useState(() => {
    const initialIndex = initialQuoteId
      ? orderFilteredQuotes(quotes, preferences, randomOrder).findIndex((quote) => quote.id === initialQuoteId)
      : 0;
    return Math.max(FEED_PAGE_SIZE, initialIndex + 2);
  });
  const [sequence, setSequence] = useState<Quote[]>(() =>
    orderFilteredQuotes(quotes, preferences, randomOrder),
  );
  const [blurredIds, setBlurredIds] = useState<Set<string>>(() => new Set());
  const latestById = useMemo(() => new Map(quotes.map((quote) => [quote.id, quote])), [quotes]);
  const visibleQuotes = pageQuoteIds(
    sequence.map((quote) => quote.id),
    visibleCount,
  ).map((id) => latestById.get(id)).filter((quote): quote is Quote => Boolean(quote));
  const sequenceKey = sequence.map((quote) => quote.id).join('|');

  useEffect(() => {
    const next = orderFilteredQuotes(quotesRef.current, preferences, randomOrder);
    setSequence(next);
    const anchorAt = initialQuoteRef.current
      ? next.findIndex((quote) => quote.id === initialQuoteRef.current)
      : 0;
    setVisibleCount(Math.max(FEED_PAGE_SIZE, anchorAt + 2));
    if (didInitialAnchorRef.current) {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [preferences.readFilter, preferences.favoritesOnly, preferences.sortMode, randomOrder]);

  useEffect(() => {
    if (sequence.length > 0) onCurrentQuoteChange(sequence[0].id);
  }, [sequenceKey]);

  useLayoutEffect(() => {
    if (didInitialAnchorRef.current || !initialQuoteRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const root = scrollRef.current;
      const target = Array.from(
        root?.querySelectorAll<HTMLElement>('[data-feed-quote-id]') ?? [],
      ).find((element) => element.dataset.feedQuoteId === initialQuoteRef.current);
      if (target) {
        target.scrollIntoView?.({ block: 'center', behavior: 'auto' });
        didInitialAnchorRef.current = true;
      } else if (sequence.length > 0) {
        didInitialAnchorRef.current = true;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sequenceKey]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      if (sequence.length > 0) setBlurredIds(new Set(sequence.slice(0, 4).map((quote) => quote.id)));
      return;
    }

    currentObserverRef.current?.disconnect();
    const currentObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = (visible?.target as HTMLElement | undefined)?.dataset.feedQuoteId;
        if (id) onCurrentQuoteChange(id);
      },
      { root, threshold: [0.2, 0.45, 0.7] },
    );
    currentObserverRef.current = currentObserver;
    for (const card of root.querySelectorAll<HTMLElement>('[data-feed-quote-id]')) {
      currentObserver.observe(card);
    }

    const blurObserver = new IntersectionObserver(
      (entries) => {
        setBlurredIds((previous) => {
          const next = new Set(previous);
          let changed = false;
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.feedQuoteId;
            if (!id) continue;
            if (entry.isIntersecting && !next.has(id)) {
              next.add(id);
              changed = true;
            } else if (!entry.isIntersecting && next.has(id)) {
              next.delete(id);
              changed = true;
            }
          }
          return changed ? next : previous;
        });
      },
      { root, rootMargin: '120px 0px', threshold: 0.01 },
    );
    for (const node of glassNodesRef.current.values()) blurObserver.observe(node);

    return () => {
      currentObserver.disconnect();
      blurObserver.disconnect();
    };
  }, [sequenceKey, visibleCount, onCurrentQuoteChange]);

  const handleScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 420) {
      setVisibleCount((count) => Math.min(sequence.length, count + FEED_PAGE_SIZE));
    }
  };

  const setGlassNode = useCallback((id: string, node: HTMLElement | null) => {
    if (node) glassNodesRef.current.set(id, node);
    else glassNodesRef.current.delete(id);
  }, []);

  const rows = pairQuoteRows(visibleQuotes);

  if (sequence.length === 0) {
    const label = preferences.favoritesOnly && preferences.readFilter !== 'all'
      ? '没有同时符合收藏和阅读状态的摘录'
      : preferences.favoritesOnly
        ? '还没有收藏的摘录'
        : preferences.readFilter === 'unread'
          ? '没有未看摘录'
          : preferences.readFilter === 'viewed'
            ? '还没有看过的摘录'
            : '还没有摘录';
    return (
      <div className="review-feed-status">
        <strong>{label}</strong>
        可以调整筛选条件后再回看。
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="review-feed-shell"
      onScroll={handleScroll}
      role="region"
      aria-label="摘录双列流"
    >
      <div className="review-feed-grid">
        {rows.map(([left, right], rowIndex) => (
          <div key={`row-${rowIndex}-${left.id}`} style={{ display: 'contents' }}>
            <FeedCard
              quote={left}
              book={books.get(left.bookId) ?? null}
              right={false}
              blurred={blurredIds.has(left.id)}
              favoritePending={favoritePendingIds.has(left.id)}
              setGlassNode={setGlassNode}
              onOpen={() => {
                onCurrentQuoteChange(left.id);
                onOpenQuote(latestById.get(left.id) ?? left, 'feed');
              }}
              onToggleFavorite={onToggleFavorite}
            />
            {right && (
              <FeedCard
                quote={right}
                book={books.get(right.bookId) ?? null}
                right
                blurred={blurredIds.has(right.id)}
                favoritePending={favoritePendingIds.has(right.id)}
                setGlassNode={setGlassNode}
                onOpen={() => {
                  onCurrentQuoteChange(right.id);
                  onOpenQuote(latestById.get(right.id) ?? right, 'feed');
                }}
                onToggleFavorite={onToggleFavorite}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedCard({
  quote,
  book,
  right,
  blurred,
  favoritePending,
  setGlassNode,
  onOpen,
  onToggleFavorite,
}: {
  quote: Quote;
  book: Book | null;
  right: boolean;
  blurred: boolean;
  favoritePending: boolean;
  setGlassNode: (id: string, node: HTMLElement | null) => void;
  onOpen: () => void;
  onToggleFavorite: (quote: Quote) => void;
}) {
  const favorite = isQuoteFavorite(quote);
  const title = book?.title?.trim() || '未知书目';
  const author = book?.author?.trim() || '';
  const viewed = isQuoteViewed(quote);
  const hasThought = Boolean(quote.thought?.trim());
  const excerpt = stripRichText(quote.text, 'quote').replace(/\s+/g, ' ').trim();
  const openLabel = [
    `打开摘录：${excerpt.slice(0, 72)}`,
    `《${title}》`,
    author,
    viewed ? '已看' : '未看',
    hasThought ? '有我的想法' : '',
  ].filter(Boolean).join('，');
  return (
    <article
      className={`review-feed-slot${right ? ' review-feed-slot--right' : ''}`}
      data-feed-quote-id={quote.id}
      aria-label={[title, author, viewed ? '已看' : '未看', hasThought ? '有我的想法' : ''].filter(Boolean).join('，')}
    >
      <div
        ref={(node) => setGlassNode(quote.id, node)}
        className={`review-feed-card${blurred ? ' is-blurred' : ''}`}
      >
        <button type="button" className="review-feed-main" onClick={onOpen} aria-label={openLabel}>
          {!isQuoteViewed(quote) && <span className="review-feed-unread-dot" aria-hidden="true" />}
          <p className="review-feed-quote">{quote.text}</p>
        </button>
        <button
          type="button"
          className="review-feed-favorite"
          aria-label={favorite ? '取消收藏此摘录' : '收藏此摘录'}
          aria-pressed={favorite}
          disabled={favoritePending}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(quote);
          }}
        >
          <Star size={18} strokeWidth={1.7} fill={favorite ? 'var(--review-favorite-gold)' : 'none'} />
        </button>
        {quote.thought?.trim() && (
          <span className="review-feed-note" aria-label="有我的想法" title="有我的想法">
            <Bookmark size={11} strokeWidth={1.8} aria-hidden="true" />
          </span>
        )}
        <button
          type="button"
          className="review-feed-info"
          onClick={onOpen}
          aria-label={`查看《${title}》的完整摘录`}
        >
          <div className="review-feed-title">《{title}》</div>
          {author && <div className="review-feed-author">{author}</div>}
        </button>
      </div>
    </article>
  );
}
