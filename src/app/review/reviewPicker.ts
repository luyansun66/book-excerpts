// ─── 摘录回顾：选卡 ──────────────────────────────────────────────────────────
//
// 每轮从摘录库里挑 DECK_SIZE 张，三条规则叠在一起：
//   1. 越久没回顾的权重越高（从没回顾过的按 MAX_WEIGHT_DAYS 算）；
//   2. 刚翻过的进冷却期，新一轮不再出现；
//   3. 同权重之间靠随机决定先后 —— 用加权无放回抽样，不是「算分排序取前 N」。
//
// 第 3 点是有意为之。算分排序每轮都会选出同一批「最久没看」的卡，连顺序都差不多，
// 用户翻两轮就腻了。加权无放回抽样（Efraimidis–Spirakis）保留优先级，但每轮的具体
// 组合和顺序都不一样：分高的更容易排在前面，而不是必然排在最前面。

import type { Quote } from '../types';

/** 每轮抽多少张。需求给的是 10–20，取中间值。 */
export const DECK_SIZE = 15;

/** 权重上限：≥ 一年没看的，都按一年算。 */
export const MAX_WEIGHT_DAYS = 365;

/** 权重下限：刚翻过的也不能是 0，否则库里卡不够时这一轮永远填不满。 */
export const MIN_WEIGHT_DAYS = 0.25;

/** 冷却期：这么久之内翻过的不进新一轮。 */
export const COOLDOWN_HOURS = 24;

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

export interface PickRoundOptions {
  size?: number;
  now?: Date;
  cooldownHours?: number;
  /** 注入随机源，测试用。 */
  rng?: () => number;
}

/** 距上次回顾过了多少天；从没回顾过、或时间戳坏掉时返回 null。 */
export function daysSinceReview(quote: Quote, now: Date | number = new Date()): number | null {
  if (!quote.lastReviewedAt) return null;
  const at = new Date(quote.lastReviewedAt).getTime();
  if (Number.isNaN(at)) return null;
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return Math.max(0, (nowMs - at) / MS_PER_DAY);
}

/** 回顾权重：天数夹在 [MIN_WEIGHT_DAYS, MAX_WEIGHT_DAYS] 之间。 */
export function reviewWeight(quote: Quote, now: Date | number = new Date()): number {
  const days = daysSinceReview(quote, now);
  if (days === null) return MAX_WEIGHT_DAYS;
  return Math.min(Math.max(days, MIN_WEIGHT_DAYS), MAX_WEIGHT_DAYS);
}

/** 冷却期内的卡（刚翻过不久）。 */
export function isCooling(quote: Quote, nowMs: number, cooldownHours: number = COOLDOWN_HOURS): boolean {
  if (!quote.lastReviewedAt) return false;
  const at = new Date(quote.lastReviewedAt).getTime();
  if (Number.isNaN(at)) return false;
  return nowMs - at < cooldownHours * MS_PER_HOUR;
}

/**
 * 加权无放回抽样，返回的顺序就是优先级顺序，可以直接当 deck 用。
 *
 * 给每项算 key = u^(1/w)（u ~ U(0,1]），取 key 最大的前 N 个：这样每项被选中的概率
 * 正比于权重，且不会重复。实现里写成 ln(u)/w —— 权重最大到 365，直接算 u^(1/365)
 * 会全部挤在 0.99…1.0 之间，精度不够。
 */
export function weightedSample<T>(
  items: readonly T[],
  count: number,
  weightOf: (item: T) => number,
  rng: () => number = Math.random,
): T[] {
  if (count <= 0 || items.length === 0) return [];

  return items
    .map((item) => {
      const weight = Math.max(weightOf(item), MIN_WEIGHT_DAYS);
      // rng() 可能返回 0，而 ln(0) 是 -∞，夹到 EPSILON 上即可
      const u = Math.min(Math.max(rng(), Number.EPSILON), 1);
      return { item, key: Math.log(u) / weight };
    })
    .sort((a, b) => b.key - a.key)
    .slice(0, Math.min(count, items.length))
    .map((entry) => entry.item);
}

/**
 * 抽一轮，返回值就是这一轮的翻卡顺序。
 *
 * 库里「不在冷却期」的卡够多时，冷却期的直接排除；不够时把冷却期的也放回来，
 * 靠权重把它们挤到队尾（MIN_WEIGHT_DAYS 那个下限就是为这一步留的）。
 */
export function pickRound(quotes: readonly Quote[], options: PickRoundOptions = {}): Quote[] {
  const { size = DECK_SIZE, now = new Date(), cooldownHours = COOLDOWN_HOURS, rng = Math.random } = options;
  if (quotes.length === 0) return [];

  const nowMs = now.getTime();
  const available = quotes.filter((q) => !isCooling(q, nowMs, cooldownHours));
  const pool = available.length >= size ? available : quotes;

  return weightedSample(pool, Math.min(size, pool.length), (q) => reviewWeight(q, nowMs), rng);
}
