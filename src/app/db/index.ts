import Dexie, { type EntityTable } from 'dexie';
import type { Book, Category, Quote } from '../types';

// ─── Browser-compatible UUID generator ─────────────────────────────────────────
// crypto.randomUUID() may fail on some non-https contexts
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch { /* fall through */ }
  }
  // Fallback: timestamp + random
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 8)}`;
}

const DB_NAME = 'bookwrite';
const DB_VERSION = 1;

export class BookWriteDB extends Dexie {
  categories!: EntityTable<Category, 'id'>;
  books!: EntityTable<Book, 'id'>;
  quotes!: EntityTable<Quote, 'id'>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      categories: 'id, name, order, isPreset',
      books: 'id, title, author, categoryId, createdAt',
      quotes: 'id, bookId, text, date, createdAt',
    });
  }
}

export const db = new BookWriteDB();

// ─── Default preset categories ────────────────────────────────────────────────
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-lit', name: 'Literature', isPreset: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'cat-soc', name: 'Sociology', isPreset: true, order: 1, createdAt: new Date().toISOString() },
  { id: 'cat-phi', name: 'Philosophy', isPreset: true, order: 2, createdAt: new Date().toISOString() },
  { id: 'cat-nov', name: 'Fiction', isPreset: true, order: 3, createdAt: new Date().toISOString() },
];

/** Ensure default categories exist in DB (idempotent – safe to call concurrently) */
export async function ensureDefaultCategories(): Promise<void> {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkPut(DEFAULT_CATEGORIES);
  }
}

// ─── Category CRUD ────────────────────────────────────────────────────────────
export async function getAllCategories(): Promise<Category[]> {
  return db.categories.orderBy('order').toArray();
}

export async function addCategory(name: string): Promise<Category> {
  const maxOrder = await db.categories.orderBy('order').last();
  const cat: Category = {
    id: uid(),
    name,
    isPreset: false,
    order: (maxOrder?.order ?? -1) + 1,
    createdAt: new Date().toISOString(),
  };
  await db.categories.add(cat);
  return cat;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name });
}

export async function deleteCategory(id: string): Promise<void> {
  // Move books in this category to first available category
  const firstCat = await db.categories.orderBy('order').first();
  const targetId = firstCat && firstCat.id !== id ? firstCat.id : null;
  if (targetId) {
    await db.books.where('categoryId').equals(id).modify({ categoryId: targetId });
  }
  await db.categories.delete(id);
}

// ─── Book CRUD ────────────────────────────────────────────────────────────────
export async function getAllBooks(): Promise<Book[]> {
  return db.books.orderBy('createdAt').reverse().toArray();
}

export async function getBooksByCategory(categoryId: string): Promise<Book[]> {
  return db.books.where('categoryId').equals(categoryId).toArray();
}

export async function addBook(book: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>): Promise<Book> {
  const now = new Date().toISOString();
  const newBook: Book = { ...book, id: uid(), createdAt: now, updatedAt: now };
  await db.books.add(newBook);
  return newBook;
}

export async function updateBook(id: string, changes: Partial<Book>): Promise<void> {
  await db.books.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteBook(id: string): Promise<void> {
  await db.quotes.where('bookId').equals(id).delete();
  await db.books.delete(id);
}

// ─── Quote CRUD ───────────────────────────────────────────────────────────────
export async function getQuotesByBook(bookId: string): Promise<Quote[]> {
  if (!bookId) {
    console.warn('[DB] getQuotesByBook called with empty bookId');
    return [];
  }
  try {
    console.log('[DB] getQuotesByBook, bookId:', bookId);
    // Dexie 4: Collection.sortBy() instead of orderBy() (orderBy is only on Table)
    const result = await db.quotes.where('bookId').equals(bookId).sortBy('date');
    const reversed = result.reverse();
    console.log('[DB] getQuotesByBook found', reversed.length, 'quotes');
    return reversed;
  } catch (e) {
    // Fallback: if sortBy fails (e.g. index not found), sort in JavaScript memory
    console.warn('[DB] sortBy failed, falling back to in-memory sort:', e);
    try {
      const all = await db.quotes.where('bookId').equals(bookId).toArray();
      const sorted = all.sort((a, b) => b.date.localeCompare(a.date));
      console.log('[DB] getQuotesByBook (fallback) found', sorted.length, 'quotes');
      return sorted;
    } catch (e2) {
      console.error('[DB] getQuotesByBook fallback also failed:', e2);
      throw e2;
    }
  }
}

export async function addQuote(quote: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>): Promise<Quote> {
  const now = new Date().toISOString();
  const newQuote: Quote = { ...quote, id: uid(), createdAt: now, updatedAt: now };
  await db.quotes.add(newQuote);
  return newQuote;
}

export async function updateQuote(id: string, changes: Partial<Quote>): Promise<void> {
  await db.quotes.update(id, { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteQuote(id: string): Promise<void> {
  await db.quotes.delete(id);
}

// ─── Search ───────────────────────────────────────────────────────────────────
export interface SearchResult {
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
}

export async function searchQuotes(keyword: string): Promise<SearchResult[]> {
  if (!keyword.trim()) return [];
  const lower = keyword.toLowerCase();
  const allQuotes = await db.quotes.toArray();
  const matched = allQuotes.filter((q) => q.text.toLowerCase().includes(lower));

  // Batch resolve book info
  const bookIds = [...new Set(matched.map((q) => q.bookId))];
  const books = await db.books.where('id').anyOf(bookIds).toArray();
  const bookMap = new Map(books.map((b) => [b.id, b]));

  return matched.map((quote) => {
    const book = bookMap.get(quote.bookId);
    return {
      quote,
      bookTitle: book?.title ?? '未知书籍',
      bookAuthor: book?.author ?? '',
    };
  });
}

// ─── Quote count for a book ───────────────────────────────────────────────────
export async function getQuoteCount(bookId: string): Promise<number> {
  return db.quotes.where('bookId').equals(bookId).count();
}

// ─── All quotes (for stats) ───────────────────────────────────────────────────
export async function getAllQuotes(): Promise<Quote[]> {
  return db.quotes.toArray();
}

// ─── Export all data as JSON ─────────────────────────────────────────────────
export interface ExportData {
  exportDate: string;
  version: number;
  categories: Category[];
  books: Book[];
  quotes: Quote[];
}

export async function exportAllData(): Promise<ExportData> {
  const categories = await db.categories.orderBy('order').toArray();
  const books = await db.books.orderBy('createdAt').toArray();
  const quotes = await db.quotes.toArray();
  return {
    exportDate: new Date().toISOString(),
    version: 1,
    categories,
    books,
    quotes,
  };
}

// ─── Seed Demian book ─────────────────────────────────────────────────────────
export async function seedDemianBook(): Promise<string> {
  // Ensure default categories exist first (in case store hasn't finished init)
  await ensureDefaultCategories();

  // Find category "小说"
  const cat = await db.categories.where('name').equals('小说').first();
  if (!cat) return 'error: 未找到「小说」分类';

  // Check if already exists
  const existing = await db.books.where('title').equals('德米安').first();
  if (existing) return 'exists';

  // Fetch cover image
  const resp = await fetch('/demian-cover.png');
  const blob = await resp.blob();
  const coverBase64 = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });

  const now = new Date().toISOString();
  const bookId = uid();

  await db.books.add({
    id: bookId,
    title: '德米安',
    author: '黑塞',
    categoryId: cat.id,
    coverType: 'upload',
    coverData: coverBase64,
    createdAt: now,
    updatedAt: now,
  });

  const quotes = [
    '每个人都带着他诞生时的残渣，都背负着史前世界的黏液和蛋壳，直到生命的终点。',
    '每个生命都奋争着，试图从深渊中奔向各自的目标。人们彼此理解，但每个人，都只能解释其自身。',
    '一个世界是我的父宅。柔和的光泽，清澈与洁净属于这个世界。',
    '断痕和截裂会重新弥合，会痊愈，被遗忘，但在我们心中最隐秘的角落，它却继续生活着，流着血。',
    '不用上学的上午令人心醉，就像一头栽进童话世界。',
    '人根本无须害怕任何人。如果一个人害怕某人，就会将此人的权力置于自身之上。',
    '许多人永远举步不前，一生都痛苦地眷念着无以挽回的昨日。',
    '只要我们满心期盼，只要这个愿望真正萦回于我们全部的生命，我们就能拥有足够强大的意志去实施它。',
    '而这才是我认识的德米安。无情、古老，如野兽、如磐石，美而冷酷，死寂一片。',
    '一切都变了。书籍变成纸。音乐变成噪音。我像颗落英缤纷的秋树。它不死。它等待。',
    '我的问题依旧是：日后要做个好儿子、好公民，还是依我的本性走别的路。',
    '我逐渐产生一种感觉，这画不是别人——而是我自己。它是我生活的映像，是我的心，我的命运。',
    '"在我们心中，住着一个无所不知、无所不求的人。他所做的一切远比我们自己做得更好。"',
    '我们对人性的界定太过狭隘！我们的灵魂中包含了曾经居住过人类灵魂中的一切。',
    '假如我们恨一个人，我们不过是借他的形象，恨我们自身的某些东西。',
    '一个觉醒的人，只有一个任何义务也无法超越的义务：寻找自我，固化自我，摸索自己的路前行。',
    '我来，不为写诗，不为预言，不为作画。人只有一个使命：走向自我。',
    '他的职责是发现自己的命运，是彻底而不屈地活出自己的命运。',
    '人们到处结社，到处聚集，到处推脱命运，到处是遁入温暖的乌合之众！',
    '人只有在无法认同自身时才会感到害怕。',
    '人们在记忆中到处寻找"自由"和"幸福"，因为他们害怕想起自己的责任。',
    '人类迄今拥有的全部理想，都来自潜意识的精神之梦。',
    '我们中的每个人，都要完全成为自己，都要与萌生于自身的天然属性密切相合。',
    '许多人愿意为理想去死——不是为个人的理想，而是为被授予的集体的理想。',
    '伤口很痛。但偶尔我会找到钥匙，沉入心底。在那里，我望向那面黑镜，就能看见我自己。',
  ];

  const today = now.slice(0, 10);
  for (const text of quotes) {
    await db.quotes.add({
      id: uid(),
      bookId,
      text,
      thought: '',
      page: null,
      date: today,
      createdAt: now,
      updatedAt: now,
    });
  }

  return 'success';
}
