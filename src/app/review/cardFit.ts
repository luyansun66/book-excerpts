// ─── 卡片排版：字号分档 + 截断 ────────────────────────────────────────────────
//
// 卡片尺寸固定，字号得反过来迁就文字长度。分档而不是连续缩放，是为了让同一个架子上的
// 卡看起来是一套东西 —— 连续缩放会让每张卡的字号都不一样，很碎。
//
// 这里只放纯计算。真正的「放不放得下」必须在 DOM 里量：中英混排的字宽、标点避头尾、
// 字体的实际度量都算不准，所以分档只用来给一个起手值，最终以实测为准。

/** 由大到小的字号档位，单位 px。 */
export const FONT_TIERS = [21, 19, 17, 15.5, 14, 13];

/** 正文最多几行，超了就截断 + 引导点开全文。 */
export const MAX_LINES = 9;

/** 正文行高倍数。阴影、翻页都不依赖它，只有测量需要，所以放这儿统一。 */
export const LINE_HEIGHT_RATIO = 1.62;

const CJK = /[\u2E80-\u9FFF\u3000-\u303F\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;
const WHITESPACE = /\s/;

/**
 * 把一段文字折算成「相当于几个汉字宽」。
 *
 * 只数字符数的话，一段英文会被严重高估（一个字母还不到半个汉字宽），结果是英文摘录
 * 永远用最小号。西文按 0.55 个汉字折，空格再轻一点；换行按一整行算，避免多行摘录被低估。
 */
export function weightedLength(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (ch === '\n') {
      width += MAX_LINES;
      continue;
    }
    if (WHITESPACE.test(ch)) {
      width += 0.35;
      continue;
    }
    width += CJK.test(ch) ? 1 : 0.55;
  }
  return width;
}

/** 各档位大概能装多少个「汉字宽」—— 只用来给起手档位，差一档无所谓。 */
const GUESS_BREAKPOINTS = [220, 420, 700, 1080, 1560];

/** 起手猜一个档位，省掉从最大号一路试下来的几轮测量。 */
export function guessTierIndex(text: string): number {
  const width = weightedLength(text);
  for (let i = 0; i < GUESS_BREAKPOINTS.length; i += 1) {
    if (width <= GUESS_BREAKPOINTS[i]) return i;
  }
  return FONT_TIERS.length - 1;
}

/**
 * 从最大档往下找第一个放得下的档位；全都放不下就用最小档（配合截断）。
 *
 * fits 由调用方注入 —— 真实测量在 DOM 里，这里保持纯函数好测。
 */
export function pickTierIndex(fits: (index: number) => boolean, tierCount: number = FONT_TIERS.length): number {
  for (let i = 0; i < tierCount; i += 1) {
    if (fits(i)) return i;
  }
  return tierCount - 1;
}
