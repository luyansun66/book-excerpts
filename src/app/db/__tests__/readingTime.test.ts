import { describe, it, expect } from 'vitest';
import {
  localDateKey,
  startOfWeek,
  aggregateReadingMinutes,
  computeReadingStatsFromRecords,
} from '../readingTimeUtils';
import type { ReadingTime } from '../../types';

function record(date: string, minutes: number): ReadingTime {
  return {
    id: date + minutes,
    date,
    minutes,
    sessions: 1,
    bookId: 'book-1',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('reading time aggregation', () => {
  it('formats a local date key', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('startOfWeek is always Monday', () => {
    expect(startOfWeek(new Date(2026, 8, 9)).getDay()).toBe(1);
  });

  it('aggregates minutes by date', () => {
    const byDate = aggregateReadingMinutes([
      record('2026-09-07', 20),
      record('2026-09-07', 30),
      record('2026-09-08', 5),
    ]);
    expect(byDate['2026-09-07']).toBe(50);
    expect(byDate['2026-09-08']).toBe(5);
  });

  it('computes today/week/month and a 7-day series', () => {
    const now = new Date(2026, 8, 9); // Wednesday 2026-09-09
    const stats = computeReadingStatsFromRecords(
      [
        record('2026-09-09', 25),
        record('2026-09-08', 15),
        record('2026-08-31', 40),
      ],
      now,
    );

    expect(stats.todayMinutes).toBe(25);
    expect(stats.weekMinutes).toBe(40);
    expect(stats.monthMinutes).toBe(40);
    expect(stats.last7Days).toHaveLength(7);
    expect(stats.last7Days[6].date).toBe('2026-09-09');
    expect(stats.last7Days[6].label).toBe('今');
    expect(stats.last7Days[6].minutes).toBe(25);
  });
});
