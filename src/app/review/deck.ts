import type { Quote } from '../types';

/** 架子上的一个槽位。roundEnd 是每轮之间的过渡卡。 */
export type DeckEntry =
  | { kind: 'excerpt'; key: string; quote: Quote }
  | { kind: 'roundEnd'; key: string; count: number };
