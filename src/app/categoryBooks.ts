/**
 * 「分类里的全部书籍」网格页的纯逻辑。
 *
 * 这一页的活儿是在一个分类里快速找到某本书，所以真正的分支只有两处：
 * 搜索（书名和作者都要能命中，大小写不敏感，首尾空格忽略）和「读完」筛选/排序。
 * 抽出来单独测，免得以后改搜索框或加筛选顺手把「作者也能搜到」「排序不动书序」
 * 弄丢——那都属于肉眼不容易立刻发现的回归。
 */
import type { Book } from './types';

/** 网格列数，跟页面上的 grid-template-columns 保持一致 */
export const CATEGORY_GRID_COLUMNS = 3;

type SearchableBook = Pick<Book, 'title' | 'author'>;

export function normalizeBookQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** 书名或作者包含关键词即命中；空关键词视为全部命中 */
export function matchesBookQuery(book: SearchableBook, query: string): boolean {
  const q = normalizeBookQuery(query);
  if (!q) return true;
  return (
    normalizeBookQuery(book.title).includes(q) || normalizeBookQuery(book.author).includes(q)
  );
}

/**
 * 按关键词过滤分类内的书。
 * 无关键词时原样返回入参（保持调用方传进来的顺序），避免多一次复制。
 */
export function filterCategoryBooks<T extends SearchableBook>(books: T[], query: string): T[] {
  if (!normalizeBookQuery(query)) return books;
  return books.filter((book) => matchesBookQuery(book, query));
}

// ─── 「读完」筛选与排序 ───────────────────────────────────────────────────────
// 都是「看的角度」，不是书籍数据本身：所以这些函数一律不改入参、也不写回
// sortOrder。用户手动拖出来的自定义顺序是唯一被持久化的那份顺序。

export type FinishedFilter = 'all' | 'finished' | 'unfinished';
export type BookSort = 'custom' | 'recentFinished';

/**
 * 按有没有读完过滤。
 * `all` 时原样返回入参（顺序不动，也不复制），跟 filterCategoryBooks 一个规矩。
 */
export function filterByFinished<T extends Pick<Book, 'finishedAt'>>(
  books: T[],
  filter: FinishedFilter,
): T[] {
  if (filter === 'all') return books;
  const wantFinished = filter === 'finished';
  return books.filter((book) => !!book.finishedAt === wantFinished);
}

/**
 * 排序。「自定义顺序」= 调用方给的顺序（getAllBooks 出来的 sortOrder asc → createdAt desc），
 * 原样返回；「最近读完」把标记时间新的排前面，没标记的一律沉底。
 *
 * 同组内用「原数组下标」当兜底比较，不依赖 Array.sort 的稳定性——
 * 稳定性是规范里较新的保证，靠它不如自己写清楚。
 * finishedAt 是坏字符串（解析不出时间）时按「没读完」处理，别让它插到读完那组里。
 */
export function sortBooks<T extends Pick<Book, 'id' | 'finishedAt'>>(
  books: T[],
  sort: BookSort,
): T[] {
  if (sort === 'custom') return books;

  const originalIndex = new Map(books.map((book, i) => [book.id, i] as const));
  const finishedTime = (book: T): number => {
    if (!book.finishedAt) return NaN;
    const t = Date.parse(book.finishedAt);
    return Number.isNaN(t) ? NaN : t;
  };

  return [...books].sort((a, b) => {
    const ta = finishedTime(a);
    const tb = finishedTime(b);
    const aDone = !Number.isNaN(ta);
    const bDone = !Number.isNaN(tb);
    if (aDone !== bDone) return aDone ? -1 : 1;
    if (aDone && ta !== tb) return tb - ta;
    return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
  });
}

export interface ArrangeCategoryBooksOptions {
  query: string;
  finished: FinishedFilter;
  sort: BookSort;
}

/** 网格页实际的展示顺序：先搜索、再筛读完、最后排序。 */
export function arrangeCategoryBooks<T extends Pick<Book, 'id' | 'title' | 'author' | 'finishedAt'>>(
  books: T[],
  { query, finished, sort }: ArrangeCategoryBooksOptions,
): T[] {
  return sortBooks(filterByFinished(filterCategoryBooks(books, query), finished), sort);
}
