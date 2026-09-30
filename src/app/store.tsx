import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Book, Category, Quote } from './types';
import {
  DEFAULT_FINISHED_LABEL_COLOR,
  DEFAULT_FINISHED_LABEL_TEXT,
  clampLabelText,
  isPresetLabelColor,
  type FinishedLabelDefaults,
} from './bookLabel';
import {
  ensureDefaultCategories,
  getAllCategories,
  addCategory as dbAddCategory,
  renameCategory as dbRenameCategory,
  deleteCategory as dbDeleteCategory,
  getAllBooks,
  addBook as dbAddBook,
  updateBook as dbUpdateBook,
  deleteBook as dbDeleteBook,
  batchUpdateBookOrders,
  batchUpdateCategoryOrders,
  getQuotesByBook,
  addQuote as dbAddQuote,
  updateQuote as dbUpdateQuote,
  deleteQuote as dbDeleteQuote,
  searchQuotes,
  getQuoteCount,
  type SearchResult,
} from './db';

// ─── 「读完」角标的全局默认（设置页里改的那一份）────────────────────────────────
// 存在 localStorage 而不是 IndexedDB：这是「界面偏好」，跟分享面板的自定义底色
// 同一个性质，不该占一个需要迁移、还要进备份的表。
const FINISHED_LABEL_STORAGE_KEY = 'finishedLabelDefaults';

const BUILTIN_LABEL_DEFAULTS: FinishedLabelDefaults = {
  text: DEFAULT_FINISHED_LABEL_TEXT,
  color: DEFAULT_FINISHED_LABEL_COLOR,
};

/** 存进去的可能是旧数据、被手改过的 JSON，读出来一律收敛到合法值再交出去。 */
function readFinishedLabelDefaults(): FinishedLabelDefaults {
  try {
    const raw = localStorage.getItem(FINISHED_LABEL_STORAGE_KEY);
    if (!raw) return BUILTIN_LABEL_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<FinishedLabelDefaults>;
    return {
      text: clampLabelText(parsed.text ?? '') || DEFAULT_FINISHED_LABEL_TEXT,
      color: isPresetLabelColor(parsed.color) ? (parsed.color as string) : DEFAULT_FINISHED_LABEL_COLOR,
    };
  } catch {
    return BUILTIN_LABEL_DEFAULTS;
  }
}

function writeFinishedLabelDefaults(next: FinishedLabelDefaults): void {
  try {
    localStorage.setItem(FINISHED_LABEL_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式/禁用存储时写不进去。本次会话内仍然生效，下次打开回到内置默认。
  }
}

// ─── Context shape ────────────────────────────────────────────────────────────
interface AppState {
  // Data
  categories: Category[];
  books: Book[];
  initialLoading: boolean;

  // Navigation
  selectedBook: Book | null;
  targetQuoteId: string | null;

  // 「读完」角标的全局默认文案与颜色（按书的 label 会覆盖它）
  finishedLabel: FinishedLabelDefaults;
  setFinishedLabel: (next: FinishedLabelDefaults) => void;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;

  // Actions – Navigation
  selectBook: (book: Book | null) => void;
  setTargetQuoteId: (id: string | null) => void;

  // Actions – Search
  setSearchQuery: (q: string) => void;

  // Refresh all data from DB (used after direct DB mutations e.g. seed)
  refreshData: () => Promise<void>;

  // Actions – Categories
  addCategory: (name: string) => Promise<Category>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  moveCategoryTo: (categoryId: string, targetIndex: number) => Promise<void>;

  // Actions – Books
  addBook: (data: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Book>;
  updateBook: (id: string, changes: Partial<Book>) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  moveBookTo: (bookId: string, targetIndex: number) => Promise<void>;

  // Actions – Quotes
  getQuotes: (bookId: string) => Promise<Quote[]>;
  addQuote: (data: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Quote>;
  updateQuote: (id: string, changes: Partial<Quote>) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  getQuoteCountForBook: (bookId: string) => Promise<number>;
}

const AppContext = createContext<AppState | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [targetQuoteId, setTargetQuoteId] = useState<string | null>(null);
  const [finishedLabel, setFinishedLabelState] = useState<FinishedLabelDefaults>(readFinishedLabelDefaults);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    (async () => {
      await ensureDefaultCategories();
      const cats = await getAllCategories();
      const bks = await getAllBooks();
      setCategories(cats);
      setBooks(bks);
      setInitialLoading(false);
    })();
  }, []);

  // Refresh data helpers
  const refreshCategories = useCallback(async () => {
    setCategories(await getAllCategories());
  }, []);

  const refreshBooks = useCallback(async () => {
    setBooks(await getAllBooks());
  }, []);

  // Search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchQuotes(searchQuery);
      setSearchResults(results);
    }, 200); // debounce
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ─── Refresh all data ────────────────────────────────────────────────────
  const refreshData = useCallback(async () => {
    await refreshCategories();
    await refreshBooks();
  }, [refreshCategories, refreshBooks]);

  // ─── Category actions ─────────────────────────────────────────────────────
  const addCategory = useCallback(async (name: string) => {
    const cat = await dbAddCategory(name);
    await refreshCategories();
    return cat;
  }, [refreshCategories]);

  const renameCategory = useCallback(async (id: string, name: string) => {
    await dbRenameCategory(id, name);
    await refreshCategories();
  }, [refreshCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    await dbDeleteCategory(id);
    await refreshCategories();
    await refreshBooks();
  }, [refreshCategories, refreshBooks]);

  // ─── Move / reorder categories ─────────────────────────────────────────
  const moveCategoryTo = useCallback(async (categoryId: string, targetIndex: number) => {
    const idx = categories.findIndex((c) => c.id === categoryId);
    if (idx === -1 || targetIndex < 0 || targetIndex >= categories.length || idx === targetIndex) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered.map((c, i) => ({ id: c.id, order: i }));
    await batchUpdateCategoryOrders(updates);
    await refreshCategories();
  }, [categories, refreshCategories]);

  // ─── Book actions ─────────────────────────────────────────────────────────
  const addBook = useCallback(async (data: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => {
    const book = await dbAddBook(data);
    await refreshBooks();
    return book;
  }, [refreshBooks]);

  const updateBookFn = useCallback(async (id: string, changes: Partial<Book>) => {
    await dbUpdateBook(id, changes);
    await refreshBooks();
    // selectedBook 是「打开详情页那一刻」的快照，不会跟着 refreshBooks 走。
    // 不同步的话，在详情页里切「读完」按钮上显示的还是旧状态。
    setSelectedBook((prev) => (prev && prev.id === id ? { ...prev, ...changes } : prev));
  }, [refreshBooks]);

  const deleteBookFn = useCallback(async (id: string) => {
    if (selectedBook?.id === id) setSelectedBook(null);
    await dbDeleteBook(id);
    await refreshBooks();
  }, [refreshBooks, selectedBook]);

  // ─── Move / reorder books within same category ──────────────────────────
  const moveBookTo = useCallback(async (bookId: string, targetIndex: number) => {
    const book = books.find((b) => b.id === bookId);
    if (!book) return;

    // Get all books in the same category, sorted by (sortOrder, createdAt desc)
    const catBooks = books
      .filter((b) => b.categoryId === book.categoryId)
      .sort((a, b) => {
        const oA = a.sortOrder ?? 0;
        const oB = b.sortOrder ?? 0;
        if (oA !== oB) return oA - oB;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const idx = catBooks.findIndex((b) => b.id === bookId);
    if (idx === -1 || targetIndex < 0 || targetIndex >= catBooks.length || idx === targetIndex) return;

    // Reorder: remove from current position, insert at target position
    const reordered = [...catBooks];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(targetIndex, 0, moved);

    // Assign sequential sortOrders and batch-update DB
    const updates = reordered.map((b, i) => ({ id: b.id, sortOrder: i }));
    await batchUpdateBookOrders(updates);
    await refreshBooks();
  }, [books, refreshBooks]);

  const setFinishedLabel = useCallback((next: FinishedLabelDefaults) => {
    const normalized: FinishedLabelDefaults = {
      text: clampLabelText(next.text) || DEFAULT_FINISHED_LABEL_TEXT,
      color: isPresetLabelColor(next.color) ? next.color : DEFAULT_FINISHED_LABEL_COLOR,
    };
    setFinishedLabelState(normalized);
    writeFinishedLabelDefaults(normalized);
  }, []);

  // ─── Quote actions ────────────────────────────────────────────────────────
  const getQuotes = useCallback(async (bookId: string) => {
    return getQuotesByBook(bookId);
  }, []);

  const addQuote = useCallback(async (data: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'>) => {
    const quote = await dbAddQuote(data);
    return quote;
  }, []);

  const updateQuote = useCallback(async (id: string, changes: Partial<Quote>) => {
    await dbUpdateQuote(id, changes);
  }, []);

  const deleteQuote = useCallback(async (id: string) => {
    await dbDeleteQuote(id);
  }, []);

  const getQuoteCountForBook = useCallback(async (bookId: string) => {
    return getQuoteCount(bookId);
  }, []);

  // ─── Value ────────────────────────────────────────────────────────────────
  const value: AppState = {
    categories,
    books,
    initialLoading,
    selectedBook,
    targetQuoteId,
    finishedLabel,
    setFinishedLabel,
    searchQuery,
    searchResults,
    isSearching,
    selectBook: setSelectedBook,
    setTargetQuoteId,
    setSearchQuery,
    refreshData,
    addCategory,
    renameCategory,
    deleteCategory,
    moveCategoryTo,
    addBook,
    updateBook: updateBookFn,
    deleteBook: deleteBookFn,
    moveBookTo,
    getQuotes,
    addQuote,
    updateQuote,
    deleteQuote,
    getQuoteCountForBook,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
