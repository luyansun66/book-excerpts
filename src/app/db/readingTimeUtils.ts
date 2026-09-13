import type { Book, ReadingTime } from '../types';

export interface ReadingStatsData {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
  last7Days: { date: string; label: string; minutes: number }[];
}

/** Format a Date into local YYYY-MM-DD. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Start of the current week (Monday, local timezone). */
export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
}

/** Sum minutes grouped by local date key. */
export function aggregateReadingMinutes(
  records: Pick<ReadingTime, 'date' | 'minutes'>[],
): Record<string, number> {
  const byDate: Record<string, number> = {};
  for (const record of records) {
    const day = record.date.slice(0, 10);
    byDate[day] = (byDate[day] || 0) + record.minutes;
  }
  return byDate;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeReadingStatsFromRecords(
  records: ReadingTime[],
  now: Date = new Date(),
): ReadingStatsData {
  const byDate = aggregateReadingMinutes(records);
  const todayKey = localDateKey(now);
  const monthKey = todayKey.slice(0, 7);
  const weekStartKey = localDateKey(startOfWeek(now));

  let weekMinutes = 0;
  let monthMinutes = 0;
  for (const [day, minutes] of Object.entries(byDate)) {
    if (day.startsWith(monthKey)) monthMinutes += minutes;
    if (day >= weekStartKey && day <= todayKey) weekMinutes += minutes;
  }

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const last7Days: ReadingStatsData['last7Days'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = localDateKey(d);
    last7Days.push({
      date: key,
      label: i === 0 ? '今' : weekdays[d.getDay()],
      minutes: round1(byDate[key] || 0),
    });
  }

  return {
    todayMinutes: round1(byDate[todayKey] || 0),
    weekMinutes: round1(weekMinutes),
    monthMinutes: round1(monthMinutes),
    last7Days,
  };
}

export type Period = 'week' | 'month' | 'all';

export interface PeriodBucket {
  key: string;
  label: string;
  minutes: number;
}

export interface PeriodBookReading {
  bookId: string;
  title: string;
  minutes: number;
}

export interface ReadingOverview {
  period: Period;
  todayMinutes: number;
  totalMinutes: number;
  dailyAverageMinutes: number;
  buckets: PeriodBucket[];
  books: PeriodBookReading[];
}

export interface PeriodRange {
  /** 计入统计的第一天（含）。 */
  startKey: string;
  /** 计入统计的最后一天（含）——今天，未来的记录一律不计。 */
  endKey: string;
  /** 横轴最后一个槽位所在日期，周/月视图会画到自然周末或月末。 */
  bucketEndKey: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_LABEL_DAYS = new Set([1, 5, 10, 15, 20, 25, 30]);

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function earliestDayKey(records: Pick<ReadingTime, 'date'>[]): string {
  let earliest = '';
  for (const record of records) {
    const day = record.date.slice(0, 10);
    if (!earliest || day < earliest) earliest = day;
  }
  return earliest;
}

/** 周=自然周（周一→周日），月=自然月（1 号→月末），总=最早记录→今天。 */
export function periodRange(
  period: Period,
  now: Date,
  records: Pick<ReadingTime, 'date'>[],
): PeriodRange {
  const todayKey = localDateKey(now);
  if (period === 'week') {
    const start = startOfWeek(now);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { startKey: localDateKey(start), endKey: todayKey, bucketEndKey: localDateKey(end) };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startKey: localDateKey(start), endKey: todayKey, bucketEndKey: localDateKey(end) };
  }
  return { startKey: earliestDayKey(records) || todayKey, endKey: todayKey, bucketEndKey: todayKey };
}

function buildDailyBuckets(
  startKey: string,
  dayCount: number,
  labelFor: (date: Date, key: string) => string,
  byDate: Record<string, number>,
): PeriodBucket[] {
  const start = parseDayKey(startKey);
  const buckets: PeriodBucket[] = [];
  for (let i = 0; i < dayCount; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = localDateKey(date);
    buckets.push({ key, label: labelFor(date, key), minutes: round1(byDate[key] || 0) });
  }
  return buckets;
}

function buildMonthlyBuckets(
  startKey: string,
  endKey: string,
  byDate: Record<string, number>,
): PeriodBucket[] {
  const start = parseDayKey(startKey);
  const end = parseDayKey(endKey);
  const buckets: PeriodBucket[] = [];
  const index = new Map<string, PeriodBucket>();

  let year = start.getFullYear();
  let month = start.getMonth();
  while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth())) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const bucket: PeriodBucket = { key, label: '', minutes: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  for (const [day, minutes] of Object.entries(byDate)) {
    const bucket = index.get(day.slice(0, 7));
    if (bucket) bucket.minutes += minutes;
  }

  const sparse = buckets.length > 6;
  for (const bucket of buckets) {
    const monthNumber = Number(bucket.key.slice(5, 7));
    bucket.minutes = round1(bucket.minutes);
    bucket.label = sparse ? (monthNumber === 1 || monthNumber === 7 ? `${monthNumber}月` : '') : `${monthNumber}月`;
  }

  return buckets;
}

/**
 * 指定周期内的总时长、日均、横轴分桶与按书拆分明细。
 * 分桶与明细共用同一套 [startKey, endKey] 边界，两者可与 totalMinutes 对账。
 */
export function computeReadingOverview(
  records: ReadingTime[],
  books: Pick<Book, 'id' | 'title'>[],
  period: Period,
  now: Date = new Date(),
): ReadingOverview {
  const todayKey = localDateKey(now);
  const range = periodRange(period, now, records);
  const byDate = aggregateReadingMinutes(records);

  const inRange: Record<string, number> = {};
  let totalMinutes = 0;
  for (const [day, minutes] of Object.entries(byDate)) {
    if (day < range.startKey || day > range.endKey) continue;
    inRange[day] = minutes;
    totalMinutes += minutes;
  }

  let buckets: PeriodBucket[];
  if (period === 'all') {
    buckets = buildMonthlyBuckets(range.startKey, range.endKey, inRange);
  } else {
    const start = parseDayKey(range.startKey);
    const bucketEnd = parseDayKey(range.bucketEndKey);
    const dayCount = Math.round((bucketEnd.getTime() - start.getTime()) / DAY_MS) + 1;
    const labelFor =
      period === 'week'
        ? (date: Date, key: string) => (key === todayKey ? '今' : WEEKDAY_LABELS[date.getDay()])
        : (date: Date, key: string) =>
            key === todayKey ? '今' : MONTH_LABEL_DAYS.has(date.getDate()) ? String(date.getDate()) : '';
    buckets = buildDailyBuckets(range.startKey, dayCount, labelFor, inRange);
  }

  const elapsedDays = Math.max(
    1,
    Math.round((parseDayKey(range.endKey).getTime() - parseDayKey(range.startKey).getTime()) / DAY_MS) + 1,
  );

  const titles = new Map(books.map((book) => [book.id, book.title]));
  const byBook = new Map<string, number>();
  for (const record of records) {
    const day = record.date.slice(0, 10);
    if (day < range.startKey || day > range.endKey) continue;
    byBook.set(record.bookId, (byBook.get(record.bookId) || 0) + record.minutes);
  }

  const bookRows: PeriodBookReading[] = Array.from(byBook.entries())
    .map(([bookId, minutes]) => ({
      bookId,
      title: titles.get(bookId) || '未知书籍',
      minutes: round1(minutes),
    }))
    .sort((a, b) => b.minutes - a.minutes || a.title.localeCompare(b.title, 'zh-Hans-CN'));

  totalMinutes = round1(totalMinutes);

  return {
    period,
    todayMinutes: round1(byDate[todayKey] || 0),
    totalMinutes,
    dailyAverageMinutes: round1(totalMinutes / elapsedDays),
    buckets,
    books: bookRows,
  };
}

export const PERIOD_LABELS: Record<Period, { tab: string; unit: string; bookList: string; empty: string }> = {
  week: { tab: '周', unit: '本周', bookList: '本周阅读', empty: '本周还没有阅读记录' },
  month: { tab: '月', unit: '本月', bookList: '本月阅读', empty: '本月还没有阅读记录' },
  all: { tab: '总', unit: '累计', bookList: '全部阅读', empty: '还没有阅读记录' },
};
