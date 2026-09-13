import { describe, it, expect } from 'vitest';
import {
  localDateKey,
  startOfWeek,
  aggregateReadingMinutes,
  computeReadingStatsFromRecords,
  computeReadingOverview,
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

describe('computeReadingOverview', () => {
  const now = new Date(2026, 8, 9); // 2026-09-09 周三，自然周 09-07 ~ 09-13

  it('周：只计自然周内的记录，未来日期不计', () => {
    const overview = computeReadingOverview(
      [
        record('2026-09-06', 99, 'book-1'), // 上周日
        record('2026-09-07', 20, 'book-1'),
        record('2026-09-08', 30, 'book-2'),
        record('2026-09-10', 77, 'book-2'), // 明天
      ],
      books,
      'week',
      now,
    );

    expect(overview.totalMinutes).toBe(50);
    expect(overview.buckets).toHaveLength(7);
    expect(overview.buckets[0]).toMatchObject({ key: '2026-09-07', label: '一', minutes: 20 });
    expect(overview.buckets[6]).toMatchObject({ key: '2026-09-13', minutes: 0 });
    expect(overview.buckets.map((b) => b.minutes)).toEqual([20, 30, 0, 0, 0, 0, 0]);
    expect(overview.buckets[2].label).toBe('今');
    expect(overview.books).toEqual([
      { bookId: 'book-2', title: '万历十五年', minutes: 30 },
      { bookId: 'book-1', title: '咀嚼人生', minutes: 20 },
    ]);
  });

  it('月：自然月 1 号到月末，未来槽位留空', () => {
    const overview = computeReadingOverview(
      [record('2026-08-31', 50, 'book-1'), record('2026-09-01', 10, 'book-1'), record('2026-09-09', 30, 'book-2')],
      books,
      'month',
      now,
    );

    expect(overview.totalMinutes).toBe(40);
    expect(overview.buckets).toHaveLength(30);
    expect(overview.buckets[0]).toMatchObject({ key: '2026-09-01', label: '1', minutes: 10 });
    expect(overview.buckets[29].key).toBe('2026-09-30');
    expect(overview.buckets[8].label).toBe('今');
    expect(overview.buckets[4].label).toBe('5');
    expect(overview.buckets[1].label).toBe('');
  });

  it('总：最早记录到今天的按月分桶，桶多时只标 1 月/7 月', () => {
    const overview = computeReadingOverview(
      [
        record('2025-12-20', 10, 'book-1'),
        record('2026-01-05', 20, 'book-1'),
        record('2026-07-01', 30, 'book-2'),
        record('2026-09-09', 40, 'book-2'),
      ],
      books,
      'all',
      now,
    );

    expect(overview.buckets.map((b) => b.key)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
    expect(overview.totalMinutes).toBe(100);
    expect(overview.buckets.filter((b) => b.label).map((b) => b.label)).toEqual(['1月', '7月']);
  });

  it('三个周期都对账：分桶求和 === 明细求和 === totalMinutes', () => {
    const records = [
      record('2025-12-20', 11.4, 'book-1'),
      record('2026-01-05', 22.2, 'book-2'),
      record('2026-09-07', 30.3, 'book-1'),
      record('2026-09-08', 15.1, 'book-2'),
      record('2026-09-09', 7.7, 'gone'),
      record('2026-09-10', 99, 'book-1'), // 未来，任何周期都不计
    ];

    for (const period of ['week', 'month', 'all'] as const) {
      const overview = computeReadingOverview(records, books, period, now);
      const bucketSum = overview.buckets.reduce((sum, b) => sum + b.minutes, 0);
      const bookSum = overview.books.reduce((sum, b) => sum + b.minutes, 0);

      expect(bucketSum).toBeCloseTo(overview.totalMinutes, 6);
      expect(bookSum).toBeCloseTo(overview.totalMinutes, 6);
    }
  });

  it('日均按区间自然天数计算，而不是有记录的天数', () => {
    const overview = computeReadingOverview([record('2026-09-09', 30, 'book-1')], books, 'week', now);
    expect(overview.dailyAverageMinutes).toBe(10); // 30 / 3 天（周一、二、三）
  });

  it('书目不存在时回落为「未知书籍」，同分钟按标题排序并四舍五入到一位小数', () => {
    const fallback = computeReadingOverview([record('2026-09-09', 8, 'gone')], books, 'week', now);
    expect(fallback.books).toEqual([{ bookId: 'gone', title: '未知书籍', minutes: 8 }]);

    const tied = computeReadingOverview(
      [record('2026-09-09', 5.04, 'book-1'), record('2026-09-09', 5.04, 'book-2')],
      books,
      'week',
      now,
    );
    const expectedTitles = ['咀嚼人生', '万历十五年'].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    expect(tied.books.map((row) => row.title)).toEqual(expectedTitles);
    expect(tied.books.map((row) => row.minutes)).toEqual([5, 5]);
  });
});
