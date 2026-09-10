// ─── 引言卡 SVG 动态生成 ───────────────────────────────────────────────────────
// 基于 letterTemplate.svg 做字段替换 + 自动断行 + 字号自适应 + 截断。
// 模板 viewBox = 0 0 1021.9 1527.7；底部横线 y=1413.1 为内容硬边界。

import template from './letterTemplate.svg?raw';

// ─── 布局常量（取自 letterTemplate.svg） ───────────────────────────────────────
const CONTENT_LEFT = 60.2;    // 内容左边界（横线左端）
const RIGHT = 960.2;          // 内容右边界（横线右端 / 出处右对齐基准）
const QUOTE_X = 220;          // 摘录正文左起点
const QUOTE_TOP = 867.5;      // 摘录首行基线
const QUOTE_LH = 4 / 3;       // 行距比例（模板 48px → 64px）

const BOTTOM_LINE_Y = 1413.1;   // 底部横线 y
const BOTTOM_CLEARANCE = 30;    // 出处行基线距底部横线的硬下限
const ATTR_GAP_MAX = 50;        // 摘录末行 → 出处行的理想间距
const ATTR_GAP_MIN = 40;        // 空间紧张时允许的最小间距
const ATTR_BOTTOM_LIMIT = BOTTOM_LINE_Y - BOTTOM_CLEARANCE; // 出处行基线最低值 1383.1
const ATTR_SIZE = 35;           // 出处字号（固定）
const ATTR_RULE_LEN = 70;     // 书名前的等长横线（35px 字号下「——」的宽度）
const ATTR_RULE_DY = -12;     // 横线相对基线的纵向偏移

// 大编号：模板 220px 字号时基线 319.8，其视觉中心 242.8 与右侧小房子中心对齐。
const BIGNUM_CENTER_X = 283.5;
const BIGNUM_CENTER_Y = 242.8;
const BIGNUM_ASCENT = 0.35;   // 数字视觉中心到基线的距离 / 字号

// 摘录字号分档（上限 48px、下限 42px，逐档缩小至放得下为止）
const QUOTE_FONT_TIERS = [48, 46, 44, 42];

interface LetterFields {
  number: number;
  dateCN: string;
  dateEN: string;
  quote: string;
  bookTitle: string;
  bookAuthor: string;
}

// ─── XML 转义 ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── 标点规范化：中文内容统一使用中文标点（禁止中英混用） ──────────────────────
function normalizeChinesePunctuation(text: string): string {
  return text
    .replace(/,/g, '，')
    .replace(/\./g, '。')
    .replace(/!/g, '！')
    .replace(/\?/g, '？')
    .replace(/;/g, '；')
    .replace(/:/g, '：')
    .replace(/\(/g, '（')
    .replace(/\)/g, '）');
}

// ─── 字符宽度估算 ─────────────────────────────────────────────────────────────
function isCjk(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 统一表意文字
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0xff00 && cp <= 0xffef) || // 全角形式
    (cp >= 0x2e80 && cp <= 0x2eff) || // CJK 部首
    (cp >= 0xf900 && cp <= 0xfaff)    // CJK 兼容
  );
}

// ─── 字体运行分类：中文（华康宋体）vs 英文（Georgia Italic） ───────────────────
// 「·」作为书名与作者的分隔符按中文字形渲染（模板即以中文字体呈现）。
function isChineseGlyph(ch: string): boolean {
  return isCjk(ch) || ch === '·';
}

function charWidth(ch: string, fontSize: number): number {
  if (ch === ' ') return fontSize * 0.32;
  if (isChineseGlyph(ch)) return fontSize;
  if (/[A-Z]/.test(ch)) return fontSize * 0.72;
  if (/[a-z]/.test(ch)) return fontSize * 0.52;
  if (/[0-9]/.test(ch)) return fontSize * 0.62;
  if (ch === '…') return fontSize * 0.5;
  return fontSize * 0.45; // 其余半角标点/符号
}

function measureWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, fontSize);
  return w;
}

// ─── 分词：CJK 逐字、拉丁/数字成词、空格单独 ─────────────────────────────────
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let latin = '';
  const flush = () => {
    if (latin) {
      tokens.push(latin);
      latin = '';
    }
  };
  for (const ch of text) {
    if (isCjk(ch)) {
      flush();
      tokens.push(ch);
    } else if (ch === ' ') {
      flush();
      tokens.push(' ');
    } else {
      latin += ch;
    }
  }
  flush();
  return tokens;
}

function splitToken(tok: string, fontSize: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let acc = '';
  let accW = 0;
  for (const ch of tok) {
    const cw = charWidth(ch, fontSize);
    if (acc && accW + cw > maxWidth) {
      parts.push(acc);
      acc = ch;
      accW = cw;
    } else {
      acc += ch;
      accW += cw;
    }
  }
  if (acc) parts.push(acc);
  return parts;
}

// 不能出现在行首的标点（避头尾）
const PROHIBITED_START_PUNCTUATION = new Set([
  '，', '。', '、', '；', '：', '！', '？', '）', '」', '』', '】', '〕', '〉', '》', '…',
]);

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let line = '';
  let lineW = 0;

  const place = (tok: string, tokW: number) => {
    if (tokW > maxWidth) {
      const parts = splitToken(tok, fontSize, maxWidth);
      for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
      line = parts[parts.length - 1];
      lineW = measureWidth(line, fontSize);
      return;
    }
    line = tok;
    lineW = tokW;
  };

  for (const tok of tokens) {
    const tokW = measureWidth(tok, fontSize);
    if (line === '') {
      place(tok, tokW);
      continue;
    }
    if (lineW + tokW <= maxWidth) {
      line += tok;
      lineW += tokW;
    } else {
      lines.push(line.trim());
      place(tok, tokW);
    }
  }
  if (line) lines.push(line.trim());

  // 避头尾：避免标点出现在行首
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (ln && PROHIBITED_START_PUNCTUATION.has(ln[0])) {
      const ch = ln[0];
      lines[i - 1] += ch;
      lines[i] = ln.slice(1);
      if (lines[i] === '') {
        lines.splice(i, 1);
        i--;
      }
    }
  }

  return lines.filter((l) => l.length > 0);
}

// ─── 单行截断：超出宽度时从尾部删字并加「…」 ─────────────────────────────────
function truncateToWidth(text: string, fontSize: number, maxWidth: number): string {
  if (measureWidth(text, fontSize) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1) {
    truncated = truncated.slice(0, -1);
    if (measureWidth(truncated + '…', fontSize) <= maxWidth) break;
  }
  return truncated + '…';
}

// ─── 出处：单行「《书名》· 作者」，右侧与摘录对齐（右边缘 = RIGHT） ───────────
function attrTextFor(bookTitle: string, bookAuthor: string): string {
  const maxW = RIGHT - CONTENT_LEFT - ATTR_RULE_LEN;
  const open = '《';
  const mid = '》· ';
  const close = '》';
  const reserveForAuthor = measureWidth('…', ATTR_SIZE) * 2;

  const titleBudget = Math.max(maxW - reserveForAuthor, ATTR_SIZE * 3);
  const title = measureWidth(bookTitle, ATTR_SIZE) <= titleBudget
    ? bookTitle
    : truncateToWidth(bookTitle, ATTR_SIZE, titleBudget);

  const headW = measureWidth(`${open}${title}${mid}`, ATTR_SIZE);
  const authorBudget = Math.max(maxW - headW, 0);
  const author = measureWidth(bookAuthor, ATTR_SIZE) <= authorBudget
    ? bookAuthor
    : truncateToWidth(bookAuthor, ATTR_SIZE, authorBudget);

  // 书名若已被截断，结尾补一个右书名号（截断函数已加「…」时不再重复）
  const titlePart = `${open}${title}${title.endsWith('…') ? close : mid}`;
  return `${titlePart}${author}`;
}

// ─── 布局计算 ──────────────────────────────────────────────────────────────────
interface Layout {
  q: number;
  quoteLines: string[];
  quoteYs: number[];
  attrText: string;
  attrX: number;   // 出处文字 x（= 横线右端）
  attrY: number;   // 出处行基线（跟随摘录末行，见 attrYFor）
  fits: boolean;
}

function lhQ(q: number): number {
  return Math.round(q * QUOTE_LH);
}

// 出处行基线：跟随摘录末行，理想间距 50px；空间紧张时收紧，但不小于 40px。
// 同时被 ATTR_BOTTOM_LIMIT 兜底，保证距底部横线始终 ≥ 30px。
function attrYFor(lastBaseline: number): number {
  const gap = Math.min(ATTR_GAP_MAX, ATTR_BOTTOM_LIMIT - lastBaseline);
  return Math.min(lastBaseline + Math.max(gap, ATTR_GAP_MIN), ATTR_BOTTOM_LIMIT);
}

function layoutFor(quote: string, bookTitle: string, bookAuthor: string, q: number): Layout {
  const quoteLines = wrapText(quote, q, RIGHT - QUOTE_X);
  const quoteYs = quoteLines.map((_, i) => QUOTE_TOP + i * lhQ(q));

  const attrText = attrTextFor(bookTitle, bookAuthor);
  const attrWidth = measureWidth(attrText, ATTR_SIZE);
  const attrX = RIGHT - attrWidth;

  const lastBaseline = quoteYs[quoteYs.length - 1] ?? QUOTE_TOP;
  const attrY = attrYFor(lastBaseline);
  const fits =
    attrY - lastBaseline >= ATTR_GAP_MIN &&
    attrY <= ATTR_BOTTOM_LIMIT &&
    attrX - ATTR_RULE_LEN >= CONTENT_LEFT;

  return { q, quoteLines, quoteYs, attrText, attrX, attrY, fits };
}

function computeLayout(quote: string, bookTitle: string, bookAuthor: string): Layout {
  for (const q of QUOTE_FONT_TIERS) {
    const layout = layoutFor(quote, bookTitle, bookAuthor, q);
    if (layout.fits) return layout;
  }

  // 最小档仍放不下 → 截断摘录，末尾加「…」
  const min = QUOTE_FONT_TIERS[QUOTE_FONT_TIERS.length - 1];
  let q = quote;
  let layout = layoutFor(q, bookTitle, bookAuthor, min);
  let guard = 0;
  while (!layout.fits && q.length > 1 && guard < 500) {
    q = q.length <= 3 ? '…' : `${q.slice(0, q.length - 3).trimEnd()}…`;
    layout = layoutFor(q, bookTitle, bookAuthor, min);
    guard++;
  }
  return layout;
}

// ─── 文本节点生成 ─────────────────────────────────────────────────────────────
// 字体族与填充色由模板 class 提供，此处只覆盖字号。
function textNode(cls: string, x: number, y: number | string, content: string, fontSize: number): string {
  return `<text class="${cls}" style="font-size:${fontSize}px" transform="translate(${x} ${y})"><tspan x="0" y="0">${esc(content)}</tspan></text>`;
}

// ─── 混合中英文的行：中文用华康宋体，英文作者用 Georgia 斜体 ──────────────────
function mixedTextNode(cls: string, x: number | string, y: number | string, content: string, fontSize: number): string {
  const runs: Array<{ text: string; zh: boolean }> = [];
  let buf = '';
  let bufZh = false;
  const flush = () => {
    if (buf) {
      runs.push({ text: buf, zh: bufZh });
      buf = '';
    }
  };
  for (const ch of content) {
    // 空格跟随相邻文字，避免把「· 作者」切成独立的一段
    if (ch === ' ') {
      if (!buf) bufZh = false;
      buf += ch;
      continue;
    }
    const zh = isChineseGlyph(ch);
    if (buf && bufZh !== zh) flush();
    buf += ch;
    bufZh = zh;
  }
  flush();

  const tspans = runs
    .map((r, i) => {
      const pos = i === 0 ? ' x="0" y="0"' : '';
      const font = r.zh
        ? ' font-family="DFPSongW3-GB" font-weight="300"'
        : ' font-family="Georgia" font-style="italic"';
      return `<tspan${pos}${font}>${esc(r.text)}</tspan>`;
    })
    .join('');

  return `<text class="${cls}" style="font-size:${fontSize}px" transform="translate(${x} ${y})">${tspans}</text>`;
}

// ─── 出处：等长横线 + 单行文字（整体右对齐到 RIGHT） ─────────────────────────
function attributionNode(layout: Layout): string {
  const y = round1(layout.attrY + ATTR_RULE_DY);
  const x2 = round1(layout.attrX);
  const x1 = round1(layout.attrX - ATTR_RULE_LEN);
  const rule = `<line class="letter-attr-rule" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  const text = mixedTextNode('letter-attr', round1(layout.attrX), round1(layout.attrY), layout.attrText, ATTR_SIZE);
  return `${rule}\n${text}`;
}

// ─── 大编号：位数越多字号越小，垂直中心保持不变 ──────────────────────────────
function bigNumberNode(number: number): string {
  const digits = String(number);
  const len = digits.length;
  const size = len <= 2 ? 220 : len === 3 ? 170 : len === 4 ? 130 : 105;
  const baseline = BIGNUM_CENTER_Y + size * BIGNUM_ASCENT;
  return `<text class="letter-bignum" text-anchor="middle" style="font-size:${size}px" transform="translate(${BIGNUM_CENTER_X} ${round1(baseline)})"><tspan x="0" y="0">${digits}</tspan></text>`;
}

// ─── 主入口 ────────────────────────────────────────────────────────────────────
export function generateLetterSvg(fields: LetterFields): string {
  const quoteText = normalizeChinesePunctuation(fields.quote);
  const layout = computeLayout(quoteText, fields.bookTitle, fields.bookAuthor);

  const quoteSvg = layout.quoteLines
    .map((line, i) => textNode('letter-quote', QUOTE_X, round1(layout.quoteYs[i]), line, layout.q))
    .join('\n');

  return template
    .replace('{{BIG_NUMBER}}', bigNumberNode(fields.number))
    .replace('{{TITLE_CN}}', esc(`第${fields.number}封信`))
    .replace('{{LETTER_NO}}', esc(`Letter No. ${fields.number}`))
    .replace('{{DATE_CN}}', esc(`折角书摘·${fields.dateCN}`))
    .replace('{{DATE_EN}}', esc(`Dogear · ${fields.dateEN}`))
    .replace('{{QUOTE_LINES}}', quoteSvg)
    .replace('{{ATTR_LINE}}', attributionNode(layout))
    .trimEnd();
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}
