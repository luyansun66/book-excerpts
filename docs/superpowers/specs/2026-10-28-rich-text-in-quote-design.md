# 摘录正文与感悟的轻量格式（A 档）—— 设计文档

**日期：** 2026-10-28
**状态：** 已实现（2026-10-29 调整为按每条摘录独立设置高亮色）
**关联问题：** 用户希望「添加摘录」页的「摘录原文」「我的感悟」能加文字格式，参考 iPhone 备忘录的格式面板

## 1. 背景与目标

「添加摘录」页两栏现在都是纯 `<textarea>`（`src/app/components/sheets/AddQuoteSheet.tsx:174`、`:278`），
分别存进 `quotes.text` / `quotes.thought` 两个 TEXT 列，全 app 按纯文本消费。

用户想照备忘录那样格式面板化：标题/小标题/副标题/正文/等宽、B/I/U/S、荧光笔、项目符号/编号/虚线列表、缩进、勾选清单。

**目标（本档只放行两样标记）：**

- 我的感悟：加粗、行内高亮。
- 摘录原文：只做行内高亮（划重点）。

**非目标：**

- 不做标题 / 小标题 / 副标题：回顾卡是固定尺寸的实物卡（`CARD_W 296.8 × CARD_H 330`，见 `src/app/review/rolodex/tokens.ts`），
  正文只有「一个版位」，标题层级没有承载物。
- 不做等宽样式：CJK 等宽要再引入一款字体（现有字体见 `src/styles/fonts.css`），而 app 里没有代码/表格场景。
- 不做缩进：与「左起版心 + 行尾不齐」的既有规范冲突（`README.md:80`、`src/app/mailbox/svgGenerator.ts:258`）。
- 不做勾选清单：摘录不是待办。
- 不给摘录原文开放加粗 / 斜体 / 列表：理由见 §2.1。
- 不做编辑态实时预览；不把 `<textarea>` 换成 contenteditable 富文本编辑器（理由见 §6.1）。
- 时光信箱不做富文本渲染，正文在进排版前降级成纯文本（理由见 §2.3，落地点见 §6 表第 8 行）。

## 2. 为什么不做备忘录那一整套

### 2.1 摘录原文是「引用」，不是「稿件」

它的三个用途是准确存档、可检索、可回顾/分享，字重与标题层级在这里不承载信息。更麻烦的是原始文献
天然带 `-`、`1.`、`*`（书目、脚注、列表、强调符号）：任何标记语法都可能把原文读错。所以摘录原文栏只放行
`==...==`（原文里几乎不可能出现的序列），其余标记语法一律不解析。

### 2.2 四个渲染面里有两个是刚性的

- 回顾卡 `src/app/review/rolodex/ExcerptCard.tsx`：卡片尺寸固定，字号靠隐藏探针量出来选档（`cardFit.ts`），
  富文本要保证**探针和真卡渲染同一棵树**，否则量出的档位与真渲染对不上。
- 时光信箱 `src/app/mailbox/svgGenerator.ts`：自研字形级排版（逐字 advance / 墨迹右缘、避头尾、标点挤压、
  按「摘录最右一列文字的最右缘」对齐出处行）。这里加内联样式等于重写排版规范。

### 2.3 字重在本项目里不是免费操作

信件正文的 CJK 用华康宋体 W3，分享卡走 FZSongHei 系列 —— 这些字族在 `src/styles/fonts.css` 里
**都只注册了一个字重**（清一色 `font-weight: normal`，思源宋体那款本身就是 SemiBold 的文件），
没有「同一族的粗体变体」。所以让正文变粗不是改 `font-weight` 的事：得再引一款字体，而
`src/app/mailbox/letterMetrics.ts` 那张按字体逐字生成的度量表（生成脚本 `scripts/gen-letter-metrics.py`）
和字体子集化端点（`functions/api/fonts/subset.ts`）都要跟着扩 —— 收益只是「原文更黑一点」。

所以**分享卡不渲染标记**：导出前统一 `stripRichText`，图上只有干净正文。这是有意为之，
不是漏做 —— 单字重字族的伪粗体会让字形发肿，配不上卡片原来的排版。

## 3. 标记集（唯一真相）

| 标记 | 语法 | 允许出现在 | 渲染成 |
|---|---|---|---|
| 行内高亮 | `==文字==` | 摘录原文 + 感悟 | `mark`，底色按这条摘录所选颜色，未选则走主题令牌 |
| 加粗 | `**文字**` | 只感悟 | `strong` |

解析规则（每一条都要有单测）：

1. 标记必须**成对**且**不跨行**。
2. 不嵌套：`==**x**==` 按字面显示（v1 不解析嵌套）。
3. 未闭合的标记按字面显示，**不吞字**。
4. 摘录原文栏（scope=quote）只解析 `==`；`**` 全部原样显示。
5. 不做列表：行首 `- ` / `1. ` / `2. ` 等一律当普通文字，不换前缀、不产生 `ul` / `ol`。

## 4. 数据格式：标记文本 + 两个可选颜色字段

`text` / `thought` 仍是 TEXT，存标记文本；颜色是每条摘录自己的数据，各加一个可空 TEXT 列：

- `quotes.text_mark_color` → `Quote.textMarkColor`：摘录原文高亮色
- `quotes.thought_mark_color` → `Quote.thoughtMarkColor`：感悟高亮色
- 值只存 `#RRGGBB`；空 = 主题默认。分类色 `quote.color` 仍只用于卡片左边条和蒙层，两者不复用。
- 两个字段不建索引，所以 Dexie 不需要 bump `DB_VERSION`；Supabase 已有库执行
  `supabase_schema.sql` 里对应的几条 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`。

标记文本本身仍让现有四条链路按纯文本工作：

- 云同步：`src/app/supabase/sync.ts`（`text` / `thought` 与两个颜色字段一起传）
- JSON 备份与导入：`src/app/db/prepare.ts`
- markdown 导出：`src/app/db/index.ts:377`（`> ${q.text}`）
- 搜索：`src/app/db/index.ts:259`（`haystack` 拼接）

附带好处：导出的 `.md` 天然带样式（`**` 是标准 md，`==` 是常见扩展）。旧数据（纯文本、没有颜色字段）
就是合法输入，不需要迁移。若改存 HTML 或 delta：搜索与 md 导出会被标签/结构污染，每个渲染面都要加
sanitize，schema 与同步还得兼容两套格式。

## 5. 解析与渲染

### 5.1 新增 `src/app/richText.ts`（纯函数）

```ts
export type RichScope = 'quote' | 'thought';
export type Inline = { kind: 'text' | 'strong' | 'mark'; text: string };

export function parseRichText(text: string, scope: RichScope): Inline[][];
export function stripRichText(text: string, scope: RichScope): string;
```

- 逐行解析：返回「每行的行内片段」，行间由渲染层补 `\n`；不识别行首列表符号。
- 行内匹配从左到右、**非贪婪**：`==a==b==` 只把 `a` 判为高亮，剩下的 `b==` 按字面显示。
- `stripRichText` 只摘掉成对标记符号，其余字符（包括行首的 `- ` / `1. `）原样保留。
- 段落之间不加任何 margin，段间距仍由原文里的空行决定（沿用现在的 `white-space: pre-wrap`）。
- 复杂度 O(n)，不做缓存：一条摘录几百字，解析发生在渲染时，量级可以忽略。

### 5.2 新增 `src/app/components/RichText.tsx`

**核心约束：整段渲染成单一文本块。** 输出沿用现在的容器（`whiteSpace: 'pre-wrap'`），内部**只有行内元素**
（`span` / `strong` / `mark`），**不产生 `ul` / `ol` / `li` / `p` 等块级子元素**。

理由是仓库已经踩过两次的坑：折叠用 `-webkit-line-clamp`，它的裁剪边界是 padding box 而不是行边界
（见 `src/app/components/CollapsibleThought.tsx:30` 的注释，以及「6px 内边距漏出 3px 字头」的实测记录）。
引入多层块级子元素会让裁剪边界与行边界脱钩，底部出现「腰斩字」。

- 高亮：`background` 优先用这条摘录的 `textMarkColor` / `thoughtMarkColor`，没有就回落
  `var(--color-quote-mark-bg)`；`boxDecorationBreak: 'clone'`（跨行的 `mark` 每行都画上底色），
  字色保持 `var(--color-text)` 不变。
- 回顾卡的探针与真卡必须用同一棵树（见 §6 表第 4 行）。

### 5.3 新增令牌

`src/styles/tokens.css` 增加 `--color-quote-mark-bg`，亮/暗各一套（挨着 `--color-bg-thought` 放：
亮色 `src/styles/tokens.css:16`、暗色 `:167`），作为「没有单独选色」时的默认。不写死颜色 ——
这个仓库专门做过「写死的浅色收进设计令牌」。每摘录颜色由添加页的工具栏选择，不设全局阅读设置。

回顾卡是例外：那个舞台是「一块固定纸色的实物」，配色全在 `src/app/review/rolodex/tokens.ts` 的 `COLORS` 里写死
（`paper: '#fdfcf9'` 等），刻意不跟主题联动。所以 `COLORS` 再加一个 `highlightBg`，由 `ExcerptCard` 显式传给
`<RichText markBackground={COLORS.highlightBg}>`，而不是让它去读 CSS 变量。

## 6. 接入点

| # | 文件 | 现状 | 改法 |
|---|---|---|---|
| 1 | `src/app/components/sheets/AddQuoteSheet.tsx` | 两个 autoResize 的 `<textarea>` | 各加一行工具栏（见 §6.1）；摘录栏只给「高亮」，感悟栏给「加粗 / 高亮」；两栏各带一组自己的高亮色（预设 + 自定义） |
| 2 | `src/app/components/CollapsibleQuoteText.tsx:119` | `{text}` | `<RichText scope="quote">` |
| 3 | `src/app/components/CollapsibleThought.tsx:112` | `{clamped ? collapseBlankLines(thought) : thought}` | 折叠与展开都过 `<RichText scope="thought">`；`collapseBlankLines` 先跑（它只动空行，与标记无关） |
| 4 | `src/app/review/rolodex/ExcerptCard.tsx:157` 与探针 `:175` | 两处 `{quote.text}` | 两处都换 `<RichText scope="quote">`，**必须同树** |
| 5 | `src/app/components/sheets/ShareCard.tsx:109` 与感悟 `:142` | 两处朴素文本（感悟走系统字体，见 `:49`） | 保持纯文本：两处先 `stripRichText`，字号分档也按 strip 后的长度算（原因见 §2.3） |
| 6 | `src/app/components/sheets/ShareSheet.tsx:221`、`:314` | `collectCardText(quote.text)` | 传 `stripRichText(quote.text, 'quote')`：子集里不该混进 `=` 字形（`collectCardText` 只收正文，不含感悟） |
| 7 | `src/app/review/ReviewPage.tsx:341` | `{quote.text}` | `<RichText scope="quote">` |
| 8 | `src/app/mailbox/letterLogic.ts:94` | `buildLetter(..., quote.text, ...)` | 传 strip 后的文本 |
| 9 | `src/app/db/index.ts:259` `searchQuotes` | `haystack` 直接用 `q.text` / `q.thought` | 两侧 strip 后再比对 |
| 10 | `src/app/components/SearchResults.tsx:80` | `highlight(result.quote.text, searchQuery)` | 基于 strip 后的文本（`highlight` 是 split 匹配，不依赖字符偏移） |
| 11 | `src/app/db/index.ts:377` `exportMarkdown` | `> ${q.text}` | 不改：标记本身就是 md 语法 |

### 6.1 工具栏的交互细节

- 有选区：把标记包在选区外；无选区：在光标处插一对标记并把光标放到中间。
- 插入后必须还原焦点与光标（`setSelectionRange`），否则连点两次就跳走。
- 已有同种标记的选区再点一次 = 去掉标记（toggle）。
- 每栏工具栏带「清除」：一次去掉本栏所有成对 `==`，保留文字与 `**加粗**`；
  本栏没有高亮时禁用。清除只作用于标记，不改已选高亮色，之后继续加高亮仍沿用当前颜色。
- 高亮色是每条摘录自己的字段，两栏各选一个；默认项不写值，交给亮/暗主题。
- 保留 `autoResize`（`AddQuoteSheet.tsx:30`）与 OCR 追加路径（`:237`）不变 —— OCR 只往 `text` 追加纯文本。
- 不换 contenteditable 的理由：要连自动增高、OCR 插入、光标恢复、中文输入法组合态一起处理，
  且富文本编辑器（tiptap/lexical）会给主包加 100KB+，而这四样标记用「选区包裹」就能覆盖。

### 6.2 折叠与测量

`useClampCollapse` 按行数折算，单一文本块下富文本不改变行数，测量逻辑不用动。补一条断言：
渲染结果里**没有块级子元素**，防止以后有人顺手换成 `ul`。

## 7. 兼容与回滚

- 只增加两个可空颜色列；旧数据没有颜色字段时合法，渲染回落到主题默认。
- 实现前先扫一遍真库，统计 `text` / `thought` 里已存在的成对 `==` 条数（理论上为 0；若有，那些条目会被当作高亮）。
- 回滚：渲染层关掉标记分支即回到纯文本；或用 `stripRichText` 批量清洗。

## 8. 测试

| 文件 | 覆盖 |
|---|---|
| `src/app/__tests__/richText.test.ts`（新） | 成对 / 未闭合 / 跨行 / 嵌套 / scope 限制 / 行首符号按普通文字 / strip 等价性 |
| `src/app/components/__tests__/CollapsibleQuoteText.test.tsx` | 带标记的正文渲染出 `mark`；折叠行数与按钮行为不变 |
| `src/app/components/__tests__/CollapsibleThought.test.tsx` | 带加粗的感悟；行首符号原样保留；断言输出是单一文本块 |
| `src/app/components/__tests__/AddQuoteSheet.test.tsx` | 工具栏在选区/光标处插入、toggle 去标记、一键清除本栏高亮（保留文字/加粗与另一栏）、OCR 追加不受影响 |
| `src/app/__tests__/quoteMarkColors.test.ts`（新） | 只接受 `#RRGGBB`；非法值回落；默认项为空 |
| `CollapsibleQuoteText` / `CollapsibleThought` / `ExcerptCard` 用例 | 每摘录颜色优先；回顾卡正文与探针共用同一底色 |
| `src/app/review/__tests__/cardFit.test.ts` | 探针与真卡渲染同一棵树 |
| 搜索用例 | `==` 标记不影响命中；搜 `==` 不误命中 |

## 9. 已知边界

- 不做列表：用户手打的 `- ` / `1. ` 只是普通文字，没有 `ul` / `ol` 语义（A 档已移除列表）。
- 不支持嵌套与跨行标记；`==**x**==` 会按字面显示。
- 编辑态没有实时预览：保存后在详情卡、回顾卡、回顾页里才看到样式。
- 分享图只导出纯文本（strip 掉标记），不带高亮与加粗（原因见 §2.3）。
- 手打成对 `==` 的旧数据会被识别为高亮（§7 会先扫库确认）。
- 时光信箱里看不到任何样式（只做 strip）。

## 10. 交付顺序

1. `richText.ts` + 单测（纯函数先绿）。
2. 令牌 + `RichText.tsx` + 组件断言（无块级子元素）。
3. 接入详情页两处（#2、#3）：用户可见的最小闭环。
4. 编辑工具栏（#1）。
5. 回顾卡探针（#4）、分享（#5、#6）、回顾页（#7）。
6. 信件 strip（#8）、搜索 strip（#9、#10）。
