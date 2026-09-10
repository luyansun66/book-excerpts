import { describe, expect, it } from 'vitest';
import { bigNumberInkCenter, generateLetterSvg } from '../svgGenerator';
import { GEO_ITALIC_UPEM, HAN_UPEM, georgiaItalicGlyph, hanGlyph } from '../letterMetrics';

// 独立复算：文本「最后一个字形墨迹最右缘」到笔位起点的距离（px）= visibleBounds 右缘。
// 中文字形走华康宋体、西文走 Georgia Italic，与出处行的分字体规则一致。
function inkRightPx(text: string, size: number): number {
  let pen = 0;
  let trailingBearing = 0;
  let han = false;
  for (const ch of text) {
    // 空格跟随相邻文字，与出处行的分字体规则一致
    if (ch !== ' ' || pen === 0) {
      han = /[\u2e80-\u2eff\u3000-\u303f\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch) || ch === '·';
    }
    const cp = ch.codePointAt(0)!;
    const glyph = han ? hanGlyph(cp) : georgiaItalicGlyph(cp);
    if (!glyph) continue;
    const upem = han ? HAN_UPEM : GEO_ITALIC_UPEM;
    pen += (glyph.adv / upem) * size;
    trailingBearing = ((glyph.adv - glyph.xMax) / upem) * size;
  }
  return pen - trailingBearing;
}

/** 取出摘录各行（字号 + 基线 + 文本）。 */
function quoteLinesOf(svg: string): Array<{ size: number; y: number; text: string }> {
  return [...svg.matchAll(
    /class="letter-quote" style="font-size:([\d.]+)px" transform="translate\(220 ([\d.]+)\)"><tspan x="0" y="0">([^<]+)<\/tspan>/g,
  )].map(([, size, y, text]) => ({ size: Number(size), y: Number(y), text }));
}

/** 取出出处各行（文字左端 x + 基线 y + 文本）。 */
function attrLinesOf(svg: string): Array<{ x: number; y: number; text: string }> {
  return [...svg.matchAll(
    /<text class="letter-attr" style="font-size:35px" transform="translate\(([\d.]+) ([\d.]+)\)">([\s\S]*?)<\/text>/g,
  )].map(([, x, y, inner]) => ({
    x: Number(x),
    y: Number(y),
    text: [...inner.matchAll(/>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(''),
  }));
}

const base = {
  number: 47,
  dateCN: '2026/09/09',
  dateEN: 'September 9, 2026',
  bookTitle: '小王子',
  bookAuthor: 'Antoine de Saint-Exupéry',
};

const quote = '所有的大人都曾经是小孩，虽然，只有少数的人记得。';

describe('generateLetterSvg', () => {
  it('replaces every placeholder and fills the dynamic fields', () => {
    const svg = generateLetterSvg({ ...base, quote });

    expect(svg).not.toContain('{{');
    expect(svg).toContain('>47</tspan>');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('第47封信');
    expect(svg).toContain('Letter No. 47');
    expect(svg).toContain('折角书摘·2026/09/09');
    expect(svg).toContain('Dogear · September 9, 2026');
    expect(svg).toContain('/assets/bg01.jpg');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('drops the leftover sample quote and the off-canvas bitmap', () => {
    const svg = generateLetterSvg({ ...base, quote });
    expect(svg).not.toContain('雪崩时');
    expect(svg).not.toContain('huaban');
    expect(svg).not.toContain('「摘录」');
    expect(svg).not.toContain('No. 47</tspan>'.replace('No. 47', 'No.'));
  });

  it('lays out the quote from the template anchor with 4/3 leading', () => {
    const svg = generateLetterSvg({ ...base, quote });

    // 模板坐标：左起点 220、首行基线 867.5；45px 档行距 = round(45 × 4/3) = 60
    expect(svg).toContain('class="letter-quote" style="font-size:45px" transform="translate(220 867.5)"');
    expect(svg).toContain('class="letter-quote" style="font-size:45px" transform="translate(220 927.5)"');
    expect(svg).toContain('所有的大人都曾经是小孩');
  });

  it('caps the quote at 45px and floors it at 40px', () => {
    const short = generateLetterSvg({ ...base, quote: '一句摘录。' });
    expect(short).toContain('style="font-size:45px"');
    expect(short).not.toContain('style="font-size:48px"');

    // 逐档缩到 40px 仍放不下时才截断摘录
    const huge = generateLetterSvg({ ...base, quote: '这句话特别长，'.repeat(200) });
    expect(huge).toContain('style="font-size:40px"');
    expect(huge).toContain('…');
  });

  it('keeps the big number live text (never outlined) and centred by real glyph bounds', () => {
    const svg = generateLetterSvg({ ...base, number: 47, quote });

    // 文字仍是可编辑的 <text>/<tspan>，没有被转曲
    expect(svg).toContain('<text class="letter-bignum" text-anchor="middle"');
    expect(svg).toContain('><tspan x="0" y="0">47</tspan></text>');

    // Georgia 旧式数字：47 的轮廓并集中心相对锚点为 (0.0141602, -0.1791992) em
    expect(svg).toContain('style="font-size:220px" transform="translate(280.4 320.3)"');

    const three = generateLetterSvg({ ...base, number: 123, quote });
    expect(three).toContain('style="font-size:170px" transform="translate(282.9 311.6)"');
  });

  it('lands the glyph outline centre on the house centre for every digit string', () => {
    // 右格小房子 path 的包围盒 y ∈ [202.3, 359.4] → 中心 280.85；编号所在左格中心 x = 283.5
    for (const digits of ['1', '2', '6', '8', '9', '47', '123', '2024', '99999']) {
      const svg = generateLetterSvg({ ...base, number: Number(digits), quote });
      const m = /text-anchor="middle" style="font-size:([\d.]+)px" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"><tspan x="0" y="0">(\d+)<\/tspan>/.exec(svg);

      expect(m, `missing bignum node for ${digits}`).not.toBeNull();
      const [, size, x, y, text] = m!;
      expect(text).toBe(digits);

      // 锚点 + 轮廓中心偏移 = 真实字形中心，必须落在目标点上（round1 精度 0.1）
      const ink = bigNumberInkCenter(digits);
      expect(Number(x) + ink.x * Number(size)).toBeCloseTo(283.5, 0);
      expect(Number(y) + ink.y * Number(size)).toBeCloseTo(280.85, 0);
    }
  });

  it('right-aligns the attribution to the quote right edge with a 70px rule', () => {
    const svg = generateLetterSvg({ ...base, quote, bookTitle: '三体', bookAuthor: '刘慈欣' });
    expect(svg.match(/class="letter-attr"/g)).toHaveLength(1);

    const quoteLines = quoteLinesOf(svg);
    const quoteRight = Math.max(...quoteLines.map((l) => 220 + inkRightPx(l.text, l.size)));

    const attrs = attrLinesOf(svg);
    expect(attrs).toHaveLength(1);
    expect(attrs[0].x + inkRightPx('《三体》· 刘慈欣', 35)).toBeCloseTo(quoteRight, 1);

    // 等长横线挂在文字左侧，长度 70px，纵向在基线上方 12px
    const rule = /<line class="letter-attr-rule" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/.exec(svg)!;
    expect(Number(rule[3]) - Number(rule[1])).toBeCloseTo(70, 1);
    expect(Number(rule[3])).toBeCloseTo(attrs[0].x, 1);
    expect(Number(rule[2])).toBeCloseTo(attrs[0].y - 12, 1);
    expect(svg).toContain('《三体》· 刘慈欣');
    expect(svg).not.toContain('——');
  });

  it('shares one right edge between the attribution and the quote’s rightmost line', () => {
    // 用字形墨迹边界（不是 Em 框）复算两边右缘：中文作者与拉丁作者都要贴合。
    // 拉丁作者是旧版按字符估算表出错的场景（曾差 30px），必须覆盖。
    const authors = [
      { bookTitle: '三体', bookAuthor: '刘慈欣' },
      { bookTitle: '小王子', bookAuthor: 'Antoine de Saint-Exupéry' },
      { bookTitle: '百年孤独', bookAuthor: '加西亚·马尔克斯' },
    ];

    for (const { bookTitle, bookAuthor } of authors) {
      const svg = generateLetterSvg({ ...base, quote, bookTitle, bookAuthor });
      const lines = quoteLinesOf(svg);
      expect(lines.length).toBeGreaterThan(1);

      const quoteRight = Math.max(...lines.map((l) => 220 + inkRightPx(l.text, l.size)));
      const [, attrX] = /class="letter-attr" style="font-size:35px" transform="translate\(([\d.]+) /.exec(svg)!;
      const attrRight = Number(attrX) + inkRightPx(`《${bookTitle}》· ${bookAuthor}`, 35);

      expect(attrRight, `${bookAuthor} 未与摘录右缘对齐`).toBeCloseTo(quoteRight, 1);
    }
  });

  // 间距按「墨迹」定义：摘录末行墨迹底 → 出处首行墨迹顶。实现把它换算成基线距，
  // 换算用的两端字形墨迹取保守上界：出处首行首字「《」高 0.85em，摘录末字降部 0.22em。
  const baselineGapOf = (svg: string) => {
    const quoteLines = quoteLinesOf(svg);
    const attrs = attrLinesOf(svg);
    return attrs[0].y - Math.max(...quoteLines.map((l) => l.y));
  };
  const impliedBaselineGap = (inkGap: number, quoteSize: number) =>
    0.22 * quoteSize + inkGap + 0.85 * 35;

  it('uses the comfortable ink gap when the quote leaves room below', () => {
    const svg = generateLetterSvg({ ...base, quote: '一句摘录。' });
    const size = quoteLinesOf(svg)[0].size;
    expect(baselineGapOf(svg)).toBeCloseTo(impliedBaselineGap(120, size), 0);

    const attrs = attrLinesOf(svg);
    const [, ruleY] = /class="letter-attr-rule" x1="[\d.]+" y1="([\d.]+)"/.exec(svg)!;
    expect(Number(ruleY)).toBeCloseTo(attrs[0].y - 12, 1);
  });

  it('tightens the ink gap for a long quote but never below 85px, keeping 30px off the bottom rule', () => {
    const longQuote = '四季更替，草木荣枯，'.repeat(14) + '夜。';
    const svg = generateLetterSvg({ ...base, quote: longQuote });

    const lines = quoteLinesOf(svg);
    expect(lines.length).toBeGreaterThan(2);
    // 每行都在 45–40 档内，且行宽不超过正文列宽
    for (const l of lines) {
      expect(l.size).toBeLessThanOrEqual(45);
      expect(l.size).toBeGreaterThanOrEqual(40);
    }

    expect(baselineGapOf(svg)).toBeGreaterThanOrEqual(impliedBaselineGap(85, 40) - 0.5);
    expect(baselineGapOf(svg)).toBeLessThanOrEqual(impliedBaselineGap(120, 45) + 0.5);

    const attrs = attrLinesOf(svg);
    expect(attrs[attrs.length - 1].y).toBeLessThanOrEqual(1413.1 - 30);
  });

  it('never lets the attribution cross the bottom rule', () => {
    const svg = generateLetterSvg({
      ...base,
      quote: '这句话特别长，'.repeat(200),
      bookTitle: '一本书名极其漫长的书'.repeat(3),
      bookAuthor: '一位名字同样非常漫长的作者'.repeat(3),
    });

    expect(svg).not.toContain('NaN');
    expect(svg).toContain('…');

    const [, baseline] = /class="letter-attr" style="font-size:35px" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"/.exec(svg) ?? [];
    expect(Number(baseline)).toBeLessThan(1413.1);
  });

  it('escapes XML special characters in the quote', () => {
    const svg = generateLetterSvg({ ...base, quote: '他说：“你好” & <世界>' });
    expect(svg).not.toContain('<世界>');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&lt;世界&gt;');
  });

  it('keeps a short quote on a single line', () => {
    const svg = generateLetterSvg({ ...base, quote: '一句摘录。' });
    expect(quoteLinesOf(svg)).toHaveLength(1);
    expect(svg).toContain('一句摘录。');
  });

  it('wraps the attribution when the quote is short and the title/author is long', () => {
    // 单行摆不下时不再把整行左移到内容边界外（曾导致右缘超出摘录右缘 ~25px），
    // 而是折成「《书名》」/「· 作者」两行，两行右缘都贴住摘录右缘。
    const svg = generateLetterSvg({
      ...base,
      quote: '人是为了活着本身而活着。',
      bookTitle: '小王子',
      bookAuthor: 'Antoine de Saint-Exupéry',
    });

    const quoteLines = quoteLinesOf(svg);
    expect(quoteLines).toHaveLength(1);
    const quoteRight = 220 + inkRightPx(quoteLines[0].text, quoteLines[0].size);

    const attrs = attrLinesOf(svg);
    // 折行后分隔符跟着作者落到次行行首，首行以书名号收尾（右缘更「实」）
    expect(attrs.map((l) => l.text)).toEqual(['《小王子》', '· Antoine de Saint-Exupéry']);
    for (const line of attrs) {
      expect(
        line.x + inkRightPx(line.text, 35),
        `${line.text} 未与摘录右缘对齐`,
      ).toBeCloseTo(quoteRight, 1);
    }

    // 横线只挂在首行左侧，且整段不越左侧内容边界（60.2）
    const rule = /<line class="letter-attr-rule" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/.exec(svg)!;
    expect(Number(rule[1])).toBeCloseTo(attrs[0].x - 70, 1);
    expect(Number(rule[1])).toBeGreaterThanOrEqual(60.2);
    expect(Number(rule[2])).toBeCloseTo(attrs[0].y - 12, 1);
    // 折行后末行仍要留在底部横线之上（≥30px）
    expect(attrs[attrs.length - 1].y).toBeLessThanOrEqual(1413.1 - 30);
    expect(attrs[1].y).toBeGreaterThan(attrs[0].y);
  });

  it('keeps every attribution line inside the left content margin', () => {
    const samples = [
      { quote: '一句摘录。', bookTitle: '小王子', bookAuthor: 'Antoine de Saint-Exupéry' },
      { quote: '一句摘录。', bookTitle: '三体', bookAuthor: '刘慈欣' },
      { quote: '人是为了活着本身而活着。', bookTitle: '长安的荔枝', bookAuthor: '马伯庸' },
      {
        quote: '所有的大人都曾经是小孩，虽然，只有少数的人记得。',
        bookTitle: '一本书名极其漫长的书'.repeat(2),
        bookAuthor: '一位名字同样非常漫长的作者'.repeat(2),
      },
      { quote: '活。', bookTitle: '追忆似水年华'.repeat(4), bookAuthor: '马塞尔·普鲁斯特'.repeat(4) },
    ];

    for (const sample of samples) {
      const svg = generateLetterSvg({ ...base, ...sample });
      expect(svg).not.toContain('NaN');

      const attrs = attrLinesOf(svg);
      expect(attrs.length).toBeGreaterThanOrEqual(1);
      expect(attrs.length).toBeLessThanOrEqual(2);

      const quoteLines = quoteLinesOf(svg);
      const quoteRight = Math.max(...quoteLines.map((l) => 220 + inkRightPx(l.text, l.size)));

      attrs.forEach((line, i) => {
        // 首行左边要留得下横线，其余行直接受内容左边界约束
        const margin = 60.2 + (i === 0 ? 70 : 0);
        expect(line.x, `${sample.bookTitle} 第 ${i + 1} 行越出左边界`).toBeGreaterThanOrEqual(margin - 0.1);
        expect(line.x + inkRightPx(line.text, 35)).toBeLessThanOrEqual(quoteRight + 0.1);
      });
      expect(attrs[attrs.length - 1].y).toBeLessThanOrEqual(1413.1 - 30);
    }
  });
});
