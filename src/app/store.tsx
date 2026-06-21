import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Book, Category, Quote } from './types';
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
  getQuotesByBook,
  addQuote as dbAddQuote,
  updateQuote as dbUpdateQuote,
  deleteQuote as dbDeleteQuote,
  searchQuotes,
  getQuoteCount,
  type SearchResult,
} from './db';

// ─── Context shape ────────────────────────────────────────────────────────────
interface AppState {
  // Data
  categories: Category[];
  books: Book[];
  initialLoading: boolean;

  // Navigation
  selectedBook: Book | null;
  showStats: boolean;

  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  isSearching: boolean;

  // Actions – Navigation
  selectBook: (book: Book | null) => void;
  setShowStats: (show: boolean) => void;

  // Actions – Search
  setSearchQuery: (q: string) => void;

  // Refresh all data from DB (used after direct DB mutations e.g. seed)
  refreshData: () => Promise<void>;

  // Actions – Categories
  addCategory: (name: string) => Promise<Category>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // Actions – Books
  addBook: (data: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Book>;
  updateBook: (id: string, changes: Partial<Book>) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;

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
  const [showStats, setShowStats] = useState(false);
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

  // ─── Book actions ─────────────────────────────────────────────────────────
  const addBook = useCallback(async (data: Omit<Book, 'id' | 'createdAt' | 'updatedAt'>) => {
    const book = await dbAddBook(data);
    await refreshBooks();
    return book;
  }, [refreshBooks]);

  const updateBookFn = useCallback(async (id: string, changes: Partial<Book>) => {
    await dbUpdateBook(id, changes);
    await refreshBooks();
  }, [refreshBooks]);

  const deleteBookFn = useCallback(async (id: string) => {
    if (selectedBook?.id === id) setSelectedBook(null);
    await dbDeleteBook(id);
    await refreshBooks();
  }, [refreshBooks, selectedBook]);

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
    showStats,
    searchQuery,
    searchResults,
    isSearching,
    selectBook: setSelectedBook,
    setShowStats,
    setSearchQuery,
    refreshData,
    addCategory,
    renameCategory,
    deleteCategory,
    addBook,
    updateBook: updateBookFn,
    deleteBook: deleteBookFn,
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
