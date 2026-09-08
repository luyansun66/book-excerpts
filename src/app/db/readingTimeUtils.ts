import type { ReadingTime } from '../types';

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
