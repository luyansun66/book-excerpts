// ─── 北京时间日期工具 ──────────────────────────────────────────────────────────
// 卡片与收信去重统一按 Asia/Shanghai 时区计算，与浏览器本地时区无关。

const BEIJING_TZ = 'Asia/Shanghai';

export interface BeijingDateParts {
  year: string;      // "2026"
  month: string;     // "09" (2-digit)
  day: string;       // "09" (2-digit)
  monthName: string; // "September"
  dayNum: string;    // "9"
}

export function beijingDateParts(now: Date = new Date()): BeijingDateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const long = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TZ,
    month: 'long',
    day: 'numeric',
  }).formatToParts(now);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    monthName: long.find((p) => p.type === 'month')?.value ?? '',
    dayNum: long.find((p) => p.type === 'day')?.value ?? get('day'),
  };
}

/** "YYYY-MM-DD" — 用于收信去重。 */
export function beijingDateKey(now: Date = new Date()): string {
  const p = beijingDateParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "YYYY/MM/DD" — 卡片中文日期。 */
export function beijingDateCN(now: Date = new Date()): string {
  const p = beijingDateParts(now);
  return `${p.year}/${p.month}/${p.day}`;
}

/** "September 9, 2026" — 卡片英文日期。 */
export function beijingDateEN(now: Date = new Date()): string {
  const p = beijingDateParts(now);
  return `${p.monthName} ${p.dayNum}, ${p.year}`;
}
