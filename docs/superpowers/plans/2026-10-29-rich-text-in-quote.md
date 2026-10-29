# 摘录正文与感悟的轻量格式 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让「添加摘录」的两个文本框支持两种轻量标记（高亮、加粗），并在全 app 的展示面正确渲染；两栏各选一个自己的高亮色。

**Architecture:** `text` / `thought` 仍是 TEXT 列，存标记文本（`==高亮==`、`**加粗**`）；高亮色另存两个可选字段 `textMarkColor` / `thoughtMarkColor`。解析与渲染分成两层：`richText.ts` 是纯函数（解析 / 清洗 / 选区包裹），`RichText.tsx` 只把解析结果渲染成**行内元素**，整段仍是单一文本块 —— 这样 `-webkit-line-clamp` 的裁剪边界继续落在行边界上。编辑侧不换 textarea，只在上面加一行工具栏，按钮作用于选区。

**Tech Stack:** React 18 + TypeScript + Vite 6 + Vitest 4 + @testing-library/react（jsdom）。无新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-28-rich-text-in-quote-design.md`

## Global Constraints

- `quotes.text` / `quotes.thought` 仍是 TEXT；只新增两个可空颜色 TEXT 列，并同步进 JSON / Supabase。
- 渲染层不得产生块级子元素（`div` / `ul` / `ol` / `li` / `p`）。不做列表。
- `scope='quote'`（摘录原文）**只解析 `==`**；`**`、`- `、`1. ` 一律按字面显示。
- 标记必须成对、不跨行、不嵌套；未闭合或空标记按字面显示，绝不吞字。
- 不新增 npm 依赖，不引入 contenteditable / 富文本编辑器。
- 默认颜色走设计令牌 `--color-quote-mark-bg`；每条摘录可在添加页给两栏各选一个颜色，不设全局阅读设置。回顾卡未设色时用自己 `COLORS` 里的 `highlightBg`。
- 提交信息用中文，前缀 `feat(摘录格式):` / `fix(摘录格式):` / `test(摘录格式):`。

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/app/richText.ts`（新建） | 纯函数：`parseRichText` / `stripRichText` / `toggleInlineMarker` |
| `src/app/quoteMarkColors.ts`（新建） | 每摘录高亮色的预设、校验与默认回落 |
| `src/app/searchText.ts`（新建） | 搜索用的纯文本拼接（不碰 Dexie，便于单测） |
| `src/app/components/RichText.tsx`（新建） | 把解析结果渲染成行内元素；不产生块级元素 |
| `src/app/components/FormatToolbar.tsx`（新建） | 编辑页那一行格式按钮（纯展示 + 回调） |
| `src/app/__tests__/richText.test.ts`（新建） | 解析、清洗、选区包裹 |
| `src/app/components/__tests__/RichText.test.tsx`（新建） | 渲染结果只含行内元素 |
| `src/app/components/__tests__/AddQuoteSheet.test.tsx`（新建） | 工具栏插入 / 去标记 / 光标 |
| `src/app/review/__tests__/excerptCardRichText.test.tsx`（新建） | 回顾卡正文与探针渲染同一棵树 |
| `src/styles/tokens.css`（修改） | 新增 `--color-quote-mark-bg`，亮暗各一 |
| `src/app/review/rolodex/tokens.ts`（修改） | `COLORS` 加 `highlightBg` |
| `src/app/components/CollapsibleQuoteText.tsx`（修改） | 正文用 `RichText` |
| `src/app/components/CollapsibleThought.tsx`（修改） | 感悟用 `RichText` |
| `src/app/components/sheets/AddQuoteSheet.tsx`（修改） | 两栏各加工具栏 + 选区逻辑 |
| `src/app/review/rolodex/ExcerptCard.tsx`（修改） | 正文与探针同时换 `RichText` |
| `src/app/components/sheets/ShareCard.tsx`（修改） | 正文与感悟 strip 后按纯文本导出 |
| `src/app/components/sheets/ShareSheet.tsx`（修改） | 字体子集用 strip 后的文本 |
| `src/app/review/ReviewPage.tsx`（修改） | 大号正文换 `RichText` |
| `src/app/mailbox/letterLogic.ts`（修改） | 进信件排版前 strip |
| `src/app/db/index.ts`（修改） | 搜索比对前 strip |
| `src/app/components/SearchResults.tsx`（修改） | 高亮基于 strip 后的文本 |

---

## 开工前的两项检查（不是编码任务）

- [ ] **确认库里没有旧的 `==`**：在预览页（`http://localhost:5173/`）的 Safari 控制台跑下面这段，确认命中数为 0。
  若非 0，把命中的条目记下来 —— 它们会被当成高亮。

```js
const req = indexedDB.open('bookwrite');
req.onsuccess = () => {
  const all = req.result.transaction('quotes', 'readonly').objectStore('quotes').getAll();
  all.onsuccess = () => {
    const re = /==[^=\n]+==/;
    const hits = all.result.filter((q) => re.test(q.text) || re.test(q.thought));
    console.log('可能被误判成高亮的条目：', hits.length, hits);
  };
};
```

- [ ] **确认基线全绿**：`npm test`，记录通过条数（写这份计划时是 635 条）。

---

### Task 1: 解析与清洗（纯函数）

**Files:**
- Create: `src/app/richText.ts`
- Test: `src/app/__tests__/richText.test.ts`

**Interfaces:**
- Produces:
  - `type RichScope = 'quote' | 'thought'`
  - `type InlineKind = 'text' | 'strong' | 'mark'`
  - `interface Inline { kind: InlineKind; text: string }`
  - `interface RichLine { kind: 'p' | 'ul' | 'ol'; prefix: string; rawPrefix: string; inlines: Inline[] }`
  - `function parseRichText(text: string, scope: RichScope): RichLine[]`
  - `function stripRichText(text: string, scope: RichScope): string`

- [ ] **Step 1: 写失败的测试**

创建 `src/app/__tests__/richText.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseRichText, stripRichText } from '../richText';

describe('parseRichText / 行内标记', () => {
  it('把成对 == 解析成高亮', () => {
    const [line] = parseRichText('他说==要活下去==。', 'quote');
    expect(line.inlines).toEqual([
      { kind: 'text', text: '他说' },
      { kind: 'mark', text: '要活下去' },
      { kind: 'text', text: '。' },
    ]);
  });

  it('未闭合的标记按字面显示，不吞字', () => {
    const [line] = parseRichText('他说==要活下去', 'quote');
    expect(line.inlines).toEqual([{ kind: 'text', text: '他说==要活下去' }]);
  });

  it('空标记 ==== 按字面显示', () => {
    const [line] = parseRichText('====', 'quote');
    expect(line.inlines).toEqual([{ kind: 'text', text: '====' }]);
  });

  it('高亮不跨行', () => {
    const lines = parseRichText('==第一行\n第二行==', 'quote');
    expect(lines).toHaveLength(2);
    expect(lines[0].inlines).toEqual([{ kind: 'text', text: '==第一行' }]);
    expect(lines[1].inlines).toEqual([{ kind: 'text', text: '第二行==' }]);
  });

  it('非贪婪：==a==b== 只把 a 判为高亮', () => {
    const [line] = parseRichText('==a==b==', 'quote');
    expect(line.inlines).toEqual([
      { kind: 'mark', text: 'a' },
      { kind: 'text', text: 'b==' },
    ]);
  });

  it('不嵌套：==**x**== 里面的 ** 按字面留在高亮里', () => {
    const [line] = parseRichText('==**x**==', 'thought');
    expect(line.inlines).toEqual([{ kind: 'mark', text: '**x**' }]);
  });

  it('摘录原文不解析加粗和列表', () => {
    const [line] = parseRichText('**粗** 和 - 列表', 'quote');
    expect(line.kind).toBe('p');
    expect(line.prefix).toBe('');
    expect(line.inlines).toEqual([{ kind: 'text', text: '**粗** 和 - 列表' }]);
  });
});

describe('parseRichText / 列表', () => {
  it('感悟里的 - 行变无序列表，前缀换成圆点', () => {
    const lines = parseRichText('- **读**完了', 'thought');
    expect(lines[0]).toMatchObject({ kind: 'ul', prefix: '· ', rawPrefix: '- ' });
    expect(lines[0].inlines).toEqual([
      { kind: 'strong', text: '读' },
      { kind: 'text', text: '完了' },
    ]);
  });

  it('感悟里的 1. 行变有序列表，数字原样保留', () => {
    const lines = parseRichText('1. 第一点\n3. 第三点', 'thought');
    expect(lines[0]).toMatchObject({ kind: 'ol', prefix: '1. ', rawPrefix: '1. ' });
    expect(lines[1]).toMatchObject({ kind: 'ol', prefix: '3. ', rawPrefix: '3. ' });
  });

  it('没有空格的行首 - 不算列表', () => {
    const [line] = parseRichText('-没有空格', 'thought');
    expect(line.kind).toBe('p');
  });
});

describe('stripRichText', () => {
  it('摘掉成对标记，保留列表前缀原样', () => {
    expect(stripRichText('- **读**完 ==重点==', 'thought')).toBe('- 读完 重点');
  });

  it('数字列表前缀也原样保留', () => {
    expect(stripRichText('1. 第一点', 'thought')).toBe('1. 第一点');
  });

  it('纯文本原样返回', () => {
    expect(stripRichText('没有标记的一段话', 'quote')).toBe('没有标记的一段话');
  });

  it('未闭合标记不动', () => {
    expect(stripRichText('半截 ==标记', 'quote')).toBe('半截 ==标记');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/__tests__/richText.test.ts`
Expected: FAIL，`Failed to resolve import "../richText"`

- [ ] **Step 3: 写实现**

创建 `src/app/richText.ts`：

```ts
// ─── 摘录 / 感悟的轻量标记 ────────────────────────────────────────────────────
//
// 只做四种标记：==高亮==、**加粗**、行首 `- `、行首 `1. `。
// 存的是标记文本本身（不走 HTML / delta）：云同步、JSON 备份、markdown 导出、搜索
// 这四条链路都按纯文本消费，标记文本让它们一行都不用改（见设计文档 §4）。
//
// 规则：成对、不跨行、不嵌套；未闭合与空标记按字面显示，绝不吞字。
// 摘录原文（scope='quote'）是引用，只认 ==，怕把原文献里的 ** 和列表读走样。

export type RichScope = 'quote' | 'thought';
export type InlineKind = 'text' | 'strong' | 'mark';

export interface Inline {
  kind: InlineKind;
  text: string;
}

export interface RichLine {
  kind: 'p' | 'ul' | 'ol';
  /** 渲染用的前缀（`· ` 或 `1. `） */
  prefix: string;
  /** 原文里的前缀，strip 时原样保留 */
  rawPrefix: string;
  inlines: Inline[];
}

const MARK = '==';
const BOLD = '**';

const UL_PREFIX = /^[-•·]\s+/;
const OL_PREFIX = /^(\d{1,3})[.、]\s+/;

function parseInline(text: string, scope: RichScope): Inline[] {
  const tokens: Array<{ open: string; kind: InlineKind }> = [{ open: MARK, kind: 'mark' }];
  if (scope === 'thought') tokens.push({ open: BOLD, kind: 'strong' });

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

export function parseRichText(text: string, scope: RichScope): RichLine[] {
  return text.split('\n').map((line) => {
    if (scope === 'thought') {
      const ul = line.match(UL_PREFIX);
      if (ul) {
        return {
          kind: 'ul' as const,
          prefix: '· ',
          rawPrefix: ul[0],
          inlines: parseInline(line.slice(ul[0].length), scope),
        };
      }
      const ol = line.match(OL_PREFIX);
      if (ol) {
        return {
          kind: 'ol' as const,
          prefix: `${ol[1]}. `,
          rawPrefix: ol[0],
          inlines: parseInline(line.slice(ol[0].length), scope),
        };
      }
    }
    return { kind: 'p' as const, prefix: '', rawPrefix: '', inlines: parseInline(line, scope) };
  });
}

export function stripRichText(text: string, scope: RichScope): string {
  return parseRichText(text, scope)
    .map((line) => line.rawPrefix + line.inlines.map((run) => run.text).join(''))
    .join('\n');
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/app/__tests__/richText.test.ts`
Expected: PASS（14 条）

- [ ] **Step 5: 提交**

```bash
git add src/app/richText.ts src/app/__tests__/richText.test.ts
git commit -m "feat(摘录格式): 解析与清洗轻量标记"
```

---

### Task 2: 渲染组件与高亮令牌

**Files:**
- Create: `src/app/components/RichText.tsx`
- Modify: `src/styles/tokens.css:16`（亮色）、`src/styles/tokens.css:167`（暗色）
- Test: `src/app/components/__tests__/RichText.test.tsx`

**Interfaces:**
- Consumes: `parseRichText`, `RichScope`（Task 1）
- Produces: `default function RichText({ text, scope, markBackground }: { text: string; scope: RichScope; markBackground?: string })` —— 返回**片段**，不带任何外层元素。

- [ ] **Step 1: 写失败的测试**

创建 `src/app/components/__tests__/RichText.test.tsx`：

```tsx
/**
 * @vitest-environment jsdom
 * 富文本必须渲染成「单一文本块」：所有产物都是行内元素。
 *
 * 原因：折叠用 -webkit-line-clamp，它的裁剪边界跟着块级子元素走 —— 一旦出现
 * ul / li / p，裁剪就不再落在行边界上，底部会漏出半截字（感悟那处踩过）。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import RichText from '../RichText';

afterEach(cleanup);

describe('RichText', () => {
  it('高亮渲染成 mark，加粗渲染成 strong', () => {
    const { container } = render(<RichText text={'==重点== 和 **加粗**'} scope="thought" />);
    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toBe('重点 和 加粗');
  });

  it('不产生任何块级子元素', () => {
    const { container } = render(<RichText text={'- 一\n- 二\n==三=='} scope="thought" />);
    expect(container.querySelector('div,ul,ol,li,p,section,article')).toBeNull();
  });

  it('换行仍是字面的 \n，交给 pre-wrap 排版', () => {
    const { container } = render(<RichText text={'第一行\n第二行'} scope="quote" />);
    expect(container.textContent).toBe('第一行\n第二行');
  });

  it('列表行带圆点前缀', () => {
    const { container } = render(<RichText text={'- 甲'} scope="thought" />);
    expect(container.textContent).toBe('· 甲');
  });

  it('摘录原文里的 == 之外不动：** 保持字面', () => {
    const { container } = render(<RichText text={'**不粗**'} scope="quote" />);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('**不粗**');
  });

  it('显式传 markBackground 时不依赖 CSS 变量', () => {
    const { container } = render(
      <RichText text={'==a=='} scope="quote" markBackground="rgba(1,2,3,0.2)" />,
    );
    const mark = container.querySelector('mark')!;
    expect(mark.style.background).toBe('rgba(1, 2, 3, 0.2)');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/components/__tests__/RichText.test.tsx`
Expected: FAIL，`Failed to resolve import "../RichText"`

- [ ] **Step 3: 加令牌**

在 `src/styles/tokens.css` 亮色段 `--color-bg-thought: #F8F4EC;` 后面加一行：

```css
  --color-quote-mark-bg: #F6E6BC;   /* 摘录/感悟里的荧光笔底色 */
```

在暗色段 `--color-bg-thought: #2A2418;` 后面加一行：

```css
    --color-quote-mark-bg: #4A3C1E;
```

- [ ] **Step 4: 写组件**

创建 `src/app/components/RichText.tsx`：

```tsx
import type { CSSProperties } from 'react';
import { parseRichText, type RichScope } from '../richText';

// ─── 把轻量标记渲染成行内元素 ────────────────────────────────────────────────
//
// 只返回行内内容（span / strong / mark），不包任何块级元素、不自己开 <p>：
// 调用方继续拿原来的容器（<p>、带 line-clamp 的 div）包住它。
// 理由见设计文档 §5.2 —— 折叠裁剪的边界必须继续落在行边界上。

interface RichTextProps {
  text: string;
  scope: RichScope;
  /**
   * 高亮底色。默认走主题令牌；回顾卡是固定纸色的实物（配色全在 rolodex/tokens.ts），
   * 那边显式传 COLORS.highlightBg，不跟主题联动。
   */
  markBackground?: string;
}

const MARK_STYLE: CSSProperties = {
  background: 'var(--color-quote-mark-bg)',
  color: 'inherit',
  borderRadius: 2,
  padding: '0 1px',
  // 高亮跨行时每一行都要画上底，否则第二行开始是断的
  boxDecorationBreak: 'clone' as never,
  WebkitBoxDecorationBreak: 'clone' as never,
};

export default function RichText({ text, scope, markBackground }: RichTextProps) {
  const lines = parseRichText(text, scope);
  const markStyle = markBackground ? { ...MARK_STYLE, background: markBackground } : MARK_STYLE;

  return (
    <>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? '\n' : ''}
          {line.prefix}
          {line.inlines.map((run, runIndex) => {
            if (run.kind === 'strong') return <strong key={runIndex}>{run.text}</strong>;
            if (run.kind === 'mark') {
              return (
                <mark key={runIndex} style={markStyle}>
                  {run.text}
                </mark>
              );
            }
            return <span key={runIndex}>{run.text}</span>;
          })}
        </span>
      ))}
    </>
  );
}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- src/app/components/__tests__/RichText.test.tsx`
Expected: PASS（6 条）

- [ ] **Step 6: 提交**

```bash
git add src/app/components/RichText.tsx src/app/components/__tests__/RichText.test.tsx src/styles/tokens.css
git commit -m "feat(摘录格式): 行内渲染组件与高亮令牌"
```

---

### Task 3: 选区包裹（工具栏的纯函数部分）

**Files:**
- Modify: `src/app/richText.ts`
- Modify: `src/app/__tests__/richText.test.ts`

**Interfaces:**
- Produces:
  - `interface EditResult { next: string; selStart: number; selEnd: number }`
  - `function toggleInlineMarker(value: string, start: number, end: number, marker: string): EditResult`
  - `function toggleLinePrefix(value: string, start: number, end: number, kind: 'ul' | 'ol'): EditResult`

- [ ] **Step 1: 追加失败的测试**

在 `src/app/__tests__/richText.test.ts` 末尾追加：

```ts
import { toggleInlineMarker, toggleLinePrefix } from '../richText';

describe('toggleInlineMarker', () => {
  it('有选区时把标记包在外面', () => {
    expect(toggleInlineMarker('abc', 1, 2, '**')).toEqual({
      next: 'a**b**c',
      selStart: 3,
      selEnd: 4,
    });
  });

  it('再点一次去掉标记', () => {
    expect(toggleInlineMarker('a**b**c', 3, 4, '**')).toEqual({
      next: 'abc',
      selStart: 1,
      selEnd: 2,
    });
  });

  it('用户连标记一起选中也能去掉', () => {
    expect(toggleInlineMarker('a==b==c', 1, 6, '==')).toEqual({
      next: 'abc',
      selStart: 1,
      selEnd: 2,
    });
  });

  it('没有选区时插一对标记，光标落在中间', () => {
    expect(toggleInlineMarker('ab', 1, 1, '==')).toEqual({
      next: 'a====b',
      selStart: 3,
      selEnd: 3,
    });
  });
});

describe('toggleLinePrefix', () => {
  it('给选中的每一行加无序列表前缀', () => {
    expect(toggleLinePrefix('甲\n乙\n丙', 0, 3, 'ul')).toEqual({
      next: '- 甲\n- 乙\n丙',
      selStart: 0,
      selEnd: 7,
    });
  });

  it('有序列表从 1 开始编号，不按原文行号', () => {
    // 2 是「乙」所在行首；1 还属于第一行（换行符之前）
    expect(toggleLinePrefix('甲\n乙', 2, 2, 'ol').next).toBe('甲\n1. 乙');
  });

  it('再次点击去掉前缀，两种写法都能认', () => {
    expect(toggleLinePrefix('- 甲\n• 乙', 0, 5, 'ul').next).toBe('甲\n乙');
  });

  it('只加在光标所在行，不碰别的行', () => {
    expect(toggleLinePrefix('甲\n乙', 0, 0, 'ul').next).toBe('- 甲\n乙');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/__tests__/richText.test.ts`
Expected: FAIL，`toggleInlineMarker is not a function`

- [ ] **Step 3: 写实现**

在 `src/app/richText.ts` 末尾追加：

```ts
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

const lineStartsOf = (value: string): number[] => {
  const starts = [0];
  for (let i = 0; i < value.length; i += 1) if (value[i] === '\n') starts.push(i + 1);
  return starts;
};

function lineIndexAt(starts: number[], index: number): number {
  let hit = 0;
  for (let i = 0; i < starts.length; i += 1) if (starts[i] <= index) hit = i;
  return hit;
}

/**
 * 给选区覆盖到的每一行加 / 去列表前缀。
 *
 * 有序列表的编号从选区第一行开始数 1、2、3 —— 不沿用原文行号，也不校验连续性：
 * 用户从别处粘来的 `1. 1. 3.` 保持原样（见设计文档 §5.1）。
 */
export function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  kind: 'ul' | 'ol',
): EditResult {
  const starts = lineStartsOf(value);
  const first = lineIndexAt(starts, start);
  const last = lineIndexAt(starts, Math.max(start, end));
  const lines = value.split('\n');

  const prefixOf = (line: string) => (kind === 'ul' ? line.match(UL_PREFIX) : line.match(OL_PREFIX));
  const allHavePrefix = lines
    .slice(first, last + 1)
    .every((line) => prefixOf(line) !== null);

  const nextLines = lines.map((line, i) => {
    if (i < first || i > last) return line;
    if (allHavePrefix) {
      const matched = prefixOf(line);
      return matched ? line.slice(matched[0].length) : line;
    }
    return (kind === 'ul' ? '- ' : `${i - first + 1}. `) + line;
  });

  const next = nextLines.join('\n');
  const nextStarts = lineStartsOf(next);
  return {
    next,
    selStart: nextStarts[first],
    selEnd: (nextStarts[last + 1] ?? next.length + 1) - 1,
  };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/app/__tests__/richText.test.ts`
Expected: PASS（22 条）

- [ ] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无输出（通过）

- [ ] **Step 6: 提交**

```bash
git add src/app/richText.ts src/app/__tests__/richText.test.ts
git commit -m "feat(摘录格式): 工具栏用的选区包裹与列表前缀"
```

---

### Task 4: 详情页正文与感悟接入渲染

**Files:**
- Modify: `src/app/components/CollapsibleQuoteText.tsx:119`（`{text}`）
- Modify: `src/app/components/CollapsibleThought.tsx:112`
- Test: `src/app/components/__tests__/CollapsibleQuoteText.test.tsx`
- Test: `src/app/components/__tests__/CollapsibleThought.test.tsx`

**Interfaces:**
- Consumes: `RichText`（Task 2）

- [ ] **Step 1: 写失败的测试**

在 `src/app/components/__tests__/CollapsibleQuoteText.test.tsx` 的 `describe('CollapsibleQuoteText')` 里追加：

```tsx
  it('正文里的高程标记渲染成 mark，且折叠行数不变', () => {
    stubHeights(OVERFLOWING_HEIGHT);
    const { container } = render(<CollapsibleQuoteText text={LONG + '==重点=='} />);

    expect(container.querySelectorAll('mark')).toHaveLength(1);
    expect(container.querySelector('mark')!.textContent).toBe('重点');
    expect(clampOf(container)).toBe('14');
  });
```

在 `src/app/components/__tests__/CollapsibleThought.test.tsx` 里追加（沿用该文件已有的 `stubHeights` 等辅助，若无则先读文件头按它的写法组织）：

```tsx
  it('感悟里的加粗与列表按行内元素渲染，不产生块级子元素', () => {
    const { container } = render(<CollapsibleThought thought={'- **读**完了\n- 第二点'} />);

    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toContain('· 读完了');
    expect(container.querySelector('ul,ol,li')).toBeNull();
  });
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/components/__tests__/CollapsibleQuoteText.test.tsx src/app/components/__tests__/CollapsibleThought.test.tsx`
Expected: FAIL，`expect(received).toHaveLength(1)` 收到 0（没有 mark）

- [ ] **Step 3: 改两个组件**

`src/app/components/CollapsibleQuoteText.tsx`：顶部加

```tsx
import RichText from './RichText';
```

把第 119 行的 `{text}` 换成：

```tsx
        <RichText text={text} scope="quote" />
```

`src/app/components/CollapsibleThought.tsx`：顶部加

```tsx
import RichText from './RichText';
```

把第 112 行的 `{clamped ? collapseBlankLines(thought) : thought}` 换成：

```tsx
            <RichText
              text={clamped ? collapseBlankLines(thought) : thought}
              scope="thought"
            />
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/app/components/__tests__/CollapsibleQuoteText.test.tsx src/app/components/__tests__/CollapsibleThought.test.tsx`
Expected: PASS（两个文件全绿）

- [ ] **Step 5: 提交**

```bash
git add src/app/components/CollapsibleQuoteText.tsx src/app/components/CollapsibleThought.tsx src/app/components/__tests__/CollapsibleQuoteText.test.tsx src/app/components/__tests__/CollapsibleThought.test.tsx
git commit -m "feat(摘录格式): 详情页正文与感悟渲染轻量标记"
```

---

### Task 5: 编辑页工具栏

**Files:**
- Create: `src/app/components/FormatToolbar.tsx`
- Modify: `src/app/components/sheets/AddQuoteSheet.tsx`（第 1-6 行 import、第 167-170 行标签下、第 273-276 行标签下）
- Test: `src/app/components/__tests__/AddQuoteSheet.test.tsx`

**Interfaces:**
- Consumes: `toggleInlineMarker`, `toggleLinePrefix`, `RichScope`（Task 1、3）
- Produces: `type FormatCommand = 'bold' | 'mark' | 'ul' | 'ol'`；`default function FormatToolbar({ scope, onCommand }: { scope: RichScope; onCommand: (cmd: FormatCommand) => void })`

- [ ] **Step 1: 写失败的测试**

创建 `src/app/components/__tests__/AddQuoteSheet.test.tsx`：

```tsx
/**
 * @vitest-environment jsdom
 * 「添加摘录」的两栏格式按钮：作用于选区、再点一次去标记、插入后光标还在原处。
 *
 * 摘录原文只给「高亮」一个按钮（原文是引用，加粗和列表会把文献里的 ** / 1. 读走样），
 * 感悟给「加粗 / 高亮 / 无序列表 / 有序列表」四个。
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen } from '@testing-library/react';

vi.mock('../../ocr', () => ({
  recognizeText: vi.fn(async () => ''),
  compressImage: vi.fn(async () => ''),
}));

const AddQuoteSheet = (await import('../sheets/AddQuoteSheet')).default;

afterEach(cleanup);

const sheet = () =>
  render(<AddQuoteSheet open onClose={() => {}} onSave={async () => {}} />);

const areas = () => Array.from(document.querySelectorAll('textarea')) as HTMLTextAreaElement[];

describe('格式工具栏', () => {
  it('摘录原文只有「高亮」一个格式按钮', () => {
    sheet();
    expect(screen.getAllByRole('button', { name: '高亮' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: '加粗' })).toHaveLength(1);
  });

  it('选中文字点高亮，包上 == 并保持选中', () => {
    sheet();
    const [quote] = areas();
    fireEvent.change(quote, { target: { value: '读完了' } });
    quote.setSelectionRange(0, 3);
    fireEvent.select(quote);

    fireEvent.click(screen.getAllByRole('button', { name: '高亮' })[0]);

    expect(quote.value).toBe('==读完了==');
    expect(quote.selectionStart).toBe(2);
    expect(quote.selectionEnd).toBe(5);
  });

  it('再点一次去掉标记', () => {
    sheet();
    const [quote] = areas();
    fireEvent.change(quote, { target: { value: '==读完了==' } });
    quote.setSelectionRange(2, 5);
    fireEvent.select(quote);

    fireEvent.click(screen.getAllByRole('button', { name: '高亮' })[0]);

    expect(quote.value).toBe('读完了');
  });

  it('感悟栏的加粗与列表各自生效', () => {
    sheet();
    const [, thought] = areas();
    fireEvent.change(thought, { target: { value: '第一点' } });
    thought.setSelectionRange(0, 3);
    fireEvent.select(thought);

    fireEvent.click(screen.getByRole('button', { name: '加粗' }));
    expect(thought.value).toBe('**第一点**');

    fireEvent.change(thought, { target: { value: '第一点' } });
    thought.setSelectionRange(0, 0);
    fireEvent.select(thought);
    fireEvent.click(screen.getByRole('button', { name: '无序列表' }));
    expect(thought.value).toBe('- 第一点');
  });

  it('点击工具栏不会丢焦点（mousedown 被拦下）', () => {
    sheet();
    areas();
    const button = screen.getAllByRole('button', { name: '高亮' })[0];
    const event = fireEvent.mouseDown(button);
    // fireEvent 返回 false 表示默认行为被 preventDefault 拦掉了
    expect(event).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/components/__tests__/AddQuoteSheet.test.tsx`
Expected: FAIL，`Unable to find an accessible element with the role "button" and name "高亮"`

- [ ] **Step 3: 写工具栏组件**

创建 `src/app/components/FormatToolbar.tsx`：

```tsx
import type { CSSProperties, MouseEvent } from 'react';
import type { RichScope } from '../richText';

// ─── 编辑页那一行格式按钮 ────────────────────────────────────────────────────
//
// 只在 <textarea> 上做「选区包裹」，不换 contenteditable：换掉要连自动增高、
// OCR 追加、光标恢复、中文输入法组合态一起重做（见设计文档 §6.1）。
//
// 按钮的 onMouseDown 必须 preventDefault —— 否则点一下 textarea 就失焦，
// selectionStart/End 归零，标记会插到文本末尾（第一条踩的就是这个）。

export type FormatCommand = 'bold' | 'mark' | 'ul' | 'ol';

interface CommandSpec {
  cmd: FormatCommand;
  label: string;
  title: string;
}

const COMMANDS: Record<RichScope, CommandSpec[]> = {
  quote: [{ cmd: 'mark', label: '高亮', title: '高亮' }],
  thought: [
    { cmd: 'bold', label: 'B', title: '加粗' },
    { cmd: 'mark', label: '高亮', title: '高亮' },
    { cmd: 'ul', label: '• 列表', title: '无序列表' },
    { cmd: 'ol', label: '1. 列表', title: '有序列表' },
  ],
};

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

const BUTTON_STYLE: CSSProperties = {
  minWidth: 26,
  height: 24,
  padding: '0 7px',
  borderRadius: 5,
  border: '1px solid var(--color-field-border)',
  background: 'var(--color-field-bg)',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  cursor: 'pointer',
  lineHeight: 1,
};

interface FormatToolbarProps {
  scope: RichScope;
  onCommand: (cmd: FormatCommand) => void;
}

export default function FormatToolbar({ scope, onCommand }: FormatToolbarProps) {
  const stopBlur = (e: MouseEvent<HTMLButtonElement>) => e.preventDefault();

  return (
    <div style={BAR_STYLE} role="toolbar" aria-label={scope === 'quote' ? '摘录原文格式' : '感悟格式'}>
      {COMMANDS[scope].map((spec) => (
        <button
          key={spec.cmd}
          type="button"
          aria-label={spec.title}
          title={spec.title}
          onMouseDown={stopBlur}
          onClick={() => onCommand(spec.cmd)}
          style={BUTTON_STYLE}
        >
          {spec.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 接进 AddQuoteSheet**

`src/app/components/sheets/AddQuoteSheet.tsx` 顶部改 import 行：

```tsx
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
```

并在 `import { overlayPortal } from '../overlayPortal';` 之后加：

```tsx
import FormatToolbar, { type FormatCommand } from '../FormatToolbar';
import { toggleInlineMarker, toggleLinePrefix } from '../../richText';
```

在组件内 `const thoughtRef = ...` 之后加：

```tsx
  /** 插入标记后要还原的选区。等这次 setState 渲染完再落，直接同步设会被旧 value 覆盖。 */
  const pendingSel = useRef<{ el: HTMLTextAreaElement; start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const pending = pendingSel.current;
    if (!pending) return;
    pendingSel.current = null;
    pending.el.focus();
    pending.el.setSelectionRange(pending.start, pending.end);
  });

  const applyFormat = (
    el: HTMLTextAreaElement | null,
    value: string,
    setValue: (next: string) => void,
    cmd: FormatCommand,
  ) => {
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const result =
      cmd === 'bold'
        ? toggleInlineMarker(value, start, end, '**')
        : cmd === 'mark'
          ? toggleInlineMarker(value, start, end, '==')
          : toggleLinePrefix(value, start, end, cmd);
    setValue(result.next);
    pendingSel.current = { el, start: result.selStart, end: result.selEnd };
  };
```

在「摘录原文」的 `<textarea ... />` **之前**插入：

```tsx
            <FormatToolbar
              scope="quote"
              onCommand={(cmd) => applyFormat(textRef.current, text, setText, cmd)}
            />
```

在「我的感悟」的 `<textarea ... />` **之前**插入：

```tsx
            <FormatToolbar
              scope="thought"
              onCommand={(cmd) => applyFormat(thoughtRef.current, thought, setThought, cmd)}
            />
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- src/app/components/__tests__/AddQuoteSheet.test.tsx`
Expected: PASS（5 条）

- [ ] **Step 6: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 无输出

```bash
git add src/app/components/FormatToolbar.tsx src/app/components/sheets/AddQuoteSheet.tsx src/app/components/__tests__/AddQuoteSheet.test.tsx
git commit -m "feat(摘录格式): 添加摘录页的格式工具栏"
```

---

### Task 6: 回顾卡（正文与探针必须同树）

**Files:**
- Modify: `src/app/review/rolodex/tokens.ts`（`COLORS` 加 `highlightBg`）
- Modify: `src/app/review/rolodex/ExcerptCard.tsx:157`、`:175`
- Test: `src/app/review/__tests__/excerptCardRichText.test.tsx`（新建）

**Interfaces:**
- Consumes: `RichText`（Task 2）、`COLORS.highlightBg`

- [ ] **Step 1: 写失败的测试**

创建 `src/app/review/__tests__/excerptCardRichText.test.tsx`：

```tsx
/**
 * @vitest-environment jsdom
 * 回顾卡的字号是「探针量、真卡用」，两边必须渲染同一棵树。
 *
 * 探针多了 / 少了一个 <mark>，量出来的行高就不同 —— 结果是真卡上字被切掉，
 * 或者短摘录被塞进小一号的字。所以这里断言两处 mark 数量一致。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ExcerptCard from '../rolodex/ExcerptCard';

afterEach(cleanup);

const quote = {
  id: 'q1',
  bookId: 'b1',
  text: '他说==要活下去==，==还要写下去==。',
  thought: '',
  page: '12',
  date: '2026-10-29',
  createdAt: '',
  updatedAt: '',
};

describe('回顾卡的高亮', () => {
  it('正文与探针渲染出同样多的 mark', () => {
    const { container } = render(<ExcerptCard quote={quote} book={null} />);
    const marks = container.querySelectorAll('mark');
    // 正文 2 个 + 探针 2 个
    expect(marks).toHaveLength(4);
  });

  it('高亮底色用卡片自己的纸色配色，不读主题变量', () => {
    const { container } = render(<ExcerptCard quote={quote} book={null} />);
    const mark = container.querySelector('mark')!;
    expect(mark.style.background).not.toContain('var(');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/review/__tests__/excerptCardRichText.test.tsx`
Expected: FAIL，`expect(received).toHaveLength(4)` 收到 0

- [ ] **Step 3: 加卡片配色**

`src/app/review/rolodex/tokens.ts` 的 `COLORS` 里，`paper: '#fdfcf9',` 之后加：

```ts
  /** 正文高亮底色。纸色是固定的，所以不跟主题令牌走。 */
  highlightBg: 'rgba(212, 168, 48, 0.30)',
```

- [ ] **Step 4: 两处同时换 RichText**

`src/app/review/rolodex/ExcerptCard.tsx` 顶部加：

```tsx
import RichText from '../../components/RichText';
```

正文（`{quote.text}`，约第 157 行）：

```tsx
          <RichText text={quote.text} scope="quote" markBackground={COLORS.highlightBg} />
```

探针（`{quote.text}`，约第 175 行）：

```tsx
        <RichText text={quote.text} scope="quote" markBackground={COLORS.highlightBg} />
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- src/app/review/__tests__/excerptCardRichText.test.tsx`
Expected: PASS（2 条）

- [ ] **Step 6: 提交**

```bash
git add src/app/review/rolodex/tokens.ts src/app/review/rolodex/ExcerptCard.tsx src/app/review/__tests__/excerptCardRichText.test.tsx
git commit -m "feat(摘录格式): 回顾卡正文与探针同步渲染标记"
```

---

### Task 7: 分享卡（纯文本）与字体子集

**Files:**
- Modify: `src/app/components/sheets/ShareCard.tsx:109`、`:142`
- Modify: `src/app/components/sheets/ShareSheet.tsx:221`、`:314`
- Test: `src/app/components/__tests__/ShareCard.test.tsx`（新建）

**Interfaces:**
- Consumes: `stripRichText`（Task 1）

> 分享卡**不渲染**标记。两个原因：
> 1. 卡片字族（FZSongHei 系列）只注册了单字重，`<strong>` 只会拿到浏览器的伪粗体，
>    字形发肿、跟正文不搭（设计文档 §2.3 已写过「字重在这里不是免费操作」）。
> 2. 分享图是位图产物，用户要的是「这段话」，不是编辑态的样式预览。
>
> 但标记也不能原样印上去 —— 导出前必须 strip，否则图上会出现 `==` 和 `**`。

- [ ] **Step 1: 写失败的测试**

创建 `src/app/components/__tests__/ShareCard.test.tsx`：

```tsx
/**
 * @vitest-environment jsdom
 * 分享图按纯文本导出：不出现标记符号，也不为了标记额外加粗/上底色。
 * 字体子集同理 —— 只该收「真字」，不能把 == ** 塞进子集请求里。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { stripRichText } from '../../richText';
import ShareCard from '../sheets/ShareCard';

afterEach(cleanup);

const theme = {
  bgColor: '#fdfcf9',
  textColor: '#20232a',
  accentColor: '#b8860b',
};

const quote = {
  id: 'q1',
  bookId: 'b1',
  text: '他说==要活下去==。',
  thought: '- **第一点**',
  page: '12',
  date: '2026-10-29',
  createdAt: '',
  updatedAt: '',
};

describe('分享卡', () => {
  it('正文与感悟按纯文本渲染，标记符号不出现', () => {
    const { container } = render(
      <ShareCard
        quote={quote}
        bookTitle="书"
        bookAuthor="作者"
        theme={theme}
        cardFamily="serif"
        showThoughts
        stickerSvg={null}
      />,
    );
    expect(container.querySelectorAll('mark, strong')).toHaveLength(0);
    expect(container.textContent).toContain('他说要活下去。');
    expect(container.textContent).toContain('- 第一点');
    expect(container.textContent).not.toContain('==');
    expect(container.textContent).not.toContain('**');
  });
});

describe('字体子集文本', () => {
  it('strip 之后不含任何标记符号', () => {
    const stripped = stripRichText(quote.text, 'quote');
    expect(stripped).toBe('他说要活下去。');
    expect(stripped).not.toContain('=');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/components/__tests__/ShareCard.test.tsx`
Expected: FAIL，`expect(received).toHaveLength(0)` 收到 2（`mark, strong`）

- [ ] **Step 3: 改 ShareCard**

顶部加：

```tsx
import { stripRichText } from '../../richText';
```

正文 `<p>` 里的 `{quote.text}` 换成：

```tsx
        {stripRichText(quote.text, 'quote')}
```

感悟块里的 `{quote.thought}` 换成：

```tsx
          {stripRichText(quote.thought, 'thought')}
```

同文件顶部的字号计算：

```tsx
  const size = quoteFontSize(quote.text);
```

换成：

```tsx
  // 分档看的是「真字」的长度：标记符号不该把摘录往小一号的档位里挤。
  const size = quoteFontSize(stripRichText(quote.text, 'quote'));
```

- [ ] **Step 4: 改 ShareSheet 的子集文本**

顶部加：

```tsx
import { stripRichText } from '../../richText';
```

第 221 行和第 314 行的：

```tsx
    const text = collectCardText(quote.text);
```

都改成：

```tsx
    const text = collectCardText(stripRichText(quote.text, 'quote'));
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- src/app/components/__tests__/ShareCard.test.tsx`
Expected: PASS（2 条）

- [ ] **Step 6: 提交**

```bash
git add src/app/components/sheets/ShareCard.tsx src/app/components/sheets/ShareSheet.tsx src/app/components/__tests__/ShareCard.test.tsx
git commit -m "feat(摘录格式): 分享卡按纯文本导出，字体子集只收真字"
```

---

### Task 8: 回顾页与时光信箱

**Files:**
- Modify: `src/app/review/ReviewPage.tsx:341`
- Modify: `src/app/mailbox/letterLogic.ts:63`、`:94`
- Test: `src/app/mailbox/__tests__/firstLetter.test.ts`（追加一条）

**Interfaces:**
- Consumes: `RichText`（Task 2）、`stripRichText`（Task 1）

- [ ] **Step 1: 写回归测试**

这封信是 SVG 纯文本排版（`<text>` / `<tspan>`），任何标记符号都会被原样画到纸上。
`letterLogic` 在进 `buildLetter` 之前必须 strip，这一步把那条约定钉住。

在 `src/app/mailbox/__tests__/firstLetter.test.ts` 末尾追加：

```ts
// 信件是 SVG 纯文本排版，标记符号会被原样画出来。这条守的是 letterLogic
// 在进 buildLetter 前必须 strip —— 以后谁把那两行删了，信里就会印出 == 和 **。
describe('信件入口的纯文本约定', () => {
  it('进信件排版前，标记会被洗干净', async () => {
    const { stripRichText } = await import('../../richText');
    expect(stripRichText('他说==要活下去==。', 'quote')).toBe('他说要活下去。');
    expect(stripRichText('- **第一点**', 'thought')).toBe('- 第一点');
  });
});
```

> 这条在 Task 1 完成后就会通过 —— 它测的是 `stripRichText` 的契约，不是新代码。
> `buildLetter` 需要数据库，直接测生成入口要建 Dexie，代价太高；所以这里用
> 「清洗函数的契约 + Step 3 的接入」两头夹住，而不是硬测一个要开库的入口。

- [ ] **Step 2: 跑测试，确认通过**

Run: `npm test -- src/app/mailbox/__tests__/firstLetter.test.ts`
Expected: PASS（新增 1 条）

- [ ] **Step 3: 改两个文件**

`src/app/review/ReviewPage.tsx` 顶部加：

```tsx
import RichText from '../components/RichText';
```

第 341 行的 `{quote.text}` 换成：

```tsx
          <RichText text={quote.text} scope="quote" />
```

`src/app/mailbox/letterLogic.ts` 顶部加：

```tsx
import { stripRichText } from '../richText';
```

第 63 行：

```ts
    const text = stripRichText(quote?.text ?? '', 'quote');
```

第 94 行：

```ts
  return buildLetter(receivedCount, stripRichText(quote.text, 'quote'), book?.title ?? '未知', book?.author ?? '佚名');
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `npm test -- src/app/mailbox/__tests__/firstLetter.test.ts src/app/mailbox/__tests__/svgGenerator.test.ts`
Expected: PASS（svgGenerator 那组是回归，确认信件排版没被影响）

- [ ] **Step 5: 提交**

```bash
git add src/app/review/ReviewPage.tsx src/app/mailbox/letterLogic.ts src/app/mailbox/__tests__/firstLetter.test.ts
git commit -m "feat(摘录格式): 回顾页渲染标记，信件降级成纯文本"
```

---

### Task 9: 搜索

**Files:**
- Create: `src/app/searchText.ts`
- Modify: `src/app/db/index.ts:259`（`searchQuotes`）
- Modify: `src/app/components/SearchResults.tsx:80`
- Test: `src/app/__tests__/searchText.test.ts`（新建）
- Test: `src/app/components/__tests__/SearchResults.test.tsx`（新建）

**Interfaces:**
- Consumes: `stripRichText`（Task 1）
- Produces: `function quoteHaystack(quote: Pick<Quote, 'text' | 'thought'>, bookTitle: string, bookAuthor: string): string`

> 为什么不直接测 `searchQuotes`：它要开 Dexie（IndexedDB），仓库里没有 `fake-indexeddb`，
> 装它就是新增依赖（违反 Global Constraints）。把「拼 haystack」这段纯逻辑抽成独立模块，
> 既不引依赖，也把「标记不进搜索」这条契约单独守住。
>
> 另外注意：`tests/book-search.test.ts` 测的是云端书籍搜索接口（`functions/api/books/search`），
> 跟本地摘录搜索无关，别往里加用例。

- [ ] **Step 1: 写失败的测试**

创建 `src/app/__tests__/searchText.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { quoteHaystack } from '../searchText';

describe('quoteHaystack', () => {
  it('标记内的字仍然搜得到', () => {
    const hay = quoteHaystack({ text: '他说==要活下去==。', thought: '' }, '书', '作者');
    expect(hay).toContain('要活下去');
  });

  it('标记符号本身不进 haystack，搜 == 不会误命中', () => {
    const hay = quoteHaystack({ text: '他说==要活下去==。', thought: '- **重点**' }, '书', '作者');
    expect(hay).not.toContain('==');
    expect(hay).not.toContain('**');
  });

  it('感悟的列表前缀保留原文写法', () => {
    const hay = quoteHaystack({ text: '', thought: '- 第一点' }, '书', '作者');
    expect(hay).toContain('- 第一点');
  });

  it('书名与作者照旧参与匹配', () => {
    const hay = quoteHaystack({ text: '正文', thought: '' }, '昨日的世界', '茨威格');
    expect(hay).toContain('昨日的世界');
    expect(hay).toContain('茨威格');
  });
});
```

创建 `src/app/components/__tests__/SearchResults.test.tsx`：

```tsx
/**
 * @vitest-environment jsdom
 * 搜索结果条目里显示的应该是「干净正文」：用户不该在自己写的高亮周围看到 == 符号。
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { SearchResult } from '../../db';

let results: SearchResult[] = [];
vi.mock('../../store', () => ({
  useApp: () => ({ searchResults: results, searchQuery: '要活下去' }),
}));

const SearchResults = (await import('../SearchResults')).default;

afterEach(cleanup);

describe('搜索结果', () => {
  it('正文里的高亮标记不会显示成 ==', () => {
    results = [
      {
        quote: {
          id: 'q1',
          bookId: 'b1',
          text: '他说==要活下去==。',
          thought: '',
          page: null,
          date: '2026-10-29',
          createdAt: '',
          updatedAt: '',
        },
        bookTitle: '书',
        bookAuthor: '作者',
      },
    ];

    const { container } = render(<SearchResults onSelectResult={() => {}} />);
    expect(container.textContent).not.toContain('==');
    expect(container.textContent).toContain('他说要活下去。');
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `npm test -- src/app/__tests__/searchText.test.ts src/app/components/__tests__/SearchResults.test.tsx`
Expected: FAIL，`Failed to resolve import "../searchText"`

- [ ] **Step 3: 抽纯函数**

创建 `src/app/searchText.ts`：

```ts
import type { Quote } from './types';
import { stripRichText } from './richText';

/**
 * 搜索用的 haystack：摘录正文 + 感悟 + 书名 + 作者，全部按纯文本拼。
 *
 * 标记符号（== / **）不进 haystack —— 否则搜 `==` 会把所有高亮过的摘录全捞出来，
 * 而这些符号对用户没有意义。列表前缀（`- ` / `1. `）按原文保留，与 strip 的语义一致。
 */
export function quoteHaystack(
  quote: Pick<Quote, 'text' | 'thought'>,
  bookTitle: string,
  bookAuthor: string,
): string {
  return [
    stripRichText(quote.text, 'quote'),
    stripRichText(quote.thought, 'thought'),
    bookTitle,
    bookAuthor,
  ]
    .filter(Boolean)
    .join(' ');
}
```

- [ ] **Step 4: 接进搜索与结果展示**

`src/app/db/index.ts` 顶部加：

```ts
import { quoteHaystack } from '../searchText';
```

把 `searchQuotes` 里原来这段：

```ts
    const haystack = [
      q.text,
      q.thought,
      bookTitle,
      bookAuthor,
    ].filter(Boolean).join(' ');
```

换成：

```ts
    const haystack = quoteHaystack(q, bookTitle, bookAuthor);
```

`src/app/components/SearchResults.tsx` 顶部加：

```tsx
import { stripRichText } from '../richText';
```

第 80 行的：

```tsx
            {highlight(result.quote.text, searchQuery)}
```

换成：

```tsx
            {highlight(stripRichText(result.quote.text, 'quote'), searchQuery)}
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `npm test -- src/app/__tests__/searchText.test.ts src/app/components/__tests__/SearchResults.test.tsx`
Expected: PASS（5 条）

- [ ] **Step 6: 全量回归**

Run: `npm test`
Expected: 全部通过（当前基线 635 条 + 本计划新增，无失败）

Run: `npx tsc --noEmit`
Expected: 无输出

- [ ] **Step 7: 提交**

```bash
git add src/app/searchText.ts src/app/db/index.ts src/app/components/SearchResults.tsx src/app/__tests__/searchText.test.ts src/app/components/__tests__/SearchResults.test.tsx
git commit -m "feat(摘录格式): 搜索按纯文本比对，结果页显示干净正文"
```

---

## 实施完成后的验证清单

- [ ] `npm test` 全绿，`npx tsc --noEmit` 无输出。
- [ ] 真机（Safari）走一遍：新建摘录 → 原文选中一段点「高亮」→ 感悟写两行点「无序列表」→ 保存。
- [ ] 详情页卡片、回顾卡（字号仍按原档位）、分享图导出、时光信箱、搜索结果五处逐个看。
- [ ] 折叠态：长摘录点「展开」前后，底部没有半截字（`-webkit-line-clamp` 边界仍落在行上）。
- [ ] 深色模式下高亮底色可读（`--color-quote-mark-bg` 的暗色值）。

## 已知不做（与 spec §9 一致）

- 标题 / 小标题 / 副标题、等宽样式、缩进、勾选清单。
- 嵌套标记、跨行标记。
- 编辑态实时预览。
- 列表的悬挂缩进（换行后续行回到左边距）。
- 时光信箱里的样式呈现（只 strip）。
