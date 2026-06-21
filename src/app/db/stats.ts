// ─── Reading statistics computation ───────────────────────────────────────────
import { getAllQuotes } from './index';
import { db } from './index';

export interface StatsData {
  totalBooks: number;
  totalQuotes: number;
  currentStreak: number;
  longestStreak: number;
  mostActiveMonth: string;   // "YYYY-MM"
  mostActiveMonthCount: number;
  dailyCounts: Record<string, number>;  // "YYYY-MM-DD" → count
  yearRange: { min: number; max: number };
}

/** Parse YYYY-MM-DD string into Date (local timezone-safe) */
function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date back to YYYY-MM-DD */
function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Days between two dates (positive if b is after a) */
function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86400000;
  const aNorm = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bNorm = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bNorm.getTime() - aNorm.getTime()) / msPerDay);
}

export async function computeStats(): Promise<StatsData> {
  const quotes = await getAllQuotes();
  const totalQuotes = quotes.length;
  const totalBooks = await db.books.count();

  // ── Daily counts ──────────────────────────────────────────────────────────
  const dailyCounts: Record<string, number> = {};
  for (const q of quotes) {
    const day = q.date.slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  }

  // ── Year range ────────────────────────────────────────────────────────────
  const dates = Object.keys(dailyCounts).sort();
  const now = new Date();
  const currentYear = now.getFullYear();
  let minYear = currentYear;
  let maxYear = currentYear;
  if (dates.length > 0) {
    minYear = Math.min(...dates.map(d => parseInt(d.slice(0, 4), 10)));
    maxYear = Math.max(...dates.map(d => parseInt(d.slice(0, 4), 10)));
  }

  // ── Most active month ─────────────────────────────────────────────────────
  const monthCounts: Record<string, number> = {};
  for (const day of dates) {
    const month = day.slice(0, 7); // "YYYY-MM"
    monthCounts[month] = (monthCounts[month] || 0) + dailyCounts[day];
  }
  let mostActiveMonth = '';
  let mostActiveMonthCount = 0;
  for (const [m, c] of Object.entries(monthCounts)) {
    if (c > mostActiveMonthCount) {
      mostActiveMonth = m;
      mostActiveMonthCount = c;
    }
  }

  // ── Streaks ───────────────────────────────────────────────────────────────
  let currentStreak = 0;
  let longestStreak = 0;

  if (dates.length > 0) {
    // Current streak: starting from today (or last active day), go backwards
    const sortedDates = [...dates].sort();
    const lastActive = parseDate(sortedDates[sortedDates.length - 1]);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Start checking from today or the most recent active day, whichever is later
    // But the streak is based on having activity on consecutive days
    let checkDate = todayStart > lastActive ? todayStart : lastActive;

    // Walk backwards from checkDate
    while (true) {
      const key = fmtDate(checkDate);
      if (dailyCounts[key]) {
        currentStreak++;
        checkDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate() - 1);
      } else if (currentStreak > 0) {
        // Only break if we've already counted some days; if today has no
        // activity and we haven't found a streak yet, check yesterday
        break;
      } else {
        checkDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate() - 1);
        // If we've gone back more than 365 days looking for a streak entry, stop
        if (daysBetween(checkDate, todayStart) > 365) break;
      }
    }

    // Longest streak: scan all sorted dates
    let run = 1;
    longestStreak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = parseDate(sortedDates[i - 1]);
      const curr = parseDate(sortedDates[i]);
      if (daysBetween(prev, curr) === 1) {
        run++;
        if (run > longestStreak) longestStreak = run;
      } else {
        run = 1;
      }
    }
    if (sortedDates.length === 0) longestStreak = 0;
  }

  return {
    totalBooks,
    totalQuotes,
    currentStreak,
    longestStreak,
    mostActiveMonth,
    mostActiveMonthCount,
    dailyCounts,
    yearRange: { min: minYear, max: maxYear },
  };
}
