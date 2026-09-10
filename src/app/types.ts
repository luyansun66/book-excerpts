// ─── Category ──────────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  isPreset: boolean;
  order: number;
  createdAt: string;
}

// ─── Book ─────────────────────────────────────────────────────────────────────
export type CoverType = 'upload' | 'url';

export interface Book {
  id: string;
  title: string;
  author: string;
  categoryId: string;
  coverType: CoverType | null;
  coverData: string | null; // blob URL for uploads, external URL for url type
  sortOrder?: number; // for custom shelf ordering within category
  createdAt: string;
  updatedAt: string;
}

// ─── Quote (Highlight) ────────────────────────────────────────────────────────
export interface Quote {
  id: string;
  bookId: string;
  text: string;
  thought: string;
  page: string | null;
  date: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Reading time (single timer session record) ───────────────────────────────
export interface ReadingTime {
  id: string;
  date: string;      // "YYYY-MM-DD" — local date the session is attributed to
  minutes: number;   // total minutes read in this session (fractional ok)
  sessions: number;  // number of active segments (start→pause / start→end)
  bookId: string;
  createdAt: string;
}


// ─── Time mailbox (时光信箱) singleton state ───────────────────────────────────
export interface LetterBox {
  id: string;              // fixed key 'main' (singleton)
  receivedCount: number;   // cumulative letters received (never decreases)
  lastReceiveDate: string; // Beijing date "YYYY-MM-DD" of last receive
  quoteId: string;         // quote locked for the current day's letter
}
