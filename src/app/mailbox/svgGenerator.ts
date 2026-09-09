// ─── 引言卡 SVG 动态生成 ───────────────────────────────────────────────────────
// 基于 letterTemplate.svg（模板一）做字段替换 + 自动断行 + 字号自适应 + 截断。
// 模板 viewBox = 0 0 1021.9 1527.7，底部横线 y=1413.1 为内容硬边界。

import template from './letterTemplate.svg?raw';

// ─── 布局常量（取自模板一） ────────────────────────────────────────────────────
const RIGHT = 960.2;         // 内容右边界
const QUOTE_X = 225.2;       // 中文摘录 x
const TRANS_X = 385;         // 英文译文 x
const ATTR_X = 510.1;        // 出处 x
const QUOTE_TOP = 891.7;     // 摘录首行基线 y
const BOTTOM = 1403.1;       // 底部横线 y=1413.1 上留 10px 安全边距

// 字号分档（按字数/高度自适应，逐档缩小）
const TIERS = [
  { q: 60, t: 26, a: 26 },
  { q: 52, t: 24, a: 24 },
  { q: 46, t: 22, a: 22 },
  { q: 40, t: 20, a: 20 },
  { q: 34, t: 18, a: 18 },
  { q: 30, t: 16, a: 16 },
];

interface LetterFields {
  number: number;
  dateCN: string;
  dateEN: string;
  quote: string;
  translation: string;
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
// ─── 标点规范化：中英文内容严格分离 ───────────────────────────────────────────
/** 将文本中的英文标点统一替换为中文标点（用于中文摘录） */
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

/** 将文本中的中文标点统一替换为英文标点（用于英文译文） */
function normalizeEnglishPunctuation(text: string): string {
  return text
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
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

// ─── 字体运行分类：中文（宋体简）vs 英文（Georgia Italic） ────────────────────
// 破折号「—/–」视为中文标点，避免出处里的「——」被分到英文斜体。
function isChineseGlyph(ch: string): boolean {
  return isCjk(ch) || ch === '—' || ch === '–';
}

function charWidth(ch: string, fontSize: number): number {
  if (ch === ' ') return fontSize * 0.32;
  if (isCjk(ch)) return fontSize;
  if (/[A-Z]/.test(ch)) return fontSize * 0.72;
  if (/[a-z]/.test(ch)) return fontSize * 0.52;
  if (/[0-9]/.test(ch)) return fontSize * 0.62;
  if (ch === '·' || ch === '…') return fontSize * 0.5;
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

// ─── 布局计算 ──────────────────────────────────────────────────────────────────
interface Layout {
  q: number;
  t: number;
  a: number;
  quoteLines: string[];
  transLines: string[];
  attrLines: string[];
  quoteYs: number[];
  transYs: number[];
  attrY: number;
}

function lhQ(q: number): number { return Math.round(q * 1.42); }
function lhT(t: number): number { return Math.round(t * 1.54); }
function gapQT(q: number): number { return Math.round(q * 1.333); }
function gapTA(t: number): number { return Math.round(t * 2.1); }

function layoutFor(
  quote: string,
  translation: string,
  attribution: string,
  tier: { q: number; t: number; a: number },
): Layout {
  const quoteLines = wrapText(quote, tier.q, RIGHT - QUOTE_X);
  const transLines = translation.trim() ? wrapText(translation, tier.t, RIGHT - TRANS_X) : [];
  const attrLines = wrapText(attribution, tier.a, RIGHT - ATTR_X);

  const quoteYs = quoteLines.map((_, i) => QUOTE_TOP + i * lhQ(tier.q));
  const quoteBottom = QUOTE_TOP + quoteLines.length * lhQ(tier.q);
  const transYs: number[] = [];
  let attrY: number;

  if (transLines.length === 0) {
    attrY = quoteBottom + gapQT(tier.q);
  } else {
    const transTop = quoteBottom + gapQT(tier.q);
    transYs.push(...transLines.map((_, j) => transTop + j * lhT(tier.t)));
    attrY = transTop + transLines.length * lhT(tier.t) + gapTA(tier.t);
  }

  return { q: tier.q, t: tier.t, a: tier.a, quoteLines, transLines, attrLines, quoteYs, transYs, attrY };
}

function computeLayout(quote: string, translation: string, attribution: string): Layout {
  for (const tier of TIERS) {
    const layout = layoutFor(quote, translation, attribution, tier);
    if (layout.attrY <= BOTTOM) return layout;
  }

  // 最小档仍放不下 → 优先截断摘录，其次截断译文，末尾加 …
  const min = TIERS[TIERS.length - 1];
  let q = quote;
  let tr = translation;
  let layout = layoutFor(q, tr, attribution, min);
  let guard = 0;
  while (layout.attrY > BOTTOM && guard < 500) {
    if (q.length > 1) {
      q = q.length <= 3 ? '…' : `${q.slice(0, q.length - 3).trimEnd()}…`;
    } else if (tr.length > 1) {
      tr = tr.length <= 3 ? '…' : `${tr.slice(0, tr.length - 3).trimEnd()}…`;
    } else {
      break;
    }
    layout = layoutFor(q, tr, attribution, min);
    guard++;
  }
  return layout;
}

// ─── 文本节点生成 ─────────────────────────────────────────────────────────────
function textNode(cls: string, x: number, y: number | string, content: string, fontSize: number): string {
  let extraStyle = '';
  if (cls === 'letter-st12') {
    extraStyle = 'font-family:&quot;Songti SC&quot;,&quot;STSong&quot;,serif;font-weight:300;';
  } else if (cls === 'letter-st6') {
    extraStyle = 'font-family:Georgia,&quot;Times New Roman&quot;,serif;font-style:italic;';
  }
  return `<text class="${cls}" style="font-size:${fontSize}px;${extraStyle}" transform="translate(${x} ${y})"><tspan x="0" y="0">${esc(content)}</tspan></text>`;
}

// ─── 混合中英文的行：出处「——《书名》· 作者」按字符切换字体，英文作者用斜体 ──
function mixedTextNode(cls: string, x: number, y: number | string, content: string, fontSize: number): string {
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
        ? ' font-family="Songti SC" font-weight="300"'
        : ' font-family="Georgia" font-style="italic"';
      return `<tspan${pos}${font}>${esc(r.text)}</tspan>`;
    })
    .join('');

  return `<text class="${cls}" style="font-size:${fontSize}px" transform="translate(${x} ${y})">${tspans}</text>`;
}

function bigNumberNode(number: number): string {
  const digits = String(number);
  const len = digits.length;
  const size = len <= 2 ? 220 : len === 3 ? 170 : len === 4 ? 130 : 105;
  return `<text class="letter-st10" text-anchor="middle" style="font-size:${size}px" transform="translate(283.5 297)"><tspan x="0" y="0">${digits}</tspan></text>`;
}

function verticalDigitsNode(number: number): string {
  const digits = String(number).split('');
  return digits
    .map((d, i) => `<text class="letter-st9" transform="translate(67.6 ${(1166.2 + i * 38).toFixed(1)})"><tspan x="0" y="0">${d}</tspan></text>`)
    .join('\n');
}

// ─── 主入口 ────────────────────────────────────────────────────────────────────
export function generateLetterSvg(fields: LetterFields): string {
  const quoteText = normalizeChinesePunctuation(fields.quote);
  const transText = normalizeEnglishPunctuation(fields.translation);
  const attribution = `——《${fields.bookTitle}》· ${fields.bookAuthor}`;
  const layout = computeLayout(quoteText, transText, attribution);

  const quoteSvg = layout.quoteLines
    .map((line, i) => textNode('letter-st12', QUOTE_X, round1(layout.quoteYs[i]), line, layout.q))
    .join('\n');
  const transSvg = layout.transLines
    .map((line, j) => textNode('letter-st6', TRANS_X, round1(layout.transYs[j]), line, layout.t))
    .join('\n');
  const attrSvg = layout.attrLines
    .map((line, i) => mixedTextNode('letter-st8', ATTR_X, round1(layout.attrY + i * lhT(layout.a)), line, layout.a))
    .join('\n');

  return template
    .replace('{{BIG_NUMBER}}', bigNumberNode(fields.number))
    .replace('{{TITLE_CN}}', esc(`第${fields.number}封信`))
    .replace('{{LETTER_NO}}', esc(`Letter No. ${fields.number}`))
    .replace('{{DATE_CN}}', esc(`折角书摘·${fields.dateCN}`))
    .replace('{{DATE_EN}}', esc(`Dogear · ${fields.dateEN}`))
    .replace('{{QUOTE_LINES}}', quoteSvg)
    .replace('{{TRANS_LINES}}', transSvg)
    .replace('{{ATTR_LINE}}', attrSvg)
    .replace('{{VERTICAL_DIGITS}}', verticalDigitsNode(fields.number));
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}
