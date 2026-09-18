# 按摘录文字做字体子集化 —— 设计文档

**日期：** 2026-09-18
**状态：** 已实现（本机验证 + 真浏览器端到端均通过，见 §8.1、§8.3；端点线上行为待部署验证，见 §8.2）
**关联问题：** 首次使用图片导出时字体加载 >2 分钟、图片生成 >3 分钟（后续 <10s）

## 1. 背景与目标

分享卡片导出时，卡片正文用用户选中的那款 CJK 字体渲染。当前实现（#1/#2 修复后）
仍然要**下载所选字体的整套 woff2**：思源宋体 7.2MB、明朝体 7.4MB、小篆 1.9MB……
按用户报的慢网速反推约 180KB/s，最大的一款 ≈ 41s。后续使用之所以快，只是因为
浏览器 HTTP 缓存命中 —— 首访的这 41s 是纯粹的下载时间，不是渲染时间。

**目标：** 让「首次导出某一段摘录」只下载这段摘录真正用到的字形，
把 7.4MB 量级的下载降到几十 KB 量级（<1s）。

**非目标：**
- 不改动整套字体的行为（它继续作为降级路径存在）。
- 不处理 #1（贴纸 SVG 分块）与 #2（html2canvas 空闲预取）。
- 不引入构建期字体转换依赖（不依赖 Cloudflare 构建环境里有 Python/fontTools）。
- 不做按 unicode 区段分片 + `unicode-range` 的静态方案（CJK 文本均匀散落在各区段，
  实测切 64 片后一段摘录仍要命中十几个分片、下载数百 KB，达不到几十 KB 的量级）。

## 2. 实测数据（本机真机验证）

### 2.1 harfbuzzjs 的能力边界

`harfbuzzjs@1.6.1` 的主 API（`harfbuzz.wasm`）只导出 shaping，**没有子集化**。
包里另有一个 `dist/harfbuzz-subset.wasm`（622KB），是**零 import 的独立模块**，
直接导出子集化 C API，可以 `WebAssembly.instantiate` 直接驱动，不需要 emscripten glue：

```
memory, malloc, free, __indirect_function_table, _initialize
hb_blob_create / hb_blob_destroy / hb_blob_get_length / hb_blob_get_data
hb_face_create / hb_face_get_empty / hb_face_destroy / hb_face_reference_blob
hb_set_create / hb_set_destroy / hb_set_clear / hb_set_add / hb_set_del / hb_set_union / hb_set_invert
hb_subset_input_create_or_fail / hb_subset_input_destroy / hb_subset_input_unicode_set
hb_subset_input_glyph_set / hb_subset_input_set / hb_subset_input_get_flags / hb_subset_input_set_flags
hb_subset_input_keep_everything / hb_subset_preprocess / hb_subset_or_fail …
```

调用顺序：`_initialize()` → `malloc` 写入字体字节 → `hb_blob_create` → `hb_face_create`
→ `hb_subset_input_create_or_fail` → `hb_subset_input_unicode_set` + `hb_set_add`
→ `hb_subset_or_fail` → `hb_face_reference_blob` → `hb_blob_get_length` / `hb_blob_get_data`
→ 拷出字节。

**必须调用 `_initialize()`**，否则 `hb_subset_or_fail` 静默返回 0。
**每次 wasm 调用后不能复用旧的 `Uint8Array` 视图** —— wasm 内存会在 `malloc` 时增长，
旧视图会失效（这正是我最初误判「明朝体子集化失败」的原因）。取数据前重新构造视图。

### 2.2 子集化开销

73 字摘录（含标点）输入各字体原始 sfnt：

| face | 输入 sfnt | 输出子集 | wasm 耗时 |
|---|---|---|---|
| SourceHanSerifCN | 11.5MB | 17.9KB | 4.1ms |
| HuiWenMingChao | 22.6MB | 52.4KB | 6.5ms |
| FZLanTingXiHei | 1.9MB | 107.0KB | 0.9ms |
| FZSongHei | 3.4MB | 20.9KB | 1.4ms |
| FZXiaoZhuan | 4.3MB | 31.9KB | 2.2ms |
| FZBeiWeiKaiShu | 3.5MB | 23.8KB | 8.6ms（含首次 JIT 预热）|
| FZZhengXianHei | 1.6MB | 11.7KB | 0.6ms |

结论：**CPU 不是瓶颈**（1–9ms），瓶颈只在「Worker 必须先拿到 sfnt」。

### 2.3 woff2 进不去

`harfbuzz-subset.wasm` **不支持 woff2**。实测同一份字体：

| 输入 | `hb_face_create` | `hb_subset_or_fail` |
|---|---|---|
| 原始 TTF（fontTools 转换） | ok | **成功** |
| `public/fonts/*.woff2` | 返回非空 face（懒解析，无意义） | **失败（返回 0）** |
| 随机字节（负对照） | 非空 | 失败（返回 0） |

注意 `hb_face_create` 对垃圾数据也返回非空 face，**不能用它判断字体是否可读**，
只能用 `hb_subset_or_fail` 的返回值。Homebrew 的 `hb-subset` 14.2.0 同样读不了 woff2
（`Failed loading font face`）。所以 Worker 侧必须先有 sfnt。

### 2.4 sfnt 体积

| face | woff2 | sfnt |
|---|---|---|
| SourceHanSerifCN | 7.17MB | 11.54MB |
| FZLanTingXiHei | 0.92MB | 1.87MB |
| FZBeiWeiKaiShu | 1.43MB | 3.51MB |
| FZSongHei | 1.47MB | 3.37MB |
| FZXiaoZhuan | 1.91MB | 4.34MB |
| FZZhengXianHei | 0.72MB | 1.57MB |
| HuiWenMingChao | 7.39MB | 22.58MB |
| **合计** | **21.0MB** | **48.6MB**（gzip 后 26.2MB）|

尝试删 hinting（`cvt ` / `fpgm` / `prep` / `gasp`）、竖排（`VORG` / `vhea` / `vmtx`）、
`GSUB` / `GPOS` / `GDEF` 并降 `post` 到 3.0 来瘦身：**只省 0–5%**。
这些字体几乎全是字形数据，瘦身不值得做，还会改变渲染细节。放弃。

**已定的决策：以不压缩的 sfnt 提交（48.6MB）。**
理由是省掉运行期解压：免费版 Workers 每个请求只有 10ms CPU，解压 8.9MB 会超预算，
而不解压就没有这个问题。代价是仓库多 28MB 二进制。

## 3. 架构

### 3.1 组件总览

```
构建期（本机跑一次，产物入库）
  scripts/build-sfnt-fonts.py  ──►  public/fonts/sfnt/<face>.ttf|.otf
                                    public/fonts/sfnt/index.json

Vite 构建（每次部署）
  vite.config.ts 插件  ──►  dist/hb-subset.wasm   （从 node_modules 拷，不入库）

运行期
  浏览器 ──GET /api/fonts/subset?face=&text=──►  functions/api/fonts/subset.ts
                                                    │ 冷路径：同源取 /fonts/sfnt/<file>
                                                    │        + /hb-subset.wasm（每个 isolate 一次）
                                                    │ 子集化
                                                    ▼
  ◄──── font/ttf | font/otf（十几~几十 KB）────────┘

  浏览器把返回字节包成 @font-face{ src: url(blob:) } 注入 <head>，
  卡片字体栈用 "ShareSub-<face>" 优先，原族名兜底。
```

### 3.2 构建期：`scripts/build-sfnt-fonts.py`

用 fontTools（本机环境已有 `fontTools 4.60.2` + `brotli`）把
`public/fonts/*.woff2` 解成原始 sfnt。**沿用仓库已有的 `scripts/subset-label-fonts.sh`
+ `public/fonts/labels/` 模式：脚本和产物都入库，字体不变就不用重跑。**

脚本内维护一份 face → 源 woff2 的映射（与 `shareCardExport.ts` 的 `FONTS` 一一对应）：

```python
FONTS = {
  'SourceHanSerifCN': 'SourceHanSerifCN-SemiBold.woff2',
  'FZLanTingXiHei':   'FZLanTingXiHei.woff2',
  'FZBeiWeiKaiShu':   '方正北魏楷书简体.woff2',
  'FZSongHei':        'FZSongHei.woff2',
  'FZXiaoZhuan':      'FZXiaoZhuan.woff2',
  'FZZhengXianHei':   'FZZhengXianHei.woff2',
  'HuiWenMingChao':   'HuiWenMingChao.woff2',
}
```

行为：
- 输出扩展名按 `'CFF ' in font` 决定：CFF/CID → `.otf`，glyf → `.ttf`。
- 内容与源文件一致，**不做任何子集化或表裁剪**（见 2.4）。
- 幂等：输出比输入新就跳过。
- 同时写 `public/fonts/sfnt/index.json`：`{ "<face>": "<filename>", ... }`。
  有了它，运行期不用猜扩展名（省掉「先试 .otf 再试 .ttf」的双倍请求）。

### 3.3 运行期：`functions/api/fonts/subset.ts`

Cloudflare Pages 会把 `functions/` 下**每个文件**当作路由，所以共享代码不能放在
`functions/` 里。为了让逻辑可单测，route 文件自身导出纯函数供 vitest 直接 import，
不额外拆文件。

**接口**

```
GET /api/fonts/subset?face=<FONTS 里的 face>&text=<URL 编码的摘录文字>

200  Content-Type: font/ttf | font/otf
     Cache-Control: public, max-age=31536000, immutable
400  text 为空、超过 MAX_TEXT_LENGTH（2000 字）、或 face 不在 index.json 里
404  index.json 里没有该 face，或对应 sfnt 资源缺失
500  wasm/子集化失败
```

`400` 与 `404` 都要能被客户端识别为「别重试，走降级」。客户端只把 `200` 视为成功。

**请求流程**

1. 解析并校验 `face` / `text`。
2. `caches.default.match(request)` 命中直接返回（**同一段摘录第二次导出 0 CPU**）。
3. `loadIndex()`：取 `/fonts/sfnt/index.json`，模块作用域缓存（每个 isolate 一次）。
4. `loadFontBytes(file)`：取 `/fonts/sfnt/<file>` 为 `ArrayBuffer`，模块作用域缓存
   （每个 isolate 一次。HuiWenMingChao 22.6MB，fetch 是 I/O 不计 CPU）。
5. `getWasm()`：取 `/hb-subset.wasm` 并 `WebAssembly.instantiate`，模块作用域缓存。
6. `subsetFont(fontBytes, text)` → 子集字节。
7. 组装响应，`Content-Type` 按输出前 4 字节判断（`OTTO` → `font/otf`，否则 `font/ttf`），
   `caches.default.put(request, response.clone())`，返回。

**`subsetFont` 的实现约束**（都是实测踩过的坑）

- 实例化后先调用一次 `_initialize()`。
- 每次 `malloc` 之后**重新构造** `new Uint8Array(memory.buffer)`，不复用视图。
- 单个 isolate 里同一 face 的字体字节已缓存，不必重复 `malloc` 拷贝。
- `hb_subset_or_fail` 返回 0 时抛错（让上层转 500），不要返回空响应。

### 3.4 客户端：`shareCardExport.ts` + `ShareSheet.tsx`

`shareCardExport.ts` 新增（纯逻辑，可单测）：

```ts
/** 子集字体族名：与整款字体分开命名，缺失字形时可以逐级兜底。 */
export function subsetFamily(face: string): string   // => `ShareSub-${face}`

/** 卡片里用所选字体渲染的全部文字。 */
export function collectCardText(quoteText: string): string   // => `“` + text + `”`

/** 拉子集并注入 @font-face；任何失败/超时返回 null。 */
export async function loadSubsetFont(
  face: string, text: string, timeoutMs?: number,
): Promise<{ family: string } | null>

/** 清掉上一次注入的 <style> 与 blob URL。 */
export function clearSubsetFont(family: string): void
```

**为什么注入 `<style>` 而不是 `document.fonts.add()`：** html2canvas 是从
`document.styleSheets` 里收集 `@font-face` 规则再搬进它的克隆文档的；用
`new FontFace()` + `document.fonts.add()` 注册的字体不在样式表里，克隆文档看不到，
导出图会静默退化成兜底字体。所以必须写成真正的 `@font-face` 规则：

```ts
const url = URL.createObjectURL(blob);
const style = document.createElement('style');
style.dataset.shareSubsetFont = family;
style.textContent =
  `@font-face{font-family:"${family}";src:url("${url}") format("${fmt}");font-display:block}`;
document.head.appendChild(style);
await document.fonts.load(`14px "${family}"`);   // 真正确保可用
```

`ShareSheet.tsx` 的改动：

- `font` 或 `quote.text` 变化时：清掉旧子集 → `loadSubsetFont()` → 成功后置 `subsetReady`。
- 卡片字体栈：`subsetReady ? '"ShareSub-<face>", ' + fallbackStack : fallbackStack`，
  其中「非 system 字体」的 fallbackStack **不再包含整款字体族名** ——
  这样**从面板里点选字体不再触发整款字体的下载**（今天会，这是首访 41s 的起点之一）。
- `handleSave()`：
  - 先等子集（`loadSubsetFont`，超时 4s）。
  - 拿到 → 直接用（连 `ensureFontReady` 都不用调）。
  - 拿不到 → 退回今天的行为：`await ensureFontReady(font.face, [...])` + 用 `font.family`。
  - `setSaving(true)` 保持在 await 之前（按钮显示「生成中…」）。
- 原来的 `preloadFont(font.face, ...)` 只在降级路径里保留。

**降级是硬要求**：`/api/fonts/subset` 的实现、网络、Cloudflare 免费版 CPU 预算
任何一环出问题，用户看到的都应该是「跟今天一样」，而不是报错或白图。

### 3.5 构建：`vite.config.ts` 拷 wasm

新增一个内联插件，`writeBundle` 阶段把
`node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm` 拷到 `dist/hb-subset.wasm`。
这样仓库里不出现第二份 622KB 二进制（`public/` 会被 Vite 原样拷进 `dist/`，
但把二进制放 `public/` 等于入库两份，所以走插件）。

若 `writeBundle` 时源文件不存在（依赖没装），**构建失败** —— 这是对的，
因为没有 wasm 端点必然 500，不如在部署前炸。

### 3.6 缓存分层

| 层 | 键 | 生命周期 | 作用 |
|---|---|---|---|
| 浏览器 HTTP 缓存 | 完整 URL（含 face + text） | `immutable` 1 年 | 同一摘录再次导出 0 请求 |
| Service Worker | 完整 URL | 随 `CACHE_NAME` | 离线可用（GET 同源，走 cache-first 分支） |
| Worker 内 `caches.default` | 完整 URL | 由 `Cache-Control` 决定 | 跨用户/跨 isolate 复用 |
| Worker 模块作用域 | face | isolate 生命周期 | 省掉重复 fetch sfnt / 重复实例化 wasm |

不需要改 `public/sw.js`：它是同源 GET 的 cache-first，子集请求天然落在
「other assets」分支，且 `responseMatchesDestination` 对 `destination === ''` 返回 true。

## 4. 测试策略

### 4.1 单测（vitest，`npm test`）

新增 `tests/font-subset-api.test.ts`：
- 直接 `import { onRequestGet } from '../functions/api/fonts/subset'`，
  用假的 `context`（`request` 是 `new Request(...)`，`env` 空对象）+ stub 掉全局 `fetch`
  返回真实 sfnt 字节 / wasm 字节。
- 断言：返回 200、`Content-Type` 正确、响应字节前 4 字节是合法 sfnt magic。
- 断言：**从输出字节里解析出的 `cmap` 覆盖请求文字里的每一个码点**（自解析 sfnt 表目录
  + cmap format 4/12，约 60 行，不引依赖）。
- 断言：体积 < 源字体的 1/10，且 < 200KB。
- 断言：`text` 为空 / 超长 / `face` 不存在 → 400/404；`hb_subset_or_fail` 返回 0 → 500。
- 断言：第二次调用命中 `caches.default`（stub 的 match 返回首次 put 的 response），
  不再 fetch 字体。

新增 `tests/font-sfnt-assets.test.ts`：
- `public/fonts/sfnt/index.json` 的键集合与 `shareCardExport.ts` 的 `FONTS` id 完全一致
  （排除 `system`）。
- `index.json` 里每个 filename 在 `public/fonts/sfnt/` 下真实存在。
- 每个文件的前 4 字节是 `\x00\x01\x00\x00`（glyf）或 `OTTO`（CFF）。
- 体积与源 woff2 的关系在合理区间（防止误把 woff2 改名提交）。

扩展 `src/app/components/sheets/__tests__/shareCardExport.test.ts`：
- `collectCardText` 含 `“` `”` 与正文。
- `loadSubsetFont` 成功路径注入 `<style data-share-subset-font>` 且 `document.fonts.load`
  被调用；`fetch` 非 2xx / 超时 / 抛错 → 返回 null 且不注入样式。
- `clearSubsetFont` 移除 `<style>` 并 `URL.revokeObjectURL`。

### 4.2 交叉校验（一次性，不进 CI）

wasm 输出是「黑盒」的，所以另做一次外部校验：用 fontTools 读 wasm 产出的子集，
断言 `cmap` 覆盖请求字符、`glyf` / `CFF ` 非空、`hmtx` 条目数与字形数一致。
这次校验写在实现阶段的手动步骤里，目的是抓出我自写 sfnt/cmap 解析器的漏洞。

### 4.3 已知测试盲区（明说）

- **Pages 的路由与 wasm 静态资源路径没法在本机跑**：`npm run preview` 是纯静态预览，
  不带 Functions；`wrangler` 不在 devDependencies 里。所以「`/hb-subset.wasm` 真能取到」
  只能部署后验证。本机验证手段是 `npx wrangler pages dev dist`（需要联网装 wrangler）。
- **Cloudflare 免费版 10ms CPU 上限只能在线上验证**。超了会 500 → 客户端降级，
  功能不坏，但那一次白跑。

## 5. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 免费版 10ms CPU 超限 | 端点 500，本次导出退回整套字体 | 客户端自动降级；模块作用域缓存让热 isolate 只付子集化那 1–9ms |
| Cloudflare CPU 比本机慢 5–10× | 同上 | 同上；必要时改用付费 Workers |
| 仓库多 48.6MB 二进制 | clone/部署变慢 | 已确认接受（方案②）。备选：改 gzip 传输（26.2MB）换运行期解压成本 |
| `FZLanTingXiHei` 子集偏大（29 字 ↔ 99KB，其它款 6–40KB） | 该字体首访稍慢 | **已查明**：不是复合字形，是 TrueType 的 hinting 字节码 —— 子集里 `glyf` 只有 8KB，`fpgm` 独占 91.5KB，harfbuzz 原样保留了它（bytecode 没法按字形裁剪）。按实测慢网 180KB/s 约 0.55s，仍在 1s 内，所以**先不动**：裁掉 `fpgm`/`prep`/`cvt ` 能省 12 倍，但会改变小字号下的渲染细节。真要再压，就在子集化后丢掉这三张表（等价 pyftsubset 的 `--no-hinting`）。 |
| 全量 sfnt 落在 `public/` 下可被公开下载 | 与现状同级的字体暴露 | 现状已公开整套 woff2，格式变化不增加暴露面；`public/_headers` 的 `/fonts/*` 已覆盖 |
| html2canvas 克隆不到 blob 版 `@font-face` | 导出图退化成兜底字体 | 用 `<style>` + `@font-face` 而非 `document.fonts.add()`；预览与导出两条路径都要验证 |

## 6. 文件改动清单

**新增**
- `scripts/build-sfnt-fonts.py`
- `public/fonts/sfnt/<7 个字体文件>` + `public/fonts/sfnt/index.json`
- `functions/api/fonts/subset.ts`
- `tests/font-subset-api.test.ts`
- `tests/font-sfnt-assets.test.ts`

**修改**
- `src/app/components/sheets/shareCardExport.ts`（新增 4 个导出函数 + 注释）
- `src/app/components/sheets/ShareSheet.tsx`（子集加载、字体栈、handleSave 降级）
- `vite.config.ts`（拷 wasm 的插件）
- `package.json`（`harfbuzzjs` 依赖，已装）
- `README.md`（说明 `public/fonts/sfnt/` 的再生成方式）

**不动**
- `public/sw.js`（cache-first 天然覆盖）、`public/_headers`、`src/styles/fonts.css`
  （整套字体的 `@font-face` 保留给降级路径）

## 7. 验收标准

1. `npm test` 全绿（现有 250 个用例 + 新增用例）。
2. `npx tsc --noEmit` 干净。
3. `npm run build` 成功，且 `dist/hb-subset.wasm` 存在。
4. 本机验：给定一段真实摘录文字，`subsetFont()` 对 7 款字体都产出
   `cmap` 覆盖完整、体积 <200KB 的合法 sfnt。
5. 部署后验：清空浏览器缓存 → 首次打开分享面板 → 点选「明朝体」→
   **不产生 `HuiWenMingChao.woff2`（7.4MB）请求**，只产生一次
   `/api/fonts/subset?...` 且响应为几十 KB；导出图里的正文是明朝体而不是兜底字体。
6. 部署后验：断开网络后重复导出同一段摘录，仍能出图（SW/HTTP 缓存命中）。
7. 降级验：把端点临时改成返回 500，导出流程**不报错**，行为与修复前一致。

验收状态：1–4 已通过（见 §8.1）；7 已通过（见 §8.3）；5、6 仍需部署后验证，原因见 §8.2。

## 8. 实现结果（与设计的偏差）

实现过程中偏离设计的地方，以及原因：

| 设计 | 实现 | 原因 |
|---|---|---|
| `loadSubsetFont()` 一次完成「拉取 + 注入」 | 拆成 `fetchSubsetFont()` + `applySubsetFont()` | 拉取是异步的，用户可能在它落地前就换了字体；一体化 API 里迟到的响应会把新字体的 `@font-face` 冲掉，卡片静默退化成系统字体。拆开后由调用方决定「这次结果还算不算数」。 |
| `clearSubsetFont(family)` 按族名清 | `clearSubsetFont()` 清掉所有子集 `<style>` | 换字体时族名已经变了，按族名过滤会漏掉上一条，blob 一直挂着。 |
| Worker 内缓存字体字节 | **不缓存** | 七款合计 48.6MB，加上 wasm 堆（子集化明朝体时实测已涨到 65MB）会顶到 isolate 的 128MB 上限。重复取字体只是一次边缘内 I/O，且同一段摘录的第二次导出本来就走 `caches.default`，到不了这一步。 |
| 未知 face → 400 | 未知 face → 404 | 语义上就是「这份资源不存在」。客户端只判 2xx，行为一致。 |
| 只改 `ShareSheet.tsx` 的字体栈 | 另加 `applyCardFont()` + html2canvas `onclone` | 导出前刚 `await` 完子集，`setState` 还没渲染完，克隆文档拿到的仍是旧字体栈 —— 导出图静默退化。直接改克隆 DOM，导出结果与渲染时序无关。 |

设计里没写、实现时必须补上的：

- **`ASSETS` 绑定优先**：静态资源优先用 `env.ASSETS.fetch()`，没有绑定（本地/测试）才退回同源 `fetch()`。Pages 运行时同源 fetch 能不能拿到静态资源只能部署后确认，这条是双保险。
- **字体渲染三档栈**：子集就位 → `"ShareSub-<face>", <fallbackFamily>`；子集在路上 → 只用 `fallbackFamily`（**不能**用 `font.family`，否则等于在还没决定走哪条路时就把整套字体拉下来）；子集失败 → `font.family`。

### 8.1 本机验证结果

一段 29 字摘录（含引号）的实测子集体积 / 子集化耗时（本机）：

| face | 整套 sfnt | 子集 | 压缩比 | 子集化 |
|---|---|---|---|---|
| SourceHanSerifCN | 11.54MB | 9.5KB | 1/1247 | 3.8ms |
| FZLanTingXiHei | 1.87MB | 99.2KB | 1/19 | 0.6ms |
| FZBeiWeiKaiShu | 3.51MB | 12.3KB | 1/293 | 8.2ms |
| FZSongHei | 3.37MB | 10.4KB | 1/332 | 0.5ms |
| FZXiaoZhuan | 4.34MB | 16.5KB | 1/269 | 1.9ms |
| FZZhengXianHei | 1.57MB | 6.3KB | 1/257 | 0.4ms |
| HuiWenMingChao | 22.58MB | 40.3KB | 1/574 | 4.5ms |
| **合计** | **48.8MB** | **194KB** | — | — |

最坏的一款（明朝体，原先首访要下 7.4MB）现在是 40KB。

- `npm test`：33 个文件 / 286 个用例全绿（新增 36 个，原 250 个）。
- `npx tsc --noEmit`：干净。
- `npm run build`：成功；`dist/hb-subset.wasm`（622KB）存在，`dist/fonts/sfnt/` 七份 sfnt 齐全。
- **七款字体都真的子集化成功**：测试直接驱动 wasm（喂真 sfnt），再自己解析输出字节，
  断言 cmap 覆盖请求的每一个码点、必需表（`cmap`/`head`/`hhea`/`hmtx`/`maxp`/`glyf`|`CFF `）
  齐全、体积 < 源的 1/10 且 < 200KB。断言落在 cmap 上而不是 HTTP 状态码上 —— 这段代码
  最容易的坏法是产出一份「合法但缺字」的字体，浏览器不报错，只悄悄换字体。
- 另用 fontTools 4.60.2 交叉校验同一批输出：可解析、cmap 覆盖 100%、轮廓非空。
- 缓存行为：同一段摘录第二次请求命中 `caches.default`，不再取字体。
- **真浏览器端到端**（脚手架见 §8.3）：真端点 + 真 html2canvas + 真导出流程，六项判定全通过；
  其中「导出图哈希 ≠ 兜底字体哈希」是子集在克隆文档里真的生效的硬证据。

### 8.2 仍然只能部署后验证

- Pages 路由（`functions/api/fonts/subset.ts`）与 `/hb-subset.wasm` 静态资源能否取到。
- 免费版 10ms CPU/请求是否够：本机 0.2–8.6ms，Cloudflare 侧可能更慢；首次请求还要加上
  wasm 实例化的开销，最坏情况那一次 500 → 客户端降级（功能不坏，那次白跑）。
- ~~浏览器里 `@font-face{src:url(blob:)}` 在 html2canvas 克隆文档中的实际生效情况。~~
  本机真浏览器已验证通过（见 §8.3）：克隆文档里点名的子集确实渲染了，导出图与兜底字体
  哈希不同。线上仍需复核一次，但复核的是 Pages 的响应头与 CDN 缓存，不是这条机制本身。
- 部署体积：`dist/` 从约 30MB 涨到 81MB，最大单文件 `HuiWenMingChao.ttf` 22.58MiB，
  离 Cloudflare Pages 的 25MiB/文件上限还有约 2.4MiB 余量 —— 这款字体再长胖就要换传输方案。

### 8.3 真机内测脚手架（已就绪，尚未执行）

§8.2 第 3 条（`@font-face{src:url(blob:)}` 在 html2canvas 克隆文档里到底生效没有）是这次
改动**唯一没法用单测覆盖**、又最容易静默退化的地方：预览完全正常，只有导出的图里字形变了。
为此准备了一套真浏览器端到端脚手架，全部在 `/tmp/verify/`（不属仓库，临时目录）：

- `server.mjs` —— 本地 HTTP 服务，把**真实的** `functions/api/fonts/subset.ts` 挂在
  `/api/fonts/subset`；静态字体从 `public/` 取、wasm 从 `node_modules/harfbuzzjs` 取，
  用假的 `ASSETS.fetch` 复刻 Pages 的绑定行为。带 `/__fail`（强制 500）和 `/__log`。
- `test.html` —— 用**线上同一份**打包产物（`shareCardExport.mjs`、`html2canvas.mjs`）驱动真实
  导出流程，判定项见下。所有失败路径（模块链接失败、未捕获异常、未处理 rejection）都写进
  `window.__RESULT`，避免出现「页面什么都没发生」这种查不出根因的现场。
- `drive.mjs` —— 零依赖 CDP 驱动（Node 24 自带 `WebSocket`，不需要 Playwright）。连 DevTools
  轮询 `window.__RESULT`，**不再用 `--dump-dom` 猜 load 事件的时序**：上一轮内测就是栽在这里，
  `--dump-dom` 在模块还没跑完时就 dump 了，拿到的 DOM 和源文件一模一样。
- `run.sh` / `commit.sh` —— 一键起服务 + 驱动；提交辅助。

判定项：子集字节 > 0；`@font-face` 出现在 `document.styleSheets` 里（html2canvas 只从
样式表搬运，这是它能看到子集的**唯一**前提）；`document.fonts.check` 为真；**同一张卡片
导出两次——一次点名子集、一次点名不存在的字体——PNG 哈希必须不同**（相同即子集没生效，
静默退化成了兜底字体）；端点 500 时 `fetchSubsetFont` 返回 `null` 且降级后仍能出图。

**状态：已执行，六项判定全部通过。** 脚手架要在本机回环端口起服务并启动无头 Chrome，
两者都被本沙箱拦截（`listen EPERM`、Chrome `mach_port_rendezvous` 被拒），而沙箱外执行的
自动审批服务当时处于故障状态（`codex-auto-review` 返回 400），因此改由人工在终端执行
`bash /tmp/verify/run.sh`。实测结果：

| 判定 | 结果 |
| --- | --- |
| 子集字节 > 0 | 通过 —— 明朝体 41,220 字节 |
| `@font-face` 进了 `document.styleSheets` | 通过 |
| `document.fonts.check` 为真 | 通过 |
| **导出 PNG 与兜底字体不同** | 通过 —— 哈希 `8dda5ce3` ≠ `9abe699a` |
| 端点 500 时降级为 `null` | 通过 |
| 降级后仍能出图 | 通过 —— 59,071 字节 |

页面零未捕获异常、零 console 报错；服务端只收到两次 `/api/fonts/subset`，对应两次导出。

这条判定的意义：`document.fonts.check` 为真只说明**主文档**有这套字形，而导出走的是
html2canvas 的克隆文档 —— 那里的 `@font-face` 是它从 `document.styleSheets` 逐条搬过去的
文本，blob URL 能不能在克隆文档里解析、搬到克隆里的规则会不会被浏览器忽略，都只有真
浏览器说了算。哈希不同就是「子集在克隆文档里真的生效」的硬证据；这条不成立时，
预览完全正常，只有导出的图悄悄换了字体。

> 一处测试脚本的输入冗余：测试页把已经是「带引号的句子」又喂了一次 `collectCardText()`，
> 于是请求里带了两对引号（子集 41.2KB 而非 §8.1 的 40.3KB）。应用里 `ShareSheet` 传的是
> 不带引号的摘录原文、卡片上的引号由 `collectCardText()` 补 —— 产品行为正确，
> 这只是测试输入的问题，不影响上面的判定。
