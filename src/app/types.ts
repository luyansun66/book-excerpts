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

/**
 * 这本书在「书架 v2」主题里怎么摆。
 *
 * - `auto`   —— 交给书架自己安排（默认，竖放书脊为主，少数封面朝外）
 * - `spine`  —— 竖放，露出书脊
 * - `cover`  —— 竖放，封面朝外（新主题下带一点立体感）
 * - `stack`  —— 横放，可以和其他横放的书摞起来
 *
 * 缺省（旧库/旧备份/云同步回来的书）都是 `auto`，读取侧统一走 `resolveLayout`。
 */
export type BookLayout = 'auto' | 'spine' | 'cover' | 'stack';

export interface Book {
  id: string;
  title: string;
  author: string;
  categoryId: string;
  coverType: CoverType | null;
  coverData: string | null; // blob URL for uploads, external URL for url type
  sortOrder?: number; // for custom shelf ordering within category
  /** 摆放形式。空 = `auto`。只在「书架 v2」主题下生效，经典主题不看它。 */
  layout?: BookLayout;
  /** 书脊模版 id（见 `shelf/spineTemplates.tsx`）。空 = 默认模版。 */
  spineTemplate?: string;
  /** 手动标记读完的时刻（ISO）。空 = 正在阅读；有值 = 已读完，封面右上角画角标。 */
  finishedAt?: string | null;
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
  /** 本条摘录「摘录原文」里 ==高亮== 的底色；空 = 主题默认。 */
  textMarkColor?: string;
  /** 本条摘录「我的感悟」里 ==高亮== 的底色；空 = 主题默认。 */
  thoughtMarkColor?: string;
  /** 最近一次在「摘录回顾」里翻过这张卡的时刻（ISO）。空 = 从没回顾过。 */
  lastReviewedAt?: string | null;
  /** 累计被翻过去过多少次。只增不减。 */
  reviewCount?: number;
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
