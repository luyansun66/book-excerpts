import { describe, expect, it } from 'vitest';
import { bigNumberInkCenter, generateLetterSvg } from '../svgGenerator';
import { GEO_ITALIC_UPEM, HAN_UPEM, georgiaItalicGlyph, hanGlyph } from '../letterMetrics';

// 独立复算：按字形真实轮廓求「字身总宽 advance」与「墨迹右缘 inkRight」（px）。
// 中文字形走华康宋体、西文走 Georgia Italic，与出处行的分字体规则一致。
function metricsOf(text: string, size: number): { advance: number; inkRight: number } {
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
  return { advance: pen, inkRight: pen - trailingBearing };
}

/** 文本「最后一个字形墨迹最右缘」到笔位起点的距离（px）= visibleBounds 右缘。 */
function inkRightPx(text: string, size: number): number {
  return metricsOf(text, size).inkRight;
}

/** 正文列的可用宽度（RIGHT − QUOTE_X）。 */
const COL_W = 960.2 - 220;

// 摘录正文会因为「中西文间隙 / 连续标点挤压」被切成多个 tspan，所以文本要把
// 整段内的 tspan 拼回来，才是真正落在纸面上的那串字。
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

interface QuoteLine {
  size: number;
  y: number;
  text: string;
  /** 依次输出的 tspan：文字 + 该段之前的 dx（字距调整，px） */
  tspans: Array<{ text: string; dx: number }>;
}

/** 取出摘录各行（字号 + 基线 + 文本 + 实际输出的 tspan/dx）。 */
function quoteLinesOf(svg: string): QuoteLine[] {
  return [...svg.matchAll(
    /class="letter-quote" style="font-size:([\d.]+)px" transform="translate\(220 ([\d.]+)\)">([\s\S]*?)<\/text>/g,
  )].map(([, size, y, inner]) => {
    const tspans = [...inner.matchAll(/<tspan([^>]*)>([\s\S]*?)<\/tspan>/g)].map((m) => {
      const dx = /dx="(-?[\d.]+)"/.exec(m[1]);
      return { text: unescapeXml(m[2]), dx: dx ? Number(dx[1]) : 0 };
    });
    return { size: Number(size), y: Number(y), text: tspans.map((t) => t.text).join(''), tspans };
  });
}

// 摘录正文整行都用华康宋体，因此逐字查 hanGlyph 即可；字距调整直接读 SVG 里
// 实际输出的 dx —— 这样「断行时的宽度判定」和「渲染时的字距」是两条独立路径，
// 谁写错了都会在这里对不上。
function renderedMetricsPx(line: QuoteLine): { advance: number; inkRight: number } {
  let pen = 0;
  let inkRight = 0;
  for (const span of line.tspans) {
    pen += span.dx;
    for (const ch of span.text) {
      const g = hanGlyph(ch.codePointAt(0)!);
      const adv = g ? (g.adv / HAN_UPEM) * line.size : 0;
      pen += adv;
      inkRight = pen - (g ? ((g.adv - g.xMax) / HAN_UPEM) * line.size : 0);
    }
  }
  return { advance: pen, inkRight };
}

/** 一行摘录渲染后的墨迹右缘（px）。 */
function quoteInkRightPx(line: QuoteLine): number {
  return renderedMetricsPx(line).inkRight;
}

/** 取出出处各行（字号 + 文字左端 x + 基线 y + 文本）。 */
function attrLinesOf(svg: string): Array<{ size: number; x: number; y: number; text: string }> {
  return [...svg.matchAll(
    /<text class="letter-attr" style="font-size:([\d.]+)px" transform="translate\(([\d.]+) ([\d.]+)\)">([\s\S]*?)<\/text>/g,
  )].map(([, size, x, y, inner]) => ({
    size: Number(size),
    x: Number(x),
    y: Number(y),
    text: [...inner.matchAll(/>([^<]*)<\/tspan>/g)].map((m) => m[1]).join(''),
  }));
}

// 出处字号固定 34px（不随摘录字号变化）；横线长 2em、上移 12/35 em、行距 1.25em。
const round1 = (n: number) => Math.round(n * 10) / 10;
const ATTR_SIZE = 34;
const ruleLen = (attrSize: number) => round1(2 * attrSize);
const ruleDy = (attrSize: number) => round1((-12 / 35) * attrSize);

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

  it('caps the quote at 45px and floors it at 37px', () => {
    const short = generateLetterSvg({ ...base, quote: '一句摘录。' });
    expect(short).toContain('style="font-size:45px"');
    expect(short).not.toContain('style="font-size:48px"');

    // 逐档缩到下限 37px 仍放不下时才截断摘录
    const huge = generateLetterSvg({ ...base, quote: '这句话特别长，'.repeat(200) });
    expect(huge).toContain('style="font-size:37px"');
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

  it('right-aligns the attribution to the quote right edge with a 2em rule', () => {
    const svg = generateLetterSvg({ ...base, quote, bookTitle: '三体', bookAuthor: '刘慈欣' });
    expect(svg.match(/class="letter-attr"/g)).toHaveLength(1);

    const quoteLines = quoteLinesOf(svg);
    const quoteRight = Math.max(...quoteLines.map((l) => 220 + quoteInkRightPx(l)));

    const attrs = attrLinesOf(svg);
    expect(attrs).toHaveLength(1);
    expect(attrs[0].x + inkRightPx('《三体》· 刘慈欣', attrs[0].size)).toBeCloseTo(quoteRight, 1);
    expect(attrs[0].size).toBe(ATTR_SIZE);

    // 等长横线挂在文字左侧，长度 2em，纵向在基线上方 12/35 em
    const rule = /<line class="letter-attr-rule" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/.exec(svg)!;
    expect(Number(rule[3]) - Number(rule[1])).toBeCloseTo(ruleLen(attrs[0].size), 1);
    expect(Number(rule[3])).toBeCloseTo(attrs[0].x, 1);
    expect(Number(rule[2])).toBeCloseTo(attrs[0].y + ruleDy(attrs[0].size), 1);
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

      const quoteRight = Math.max(...lines.map((l) => 220 + quoteInkRightPx(l)));
      const attrs = attrLinesOf(svg);
      expect(attrs).toHaveLength(1);
      expect(attrs[0].size).toBe(ATTR_SIZE);
      const attrRight = attrs[0].x + inkRightPx(`《${bookTitle}》· ${bookAuthor}`, attrs[0].size);

      expect(attrRight, `${bookAuthor} 未与摘录右缘对齐`).toBeCloseTo(quoteRight, 1);
    }
  });

  it('keeps the attribution at a fixed 34px across every quote tier', () => {
    // 出处字号不跟摘录字号联动：摘录从 45 一路降到 37，出处始终是 34px。
    // 从最短到最长扫一遍，覆盖 45→37 的每一档（不写死每档对应多少字，
    // 免得断行规则一调、档位边界一动这条测试就假红）。
    const seen = new Set<number>();
    for (let n = 1; n <= 20; n++) {
      const svg = generateLetterSvg({ ...base, quote: '四季更替，草木荣枯，'.repeat(n) + '夜。' });
      const quoteSize = quoteLinesOf(svg)[0].size;
      expect(quoteSize).toBeGreaterThanOrEqual(37);
      expect(quoteSize).toBeLessThanOrEqual(45);
      seen.add(quoteSize);

      for (const line of attrLinesOf(svg)) {
        expect(line.size, `n=${n} 出处字号应固定为 34px`).toBe(ATTR_SIZE);
      }
    }
    // 顶档和下限都要走到，确认全档位下出处都是 34px
    expect(seen.has(45)).toBe(true);
    expect(seen.has(37)).toBe(true);
  });

  // 避头尾：行末撞线的句读不再无脑推排（会把前一个字一起顶到下一行，留下一个字的洞）。
  // 全角句读的墨迹只占字身靠左一小段（「，」0.31em、「！」0.56em），字身右侧那片空白
  // 本来就是留给避头尾的余量：只要标点「墨迹右缘」仍在列宽内，就让它留在行末。
  it('keeps a line-final comma on its line instead of pushing a character down', () => {
    const svg = generateLetterSvg({ ...base, quote: '测'.repeat(16) + '，' + '测'.repeat(30) + '。' });
    const first = quoteLinesOf(svg)[0];

    expect(first.text.endsWith('，')).toBe(true);
    // 该行的「字身宽」已经越过列宽，但「墨迹右缘」没有 —— 这正是被允许的悬挂
    expect(renderedMetricsPx(first).advance).toBeGreaterThan(COL_W);
    expect(quoteInkRightPx(first)).toBeLessThanOrEqual(COL_W);
  });

  it('still pushes a character down when even the punctuation ink cannot fit', () => {
    const svg = generateLetterSvg({ ...base, quote: '测'.repeat(16) + '！' + '测'.repeat(30) + '。' });
    const lines = quoteLinesOf(svg);

    // 「！」墨迹 0.56em，悬挂也塞不下 → 回到追い出し，连「测」一起推到下一行
    expect(lines[0].text.endsWith('！')).toBe(false);
    expect(lines[1].text.startsWith('测！')).toBe(true);
  });

  it('never lets any quote line’s ink cross the right column edge', () => {
    const samples = [
      '测'.repeat(16) + '，' + '测'.repeat(30) + '。',
      '测'.repeat(16) + '！' + '测'.repeat(30) + '。',
      '所有的大人都曾经是小孩，虽然，只有少数的人记得。',
      '人生一世，最后会发现名利财富都是空，人能够拥有的只有生命本身。但生命的流逝使得它难以实现超越时段的自我确认，唯有文字能够担当此任，宣告生命曾经在场。经由它们，我们得以端详生命的纹理，探寻生命的本质与深意。',
      '四季更替，草木荣枯，'.repeat(16) + '夜。',
    ];
    for (const quote of samples) {
      for (const line of quoteLinesOf(generateLetterSvg({ ...base, quote }))) {
        expect(quoteInkRightPx(line), `越出列宽：${line.text}`).toBeLessThanOrEqual(COL_W + 0.01);
      }
    }
  });

  // ─── 摘录正文排版规范 ───────────────────────────────────────────────────────
  // 逐字的笔位与墨迹范围，用来验证字距规则在纸面上的实际观感。
  interface GlyphRun { ch: string; penStart: number; inkEnd: number }

  function glyphRuns(line: QuoteLine): GlyphRun[] {
    const out: GlyphRun[] = [];
    let pen = 0;
    for (const span of line.tspans) {
      pen += span.dx;
      for (const ch of span.text) {
        const g = hanGlyph(ch.codePointAt(0)!);
        const adv = g ? (g.adv / HAN_UPEM) * line.size : 0;
        out.push({ ch, penStart: pen, inkEnd: pen + (g ? (g.xMax / HAN_UPEM) * line.size : 0) });
        pen += adv;
      }
    }
    return out;
  }

  /** 前一个字墨迹右端 → 后一个字笔位起点之间的空白（px），即肉眼看到的字距。 */
  function gapBeforePx(runs: GlyphRun[], i: number): number {
    return runs[i].penStart - runs[i - 1].inkEnd;
  }

  const breakingSamples = [
    '测'.repeat(14) + '「引号开始的句子」' + '测'.repeat(10) + '。',
    '测'.repeat(14) + '（括号内容）' + '测'.repeat(10) + '。',
    '测'.repeat(13) + '《书名号》' + '测'.repeat(12) + '。',
    '测'.repeat(16) + '，' + '测'.repeat(30) + '。',
    '测'.repeat(16) + '！' + '测'.repeat(30) + '。',
    '所有的大人都曾经是小孩，虽然，只有少数的人记得。',
    '四季更替，草木荣枯，'.repeat(16) + '夜。',
  ];

  it('避尾：行末不出现起首标点（左引号 / 左括号 / 书名号）', () => {
    // 15 个全角字 + 左括号正好填满一行：旧实现会把「（」留在行末，内容被切在下一行
    const svg = generateLetterSvg({ ...base, quote: '测'.repeat(15) + '（括号内容）' + '测'.repeat(9) + '。' });
    const lines = quoteLinesOf(svg);
    expect(lines[0].text).toBe('测'.repeat(15));
    expect(lines[1].text.startsWith('（括号内容）')).toBe(true);

    const prohibitedEnd = '（《「『【〔〈';
    for (const quote of breakingSamples) {
      for (const line of quoteLinesOf(generateLetterSvg({ ...base, quote }))) {
        expect(prohibitedEnd.includes(line.text[line.text.length - 1]), `行末标点：${line.text}`).toBe(false);
      }
    }
  });

  it('避头：行首不出现收尾标点', () => {
    const prohibitedStart = '，。、；：！？）」』】〕〉》…';
    for (const quote of breakingSamples) {
      for (const line of quoteLinesOf(generateLetterSvg({ ...base, quote }))) {
        expect(prohibitedStart.includes(line.text[0]), `行首标点：${line.text}`).toBe(false);
      }
    }
  });

  const PUNCT = '，。、；：！？）」』】〕〉》…（《「『【〔〈';
  const isPunct = (ch: string) => PUNCT.includes(ch);

  /** 与实现同一套「中文/西文」归类：CJK 标点算中文一侧。 */
  const isCjkChar = (ch: string) => {
    const cp = ch.codePointAt(0)!;
    return (
      (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3000 && cp <= 0x303f) ||
      (cp >= 0xff00 && cp <= 0xffef) || (cp >= 0x2e80 && cp <= 0x2eff) ||
      (cp >= 0xf900 && cp <= 0xfaff)
    );
  };

  it('连续标点之间挤压空白余量，不留整格空洞', () => {
    const svg = generateLetterSvg({ ...base, quote: '他把这句话叫作「命运。」然后转身离开了，天气很好。' });
    const line = quoteLinesOf(svg)[0];
    const runs = glyphRuns(line);

    let checked = 0;
    for (let i = 1; i < runs.length; i++) {
      if (!isPunct(runs[i - 1].ch) || !isPunct(runs[i].ch)) continue;
      checked++;
      // 不挤压时两字之间会空掉前一个标点的整段自带空白（」约 0.61em、。约 0.64em）；
      // 压掉一半后剩约 0.3em，与正常的字间差不多。
      const gapEm = gapBeforePx(runs, i) / line.size;
      const pair = `${runs[i - 1].ch}${runs[i].ch}`;
      expect(gapEm, pair).toBeLessThan(0.4);
      expect(gapEm, pair).toBeGreaterThan(0.15);
    }
    expect(checked, '样本里应出现相邻标点').toBeGreaterThan(0);
  });

  it('中西文之间补足 1/4em 空隙', () => {
    const svg = generateLetterSvg({ ...base, quote: '他说hello world然后离开了，天气很好。' });
    const line = quoteLinesOf(svg)[0];
    const runs = glyphRuns(line);

    let checked = 0;
    for (let i = 1; i < runs.length; i++) {
      const cur = runs[i].ch;
      if (cur === ' ') continue;
      if (isCjkChar(runs[i - 1].ch) === isCjkChar(cur)) continue;
      checked++;
      // 前一个字自带的右侧空白算在内，补足到 1/4em
      expect(gapBeforePx(runs, i) / line.size, `${runs[i - 1].ch}→${cur}`).toBeGreaterThan(0.2);
    }
    expect(checked, '样本里应出现中西文交界').toBeGreaterThan(0);
  });

  it('行首与行末都不留空格', () => {
    const svg = generateLetterSvg({ ...base, quote: '测'.repeat(15) + ' 后面 ' + '测'.repeat(24) + ' 收尾。' });
    for (const line of quoteLinesOf(svg)) {
      expect(line.text.startsWith(' '), `行首空格：|${line.text}|`).toBe(false);
      expect(line.text.endsWith(' '), `行末空格：|${line.text}|`).toBe(false);
    }
  });

  // 间距按「墨迹」定义：摘录末行墨迹底 → 出处首行墨迹顶。实现把它换算成基线距，
  // 换算用的两端字形墨迹取保守上界：出处首行首字「《」高 0.85em，摘录末字降部 0.22em。
  const baselineGapOf = (svg: string) => {
    const quoteLines = quoteLinesOf(svg);
    const attrs = attrLinesOf(svg);
    return attrs[0].y - Math.max(...quoteLines.map((l) => l.y));
  };
  const impliedBaselineGap = (inkGap: number, quoteSize: number, attrSize: number) =>
    0.22 * quoteSize + inkGap + 0.85 * attrSize;

  it('uses the comfortable ink gap when the quote leaves room below', () => {
    const svg = generateLetterSvg({ ...base, quote: '一句摘录。' });
    const attrs = attrLinesOf(svg);
    const size = quoteLinesOf(svg)[0].size;
    expect(attrs[0].size).toBe(ATTR_SIZE);
    expect(baselineGapOf(svg)).toBeCloseTo(impliedBaselineGap(120, size, attrs[0].size), 0);

    const [, ruleY] = /class="letter-attr-rule" x1="[\d.]+" y1="([\d.]+)"/.exec(svg)!;
    expect(Number(ruleY)).toBeCloseTo(attrs[0].y + ruleDy(attrs[0].size), 1);
  });

  it('tightens the ink gap for a long quote but never below 85px, keeping 30px off the bottom rule', () => {
    const longQuote = '四季更替，草木荣枯，'.repeat(14) + '夜。';
    const svg = generateLetterSvg({ ...base, quote: longQuote });

    const lines = quoteLinesOf(svg);
    expect(lines.length).toBeGreaterThan(2);
    // 每行都在 45–40 档内，且行宽不超过正文列宽
    for (const l of lines) {
      expect(l.size).toBeLessThanOrEqual(45);
      expect(l.size).toBeGreaterThanOrEqual(37);
    }

    expect(baselineGapOf(svg)).toBeGreaterThanOrEqual(impliedBaselineGap(85, 37, ATTR_SIZE) - 0.5);
    expect(baselineGapOf(svg)).toBeLessThanOrEqual(impliedBaselineGap(120, 45, ATTR_SIZE) + 0.5);

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

    const [, baseline] = /class="letter-attr" style="font-size:[\d.]+px" transform="translate\((-?[\d.]+) (-?[\d.]+)\)"/.exec(svg) ?? [];
    expect(Number(baseline)).toBeLessThan(1413.1);
  });

  it('escapes XML special characters in the quote', () => {
    const quote = '他说：“你好” & <世界>';
    const svg = generateLetterSvg({ ...base, quote });

    expect(svg).not.toContain('<世界>');
    expect(svg).toContain('&amp;');
    // 转义后按 tspan 拼回来，必须与原文逐字一致
    expect(quoteLinesOf(svg).map((l) => l.text).join('')).toBe(quote);
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
    const quoteRight = 220 + quoteInkRightPx(quoteLines[0]);

    const attrs = attrLinesOf(svg);
    // 折行后分隔符跟着作者落到次行行首，首行以书名号收尾（右缘更「实」）
    expect(attrs.map((l) => l.text)).toEqual(['《小王子》', '· Antoine de Saint-Exupéry']);
    for (const line of attrs) {
      expect(
        line.x + inkRightPx(line.text, line.size),
        `${line.text} 未与摘录右缘对齐`,
      ).toBeCloseTo(quoteRight, 1);
    }

    // 横线只挂在首行左侧，且整段不越左侧内容边界（60.2）
    const rule = /<line class="letter-attr-rule" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/.exec(svg)!;
    expect(Number(rule[1])).toBeCloseTo(attrs[0].x - ruleLen(attrs[0].size), 1);
    expect(Number(rule[1])).toBeGreaterThanOrEqual(60.2);
    expect(Number(rule[2])).toBeCloseTo(attrs[0].y + ruleDy(attrs[0].size), 1);
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
      const quoteRight = Math.max(...quoteLines.map((l) => 220 + quoteInkRightPx(l)));

      attrs.forEach((line, i) => {
        // 首行左边要留得下横线，其余行直接受内容左边界约束
        const margin = 60.2 + (i === 0 ? ruleLen(line.size) : 0);
        expect(line.x, `${sample.bookTitle} 第 ${i + 1} 行越出左边界`).toBeGreaterThanOrEqual(margin - 0.1);
        expect(line.x + inkRightPx(line.text, line.size)).toBeLessThanOrEqual(quoteRight + 0.1);
      });
      expect(attrs[attrs.length - 1].y).toBeLessThanOrEqual(1413.1 - 30);
    }
  });
});
