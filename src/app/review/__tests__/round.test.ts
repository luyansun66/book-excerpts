import { describe, expect, it } from 'vitest';
import type { Quote } from '../../types';
import type { DeckEntry } from '../deck';
import { HISTORY_SIZE, buildRound, canGoNext, canGoPrev, isAtRoundEnd, recentQuotes, reviewedCount } from '../round';

function quote(id: string): Quote {
  return {
    id,
    bookId: 'b1',
    text: `摘录 ${id}`,
    thought: '',
    page: null,
    date: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** 手搓一轮，避开 pickRound 的随机性，专门测轮次的算术。 */
function makeRound(pickedIds: string[], historyIds: string[]): ReturnType<typeof buildRound> {
  const entries: DeckEntry[] = [...historyIds, ...pickedIds].map((id, i) => ({
    kind: 'excerpt',
    key: `${i}:${id}`,
    quote: quote(id),
  }));
  return {
    deck: [...entries, { kind: 'roundEnd', key: 'round-end', count: pickedIds.length }],
    index: historyIds.length,
    count: pickedIds.length,
    historyLen: historyIds.length,
  };
}

describe('buildRound', () => {
  it('把抽出来的摘录排在历史卡后面，末尾挂过渡卡', () => {
    const round = buildRound(Array.from({ length: 30 }, (_, i) => quote(`q${i}`)), [quote('h1'), quote('h2')]);
    expect(round.historyLen).toBe(2);
    expect(round.count).toBe(HISTORY_SIZE * 3);
    expect(round.index).toBe(2);
    expect(round.deck.length).toBe(2 + round.count + 1);
    expect(round.deck[round.deck.length - 1]?.kind).toBe('roundEnd');
    expect(round.deck[0]).toMatchObject({ kind: 'excerpt', quote: { id: 'h1' } });
    expect(round.deck[1]).toMatchObject({ kind: 'excerpt', quote: { id: 'h2' } });
  });

  it('空库也能建出一轮（只有过渡卡），不会崩', () => {
    const round = buildRound([], []);
    expect(round.deck.length).toBe(1);
    expect(round.count).toBe(0);
  });

  it('起步停在本轮第一张，而不是历史卡上', () => {
    const round = makeRound(['a', 'b', 'c'], ['h1', 'h2']);
    expect(round.index).toBe(2);
    expect(reviewedCount(round)).toBe(0);
    expect(round.deck[round.index]).toMatchObject({ quote: { id: 'a' } });
  });
});

describe('reviewedCount', () => {
  it('翻一张加一个，翻回一张减一个', () => {
    const round = makeRound(['a', 'b', 'c'], []);
    expect(reviewedCount(round)).toBe(0);
    expect(reviewedCount({ ...round, index: 1 })).toBe(1);
    expect(reviewedCount({ ...round, index: 3 })).toBe(3);
    expect(reviewedCount({ ...round, index: 2 })).toBe(2);
  });

  it('往回翻进历史卡时夹到 0，不出现负数', () => {
    const round = makeRound(['a', 'b', 'c'], ['h1', 'h2']);
    for (let index = 0; index < 2; index += 1) {
      expect(reviewedCount({ ...round, index })).toBe(0);
    }
  });

  it('翻完停在过渡卡上正好是本轮张数', () => {
    const round = makeRound(['a', 'b', 'c'], []);
    expect(reviewedCount({ ...round, index: round.deck.length - 1 })).toBe(3);
  });
});

describe('canGoPrev / canGoNext / isAtRoundEnd', () => {
  it('两端各有一条路走不通', () => {
    const round = makeRound(['a', 'b'], ['h1']);
    const first = { ...round, index: 0 };
    const last = { ...round, index: round.deck.length - 1 };
    expect(canGoPrev(first)).toBe(false);
    expect(canGoNext(first)).toBe(true);
    expect(isAtRoundEnd(first)).toBe(false);
    expect(canGoPrev(last)).toBe(true);
    expect(canGoNext(last)).toBe(false);
    expect(isAtRoundEnd(last)).toBe(true);
  });

  it('只有过渡卡一轮（空库）不算"翻完了"', () => {
    const round = buildRound([], []);
    expect(isAtRoundEnd(round)).toBe(false);
  });
});

describe('recentQuotes', () => {
  it('取本轮最后几张，且不把过渡卡算进去', () => {
    const round = makeRound(['a', 'b', 'c', 'd', 'e', 'f', 'g'], []);
    expect(recentQuotes(round).map((q) => q.id)).toEqual(['c', 'd', 'e', 'f', 'g']);
  });

  it('不足 HISTORY_SIZE 时有多少给多少', () => {
    const round = makeRound(['a', 'b'], []);
    expect(recentQuotes(round).map((q) => q.id)).toEqual(['a', 'b']);
  });

  it('本轮张数够多时，取到的就是本轮最后几张', () => {
    const round = makeRound(['a', 'b', 'c'], ['h1', 'h2']);
    // 只有 5 张摘录时，"最近看过的 5 张"恰好把上一轮留的两张也算进来 —— 它们确实刚看过。
    expect(recentQuotes(round).map((q) => q.id)).toEqual(['h1', 'h2', 'a', 'b', 'c']);
  });

  it('新开一轮后仍能往回翻到最后那几张（跨轮回翻）', () => {
    const first = makeRound(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['old1', 'old2']);
    const next = makeRound(['x', 'y'], recentQuotes(first).map((q) => q.id));
    // 停在 x 上，往回退 HISTORY_SIZE 步正好走完上一轮的尾巴
    expect(next.index).toBe(HISTORY_SIZE);
    const back: string[] = [];
    for (let index = next.index - 1; index >= 0; index -= 1) {
      const entry = next.deck[index];
      back.push(entry.kind === 'excerpt' ? entry.quote.id : '?');
    }
    expect(back).toEqual(['g', 'f', 'e', 'd', 'c']);
    for (const index of [0, 1, 2, 3, 4]) {
      expect(reviewedCount({ ...next, index })).toBe(0);
    }
  });
});
