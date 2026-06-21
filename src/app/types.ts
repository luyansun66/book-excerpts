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
  createdAt: string;
  updatedAt: string;
}

// ─── Quote (Highlight) ────────────────────────────────────────────────────────
export interface Quote {
  id: string;
  bookId: string;
  text: string;
  thought: string;
  page: number | null;
  date: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Theme presets for share cards ────────────────────────────────────────────
export interface ThemePreset {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
}
