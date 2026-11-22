import { supabase, getCurrentUser } from './client';
import type { Category, Book, Quote } from '../types';

// layout / spineTemplate 未参与同步：换设备后会回落到默认值；补齐需远端 books 表加列。
// ─── Push local data to Supabase ──────────────────────────────────────────────

export async function pushAllData(
  categories: Category[],
  books: Book[],
  quotes: Quote[]
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('未登录');

  // Upsert categories
  for (const cat of categories) {
    await supabase.from('categories').upsert({
      id: cat.id,
      user_id: user.id,
      name: cat.name,
      sort_order: cat.order ?? 0,
    });
  }

  // Upsert books
  for (const book of books) {
    if (!book.categoryId) {
      console.warn('[pushAllData] 跳过缺少 categoryId 的书籍: ' + book.title);
      continue;
    }
    await supabase.from('books').upsert({
      id: book.id,
      user_id: user.id,
      category_id: book.categoryId,
      title: book.title,
      author: book.author ?? '',
      cover_type: book.coverType ?? null,
      cover_data: book.coverData ?? null,
      sort_order: book.sortOrder ?? 0,
      created_at: book.createdAt,
    });
  }

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
    await supabase.from('quotes').delete().in('book_id', bookIds);
  }

  for (const quote of quotes) {
    const { error } = await supabase.from('quotes').upsert({
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
    });
    if (error) throw error;
  }
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
