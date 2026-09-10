// ─── 时光信箱核心逻辑：按“累计收信次数”编号，同日复用同一封信 ───────────────
// 编号 = 已完成收信的次数（不是日期序号）：
//   第 1/2/3 天各点一次 → 1、2、3；第 4 天未点 → 不变；第 5 天点 → 4。
// 同一天重复点击 → 重开当天同一封（同摘录、同编号）。

import { getBook, getLetterBox, getQuote, getRandomQuote, LETTER_BOX_KEY, saveLetterBox } from '../db';
import type { LetterBox } from '../types';
import { beijingDateCN, beijingDateEN, beijingDateKey } from './dates';
import { generateLetterSvg } from './svgGenerator';

// ─── 第一封信的内置文案 ────────────────────────────────────────────────────────
// 新用户一条摘录都还没有时，不弹「还没有摘录」的空状态，而是把这段话当成开箱礼送出。
// 它不写进数据库（不能污染「我的摘录」），只在信箱状态里留一个哨兵 id，
// 这样同一天再打开信箱仍然是同一封第一封信。
export const FIRST_LETTER_QUOTE_ID = '__first_letter__';

export const FIRST_LETTER = {
  quoteText:
    '人生一世，最后会发现名利财富都是空，人能够拥有的只有生命本身。' +
    '但生命的流逝使得它难以实现超越时段的自我确认，唯有文字能够担当此任，宣告生命曾经在场。' +
    '经由它们，我们得以端详生命的纹理，探寻生命的本质与深意。',
  bookTitle: '咀嚼人生',
  bookAuthor: '曾文寂',
} as const;

export interface Letter {
  number: number;
  quoteText: string;
  bookTitle: string;
  bookAuthor: string;
  svg: string;
}

export type LetterResult = Letter | { error: string };

async function buildLetter(
  number: number,
  quoteText: string,
  bookTitle: string,
  bookAuthor: string,
): Promise<Letter> {
  const svg = generateLetterSvg({
    number,
    dateCN: beijingDateCN(),
    dateEN: beijingDateEN(),
    quote: quoteText,
    bookTitle,
    bookAuthor,
  });
  return { number, quoteText, bookTitle, bookAuthor, svg };
}

export async function obtainLetter(): Promise<LetterResult> {
  const today = beijingDateKey();
  const state = await getLetterBox();

  // 同一天再次打开 → 复用已锁定的那封信
  if (state && state.lastReceiveDate === today) {
    if (state.quoteId === FIRST_LETTER_QUOTE_ID) {
      return buildLetter(state.receivedCount, FIRST_LETTER.quoteText, FIRST_LETTER.bookTitle, FIRST_LETTER.bookAuthor);
    }
    const quote = state.quoteId ? await getQuote(state.quoteId) : null;
    const text = quote?.text ?? '';
    const bookTitle = quote ? ((await getBook(quote.bookId))?.title ?? '未知') : '未知';
    const bookAuthor = quote ? ((await getBook(quote.bookId))?.author ?? '佚名') : '佚名';
    return buildLetter(state.receivedCount, text, bookTitle, bookAuthor);
  }

  // 新的一天第一次收信 → 计数 +1，随机抽一条过往摘录
  const receivedCount = (state?.receivedCount ?? 0) + 1;
  const quote = await getRandomQuote();

  // 一条摘录都没有（刚注册的新用户，或摘录被清空）→ 第一封信送内置文案
  if (!quote) {
    await saveLetterBox({
      id: LETTER_BOX_KEY,
      receivedCount,
      lastReceiveDate: today,
      quoteId: FIRST_LETTER_QUOTE_ID,
    });
    return buildLetter(receivedCount, FIRST_LETTER.quoteText, FIRST_LETTER.bookTitle, FIRST_LETTER.bookAuthor);
  }

  const book = await getBook(quote.bookId);

  const next: LetterBox = {
    id: LETTER_BOX_KEY,
    receivedCount,
    lastReceiveDate: today,
    quoteId: quote.id,
  };
  await saveLetterBox(next);

  return buildLetter(receivedCount, quote.text, book?.title ?? '未知', book?.author ?? '佚名');
}
