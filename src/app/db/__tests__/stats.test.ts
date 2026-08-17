import { describe, it, expect } from 'vitest';

function computeStreaks(dates: string[]): { currentStreak: number; longestStreak: number } {
  const sorted = [...dates].sort();
  const today = new Date();
  const dateSet = new Set(sorted);

  let currentStreak = 0;
  let longestStreak = 1;

  if (sorted.length === 0) return { currentStreak: 0, longestStreak: 0 };

  let check = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (true) {
    const key = `${check.getFullYear()}-${String(check.getMonth() + 1).padStart(2, '0')}-${String(check.getDate()).padStart(2, '0')}`;
    if (dateSet.has(key)) {
      currentStreak++;
      check = new Date(check.getFullYear(), check.getMonth(), check.getDate() - 1);
    } else if (currentStreak > 0) {
      break;
    } else {
      check = new Date(check.getFullYear(), check.getMonth(), check.getDate() - 1);
      const daysBack = (today.getTime() - check.getTime()) / 86400000;
      if (daysBack > 365) break;
    }
  }

  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (Math.abs(diff - 1) < 0.01) {
      run++;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }
  if (sorted.length === 0) longestStreak = 0;

  return { currentStreak, longestStreak };
}

describe('computeStreaks', () => {
  it('空数组返回 0', () => {
    const result = computeStreaks([]);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it('今天有记录 currentStreak >= 1', () => {
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const result = computeStreaks([key]);
    expect(result.currentStreak).toBeGreaterThanOrEqual(1);
  });

  it('连续3天+间隔+连续2天 longestStreak=3', () => {
    const result = computeStreaks(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06']);
    expect(result.longestStreak).toBe(3);
  });

  it('不连续 longestStreak=1', () => {
    const result = computeStreaks(['2026-01-01', '2026-01-03', '2026-01-05']);
    expect(result.longestStreak).toBe(1);
  });
});

describe('searchQuotes logic', () => {
  function searchQuotes(
    keyword: string,
    quotes: Array<{ text: string; thought: string }>,
    books: Array<{ title: string; author: string; id: number }>,
    bookIdMap: Record<number, number>,
  ): number {
    const lower = keyword.toLowerCase();
    let count = 0;
    for (const q of quotes) {
      const book = books.find(b => b.id === bookIdMap[quotes.indexOf(q)]);
      const haystack = [q.text, q.thought, book?.title ?? '', book?.author ?? ''].filter(Boolean).join(' ');
      if (haystack.toLowerCase().includes(lower)) count++;
    }
    return count;
  }

  const books = [{ title: '德米安', author: '黑塞', id: 1 }, { title: '百年孤独', author: '马尔克斯', id: 2 }];
  const quotes = [
    { text: '每个人都带着他诞生时的残渣', thought: '关于生命', },
    { text: '许多年之后', thought: '', },
  ];
  const map: Record<number, number> = { 0: 1, 1: 2 };

  it('搜正文匹配', () => expect(searchQuotes('残渣', quotes, books, map)).toBe(1));
  it('搜书名匹配', () => expect(searchQuotes('德米安', quotes, books, map)).toBe(1));
  it('搜作者匹配', () => expect(searchQuotes('马尔克斯', quotes, books, map)).toBe(1));
  it('搜感悟匹配', () => expect(searchQuotes('生命', quotes, books, map)).toBe(1));
  it('搜无匹配', () => expect(searchQuotes('xyz', quotes, books, map)).toBe(0));
});
