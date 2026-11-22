import type { Quote } from '../types';

export type ReviewViewMode = 'flip' | 'feed';
export type ReviewReadFilter = 'all' | 'unread' | 'viewed';
export type ReviewSortMode = 'latest' | 'random';

export interface ReviewPreferences {
  viewMode: ReviewViewMode;
  readFilter: ReviewReadFilter;
  favoritesOnly: boolean;
  sortMode: ReviewSortMode;
}

export const VIEW_MODE_STORAGE_KEY = 'review.viewMode';
export const VIEW_DWELL_MS = 2_000;
export const FEED_PAGE_SIZE = 24;

export function isReviewViewMode(value: unknown): value is ReviewViewMode {
  return value === 'flip' || value === 'feed';
}

/** 冷启动只继承视图；筛选、收藏开关重置，排序默认随机。 */
export function createColdStartPreferences(persistedViewMode?: unknown): ReviewPreferences {
  return {
    viewMode: isReviewViewMode(persistedViewMode) ? persistedViewMode : 'flip',
    readFilter: 'all',
    favoritesOnly: false,
    sortMode: 'random',
  };
}

function readPersistedViewMode(): unknown {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  } catch {
    return undefined;
  }
}

/**
 * 模块实例就是一次页面运行时。回顾页被关闭再打开时，筛选和排序从这个对象恢复；
 * 浏览器进程被彻底结束并重新加载 JS 后，模块重新初始化，只读取持久化的 viewMode。
 */
let sessionPreferences = createColdStartPreferences(readPersistedViewMode());
let sessionRandomOrder: string[] = [];

export function getReviewSessionPreferences(): ReviewPreferences {
  return { ...sessionPreferences };
}

export function setReviewSessionPreferences(next: ReviewPreferences): void {
  sessionPreferences = { ...next };
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, next.viewMode);
  } catch {
    // 隐私模式或配额失败时只在本次会话有效，不影响页面操作。
  }
}

export function getReviewSessionRandomOrder(): string[] {
  return [...sessionRandomOrder];
}

export function setReviewSessionRandomOrder(next: readonly string[]): void {
  sessionRandomOrder = [...next];
}

export function isQuoteViewed(quote: Quote): boolean {
  return Boolean(quote.viewedAt);
}

export function isQuoteFavorite(quote: Quote): boolean {
  return Boolean(quote.isFavorite);
}

/** 以目标值写入收藏；当前值已相同时不需要落库。 */
export function favoriteWriteNeeded(current: boolean | undefined, desired: boolean): boolean {
  return Boolean(current) !== desired;
}

function createdTime(quote: Quote): number {
  const value = new Date(quote.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** createdAt 倒序；时间相同按 quoteId 升序，保证跨设备/多次读取都稳定。 */
export function sortQuotesLatest(quotes: readonly Quote[]): Quote[] {
  return [...quotes].sort((a, b) => {
    const delta = createdTime(b) - createdTime(a);
    return delta || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export function shuffleQuoteIds(
  quoteIds: readonly string[],
  rng: () => number = Math.random,
): string[] {
  const result = [...quoteIds];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.min(Math.max(rng(), 0), 0.999999999999) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function randomOrderForQuotes(
  quotes: readonly Quote[],
  rng: () => number = Math.random,
): string[] {
  return shuffleQuoteIds(quotes.map((quote) => quote.id), rng);
}

export function filterReviewQuotes(
  quotes: readonly Quote[],
  preferences: Pick<ReviewPreferences, 'readFilter' | 'favoritesOnly'>,
): Quote[] {
  return quotes.filter((quote) => {
    if (preferences.favoritesOnly && !isQuoteFavorite(quote)) return false;
    if (preferences.readFilter === 'unread' && isQuoteViewed(quote)) return false;
    if (preferences.readFilter === 'viewed' && !isQuoteViewed(quote)) return false;
    return true;
  });
}

/**
 * 从已经冻结的随机序列里筛出当前符合条件的项。它不会重新洗牌，也不复制或遗漏 id。
 */
export function orderFilteredQuotes(
  quotes: readonly Quote[],
  preferences: Pick<ReviewPreferences, 'readFilter' | 'favoritesOnly' | 'sortMode'>,
  randomOrder: readonly string[] = [],
): Quote[] {
  const eligible = filterReviewQuotes(quotes, preferences);
  if (preferences.sortMode === 'latest') return sortQuotesLatest(eligible);

  const byId = new Map(eligible.map((quote) => [quote.id, quote]));
  const ordered: Quote[] = [];
  const used = new Set<string>();
  for (const id of randomOrder) {
    const quote = byId.get(id);
    if (!quote || used.has(id)) continue;
    ordered.push(quote);
    used.add(id);
  }
  // 防御旧数据/并发加入的新摘录：随机序列生成后若出现未收录 id，仍按稳定顺序补在末尾。
  for (const quote of sortQuotesLatest(eligible)) {
    if (!used.has(quote.id)) ordered.push(quote);
  }
  return ordered;
}

/**
 * 卡片上的收藏/看过状态变了，但当前序列必须保持不动，直到用户离开回顾页。
 * 这个 helper 只替换对象，绝不重新筛选 id。
 */
export function replaceQuotesKeepingSequence(
  sequence: readonly Quote[],
  latestQuotes: readonly Quote[],
): Quote[] {
  const byId = new Map(latestQuotes.map((quote) => [quote.id, quote]));
  return sequence.map((quote) => byId.get(quote.id) ?? quote);
}

export function pageQuoteIds(quoteIds: readonly string[], visibleCount: number): string[] {
  return quoteIds.slice(0, Math.max(0, Math.min(visibleCount, quoteIds.length)));
}

/** 0/1/2/3 条数据都用同一套左、右两格组织；右格空缺时保持左格原位置。 */
export function pairQuoteRows<T>(items: readonly T[]): Array<[T, T?]> {
  const rows: Array<[T, T?]> = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items[i + 1] === undefined ? [items[i]] : [items[i], items[i + 1]]);
  }
  return rows;
}

/** 过滤器切换或从另一视图回来时，优先停回同一个 quoteId。 */
export function anchoredIndex(quoteIds: readonly string[], currentQuoteId: string | null): number {
  if (!currentQuoteId) return 0;
  const index = quoteIds.indexOf(currentQuoteId);
  return index >= 0 ? index : 0;
}

export function formatReviewDate(value: string): string {
  const match = (value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : value || '';
}

export interface DwellClock {
  setActive(active: boolean, nowMs?: number): void;
  elapsed(nowMs?: number): number;
  reached(nowMs?: number): boolean;
  isActive(): boolean;
}

/**
 * 纯计时器，不直接绑 React。前台且未遮挡时累计，后台/弹层遮挡时冻结累计值。
 * 只有累计达到阈值才返回 reached，调用方再执行一次幂等数据库写入。
 */
export function createDwellClock(thresholdMs: number = VIEW_DWELL_MS): DwellClock {
  let active = false;
  let accumulated = 0;
  let activeSince: number | null = null;

  return {
    setActive(next, nowMs = Date.now()) {
      if (next === active) return;
      if (active && activeSince !== null) accumulated += Math.max(0, nowMs - activeSince);
      active = next;
      activeSince = next ? nowMs : null;
    },
    elapsed(nowMs = Date.now()) {
      const current = active && activeSince !== null ? Math.max(0, nowMs - activeSince) : 0;
      return accumulated + current;
    },
    reached(nowMs = Date.now()) {
      return this.elapsed(nowMs) >= thresholdMs;
    },
    isActive() {
      return active;
    },
  };
}
