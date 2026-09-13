import { describe, it, expect } from 'vitest';
import {
  localDateKey,
  startOfWeek,
  aggregateReadingMinutes,
  computeReadingStatsFromRecords,
  computeWeekBookMinutes,
} from '../readingTimeUtils';
import type { ReadingTime } from '../../types';

function record(date: string, minutes: number, bookId = 'book-1'): ReadingTime {
  return {
    id: date + minutes + bookId,
    date,
    minutes,
    sessions: 1,
    bookId,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const books = [
  { id: 'book-1', title: '咀嚼人生' },
  { id: 'book-2', title: '万历十五年' },
];

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

describe('computeWeekBookMinutes', () => {
  const now = new Date(2026, 8, 9); // Wednesday 2026-09-09, week starts 2026-09-07

  it('groups this week by book and sorts by minutes desc', () => {
    const rows = computeWeekBookMinutes(
      [
        record('2026-09-09', 20, 'book-1'),
        record('2026-09-08', 10, 'book-1'),
        record('2026-09-07', 45, 'book-2'),
      ],
      books,
      now,
    );

    expect(rows).toEqual([
      { bookId: 'book-2', title: '万历十五年', minutes: 45 },
      { bookId: 'book-1', title: '咀嚼人生', minutes: 30 },
    ]);
  });

  it('excludes records before Monday and in the future', () => {
    const rows = computeWeekBookMinutes(
      [
        record('2026-09-06', 99, 'book-1'), // 上周日
        record('2026-08-31', 88, 'book-1'), // 上上周一
        record('2026-09-10', 77, 'book-1'), // 明天
        record('2026-09-07', 12, 'book-1'),
      ],
      books,
      now,
    );

    expect(rows).toEqual([{ bookId: 'book-1', title: '咀嚼人生', minutes: 12 }]);
  });

  it('falls back for books that no longer exist', () => {
    const rows = computeWeekBookMinutes([record('2026-09-09', 8, 'gone')], books, now);
    expect(rows).toEqual([{ bookId: 'gone', title: '未知书籍', minutes: 8 }]);
  });

  it('breaks ties by title and rounds to one decimal', () => {
    const rows = computeWeekBookMinutes(
      [
        record('2026-09-09', 5.04, 'book-1'),
        record('2026-09-09', 5.04, 'book-2'),
        record('2026-09-09', 0.02, 'book-1'),
      ],
      books,
      now,
    );

    const tied = ['咀嚼人生', '万历十五年'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    expect(rows.map((row) => row.title)).toEqual(tied);
    expect(rows.find((row) => row.bookId === 'book-1')!.minutes).toBe(5.1);
    expect(rows.find((row) => row.bookId === 'book-2')!.minutes).toBe(5);
  });

  it('reconciles with weekMinutes from the summary', () => {
    const records = [
      record('2026-09-07', 20, 'book-1'),
      record('2026-09-08', 30, 'book-2'),
      record('2026-09-09', 40, 'book-2'),
    ];
    const summary = computeReadingStatsFromRecords(records, now);
    const total = computeWeekBookMinutes(records, books, now).reduce((sum, r) => sum + r.minutes, 0);

    expect(total).toBe(summary.weekMinutes);
  });
});
