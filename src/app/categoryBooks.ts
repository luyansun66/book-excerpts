/**
 * 「分类里的全部书籍」网格页的纯逻辑。
 *
 * 这一页的活儿是在一个分类里快速找到某本书，所以真正有分支的只有搜索这一步：
 * 书名和作者都要能命中，大小写不敏感，首尾空格忽略。抽出来单独测，
 * 免得以后改搜索框顺手把「作者也能搜到」弄丢——那属于肉眼不容易立刻发现的回归。
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
