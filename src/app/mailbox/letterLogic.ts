// ─── 时光信箱核心逻辑：按“累计收信次数”编号，同日复用同一封信 ───────────────
// 编号 = 已完成收信的次数（不是日期序号）：
//   第 1/2/3 天各点一次 → 1、2、3；第 4 天未点 → 不变；第 5 天点 → 4。
// 同一天重复点击 → 重开当天同一封（同摘录、同编号）。

import { getBook, getLetterBox, getQuote, getRandomQuote, LETTER_BOX_KEY, saveLetterBox } from '../db';
import type { LetterBox } from '../types';
import { beijingDateCN, beijingDateEN, beijingDateKey } from './dates';
import { generateLetterSvg } from './svgGenerator';

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
    const quote = state.quoteId ? await getQuote(state.quoteId) : null;
    const text = quote?.text ?? '';
    const bookTitle = quote ? ((await getBook(quote.bookId))?.title ?? '未知') : '未知';
    const bookAuthor = quote ? ((await getBook(quote.bookId))?.author ?? '佚名') : '佚名';
    return buildLetter(state.receivedCount, text, bookTitle, bookAuthor);
  }

  // 新的一天第一次收信 → 计数 +1，随机抽一条过往摘录
  const quote = await getRandomQuote();
  if (!quote) return { error: '还没有摘录，先去记录一条吧' };

  const receivedCount = (state?.receivedCount ?? 0) + 1;
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
