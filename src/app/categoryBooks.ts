/**
 * 「分类里的全部书籍」网格页的纯逻辑。
 *
 * 这一页的活儿是在一个分类里快速找到某本书，所以真正的分支只有两处：
 * 搜索（书名和作者都要能命中，大小写不敏感，首尾空格忽略）和「读完」筛选。
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

// ─── 「读完」筛选 ───────────────────────────────────────────────────────
// 都是「看的角度」，不是书籍数据本身：所以这些函数一律不改入参、也不写回
// sortOrder。用户手动拖出来的自定义顺序是唯一被持久化的那份顺序。

/**
 * 「读完」三态里去掉「未标记」剩下的两态：没标记读完的书就是**正在阅读**，
 * 所以 `unfinished` 在界面上叫「正在阅读」，两态不重不漏地拼成 `all`。
 */
export type FinishedFilter = 'all' | 'finished' | 'unfinished';

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

export interface ArrangeCategoryBooksOptions {
  query: string;
  finished: FinishedFilter;
}

/**
 * 网格页实际的展示顺序：先搜索、再筛读完。
 * 再往后就是调用方给的原顺序（用户拖拽出来的 sortOrder），这里不做任何重排。
 */
export function arrangeCategoryBooks<T extends Pick<Book, 'title' | 'author' | 'finishedAt'>>(
  books: T[],
  { query, finished }: ArrangeCategoryBooksOptions,
): T[] {
  return filterByFinished(filterCategoryBooks(books, query), finished);
}
