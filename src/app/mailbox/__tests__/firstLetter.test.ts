import { describe, expect, it } from 'vitest';
import { FIRST_LETTER, FIRST_LETTER_QUOTE_ID } from '../letterLogic';
import { generateLetterSvg } from '../svgGenerator';

// 新用户（摘录 0 条）收到的第一封信是内置文案，不来自数据库。
// 这里守住两个契约：文案本身完整成句、且能原样排进卡片（不截断、不越底部横线）。
describe('第一封信的内置文案', () => {
  const render = () =>
    generateLetterSvg({
      number: 1,
      dateCN: '2026/09/10',
      dateEN: 'September 10, 2026',
      quote: FIRST_LETTER.quoteText,
      bookTitle: FIRST_LETTER.bookTitle,
      bookAuthor: FIRST_LETTER.bookAuthor,
    });

  it('正文与出处分开存放，出处不重复写进正文', () => {
    expect(FIRST_LETTER.bookTitle).toBe('咀嚼人生');
    expect(FIRST_LETTER.bookAuthor).toBe('曾文寂');
    // 「——《咀嚼人生》曾文寂」是引用出处，由模板单独渲染，不能留在正文里
    for (const marker of ['——', '《', '》', '咀嚼人生', '曾文寂']) {
      expect(FIRST_LETTER.quoteText, `正文里不该出现「${marker}」`).not.toContain(marker);
    }
    // 完整文段：三段语义连贯，以句号收尾
    expect(FIRST_LETTER.quoteText.endsWith('深意。')).toBe(true);
    expect(FIRST_LETTER_QUOTE_ID).not.toBe('');
  });

  it('能完整排进卡片：不截断、字号在档位内、出处不越底部横线', () => {
    const svg = render();

    const sizes = [...svg.matchAll(/class="letter-quote" style="font-size:([\d.]+)px"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(1);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(37);
      expect(size).toBeLessThanOrEqual(45);
    }

    // 正文没被截断（模板截断时会补「…」，而这段正文本身不含省略号）
    expect(FIRST_LETTER.quoteText).not.toContain('…');
    expect(svg).not.toContain('…');

    // 出处单行右对齐，且距底部横线仍留够 30px
    const attrs = [...svg.matchAll(
      /<text class="letter-attr" style="font-size:([\d.]+)px" transform="translate\(([\d.]+) ([\d.]+)\)">([\s\S]*?)<\/text>/g,
    )].map(([, size, x, y, inner]) => ({
      size: Number(size),
      x: Number(x),
      y: Number(y),
      text: [...inner.matchAll(/>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(''),
    }));

    expect(attrs).toHaveLength(1);
    expect(attrs[0].text).toBe('《咀嚼人生》· 曾文寂');
    expect(attrs[0].size).toBe(34);
    expect(attrs[0].y).toBeLessThanOrEqual(1413.1 - 30);

    // 摘录末行 → 出处首行的墨迹间距不低于硬下限 85px
    const lastQuoteBaseline = Math.max(
      ...[...svg.matchAll(/class="letter-quote" style="font-size:[\d.]+px" transform="translate\(220 ([\d.]+)\)"/g)].map(
        (m) => Number(m[1]),
      ),
    );
    expect(attrs[0].y - lastQuoteBaseline - 0.22 * sizes[0] - 0.85 * 34).toBeGreaterThanOrEqual(85 - 0.5);
  });
});
