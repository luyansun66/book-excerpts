import { db, getAllBooks } from './index';
import { computeReadingStatsFromRecords, computeWeekBookMinutes, type ReadingStatsData, type WeekBookReading } from './readingTimeUtils';

export type { ReadingStatsData, WeekBookReading } from './readingTimeUtils';

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

export async function computeWeekBookReading(): Promise<WeekBookReading[]> {
  const [records, books] = await Promise.all([db.readingTime.toArray(), getAllBooks()]);
  return computeWeekBookMinutes(records, books, new Date());
}
