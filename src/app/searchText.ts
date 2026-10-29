import type { Quote } from './types';
import { stripRichText } from './richText';

/**
 * 搜索用的 haystack：摘录正文 + 感悟 + 书名 + 作者，全部按纯文本拼。
 *
 * 标记符号（== / **）不进 haystack —— 否则搜 `==` 会把所有高亮过的摘录全捞出来，
 * 而这些符号对用户没有意义。
 */
export function quoteHaystack(
  quote: Pick<Quote, 'text' | 'thought'>,
  bookTitle: string,
  bookAuthor: string,
): string {
  return [
    stripRichText(quote.text, 'quote'),
    stripRichText(quote.thought, 'thought'),
    bookTitle,
    bookAuthor,
  ]
    .filter(Boolean)
    .join(' ');
}
