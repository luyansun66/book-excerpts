import { describe, expect, it } from 'vitest';
import { generateLetterSvg } from '../svgGenerator';

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

    // 模板坐标：左起点 220、首行基线 867.5、行距 64（48px × 4/3）
    expect(svg).toContain('class="letter-quote" style="font-size:48px" transform="translate(220 867.5)"');
    expect(svg).toContain('class="letter-quote" style="font-size:48px" transform="translate(220 931.5)"');
    expect(svg).toContain('所有的大人都曾经是小孩');
  });

  it('keeps the big number centred on the same optical centre at every tier', () => {
    const two = generateLetterSvg({ ...base, quote });
    expect(two).toContain('text-anchor="middle" style="font-size:220px" transform="translate(283.5 319.8)"');

    const three = generateLetterSvg({ ...base, number: 123, quote });
    // 170px 档：视觉中心 242.8 不变 → 基线 242.8 + 170 × 0.35 = 302.3
    expect(three).toContain('style="font-size:170px" transform="translate(283.5 302.3)"');
  });

  it('renders the attribution as one right-aligned line with a 70px rule, 50px below the quote', () => {
    const svg = generateLetterSvg({ ...base, quote, bookTitle: '三体', bookAuthor: '刘慈欣' });
    expect(svg.match(/class="letter-attr"/g)).toHaveLength(1);

    // 出处为单行，文字右边缘 = 960.2（宽度估算：8 个全角字 + 1 个空格）
    // 摘录 2 行末行基线 931.5 + 理想间距 50 → 出处基线 981.5（距底部横线 431.6 ≥ 30）
    expect(svg).toContain('<line class="letter-attr-rule" x1="599.0" y1="969.5" x2="669.0" y2="969.5"/>');
    expect(svg).toContain('class="letter-attr" style="font-size:35px" transform="translate(669.0 981.5)"');
    expect(svg).toContain('《三体》· 刘慈欣');
    expect(svg).not.toContain('——');
  });

  it('shrinks the attribution gap to 40-50px and stays at least 30px off the bottom rule', () => {
    // 44px 档 9 行：末行基线 867.5 + 8 × 59 = 1339.5，剩余净空 1383.1 - 1339.5 = 43.6 ∈ [40, 50]
    const longQuote = '四季更替，草木荣枯，'.repeat(14) + '夜。';
    const svg = generateLetterSvg({ ...base, quote: longQuote });

    expect(svg.match(/class="letter-quote"/g)).toHaveLength(9);

    const [, ruleY] = /class="letter-attr-rule" x1="[\d.]+" y1="([\d.]+)"/.exec(svg) ?? [];
    const [, baseline] = /class="letter-attr" style="font-size:35px" transform="translate\([\d.]+ ([\d.]+)\)/.exec(svg) ?? [];
    expect(Number(baseline)).toBeCloseTo(1383.1, 1);
    expect(Number(ruleY)).toBeCloseTo(1371.1, 1);

    const lastQuoteBaseline = 1339.5;
    const gap = Number(baseline) - lastQuoteBaseline;
    expect(gap).toBeGreaterThanOrEqual(40);
    expect(gap).toBeLessThanOrEqual(50);
    expect(Number(baseline)).toBeLessThanOrEqual(1413.1 - 30);
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
    expect(svg).toContain('一句摘录。');
    // 出处为单个文本节点（中英文分属两个 tspan，故分别断言）
    expect(svg.match(/class="letter-attr"/g)).toHaveLength(1);
    expect(svg).toContain('《小王子》· </tspan>');
    expect(svg).toContain('Antoine de Saint-Exupéry');
    expect(svg.match(/class="letter-quote"/g)).toHaveLength(1);
  });
});
