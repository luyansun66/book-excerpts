// ─── 摘录 / 感悟的轻量标记 ────────────────────────────────────────────────────
//
// 只做两种标记：==高亮==、**加粗**。
// 存的是标记文本本身（不走 HTML / delta）：云同步、JSON 备份、markdown 导出、搜索
// 这四条链路都按纯文本消费，标记文本让它们一行都不用改（见设计文档 §4）。
//
// 规则：成对、不跨行、不嵌套；未闭合与空标记按字面显示，绝不吞字。
// 摘录原文（scope='quote'）是引用，只认 ==，怕把原文献里的 ** 读走样。

export type RichScope = 'quote' | 'thought';
export type InlineKind = 'text' | 'strong' | 'mark';

export interface Inline {
  kind: InlineKind;
  text: string;
}

const MARK = '==';
const BOLD = '**';

function parseInlineWithTokens(
  text: string,
  tokens: Array<{ open: string; kind: InlineKind }>,
): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  let i = 0;
  while (i < text.length) {
    const hit = tokens.find((t) => text.startsWith(t.open, i));
    if (!hit) {
      buf += text[i];
      i += 1;
      continue;
    }
    const closeAt = text.indexOf(hit.open, i + hit.open.length);
    const inner = closeAt < 0 ? '' : text.slice(i + hit.open.length, closeAt);
    if (closeAt < 0 || inner === '') {
      // 未闭合 / 空标记：按字面吐出开标记，继续往后扫
      buf += hit.open;
      i += hit.open.length;
      continue;
    }
    if (buf) {
      out.push({ kind: 'text', text: buf });
      buf = '';
    }
    out.push({ kind: hit.kind, text: inner });
    i = closeAt + hit.open.length;
  }
  if (buf) out.push({ kind: 'text', text: buf });
  return out;
}

function parseInline(text: string, scope: RichScope): Inline[] {
  const tokens: Array<{ open: string; kind: InlineKind }> = [{ open: MARK, kind: 'mark' }];
  if (scope === 'thought') tokens.push({ open: BOLD, kind: 'strong' });
  return parseInlineWithTokens(text, tokens);
}

/**
 * 按行切开、逐行解析行内标记。返回「每行的行内片段」而不是块级结构：
 * 调用方仍把整段放在同一个文本块里（`white-space: pre-wrap`），行间只补 `\n`，
 * 不生成 `ul` / `ol` / `p` —— 折叠用的 `-webkit-line-clamp` 要求裁剪边界落在行边界上。
 */
export function parseRichText(text: string, scope: RichScope): Inline[][] {
  return text.split('\n').map((line) => parseInline(line, scope));
}

export function stripRichText(text: string, scope: RichScope): string {
  return parseRichText(text, scope)
    .map((line) => line.map((run) => run.text).join(''))
    .join('\n');
}

/**
 * 只去掉成对的高亮标记，保留加粗标记和所有文字。
 * 编辑页的「清除」用它：删高亮不等于把用户写的 `**加粗**` 也一并洗掉。
 */
export function stripHighlightMarkers(text: string): string {
  const markOnly = [{ open: MARK, kind: 'mark' as const }];
  return text
    .split('\n')
    .map((line) => parseInlineWithTokens(line, markOnly).map((run) => run.text).join(''))
    .join('\n');
}

// ─── 编辑侧：把标记套到选区上 ────────────────────────────────────────────────

export interface EditResult {
  next: string;
  selStart: number;
  selEnd: number;
}

/** 把 `marker` 套在选区外；已经套着（或在选区里带着）就拆掉。空选区时插一对，光标落中间。 */
export function toggleInlineMarker(
  value: string,
  start: number,
  end: number,
  marker: string,
): EditResult {
  const len = marker.length;
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);

  // 选区外侧已经包着 → 拆掉
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      next: before.slice(0, -len) + sel + after.slice(len),
      selStart: start - len,
      selEnd: end - len,
    };
  }

  // 用户把标记本身也选中了 → 拆掉
  if (sel.length >= len * 2 && sel.startsWith(marker) && sel.endsWith(marker)) {
    const inner = sel.slice(len, -len);
    return { next: before + inner + after, selStart: start, selEnd: start + inner.length };
  }

  return {
    next: before + marker + sel + marker + after,
    selStart: start + len,
    selEnd: end + len,
  };
}

