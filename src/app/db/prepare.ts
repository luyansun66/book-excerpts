import type { Book, Category, Quote } from '../types'

export interface ExportData {
  exportDate: string;
  version: number;
  categories: Category[];
  books: Book[];
  quotes: Quote[];
}

export interface PreparedImport {
  data: ExportData;
  repairedCount: number;
}

export interface ImportResult {
  categories: number;
  books: number;
  quotes: number;
}

/**
 * 修复导入数据中分类关联不完整的书籍：
 * 书没有 categoryId，或 categoryId 指向不存在的分类时，
 * 归入第一个分类，并返回修复数量供 UI 提示。
 */
export function prepareImportData(data: ExportData): PreparedImport {
  const categoryIds = new Set(data.categories.map((c) => c.id));
  const firstCategoryId = data.categories[0]?.id;
  let repairedCount = 0;

  const books = data.books.map((book) => {
    if (book.categoryId && categoryIds.has(book.categoryId)) return book;
    if (!firstCategoryId) return book;
    repairedCount += 1;
    return { ...book, categoryId: firstCategoryId };
  });

  return {
    data: { ...data, books },
    repairedCount,
  };
}
