import { supabase, getCurrentUser } from './client';
import type { Category, Book, Quote } from '../types';

// layout / spineTemplate 未参与同步：换设备后会回落到默认值；补齐需远端 books 表加列。
// ─── Push local data to Supabase ──────────────────────────────────────────────

const CATEGORY_BATCH_SIZE = 100;
const BOOK_BATCH_SIZE = 20;
const QUOTE_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function describeSyncError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return String(error);
}

function syncError(label: string, error: unknown): Error {
  return new Error(`${label}：${describeSyncError(error)}`);
}

async function upsertBatches(
  table: 'categories' | 'books' | 'quotes',
  rows: Array<Record<string, unknown>>,
  batchSize: number,
  failureLabel: string
): Promise<void> {
  for (const batch of chunk(rows, batchSize)) {
    const { error } = await supabase.from(table).upsert(batch);
    if (error) throw syncError(failureLabel, error);
  }
}

export async function pushAllData(
  categories: Category[],
  books: Book[],
  quotes: Quote[]
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('未登录');

  const categoryRows = categories.map(cat => ({
    id: cat.id,
    user_id: user.id,
    name: cat.name,
    sort_order: cat.order ?? 0,
  }));
  await upsertBatches(
    'categories',
    categoryRows,
    CATEGORY_BATCH_SIZE,
    '云端分类备份失败'
  );

  const syncedBooks = books.filter(book => {
    if (book.categoryId) return true;
    console.warn('[pushAllData] 跳过缺少 categoryId 的书籍: ' + book.title);
    return false;
  });
  const bookRows = syncedBooks.map(book => ({
    id: book.id,
    user_id: user.id,
    category_id: book.categoryId,
    title: book.title,
    author: book.author ?? '',
    cover_type: book.coverType ?? null,
    cover_data: book.coverData ?? null,
    sort_order: book.sortOrder ?? 0,
    created_at: book.createdAt,
  }));
  await upsertBatches(
    'books',
    bookRows,
    BOOK_BATCH_SIZE,
    '云端书籍备份失败'
  );

  // 新字段需要远端表先执行 supabase_schema.sql。这里在删除任何摘录前做一次能力探测，
  // 避免旧库缺少列时先删成功、随后每次 upsert 都失败，把云端摘录清空。
  const { error: quoteSchemaError } = await supabase
    .from('quotes')
    .select('chapter, is_favorite, viewed_at, created_at')
    .limit(1);
  if (quoteSchemaError) {
    throw new Error('云端 quotes 表缺少回顾字段，请先执行 supabase_schema.sql 中的迁移。');
  }

  // Delete existing quotes for these books, then insert fresh
  const bookIds = books.map(b => b.id);
  if (bookIds.length > 0) {
    const { error } = await supabase.from('quotes').delete().in('book_id', bookIds);
    if (error) throw syncError('云端摘录清理失败', error);
  }

  const quoteRows = quotes.map(quote => ({
    id: quote.id,
    user_id: user.id,
    book_id: quote.bookId,
    text: quote.text,
    thought: quote.thought ?? '',
    page: quote.page ?? null,
    chapter: quote.chapter ?? null,
    date: quote.date,
    created_at: quote.createdAt,
    is_favorite: Boolean(quote.isFavorite),
    viewed_at: quote.viewedAt ?? null,
    color: quote.color ?? null,
    text_mark_color: quote.textMarkColor ?? null,
    thought_mark_color: quote.thoughtMarkColor ?? null,
    order: 0,
  }));
  await upsertBatches(
    'quotes',
    quoteRows,
    QUOTE_BATCH_SIZE,
    '云端摘录备份失败'
  );
}

// ─── Pull remote data from Supabase ───────────────────────────────────────────

export async function pullAllData(): Promise<{
  categories: Category[];
  books: Book[];
  quotes: Quote[];
}> {
  const user = await getCurrentUser();
  if (!user) throw new Error('未登录');

  const [{ data: cats }, { data: books }, { data: quotes }] = await Promise.all([
    supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order'),
    supabase.from('books').select('*').eq('user_id', user.id).order('created_at'),
    supabase.from('quotes').select('*').eq('user_id', user.id),
  ]);

  return {
    categories: (cats || []).map(c => ({
      id: c.id,
      name: c.name,
      isPreset: false,
      order: c.sort_order || 0,
      sortOrder: c.sort_order || 0,
      color: c.color,
      createdAt: new Date().toISOString(),
    })) as Category[],
    books: (books || []).map(b => ({
      id: b.id,
      categoryId: b.category_id,
      title: b.title,
      author: b.author || '',
      coverType: (b.cover_type as any) || null,
      coverData: b.cover_data || null,
      sortOrder: b.sort_order || 0,
      createdAt: b.created_at || new Date().toISOString(),
      updatedAt: b.created_at || new Date().toISOString(),
    })) as Book[],
    quotes: (quotes || []).map(q => ({
      id: q.id,
      bookId: q.book_id,
      text: q.text,
      thought: q.thought || '',
      page: q.page || null,
      chapter: q.chapter || null,
      date: q.date || new Date().toISOString(),
      viewedAt: q.viewed_at || null,
      isFavorite: Boolean(q.is_favorite),
      color: q.color || undefined,
      textMarkColor: q.text_mark_color || undefined,
      thoughtMarkColor: q.thought_mark_color || undefined,
      createdAt: q.created_at || q.date || new Date().toISOString(),
      updatedAt: q.date || new Date().toISOString(),
      order: q.order || 0,
    })) as Quote[],
  };
}
