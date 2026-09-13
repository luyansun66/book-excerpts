import { db, getAllBooks } from './index';
import { computeReadingStatsFromRecords, type ReadingStatsData } from './readingTimeUtils';
import type { Book, ReadingTime } from '../types';

export type {
  ReadingStatsData,
  Period,
  PeriodBucket,
  PeriodBookReading,
  ReadingOverview,
} from './readingTimeUtils';

export async function computeReadingStats(): Promise<ReadingStatsData> {
  const records = await db.readingTime.toArray();
  return computeReadingStatsFromRecords(records, new Date());
}

export async function getBookReadingMinutes(bookId: string): Promise<number> {
  if (!bookId) return 0;
  const records = await db.readingTime.where('bookId').equals(bookId).toArray();
  const total = records.reduce((sum, record) => sum + record.minutes, 0);
  return Math.round(total * 10) / 10;
}

export interface ReadingSnapshot {
  records: ReadingTime[];
  books: Pick<Book, 'id' | 'title'>[];
}

/** 一次拉取阅读记录与书目，统计页在内存里切换周期，避免每次切换都读库。 */
export async function loadReadingSnapshot(): Promise<ReadingSnapshot> {
  const [records, books] = await Promise.all([db.readingTime.toArray(), getAllBooks()]);
  return { records, books: books.map(({ id, title }) => ({ id, title })) };
}
