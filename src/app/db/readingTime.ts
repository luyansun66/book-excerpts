import { db } from './index';
import { computeReadingStatsFromRecords, type ReadingStatsData } from './readingTimeUtils';

export type { ReadingStatsData } from './readingTimeUtils';

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
