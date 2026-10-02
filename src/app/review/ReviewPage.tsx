// ─── 摘录回顾页 ───────────────────────────────────────────────────────────────
//
// 一整页只做一件事：把摘录库随机翻成一轮，让用户在名片架上一张张过。
// 页面负责三件架子管不着的事：把卡片数据凑齐（摘录 + 它所属的书）、把舞台缩放到
// 屏幕里、以及一轮翻完之后重开一轮。
//
// 重开的那一段刻意分成两拍：先让"本轮回顾完成"的过渡卡停 ROUND_END_DWELL_MS，
// 再淡出 → 换牌 → 淡入。直接原地换掉卡组的话，用户会以为界面出了 bug。

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronLeft, ChevronUp, X } from 'lucide-react';
import { getAllBooks, getAllQuotes, markQuoteReviewed } from '../db';
import type { Book, Quote } from '../types';
import Rolodex, { type RolodexHandle } from './rolodex/Rolodex';
import { COLORS, HAND_STACK, MAX_STAGE_SCALE, SERIF_STACK, STAGE_H, STAGE_W } from './rolodex/tokens';
import {
  buildRound,
  canGoNext,
  canGoPrev,
  isAtRoundEnd,
  recentQuotes,
  reviewedCount,
  type RoundState,
} from './round';

/** 一轮翻完后，过渡卡停留多久。 */
const ROUND_END_DWELL_MS = 1200;
/** 换牌时的淡出/淡入时长。 */
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
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [books, setBooks] = useState<Map<string, Book>>(() => new Map());
  const [round, setRound] = useState<RoundState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [fading, setFading] = useState(false);
  const [full, setFull] = useState<Quote | null>(null);

  const areaRef = useRef<HTMLDivElement | null>(null);
  const rolodexRef = useRef<RolodexHandle | null>(null);
  // 换下一轮时要用最新的摘录状态（刚翻过的那些已经带上新的回顾时间），
  // 而定时器是在上一帧闭包里跑的，所以从 ref 读。
  const quotesRef = useRef<Quote[]>([]);

  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  useEffect(() => {
    let alive = true;
    Promise.all([getAllQuotes(), getAllBooks()])
      .then(([allQuotes, allBooks]) => {
        if (!alive) return;
        setQuotes(allQuotes);
        setBooks(new Map(allBooks.map((b) => [b.id, b])));
        setRound(buildRound(allQuotes, []));
        setLoaded(true);
      })
      .catch((e) => {
        console.error('[Review] 读取摘录失败:', e);
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 舞台是一整块固定尺寸的实物，只整体缩放去适配。缩放写在中间这层，
  // 它跟加载态无关，所以观察器一次挂上就够。
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      setScale(Math.max(0.35, Math.min(rect.width / STAGE_W, rect.height / STAGE_H, MAX_STAGE_SCALE)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleReviewed = useCallback((quote: Quote) => {
    const at = new Date().toISOString();
    // 内存里也要跟着走：下一轮选卡读的是这份数据，不回写就会一直把刚看过的当"很久没看"。
    setQuotes((prev) =>
      prev.map((q) => (q.id === quote.id ? { ...q, lastReviewedAt: at, reviewCount: (q.reviewCount ?? 0) + 1 } : q)),
    );
    markQuoteReviewed(quote.id, at).catch((e) => console.warn('[Review] 记录回顾失败:', e));
  }, []);

  const handleIndexChange = useCallback((next: number) => {
    setRound((prev) => (prev ? { ...prev, index: next } : prev));
  }, []);

  const atRoundEnd = round !== null && isAtRoundEnd(round);

  useEffect(() => {
    if (!atRoundEnd || !round) return;
    let inner = 0;
    const outer = window.setTimeout(() => {
      setFading(true);
      inner = window.setTimeout(() => {
        setRound((prev) => (prev ? buildRound(quotesRef.current, recentQuotes(prev)) : prev));
        setFading(false);
      }, SWAP_FADE_MS);
    }, ROUND_END_DWELL_MS);
    return () => {
      window.clearTimeout(outer);
      window.clearTimeout(inner);
    };
  }, [atRoundEnd, round]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (full) setFull(null);
        else onBack();
        return;
      }
      if (full) return;
      // ↑ / → 往上翻（下一张），↓ / ← 往回翻。和手指在架子上滑的方向一致。
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        rolodexRef.current?.go(1);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        rolodexRef.current?.go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, onBack]);

  const current = round ? round.deck[round.index] : undefined;
  const currentQuote = current?.kind === 'excerpt' ? current.quote : null;
  const reviewed = round ? reviewedCount(round) : 0;
  const canPrev = round ? canGoPrev(round) : false;
  const canNext = round ? canGoNext(round) : false;

  const bookOf = useCallback((bookId: string) => books.get(bookId) ?? null, [books]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        // 回顾页是盖在书架上的整页浮层，底色必须和 App 主题一致，否则进出会看到明显的
        // 色块跳变；写死颜色在深色模式下也会一直停在浅色。
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 'calc(10px + env(safe-area-inset-top)) 14px 6px',
          flex: '0 0 auto',
        }}
      >
        <button type="button" onClick={onBack} aria-label="返回" style={iconButtonStyle}>
          <ChevronLeft size={19} strokeWidth={1.9} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF_STACK, fontSize: 16, letterSpacing: 3, color: 'var(--color-text)' }}>
            摘录回顾
          </div>
          <div style={{ fontFamily: SERIF_STACK, fontSize: 11.5, letterSpacing: 1.4, color: 'var(--color-text-secondary)', marginTop: 2 }}>
            {round && round.count > 0 ? `已重读 ${reviewed} / ${round.count}` : '把读过的好句子再过一遍'}
          </div>
        </div>
        <button type="button" onClick={onBack} aria-label="关闭" style={iconButtonStyle}>
          <X size={18} strokeWidth={1.9} />
        </button>
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
        {loaded && quotes.length === 0 && (
          <EmptyState message="还没有摘录可以回顾" hint="去书里划几段喜欢的句子吧" />
        )}
        {loaded && round && quotes.length > 0 && (
          <motion.div
            animate={{ opacity: fading ? 0 : 1 }}
            transition={{ duration: SWAP_FADE_MS / 1000, ease: 'easeInOut' }}
            style={{
              width: STAGE_W,
              height: STAGE_H,
              flex: '0 0 auto',
              transform: `scale(${scale})`,
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
              onOpenFull={setFull}
            />
          </motion.div>
        )}
      </div>

      <footer
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          padding: `4px 20px calc(14px + env(safe-area-inset-bottom))`,
        }}
      >
        <div style={{ display: 'flex', gap: 12 }}>
          <StepButton label="上一张" disabled={!canPrev} onClick={() => rolodexRef.current?.go(-1)}>
            <ChevronDown size={17} strokeWidth={2} />
          </StepButton>
          <StepButton label="下一张" disabled={!canNext} onClick={() => rolodexRef.current?.go(1)}>
            <ChevronUp size={17} strokeWidth={2} />
          </StepButton>
        </div>
        <div style={{ fontFamily: SERIF_STACK, fontSize: 11.5, letterSpacing: 1, color: 'var(--color-text-muted)' }}>
          上滑翻到下一张，下滑翻回上一张
        </div>
      </footer>

      {/* 屏幕阅读器靠这一段知道翻到了哪张；视觉上完全不可见。 */}
      <p aria-live="polite" style={screenReaderOnly}>
        {round && round.count > 0
          ? `第 ${reviewed} 张，共 ${round.count} 张。${currentQuote ? currentQuote.text.slice(0, 80) : '本轮回顾完成'}`
          : ''}
      </p>

      <AnimatePresence>
        {full && (
          <FullTextSheet
            quote={full}
            book={books.get(full.bookId) ?? null}
            onClose={() => setFull(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const iconButtonStyle = {
  width: 34,
  height: 34,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  border: '1px solid rgba(32,35,42,0.14)',
  background: 'rgba(255,255,255,0.72)',
  color: COLORS.ink,
  cursor: 'pointer',
} as const;

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        borderRadius: 999,
        border: '1px solid rgba(32,35,42,0.14)',
        background: 'rgba(255,255,255,0.72)',
        color: COLORS.ink,
        fontFamily: SERIF_STACK,
        fontSize: 13,
        letterSpacing: 1.5,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
      {label}
    </button>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div className="review-spinner" />
      <div style={{ fontFamily: SERIF_STACK, fontSize: 13, letterSpacing: 1.5, color: 'var(--color-text-secondary)' }}>{label}</div>
    </div>
  );
}

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 24 }}>
      <div style={{ fontFamily: HAND_STACK, fontSize: 26, color: 'var(--color-text)' }}>{message}</div>
      <div style={{ fontFamily: SERIF_STACK, fontSize: 13, letterSpacing: 1.5, color: 'var(--color-text-secondary)' }}>{hint}</div>
    </div>
  );
}

function FullTextSheet({ quote, book, onClose }: { quote: Quote; book: Book | null; onClose: () => void }) {
  const meta = [book?.author, quote.page == null ? '' : /^\d+$/.test(quote.page) ? `p.${quote.page}` : quote.page]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'flex-end',
        background: 'rgba(20,18,14,0.42)',
      }}
    >
      <motion.div
        initial={{ y: 44 }}
        animate={{ y: 0 }}
        exit={{ y: 44 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '78%',
          overflowY: 'auto',
          background: COLORS.paper,
          borderRadius: '18px 18px 0 0',
          padding: `22px 22px calc(26px + env(safe-area-inset-bottom))`,
          boxShadow: '0 -18px 40px rgba(18,20,26,0.28)',
        }}
      >
        <div
          style={{
            fontFamily: SERIF_STACK,
            fontSize: 16.5,
            lineHeight: 1.85,
            letterSpacing: 0.4,
            color: COLORS.ink,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {quote.text}
        </div>
        <div style={{ marginTop: 18, fontFamily: HAND_STACK, fontSize: 21, color: COLORS.ink }}>
          {book?.title || '未知书目'}
        </div>
        {meta && (
          <div style={{ marginTop: 4, fontFamily: HAND_STACK, fontSize: 15, color: COLORS.inkSoft }}>{meta}</div>
        )}
        <button
          type="button"
          onClick={onClose}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '11px 0',
            borderRadius: 999,
            border: '1px solid rgba(32,35,42,0.16)',
            background: 'rgba(32,35,42,0.05)',
            color: COLORS.ink,
            fontFamily: SERIF_STACK,
            fontSize: 13.5,
            letterSpacing: 3,
            cursor: 'pointer',
          }}
        >
          收起
        </button>
      </motion.div>
    </motion.div>
  );
}
