// ─── 摘录回顾页 ───────────────────────────────────────────────────────────────
//
// 翻页名片架与双列信息流共用同一份摘录、收藏、看过与排序状态。页面切换视图时
// 不卸载整条业务数据，只换展示层；currentQuoteId 是两种视图之间的内容锚点。
// 阅读弹窗作为覆盖层保留双列流的 DOM 和滚动位置，返回时无需重新计算位置。

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import {
  getAllBooks,
  getAllQuotes,
  markQuoteReviewed,
  markQuoteViewed,
  setQuoteFavorite,
} from '../db';
import type { Book, Quote } from '../types';
import Rolodex, { type RolodexHandle } from './rolodex/Rolodex';
import {
  HAND_STACK,
  MAX_STAGE_SCALE,
  SERIF_STACK,
  STAGE_H,
  STAGE_INK_H,
  STAGE_PAD_BOTTOM,
  STAGE_PAD_TOP,
  STAGE_W,
} from './rolodex/tokens';
import {
  isAtRoundEnd,
  reviewedCount,
  buildOrderedRound,
  type RoundState,
} from './round';
import {
  anchoredIndex,
  getReviewSessionPreferences,
  getReviewSessionRandomOrder,
  orderFilteredQuotes,
  randomOrderForQuotes,
  replaceQuotesKeepingSequence,
  setReviewSessionPreferences,
  setReviewSessionRandomOrder,
  type ReviewPreferences,
} from './excerptFeedState';
import ReviewSettingsPopover from './ReviewSettingsPopover';
import DualColumnFeed from './DualColumnFeed';
import ExcerptReader from './ExcerptReader';
import { usePrefetchOnIdle } from '../hooks/usePrefetchOnIdle';
import { prefetchShareSheet } from '../components/sheets/shareSheetLoader';
import ShareSheetHost from '../components/sheets/ShareSheetHost';
const ROUND_END_DWELL_MS = 1200;
const SWAP_FADE_MS = 220;

const screenReaderOnly = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

export default function ReviewPage({ onBack }: { onBack: () => void }) {
  const [preferences, setPreferences] = useState<ReviewPreferences>(getReviewSessionPreferences);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [books, setBooks] = useState<Map<string, Book>>(() => new Map());
  const [visibleQuotes, setVisibleQuotes] = useState<Quote[]>([]);
  const [randomOrder, setRandomOrder] = useState<string[]>(getReviewSessionRandomOrder);
  const [round, setRound] = useState<RoundState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [scale, setScale] = useState(1);
  const [fading, setFading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [readerQuoteId, setReaderQuoteId] = useState<string | null>(null);
  const [shareQuoteId, setShareQuoteId] = useState<string | null>(null);
  const [favoritePendingIds, setFavoritePendingIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const areaRef = useRef<HTMLDivElement | null>(null);
  const settingsAnchorRef = useRef<HTMLDivElement | null>(null);
  const rolodexRef = useRef<RolodexHandle | null>(null);
  const quotesRef = useRef<Quote[]>([]);
  const visibleQuotesRef = useRef<Quote[]>([]);
  const preferencesRef = useRef(preferences);
  const currentQuoteIdRef = useRef<string | null>(null);
  const readerQuoteIdRef = useRef<string | null>(null);
  const shareQuoteIdRef = useRef<string | null>(null);
  const readerFocusRef = useRef<HTMLElement | null>(null);
  const forceFirstAnchorRef = useRef(false);
  const favoritePendingRef = useRef(new Set<string>());
  const toastTimerRef = useRef<number | undefined>(undefined);

  usePrefetchOnIdle(prefetchShareSheet);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);
  useEffect(() => { visibleQuotesRef.current = visibleQuotes; }, [visibleQuotes]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { currentQuoteIdRef.current = currentQuoteId; }, [currentQuoteId]);
  useEffect(() => { readerQuoteIdRef.current = readerQuoteId; }, [readerQuoteId]);
  useEffect(() => { shareQuoteIdRef.current = shareQuoteId; }, [shareQuoteId]);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    setLoadError('');
    Promise.all([getAllQuotes(), getAllBooks()])
      .then(([allQuotes, allBooks]) => {
        if (!alive) return;
        const prefs = preferencesRef.current;
        const sessionOrder = getReviewSessionRandomOrder();
        const order = prefs.sortMode === 'random'
          ? (sessionOrder.length > 0 ? sessionOrder : randomOrderForQuotes(allQuotes))
          : [];
        if (prefs.sortMode === 'random') setReviewSessionRandomOrder(order);
        const next = orderFilteredQuotes(allQuotes, prefs, order);
        const anchor = prefs.viewMode === 'feed' ? null : currentQuoteIdRef.current;
        const deck = buildOrderedRound(next, anchor);
        const activeId = next[anchoredIndex(next.map((quote) => quote.id), anchor)]?.id ?? null;
        setQuotes(allQuotes);
        setBooks(new Map(allBooks.map((book) => [book.id, book])));
        setRandomOrder(order);
        setVisibleQuotes(next);
        setRound(deck);
        setCurrentQuoteId(activeId);
        setLoaded(true);
      })
      .catch((error) => {
        console.error('[Review] 读取摘录失败:', error);
        if (!alive) return;
        setLoadError('回顾内容加载失败，请检查本地数据后重试。');
        setLoaded(true);
      });
    return () => { alive = false; };
  }, [retryTrigger]);

  useLayoutEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setScale(Math.max(0.35, Math.min(
        rect.width / STAGE_W,
        rect.height / STAGE_INK_H,
        MAX_STAGE_SCALE,
      )));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loaded || loadError) return;
    const order = preferences.sortMode === 'random'
      ? (randomOrder.length ? randomOrder : randomOrderForQuotes(quotesRef.current))
      : [];
    if (preferences.sortMode === 'random' && order !== randomOrder) {
      setReviewSessionRandomOrder(order);
      setRandomOrder(order);
    }
    const next = orderFilteredQuotes(quotesRef.current, preferences, order);
    const forcedFirst = forceFirstAnchorRef.current;
    forceFirstAnchorRef.current = false;
    const anchor = forcedFirst ? null : currentQuoteIdRef.current;
    const activeId = next[anchoredIndex(next.map((quote) => quote.id), anchor)]?.id ?? null;
    setVisibleQuotes(next);
    setRound(buildOrderedRound(next, activeId));
    setCurrentQuoteId(activeId);
  }, [
    loaded,
    loadError,
    preferences.viewMode,
    preferences.readFilter,
    preferences.favoritesOnly,
    preferences.sortMode,
    randomOrder,
  ]);

  const handleReviewed = useCallback((quote: Quote) => {
    const at = new Date().toISOString();
    setQuotes((previous) =>
      previous.map((item) => item.id === quote.id
        ? { ...item, lastReviewedAt: at, reviewCount: (item.reviewCount ?? 0) + 1 }
        : item),
    );
    markQuoteReviewed(quote.id, at).catch((error) => {
      console.warn('[Review] 记录回顾失败:', error);
    });
  }, []);

  const handleIndexChange = useCallback((nextIndex: number) => {
    setRound((previous) => {
      if (!previous) return previous;
      const entry = previous.deck[nextIndex];
      if (entry?.kind === 'excerpt') setCurrentQuoteId(entry.quote.id);
      return { ...previous, index: nextIndex };
    });
  }, []);

  const atRoundEnd = round !== null && isAtRoundEnd(round);

  useEffect(() => {
    if (!atRoundEnd || !round) return;
    let inner = 0;
    const outer = window.setTimeout(() => {
      setFading(true);
      inner = window.setTimeout(() => {
        setRound((previous) => {
          if (!previous) return previous;
          const entry = previous.deck[0];
          if (entry?.kind === 'excerpt') setCurrentQuoteId(entry.quote.id);
          return { ...previous, index: 0 };
        });
        setFading(false);
      }, SWAP_FADE_MS);
    }, ROUND_END_DWELL_MS);
    return () => {
      window.clearTimeout(outer);
      window.clearTimeout(inner);
    };
  }, [atRoundEnd, round]);

  const openReader = useCallback((quote: Quote) => {
    readerFocusRef.current = document.activeElement as HTMLElement | null;
    currentQuoteIdRef.current = quote.id;
    setCurrentQuoteId(quote.id);
    setSettingsOpen(false);
    readerQuoteIdRef.current = quote.id;
    setReaderQuoteId(quote.id);
    try {
      const previousState = { ...(window.history.state || {}) };
      delete previousState.reviewSettings;
      window.history.replaceState(previousState, '');
      window.history.pushState({ ...previousState, reviewReader: true }, '');
    } catch {
      // 某些嵌入式 WebView 禁用 history，文本内仍有关闭按钮和 Esc。
    }
  }, []);

  const closeReader = useCallback(() => {
    readerQuoteIdRef.current = null;
    setReaderQuoteId(null);
    setShareQuoteId(null);
    const focusTarget = readerFocusRef.current;
    readerFocusRef.current = null;
    window.setTimeout(() => focusTarget?.focus?.(), 0);
    try {
      if (window.history.state?.reviewReader) window.history.back();
    } catch {
      // 没有 history 时直接关闭。
    }
  }, []);

  const openShare = useCallback((quote: Quote) => {
    shareQuoteIdRef.current = quote.id;
    setShareQuoteId(quote.id);
    try {
      window.history.pushState({ ...(window.history.state || {}), reviewShare: true }, '');
    } catch {
      // 无 history 时仍可用编辑器自己的关闭按钮返回。
    }
  }, []);

  const closeShare = useCallback(() => {
    shareQuoteIdRef.current = null;
    setShareQuoteId(null);
    try {
      if (window.history.state?.reviewShare) window.history.back();
    } catch {
      // 没有 history 时已经完成关闭。
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (shareQuoteIdRef.current) {
        shareQuoteIdRef.current = null;
        setShareQuoteId(null);
        return;
      }
      if (!readerQuoteIdRef.current) return;
      const focusTarget = readerFocusRef.current;
      readerFocusRef.current = null;
      readerQuoteIdRef.current = null;
      setReaderQuoteId(null);
      window.setTimeout(() => focusTarget?.focus?.(), 0);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (shareQuoteId) {
          event.preventDefault();
          closeShare();
          return;
        }
        if (readerQuoteId) {
          event.preventDefault();
          closeReader();
          return;
        }
        if (settingsOpen) return; // 浮层自己的 capture listener 先处理并恢复焦点。
        event.preventDefault();
        onBack();
        return;
      }
      if (readerQuoteId || settingsOpen) return;
      if (preferences.viewMode !== 'flip') return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
        event.preventDefault();
        rolodexRef.current?.go(1);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
        event.preventDefault();
        rolodexRef.current?.go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeReader, closeShare, onBack, preferences.viewMode, readerQuoteId, settingsOpen, shareQuoteId]);

  const handlePreferencesChange = useCallback((next: ReviewPreferences) => {
    if (
      next.sortMode === 'random'
      && preferencesRef.current.sortMode !== 'random'
      && randomOrder.length === 0
    ) {
      const nextOrder = randomOrderForQuotes(quotesRef.current);
      setReviewSessionRandomOrder(nextOrder);
      setRandomOrder(nextOrder);
    }
    preferencesRef.current = next;
    setPreferences(next);
    setReviewSessionPreferences(next);
  }, [randomOrder.length]);

  const handleShuffle = useCallback(() => {
    forceFirstAnchorRef.current = true;
    setCurrentQuoteId(null);
    const nextOrder = randomOrderForQuotes(quotesRef.current);
    setReviewSessionRandomOrder(nextOrder);
    setRandomOrder(nextOrder);
  }, []);

  const handleToggleFavorite = useCallback(async (quote: Quote) => {
    if (favoritePendingRef.current.has(quote.id)) return;
    favoritePendingRef.current.add(quote.id);
    const live = quotesRef.current.find((item) => item.id === quote.id) ?? quote;
    const previous = Boolean(live.isFavorite);
    const desired = !previous;
    setFavoritePendingIds((current) => new Set(current).add(quote.id));
    setQuotes((current) => current.map((item) =>
      item.id === quote.id ? { ...item, isFavorite: desired } : item
    ));
    setVisibleQuotes((current) => current.map((item) =>
      item.id === quote.id ? { ...item, isFavorite: desired } : item
    ));
    try {
      await setQuoteFavorite(quote.id, desired);
    } catch (error) {
      console.error('[Review] 收藏写入失败:', error);
      setQuotes((current) => current.map((item) =>
        item.id === quote.id ? { ...item, isFavorite: previous } : item
      ));
      setVisibleQuotes((current) => current.map((item) =>
        item.id === quote.id ? { ...item, isFavorite: previous } : item
      ));
      showToast('收藏失败，已恢复原来的状态');
    } finally {
      favoritePendingRef.current.delete(quote.id);
      setFavoritePendingIds((current) => {
        const next = new Set(current);
        next.delete(quote.id);
        return next;
      });
    }
  }, [showToast]);

  const handleViewed = useCallback(async (quote: Quote) => {
    const live = quotesRef.current.find((item) => item.id === quote.id) ?? quote;
    if (live.viewedAt) return;
    const viewedAt = new Date().toISOString();
    // 只替换对象，不重建 visibleQuotes：返回双列后圆点更新，但当前顺序和位置不变。
    setVisibleQuotes((current) => replaceQuotesKeepingSequence(current, [
      { ...live, viewedAt },
    ]));
    setQuotes((current) => current.map((item) =>
      item.id === quote.id ? { ...item, viewedAt } : item
    ));
    try {
      await markQuoteViewed(quote.id, viewedAt);
    } catch (error) {
      console.error('[Review] 记录看过失败:', error);
      setQuotes((current) => current.map((item) =>
        item.id === quote.id ? { ...item, viewedAt: undefined } : item
      ));
      showToast('记录“看过”失败，请稍后重试');
    }
  }, [showToast]);

  const current = round ? round.deck[round.index] : undefined;
  const currentQuote = current?.kind === 'excerpt'
    ? quotes.find((quote) => quote.id === current.quote.id) ?? current.quote
    : null;
  const reviewed = round ? reviewedCount(round) : 0;
  const bookOf = useCallback((bookId: string) => books.get(bookId) ?? null, [books]);
  const readerQuote = readerQuoteId ? quotes.find((quote) => quote.id === readerQuoteId) ?? null : null;
  const shareQuote = shareQuoteId ? quotes.find((quote) => quote.id === shareQuoteId) ?? null : null;
  const sourceBook = readerQuote ? books.get(readerQuote.bookId) ?? null : null;
  const shareBook = shareQuote ? books.get(shareQuote.bookId) ?? null : null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'calc(6px + env(safe-area-inset-top)) 14px 0',
        }}
      >
        <button
          type="button"
          onClick={() => { if (!settingsOpen) onBack(); }}
          aria-label="返回"
          style={iconButtonStyle}
        >
          <ChevronLeft size={19} strokeWidth={1.9} />
        </button>
        <ReviewSettingsPopover
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          anchorRef={settingsAnchorRef}
          preferences={preferences}
          onChange={handlePreferencesChange}
          onShuffle={handleShuffle}
        />
      </header>

      <div
        ref={areaRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {!loaded && <Spinner label="正在取摘录…" />}
        {loaded && loadError && (
          <EmptyState
            message="暂时打不开回顾"
            hint={loadError}
            action={{ label: '重试', onClick: () => setRetryTrigger((value) => value + 1) }}
          />
        )}
        {loaded && !loadError && visibleQuotes.length === 0 && (
          <EmptyState
            message="当前筛选下没有摘录"
            hint={quotes.length === 0 ? '去书里划几段喜欢的句子吧' : '调整筛选条件后再看看'}
          />
        )}

        {loaded && !loadError && visibleQuotes.length > 0 && preferences.viewMode === 'feed' && (
          <DualColumnFeed
            quotes={visibleQuotes}
            books={books}
            preferences={preferences}
            randomOrder={randomOrder}
            initialQuoteId={currentQuoteId}
            favoritePendingIds={favoritePendingIds}
            onOpenQuote={openReader}
            onToggleFavorite={handleToggleFavorite}
            onCurrentQuoteChange={setCurrentQuoteId}
          />
        )}

        {loaded && !loadError && visibleQuotes.length > 0 && preferences.viewMode === 'flip' && round && (
          <motion.div
            animate={{ opacity: fading ? 0 : 1 }}
            transition={{ duration: SWAP_FADE_MS / 1000, ease: 'easeInOut' }}
            style={{
              width: STAGE_W,
              height: STAGE_H,
              flex: '0 0 auto',
              transform: `translateY(${((STAGE_PAD_BOTTOM - STAGE_PAD_TOP) / 2) * scale}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <Rolodex
              ref={rolodexRef}
              deck={round.deck}
              index={round.index}
              scale={scale}
              bookOf={bookOf}
              onReviewed={handleReviewed}
              onIndexChange={handleIndexChange}
              onOpenFull={openReader}
            />
          </motion.div>
        )}
      </div>

      {preferences.viewMode === 'flip' && (
        <div style={{ flex: '0 0 auto', height: 'calc(4px + env(safe-area-inset-bottom))' }} />
      )}

      <p aria-live="polite" style={screenReaderOnly}>
        {preferences.viewMode === 'feed'
          ? `双列流，共 ${visibleQuotes.length} 条摘录`
          : round && round.count > 0
            ? `第 ${reviewed + 1} 张，共 ${round.count} 张。${currentQuote?.text.slice(0, 80) ?? ''}`
            : ''}
      </p>

      <AnimatePresence>
        {readerQuote && (
          <ExcerptReader
            key={readerQuote.id}
            quote={readerQuote}
            book={sourceBook}
            favoritePending={favoritePendingIds.has(readerQuote.id)}
            shareOpen={shareQuoteId !== null}
            onBack={closeReader}
            onToggleFavorite={handleToggleFavorite}
            onShare={openShare}
            onViewed={handleViewed}
          />
        )}
      </AnimatePresence>

      {shareQuote && (
        <ShareSheetHost
          open
          onClose={closeShare}
          quote={shareQuote}
          bookTitle={shareBook?.title || '未知书目'}
          bookAuthor={shareBook?.author || '作者未知'}
          initialTemplate="calendar"
        />
      )}

      {toast && <div className="review-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}

const iconButtonStyle = {
  width: 44,
  height: 44,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  borderRadius: '50%',
  border: 0,
  background: 'transparent',
  color: 'rgba(55,51,46,0.58)',
  cursor: 'pointer',
} as const;

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="review-spinner" />
      <div style={{ fontFamily: SERIF_STACK, fontSize: 13, letterSpacing: 1.5, color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

function EmptyState({
  message,
  hint,
  action,
}: {
  message: string;
  hint: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24, textAlign: 'center' }}>
      <div style={{ fontFamily: HAND_STACK, fontSize: 26, color: 'var(--color-text)' }}>{message}</div>
      <div style={{ fontFamily: SERIF_STACK, fontSize: 13, lineHeight: 1.7, letterSpacing: 0.7, color: 'var(--color-text-secondary)' }}>{hint}</div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{ marginTop: 8, padding: '8px 18px', borderRadius: 999, border: '1px solid rgba(32,35,42,0.18)', background: 'var(--color-bg-card)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
