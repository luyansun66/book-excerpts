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
// 行距比例 7/5 = 1.4（模板原本是 48px 配 64px，即 4/3 ≈ 1.333，排版偏紧）。
// 放宽到 1.4 后 45px 档行距 60px → 63px。这个值是可放的最大档位：再松到 1.45
// 时首信那段（7 行 × 45px）的底部间距只剩 87px，逼近 85px 硬下限，字号会被迫掉档。
// 行距一松，「摘录末行 → 出处首行」的墨迹间距同步变小，所以改这里必须复核
// ATTR_INK_GAP_MIN 是否仍能满足（见下方 attrInkGapRoom）。
const QUOTE_LH = 7 / 5;

const BOTTOM_LINE_Y = 1413.1;   // 底部横线 y
const BOTTOM_CLEARANCE = 30;    // 出处末行基线距底部横线的硬下限
const ATTR_BOTTOM_LIMIT = BOTTOM_LINE_Y - BOTTOM_CLEARANCE; // 出处末行基线最低值 1383.1
const ATTR_SIZE = 34;           // 出处字号（固定，不随摘录字号变化）

// ─── 摘录末行 → 出处的间距：按「墨迹」定义，不按基线定义 ──────────────────────
// 要控制的是「摘录末行墨迹底 → 出处首行墨迹顶」这段空白。墨迹到各自基线还有一段
// 距离，且随末字字形浮动，所以统一取字体轮廓的保守上界换算成基线距：
//   · 出处首行首字恒为「《」，是整行墨迹最高点（≈0.85em）；
//   · 摘录末字可能是句读（≈0.09em）或西文降部（≈0.21em），取 0.22em 兜住。
// 都用上界 ⇒ 实际墨迹间距只会比目标值更大，「下限」一定成立。
const ATTR_INK_ASCENT_EM = 0.85;
const QUOTE_INK_DESCENT_EM = 0.22;

const ATTR_INK_GAP_MIN = 85;      // 硬下限（约为旧版 16.5px 的 5 倍）
const ATTR_INK_GAP_COMFORT = 120; // 下方宽裕时的舒适间距
// 出处的横线长度、横线偏移、行距都定义成 em，随出处字号一起缩放，
// 否则小字号档位下横线会显得过长、两行出处会显得过散。
const ATTR_RULE_LEN_EM = 2;        // 横线长度（35px 字号下 = 70px，即「——」的宽度）
const ATTR_RULE_DY_EM = -12 / 35;  // 横线相对基线的纵向偏移（35px 字号下 = −12px）
const ATTR_LINE_H_EM = 1.25;       // 出处折成两行时的行距（35px 字号下 = 44px）
const r1 = (n: number) => Math.round(n * 10) / 10;   // 保留 1 位小数的数值版
const attrRuleLen = (size: number) => r1(ATTR_RULE_LEN_EM * size);
const attrRuleDy = (size: number) => r1(ATTR_RULE_DY_EM * size);
const attrLineH = (size: number) => r1(ATTR_LINE_H_EM * size);

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

// 摘录字号分档（上限 45px、下限 37px，逐档缩小至放得下为止）
const QUOTE_FONT_TIERS = [45, 44, 43, 42, 41, 40, 39, 38, 37];

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

/** 文本墨迹右边界（px）：真实可视右端，不含末字的右侧边距。 */
function measureInk(text: string, fontSize: number, font: LetterFont): number {
  return textInkEm(text, font) * fontSize;
}

// ─── 摘录正文排版规范 ─────────────────────────────────────────────────────────
// 版心：左起 QUOTE_X、右界 RIGHT；一律左对齐、行尾不齐（不做两端对齐，免得字距被拉散）。
// 断行：中文逐字、西文成词、空格单独成词。
// 禁则：行首不得出现收尾标点（避头），行末不得出现起首标点（避尾）。
// 标点：行末标点只要「墨迹右缘」还在版心内就留在行末（用掉它自带的空白余量）；
//       连续标点之间压掉前一个标点一半的空白余量，免得两个字身之间空出一个洞。
// 混排：中文与西文交界处补足 1/4em 空隙（clreq「中西文间隙」）；
//       空格本身已经是间隔，其后不再补。
// 空格：行首不出现空格，行末空格随 trim 丢弃。
const PUNCT_SQUEEZE = 0.5;      // 连续标点：压掉前一个标点空白余量的比例
const CJK_LATIN_GAP_EM = 0.25;  // 中西文交界处的目标空隙（1/4em）

// 收尾标点（避头）：不能出现在行首
const PROHIBITED_START_PUNCTUATION = new Set([
  '，', '。', '、', '；', '：', '！', '？', '）', '」', '』', '】', '〕', '〉', '》', '…',
]);
// 起首标点（避尾）：不能出现在行末
const PROHIBITED_END_PUNCTUATION = new Set(['（', '《', '「', '『', '【', '〔', '〈']);
const QUOTE_PUNCTUATION = new Set([...PROHIBITED_START_PUNCTUATION, ...PROHIBITED_END_PUNCTUATION]);

/** 一个字形在摘录正文字体（华康宋体）下的字身宽与墨迹右缘，单位 em。 */
function quoteBox(ch: string): { adv: number; xMax: number } {
  const g = glyphFor(ch, 'han');
  if (!g) return { adv: fallbackEm(ch), xMax: fallbackEm(ch) };
  return { adv: g.adv / HAN_UPEM, xMax: g.xMax / HAN_UPEM };
}

/** 字距调整：在 cur 之前额外插入的空隙（em），负值表示压缩。 */
function trackingBefore(prev: string | undefined, cur: string): number {
  if (!prev) return 0;
  const box = quoteBox(prev);
  const trailing = box.adv - box.xMax;   // 前一个字自带的右侧空白
  if (QUOTE_PUNCTUATION.has(prev) && QUOTE_PUNCTUATION.has(cur)) {
    return -trailing * PUNCT_SQUEEZE;
  }
  if (cur !== ' ' && isCjk(prev) !== isCjk(cur)) {
    return Math.max(0, CJK_LATIN_GAP_EM - trailing);
  }
  return 0;
}

/** 一段摘录文本渲染后的字身宽（em），含字距调整。 */
function quoteWidthEm(text: string): number {
  let w = 0;
  let prev: string | undefined;
  for (const ch of text) {
    w += trackingBefore(prev, ch) + quoteBox(ch).adv;
    prev = ch;
  }
  return w;
}

/** 一段摘录文本的墨迹右缘（em）：字身宽扣掉末字自带的右侧空白。 */
function quoteInkEm(text: string): number {
  const chars = [...text];
  const last = chars[chars.length - 1];
  if (!last) return 0;
  const box = quoteBox(last);
  return quoteWidthEm(text) - (box.adv - box.xMax);
}

/** 把一行按字距调整切成若干段，供 SVG 用 tspan 的 dx 还原同样的字距。 */
function quoteSegments(text: string): Array<{ text: string; dxEm: number }> {
  const segs: Array<{ text: string; dxEm: number }> = [];
  let prev: string | undefined;
  for (const ch of text) {
    const dx = trackingBefore(prev, ch);
    if (segs.length > 0 && dx === 0) segs[segs.length - 1].text += ch;
    else segs.push({ text: ch, dxEm: dx });
    prev = ch;
  }
  return segs;
}

/** 一段文本的排版宽度（px）。摘录正文走字距调整，其余字体按裸字身宽。 */
function layoutWidth(text: string, fontSize: number, font: LetterFont): number {
  return font === 'han' ? quoteWidthEm(text) * fontSize : measureWidth(text, fontSize, font);
}

/** 一段文本的墨迹右缘（px）。 */
function layoutInk(text: string, fontSize: number, font: LetterFont): number {
  return font === 'han' ? quoteInkEm(text) * fontSize : measureInk(text, fontSize, font);
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

  // 把 tok 接到行末时，两字交界处的字距调整也要计进去
  const gapBefore = (tok: string) =>
    font === 'han' && line !== '' && tok !== ''
      ? trackingBefore(line[line.length - 1], tok[0]) * fontSize
      : 0;

  const place = (tok: string, tokW: number) => {
    if (tokW > maxWidth) {
      const parts = splitToken(tok, fontSize, maxWidth, font);
      for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i]);
      line = parts[parts.length - 1];
      lineW = layoutWidth(line, fontSize, font);
      return;
    }
    line = tok;
    lineW = tokW;
  };

  // 结束当前行；行末若是起首标点（避尾），把它带到下一行去，返回要带走的字。
  const breakLine = (): string => {
    let carry = '';
    if (line.length > 1 && PROHIBITED_END_PUNCTUATION.has(line[line.length - 1])) {
      carry = line[line.length - 1];
      line = line.slice(0, -1);
    }
    lines.push(line.trim());
    line = '';
    lineW = 0;
    return carry;
  };

  for (const tok of tokens) {
    if (line === '') {
      if (tok === ' ') continue;   // 行首不留空格
      place(tok, layoutWidth(tok, fontSize, font));
      continue;
    }

    const tokW = gapBefore(tok) + layoutWidth(tok, fontSize, font);
    if (lineW + tokW <= maxWidth) {
      line += tok;
      lineW += tokW;
      continue;
    }

    // 避头：标点不能落在行首。这里先别急着推排——全角句读的墨迹只占字身靠左的一小段
    // （「，」0.31em、「。」0.36em、「！」0.56em），字身右侧那片空白本就是留给避头尾的
    // 余量。墨迹右缘仍在版心内就让它留在行末，只是把那片空白用掉了；
    // 连墨迹都放不下时，才做追い出し：把当前行末字一起挪到下一行。
    if (PROHIBITED_START_PUNCTUATION.has(tok) && line.length > 1) {
      if (lineW + gapBefore(tok) + layoutInk(tok, fontSize, font) <= maxWidth) {
        lines.push((line + tok).trim());
        line = '';
        lineW = 0;
        continue;
      }
      const last = line[line.length - 1];
      line = line.slice(0, -1);
      const carried = breakLine();   // 顺便处理避尾
      place(carried + last + tok, layoutWidth(carried + last + tok, fontSize, font));
      continue;
    }

    // 避尾：行末不得是起首标点，连同它一起挪到下一行
    const carry = breakLine();
    place(carry + tok, layoutWidth(carry + tok, fontSize, font));
  }
  if (line) lines.push(line.trim());

  // 兜底：仍出现行首标点时，只有在上一行「塞得下」的前提下才上提。
  // 判定口径与主循环一致——按墨迹右缘，行末标点可以用掉自带的空白余量，
  // 因此任何一行的墨迹右缘都不会超过 maxWidth。
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i];
    if (!ln || !PROHIBITED_START_PUNCTUATION.has(ln[0])) continue;
    const merged = lines[i - 1] + ln[0];
    if (layoutWidth(merged, fontSize, font) > maxWidth && layoutInk(merged, fontSize, font) > maxWidth) continue;
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
const attrInkPx = (text: string, size: number) => textInkEm(text, 'mixed') * size;

// 首行「《书名》」：书名太长就逐字回退到「《书名…》」，再不行退成「《…》」。
function attrHeadFor(bookTitle: string, budget: number, size: number): string {
  const full = `《${bookTitle}》`;
  if (attrInkPx(full, size) <= budget) return full;
  let cut = bookTitle;
  while (cut.length > 1) {
    cut = cut.slice(0, -1).trimEnd();
    const candidate = `《${cut}…》`;
    if (attrInkPx(candidate, size) <= budget) return candidate;
  }
  const minimal = '《…》';
  return attrInkPx(minimal, size) <= budget ? minimal : '';
}

// 次行「· 作者」：放不下就从作者尾部截断加「…」；连一个字都放不下时返回空串
// （此时整段只剩首行，不再输出悬空的分隔符）。
function attrTailFor(bookAuthor: string, budget: number, size: number): string {
  if (!bookAuthor) return '';
  const prefix = '· ';
  if (attrInkPx(prefix + bookAuthor, size) <= budget) return prefix + bookAuthor;
  let cut = bookAuthor;
  while (cut.length > 1) {
    cut = cut.slice(0, -1).trimEnd();
    const candidate = `${prefix}${cut}…`;
    if (attrInkPx(candidate, size) <= budget) return candidate;
  }
  return '';
}

// 返回 1～2 行出处文字；每行墨迹宽度都保证不超过自己那一行的可用宽度，
// 因此调用方可以把每行右缘直接贴到摘录右缘上，绝不会越出左侧内容边界。
// 首行的可用宽度要扣掉行首那根横线；次行不需要（横线只挂在首行左侧）。
function attrLinesFor(bookTitle: string, bookAuthor: string, rightEdge: number, size: number): string[] {
  const headBudget = rightEdge - CONTENT_LEFT - attrRuleLen(size);
  const tailBudget = rightEdge - CONTENT_LEFT;

  // 1) 单行放得下 → 保持单行的「《书名》· 作者」
  const single = `《${bookTitle}》· ${bookAuthor}`;
  if (attrInkPx(single, size) <= headBudget) return [single];

  // 2) 折成两行：「《书名》」/「· 作者」
  const head = attrHeadFor(bookTitle, headBudget, size);
  if (!head) return [];   // 摘录短到连一个书名号都放不下（极少见）
  const tail = attrTailFor(bookAuthor, tailBudget, size);
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
  attrRuleLen: number;  // 首行横线长度（随出处字号缩放）
  attrSize: number;     // 出处字号
  fits: boolean;
}

function lhQ(q: number): number {
  return Math.round(q * QUOTE_LH);
}

/** 「墨迹间距 = inkGap」时，出处首行基线相对摘录末行基线要拉开多少。 */
function attrBaselineGap(inkGap: number, q: number, attrSize: number): number {
  return QUOTE_INK_DESCENT_EM * q + inkGap + ATTR_INK_ASCENT_EM * attrSize;
}

/** 出处末行仍能留在底部横线上方（≥30px）时，墨迹间距最大能取多少。 */
function attrInkGapRoom(lastBaseline: number, lineCount: number, q: number, attrSize: number): number {
  const lowestFirstBaseline = ATTR_BOTTOM_LIMIT - (lineCount - 1) * attrLineH(attrSize);
  return lowestFirstBaseline - lastBaseline - attrBaselineGap(0, q, attrSize);
}

function layoutFor(quote: string, bookTitle: string, bookAuthor: string, q: number): Layout {
  const quoteLines = wrapText(quote, q, RIGHT - QUOTE_X, 'han');
  const quoteYs = quoteLines.map((_, i) => QUOTE_TOP + i * lhQ(q));

  // 摘录「最右一列文字」的墨迹右缘（不是内容右边界 960.2，也不是 Em 框右缘）
  const quoteRight = quoteLines.reduce(
    (max, line) => Math.max(max, QUOTE_X + quoteInkEm(line) * q),
    QUOTE_X,
  );
  const attrTexts = attrLinesFor(bookTitle, bookAuthor, quoteRight, ATTR_SIZE);

  // 下方宽裕 → 用舒适间距；紧张 → 一路压到「刚好不碰底线」，但不低于硬下限。
  // 硬下限都放不下时 fits=false，由 computeLayout 降摘录字号、最后才截断摘录。
  const lastBaseline = quoteYs[quoteYs.length - 1] ?? QUOTE_TOP;
  const inkGap = Math.min(ATTR_INK_GAP_COMFORT, attrInkGapRoom(lastBaseline, attrTexts.length, q, ATTR_SIZE));
  const firstBaseline = lastBaseline + attrBaselineGap(inkGap, q, ATTR_SIZE);
  // 每行都用墨迹右缘贴住摘录右缘：不是 Em 框右缘，末字的右侧边距不参与对齐
  const attrLines = attrTexts.map((text, i) => ({
    text,
    y: firstBaseline + i * attrLineH(ATTR_SIZE),
    x: quoteRight - textInkEm(text, 'mixed') * ATTR_SIZE,
  }));

  const lastAttrBaseline = attrLines[attrLines.length - 1]?.y ?? firstBaseline;
  // 横向由 attrLinesFor 的宽度契约保证（首行 x − 横线长 ≥ CONTENT_LEFT）
  const fits = inkGap >= ATTR_INK_GAP_MIN && lastAttrBaseline <= ATTR_BOTTOM_LIMIT;

  return {
    q,
    quoteLines,
    quoteYs,
    attrLines,
    attrRuleX2: attrLines[0]?.x ?? quoteRight,
    attrRuleY: firstBaseline + attrRuleDy(ATTR_SIZE),
    attrRuleLen: attrRuleLen(ATTR_SIZE),
    attrSize: ATTR_SIZE,
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
// ─── 摘录正文：按字距调整切成 tspan，用 dx 还原中西文间隙与连续标点挤压 ────────
// 字距调整只改「笔位」，不改字形，所以文字仍是活的 <text>，可选中、可编辑。
function quoteTextNode(x: number, y: number | string, content: string, fontSize: number): string {
  const tspans = quoteSegments(content)
    .map((seg, i) => {
      const pos = i === 0 ? ' x="0" y="0"' : seg.dxEm === 0 ? '' : ` dx="${round1(seg.dxEm * fontSize)}"`;
      return `<tspan${pos}>${esc(seg.text)}</tspan>`;
    })
    .join('');
  return `<text class="letter-quote" style="font-size:${fontSize}px" transform="translate(${x} ${y})">${tspans}</text>`;
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
  const x1 = round1(layout.attrRuleX2 - layout.attrRuleLen);
  const rule = `<line class="letter-attr-rule" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`;
  const text = layout.attrLines
    .map((l) => mixedTextNode('letter-attr', round1(l.x), round1(l.y), l.text, layout.attrSize))
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
    .map((line, i) => quoteTextNode(QUOTE_X, round1(layout.quoteYs[i]), line, layout.q))
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
