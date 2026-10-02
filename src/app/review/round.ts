// ─── 摘录回顾：一轮的组成 ─────────────────────────────────────────────────────
//
// 一轮 = [上一轮留下的几张历史卡] + [本轮新抽的 DECK_SIZE 张] + [一张过渡卡]。
//
// 历史卡是为了让"翻回上一张"在跨轮的那一下还成立：一轮翻完重开时，手指如果在第一张
// 上往回滑，看到的应该是刚看过的那几张，而不是"没得翻了"。过渡卡排在最末尾，翻开它
// 就等于宣告本轮结束，页面据此延时重开（见 ReviewPage 的 ROUND_END_DWELL_MS）。
//
// 计数只数本轮新抽的那些：index 从 historyLen 起步，往回翻多少都不影响"已重读 x / n"。

import type { Quote } from '../types';
import type { DeckEntry } from './deck';
import { pickRound } from './reviewPicker';

/** 跨轮保留几张刚翻过的卡，好让用户还能往回翻两下。 */
export const HISTORY_SIZE = 5;

export interface RoundState {
  deck: DeckEntry[];
  index: number;
  /** 本轮抽了多少张（不含上一轮留下的历史卡）。 */
  count: number;
  /** deck 开头几张是历史卡。 */
  historyLen: number;
}

/** 组装一轮。历史卡在前，抽出来的摘录在后，末尾挂过渡卡。 */
export function buildRound(quotes: Quote[], history: Quote[]): RoundState {
  const picked = pickRound(quotes);
  const entries: DeckEntry[] = [...history, ...picked].map((quote, i) => ({
    kind: 'excerpt',
    key: `${i}:${quote.id}`,
    quote,
  }));
  return {
    deck: [...entries, { kind: 'roundEnd', key: 'round-end', count: picked.length }],
    index: history.length,
    count: picked.length,
    historyLen: history.length,
  };
}

const isExcerpt = (e: DeckEntry): e is Extract<DeckEntry, { kind: 'excerpt' }> => e.kind === 'excerpt';

/** 刚翻过去的那几张，用来当下一轮的历史卡。跳过末尾的过渡卡。 */
export function recentQuotes(round: RoundState): Quote[] {
  return round.deck
    .slice(0, round.deck.length - 1)
    .filter(isExcerpt)
    .slice(-HISTORY_SIZE)
    .map((e) => e.quote);
}

/** 本轮已经翻过去几张。往回翻进历史卡时会夹到 0，不会出现负数。 */
export function reviewedCount(round: RoundState): number {
  return Math.max(0, Math.min(round.index - round.historyLen, round.count));
}

export const canGoPrev = (round: RoundState): boolean => round.index > 0;
export const canGoNext = (round: RoundState): boolean => round.index < round.deck.length - 1;

/**
 * 翻到过渡卡上就等于本轮结束。
 *
 * 本轮一张都没抽到（库被清空 / 摘录全被删了）时不算结束 —— 那种情况下重开只会拿到
 * 又一模一样的空轮，变成每 1.2 秒闪一次的动画空转；停在过渡卡上反而看得清发生了什么。
 */
export const isAtRoundEnd = (round: RoundState): boolean =>
  round.count > 0 && round.deck.length > 1 && round.index === round.deck.length - 1;
