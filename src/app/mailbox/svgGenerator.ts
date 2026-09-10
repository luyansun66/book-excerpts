// ─── 引言卡 SVG 动态生成 ───────────────────────────────────────────────────────
// 基于 letterTemplate.svg 做字段替换 + 自动断行 + 字号自适应 + 截断。
// 模板 viewBox = 0 0 1021.9 1527.7；底部横线 y=1413.1 为内容硬边界。

import template from './letterTemplate.svg?raw';
import {
  GEO_ITALIC_UPEM,
  HAN_UPEM,
  georgiaItalicGlyph,
  hanGlyph,
  type GlyphBox,
} from './letterMetrics';

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
const ATTR_LINE_H = 44;       // 出处折成两行时的行距（35px × 1.25）

// ─── 大编号：按「字形真实可视边界」对齐右格小房子的中心 ───────────────────────
// 模板右格小房子 path（M738,202.3l88.4,56.1v101h-176.8v-101l88.4,-56.1Z）的几何包围盒：
const HOUSE_BOX = { x1: 649.6, y1: 202.3, x2: 826.4, y2: 359.4 };
const BIGNUM_TARGET_X = 283.5;                               // 编号所在左格的视觉中心
const BIGNUM_TARGET_Y = (HOUSE_BOX.y1 + HOUSE_BOX.y2) / 2;   // 与右格小房子中心同高（280.85）

// 从 书签字体/Georgia Bold.ttf 用 fontTools 读 glyf 的 xMin/xMax/yMin/yMax（unitsPerEm = 2048）。
// 只用真实轮廓、不用 Em 框：Georgia 用旧式数字，'3/4/5/7/9' 带降部、'6/8' 带升部，
// 各数字的视觉高度并不相同，必须取「整串数字的轮廓并集」的中心才准。
// 复核：
//   python3 -c "from fontTools.ttLib import TTFont as T;f=T('书签字体/Georgia Bold.ttf');\
//   c=f.getBestCmap();h=f['hmtx'];g=f['glyf'];print({d:(h[c[48+i]][0],g[c[48+i]].yMin,g[c[48+i]].yMax) for i,d in enumerate('0123456789')})"
// 大编号的字形中心由此计算，SVG 里始终输出活的 <text>，不做永久转曲（见 bigNumberInkCenter）。
const GEORGIA_BOLD_UPEM = 2048;
const GEORGIA_BOLD_DIGITS: Record<
  string,
  { adv: number; xMin: number; xMax: number; yMin: number; yMax: number }
> = {
  '0': { adv: 1436, xMin: 103, xMax: 1333, yMin: -34, yMax: 1109 },
  '1': { adv: 1003, xMin: 117, xMax: 946, yMin: 0, yMax: 1107 },
  '2': { adv: 1283, xMin: 110, xMax: 1194, yMin: 0, yMax: 1109 },
  '3': { adv: 1279, xMin: 52, xMax: 1176, yMin: -369, yMax: 1109 },
  '4': { adv: 1330, xMin: 49, xMax: 1261, yMin: -369, yMax: 1103 },
  '5': { adv: 1227, xMin: 56, xMax: 1141, yMin: -369, yMax: 1077 },
  '6': { adv: 1327, xMin: 103, xMax: 1243, yMin: -35, yMax: 1458 },
  '7': { adv: 1135, xMin: 89, xMax: 1144, yMin: -369, yMax: 1077 },
  '8': { adv: 1385, xMin: 104, xMax: 1281, yMin: -37, yMax: 1460 },
  '9': { adv: 1327, xMin: 84, xMax: 1224, yMin: -375, yMax: 1109 },
};

// 摘录字号分档（上限 45px、下限 40px，逐档缩小至放得下为止）
const QUOTE_FONT_TIERS = [45, 44, 43, 42, 41, 40];

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

// ─── 字形度量：一律使用真实轮廓数据，不用 Em 框估算 ──────────────────────────
// 度量由 scripts/gen-letter-metrics.py 从源字体提取（advance + 墨迹 xMax），
// 等于 Illustrator 的 visibleBounds；禁止改用 Em 文本框（geometricBounds）——
// Em 框左右带边距、上下带行距留白，拿来做对齐视觉不准。
type LetterFont = 'han' | 'georgia-italic' | 'mixed';
/** 真正落到某个字体文件上的度量查询；'mixed' 由调用方先按运行片段拆开 */
type GlyphFont = Exclude<LetterFont, 'mixed'>;

function glyphFor(ch: string, font: GlyphFont): GlyphBox | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  return font === 'georgia-italic' ? georgiaItalicGlyph(cp) : hanGlyph(cp);
}

function upemOf(font: GlyphFont): number {
  return font === 'georgia-italic' ? GEO_ITALIC_UPEM : HAN_UPEM;
}

// 字体缺字时的兜底估算（em）；只在度量数据缺失时才会走到
function fallbackEm(ch: string): number {
  if (ch === ' ') return 0.32;
  if (isChineseGlyph(ch)) return 1;
  if (/[A-Z]/.test(ch)) return 0.72;
  if (/[a-z]/.test(ch)) return 0.52;
  if (/[0-9]/.test(ch)) return 0.62;
  if (ch === '…') return 0.5;
  return 0.45; // 其余半角标点/符号
}

function advanceEm(text: string, font: GlyphFont): number {
  const upem = upemOf(font);
  let w = 0;
  for (const ch of text) {
    const g = glyphFor(ch, font);
    w += g ? g.adv / upem : fallbackEm(ch);
  }
  return w;
}

// 从笔位起点到「最后一个字形墨迹最右侧」的距离（em）——真实可视右边界。
// 末字的右侧边距（advance − xMax）被扣掉，因此这里给出的是轮廓边界，不是 Em 框。
function inkRightEm(text: string, font: GlyphFont): number {
  const upem = upemOf(font);
  let pen = 0;
  let tail: { adv: number; xMax: number } | null = null;
  for (const ch of text) {
    const g = glyphFor(ch, font);
    const adv = g ? g.adv / upem : fallbackEm(ch);
    pen += adv;
    tail = g ? { adv, xMax: g.xMax / upem } : { adv, xMax: adv };
  }
  return tail ? pen - (tail.adv - tail.xMax) : 0;
}

// 出处行是「中文用华康宋体、西文用 Georgia Italic」的混排，按运行片段分别取度量
interface TextRun {
  text: string;
  zh: boolean;
}

function runsOf(content: string): TextRun[] {
  const runs: TextRun[] = [];
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
  return runs;
}

function measureRunEm(runs: TextRun[], mode: 'advance' | 'ink'): number {
  let pen = 0;
  let tail: { adv: number; xMax: number } | null = null;
  for (const run of runs) {
    const font: GlyphFont = run.zh ? 'han' : 'georgia-italic';
    const upem = upemOf(font);
    for (const ch of run.text) {
      const g = glyphFor(ch, font);
      const adv = g ? g.adv / upem : fallbackEm(ch);
      pen += adv;
      tail = g ? { adv, xMax: g.xMax / upem } : { adv, xMax: adv };
    }
  }
  if (mode === 'advance' || !tail) return pen;
  return pen - (tail.adv - tail.xMax);
}

/** 文本笔位总宽（em）。mixed = 中文走华康、西文走 Georgia Italic。 */
function textWidthEm(text: string, font: LetterFont): number {
  return font === 'mixed' ? measureRunEm(runsOf(text), 'advance') : advanceEm(text, font);
}

/** 文本墨迹右边界（em），即真实可视右端到笔位起点的距离。 */
function textInkEm(text: string, font: LetterFont): number {
  return font === 'mixed' ? measureRunEm(runsOf(text), 'ink') : inkRightEm(text, font);
}

function measureWidth(text: string, fontSize: number, font: LetterFont): number {
  return textWidthEm(text, font) * fontSize;
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

function splitToken(
  tok: string,
  fontSize: number,
  maxWidth: number,
  font: LetterFont,
): string[] {
  const parts: string[] = [];
  let acc = '';
  let accW = 0;
  for (const ch of tok) {
    const cw = measureWidth(ch, fontSize, font);
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

function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  font: LetterFont,
): string[] {
  const tokens = tokenize(text);
  const lines: string[] = [];
  let line = '';
  let lineW = 0;

  const place = (tok: string, tokW: number) => {
    if (tokW > maxWidth) {
      const parts = splitToken(tok, fontSize, maxWidth, font);
      for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
      line = parts[parts.length - 1];
      lineW = measureWidth(line, fontSize, font);
      return;
    }
    line = tok;
    lineW = tokW;
  };

  for (const tok of tokens) {
    const tokW = measureWidth(tok, fontSize, font);
    if (line === '') {
      place(tok, tokW);
      continue;
    }
    if (lineW + tokW <= maxWidth) {
      line += tok;
      lineW += tokW;
      continue;
    }

    // 放不下的是「不能出现在行首」的标点 → 追い出し：把当前行末字一起挪到下一行，
    // 这样标点不会落在行首，同时行宽也不会被撑破（禁止把标点硬塞进上一行）。
    if (PROHIBITED_START_PUNCTUATION.has(tok) && line.length > 1) {
      const last = line[line.length - 1];
      lines.push(line.slice(0, -1).trim());
      place(last + tok, measureWidth(last + tok, fontSize, font));
      continue;
    }

    lines.push(line.trim());
    place(tok, tokW);
  }
  if (line) lines.push(line.trim());

  // 兜底：仍出现行首标点时，只有在上一行「塞得下」的前提下才上提，
  // 保证任何一行的宽度都不会超过 maxWidth。
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || !PROHIBITED_START_PUNCTUATION.has(ln[0])) continue;
    const merged = lines[i - 1] + ln[0];
    if (measureWidth(merged, fontSize, font) > maxWidth) continue;
    lines[i - 1] = merged;
    lines[i] = ln.slice(1);
    if (lines[i] === '') {
      lines.splice(i, 1);
      i--;
    }
  }

  return lines.filter((l) => l.length > 0);
}

// ─── 出处：优先单行，放不下时折成「《书名》/ · 作者」两行 ──────────────────────
// 摘录短、书名作者长时，单行怎么摆都会越出左侧内容边界（旧实现把整行左移，
// 结果末字右缘反而超出摘录右缘）。这里改成换行：首行「《书名》」、次行「· 作者」。
// 分隔符跟着作者落到次行行首，首行以书名号收尾——右缘是「》」这种实心笔画，
// 贴住摘录右缘时比悬空的小圆点更「实」。
// 宽度一律按「墨迹右缘」判断（advance 可能小于墨迹，意大利体右伸字形会漏算）。
const attrInkPx = (text: string) => textInkEm(text, 'mixed') * ATTR_SIZE;

// 首行「《书名》」：书名太长就逐字回退到「《书名…》」，再不行退成「《…》」。
function attrHeadFor(bookTitle: string, budget: number): string {
  const full = `《${bookTitle}》`;
  if (attrInkPx(full) <= budget) return full;
  let cut = bookTitle;
  while (cut.length > 1) {
    cut = cut.slice(0, -1).trimEnd();
    const candidate = `《${cut}…》`;
    if (attrInkPx(candidate) <= budget) return candidate;
  }
  const minimal = '《…》';
  return attrInkPx(minimal) <= budget ? minimal : '';
}

// 次行「· 作者」：放不下就从作者尾部截断加「…」；连一个字都放不下时返回空串
// （此时整段只剩首行，不再输出悬空的分隔符）。
function attrTailFor(bookAuthor: string, budget: number): string {
  if (!bookAuthor) return '';
  const prefix = '· ';
  if (attrInkPx(prefix + bookAuthor) <= budget) return prefix + bookAuthor;
  let cut = bookAuthor;
  while (cut.length > 1) {
    cut = cut.slice(0, -1).trimEnd();
    const candidate = `${prefix}${cut}…`;
    if (attrInkPx(candidate) <= budget) return candidate;
  }
  return '';
}

// 返回 1～2 行出处文字；每行墨迹宽度都保证不超过自己那一行的可用宽度，
// 因此调用方可以把每行右缘直接贴到摘录右缘上，绝不会越出左侧内容边界。
// 首行的可用宽度要扣掉行首那根横线；次行不需要（横线只挂在首行左侧）。
function attrLinesFor(bookTitle: string, bookAuthor: string, rightEdge: number): string[] {
  const headBudget = rightEdge - CONTENT_LEFT - ATTR_RULE_LEN;
  const tailBudget = rightEdge - CONTENT_LEFT;

  // 1) 单行放得下 → 保持单行的「《书名》· 作者」
  const single = `《${bookTitle}》· ${bookAuthor}`;
  if (attrInkPx(single) <= headBudget) return [single];

  // 2) 折成两行：「《书名》」/「· 作者」
  const head = attrHeadFor(bookTitle, headBudget);
  if (!head) return [];   // 摘录短到连一个书名号都放不下（极少见）
  const tail = attrTailFor(bookAuthor, tailBudget);
  return tail ? [head, tail] : [head];
}

// ─── 布局计算 ──────────────────────────────────────────────────────────────────
interface AttrLine {
  text: string;
  x: number;   // 该行文字左端（由右缘对齐摘录右缘反推）
  y: number;   // 该行基线
}

interface Layout {
  q: number;
  quoteLines: string[];
  quoteYs: number[];
  attrLines: AttrLine[];
  attrRuleX2: number;   // 首行横线右端 = 首行文字左端
  attrRuleY: number;    // 首行横线 y
  fits: boolean;
}

function lhQ(q: number): number {
  return Math.round(q * QUOTE_LH);
}

// 出处首行基线：跟随摘录末行，理想间距 50px；空间紧张时收紧，但不小于 40px。
// 折行后每一行都要落在 ATTR_BOTTOM_LIMIT 之上，所以行数越多首行越要上提。
function attrYFor(lastBaseline: number, lineCount: number): number {
  const limit = ATTR_BOTTOM_LIMIT - (lineCount - 1) * ATTR_LINE_H;
  const gap = Math.min(ATTR_GAP_MAX, limit - lastBaseline);
  return Math.min(lastBaseline + Math.max(gap, ATTR_GAP_MIN), limit);
}

function layoutFor(quote: string, bookTitle: string, bookAuthor: string, q: number): Layout {
  const quoteLines = wrapText(quote, q, RIGHT - QUOTE_X, 'han');
  const quoteYs = quoteLines.map((_, i) => QUOTE_TOP + i * lhQ(q));

  // 摘录「最右一列文字」的墨迹右缘（不是内容右边界 960.2，也不是 Em 框右缘）
  const quoteRight = quoteLines.reduce(
    (max, line) => Math.max(max, QUOTE_X + textInkEm(line, 'han') * q),
    QUOTE_X,
  );
  const attrTexts = attrLinesFor(bookTitle, bookAuthor, quoteRight);

  const lastBaseline = quoteYs[quoteYs.length - 1] ?? QUOTE_TOP;
  const firstBaseline = attrYFor(lastBaseline, attrTexts.length);
  // 每行都用墨迹右缘贴住摘录右缘：不是 Em 框右缘，末字的右侧边距不参与对齐
  const attrLines = attrTexts.map((text, i) => ({
    text,
    y: firstBaseline + i * ATTR_LINE_H,
    x: quoteRight - textInkEm(text, 'mixed') * ATTR_SIZE,
  }));

  const lastAttrBaseline = attrLines[attrLines.length - 1]?.y ?? firstBaseline;
  // 横向由 attrLinesFor 的宽度契约保证（首行 x − ATTR_RULE_LEN ≥ CONTENT_LEFT）
  const fits =
    firstBaseline - lastBaseline >= ATTR_GAP_MIN && lastAttrBaseline <= ATTR_BOTTOM_LIMIT;

  return {
    q,
    quoteLines,
    quoteYs,
    attrLines,
    attrRuleX2: attrLines[0]?.x ?? quoteRight,
    attrRuleY: firstBaseline + ATTR_RULE_DY,
    fits,
  };
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
  const tspans = runsOf(content)
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

// ─── 出处：等长横线 + 一至两行右对齐文字（横线只挂在首行左侧） ─────────────────
function attributionNode(layout: Layout): string {
  if (layout.attrLines.length === 0) return '';   // 摘录短到一行出处都放不下（极少见）
  const y = round1(layout.attrRuleY);
  const x2 = round1(layout.attrRuleX2);
  const x1 = round1(layout.attrRuleX2 - ATTR_RULE_LEN);
  const rule = `<line class="letter-attr-rule" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  const text = layout.attrLines
    .map((l) => mixedTextNode('letter-attr', round1(l.x), round1(l.y), l.text, ATTR_SIZE))
    .join('\n');
  return `${rule}\n${text}`;
}



// ─── 大编号字形中心 ────────────────────────────────────────────────────────────
// 等价于 Illustrator 的 visibleBounds 求心：取「整串数字轮廓并集」的中心，
// 而不是 Em 文本框（textFrame.geometricBounds）的中心——Em 框上下留白，视觉不准。
// 这里直接读字体轮廓数据，不需要真的复制转曲，因此 <text> 全程保持可编辑。
// 返回相对 text-anchor="middle" 锚点的偏移，单位 em；y 与 SVG 同向（向下为正）。
export function bigNumberInkCenter(digits: string): { x: number; y: number } {
  const totalAdv = [...digits].reduce((sum, d) => sum + (GEORGIA_BOLD_DIGITS[d]?.adv ?? 0), 0);
  let pen = -totalAdv / 2;   // 居中锚点：从负半宽处起笔
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const d of digits) {
    const g = GEORGIA_BOLD_DIGITS[d];
    if (!g) continue;
    minX = Math.min(minX, pen + g.xMin);
    maxX = Math.max(maxX, pen + g.xMax);
    minY = Math.min(minY, g.yMin);
    maxY = Math.max(maxY, g.yMax);
    pen += g.adv;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };

  return {
    x: (minX + maxX) / 2 / GEORGIA_BOLD_UPEM,
    y: -(minY + maxY) / 2 / GEORGIA_BOLD_UPEM,   // 字体坐标 y 向上 → SVG y 向下
  };
}

// ─── 大编号：位数越多字号越小；字形可视中心始终落在 (TARGET_X, TARGET_Y) ───────
function bigNumberNode(number: number): string {
  const digits = String(number);
  const len = digits.length;
  const size = len <= 2 ? 220 : len === 3 ? 170 : len === 4 ? 130 : 105;
  const ink = bigNumberInkCenter(digits);
  const x = BIGNUM_TARGET_X - ink.x * size;
  const y = BIGNUM_TARGET_Y - ink.y * size;
  return `<text class="letter-bignum" text-anchor="middle" style="font-size:${size}px" transform="translate(${round1(x)} ${round1(y)})"><tspan x="0" y="0">${digits}</tspan></text>`;
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
