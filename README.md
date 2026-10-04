# 折角 — 阅读摘录管理 PWA

一个移动端优先的阅读摘录管理工具，支持书籍管理、摘录记录、全文搜索、分享卡片生成和数据统计。

## 功能

- 📚 **书架管理** — 按分类管理书籍，支持自定义分类、上传封面
- 💬 **摘录记录** — 记录阅读中的精彩段落，可标注页码、添加个人感悟
- 🔍 **全文搜索** — 快速搜索所有摘录内容
- 🎴 **分享卡片** — 将摘录生成为精美图片，多种主题可供选择
- 📊 **阅读统计** — 阅读日历热力图、连续记录、数据统计
- 📤 **数据导出/导入** — JSON 格式备份与恢复，方便迁移
- 📱 **PWA 支持** — 可添加到手机主屏幕，离线可用

## 每日书签（时光信箱）

点击首页插画里的邮筒会拆开当天的「折角书摘」卡片：按累计收信次数编号，同一天复用同一封，
内容随机取自已有摘录。卡片由 `src/app/mailbox/letterTemplate.svg` 模板 +
`svgGenerator.ts` 动态排版生成。

**第一封信**：新用户摘录还是 0 条时，不弹「还没有摘录」的空状态，而是直接送出
`letterLogic.ts` 里内置的那段《咀嚼人生》文案（正文与书名/作者分开存放，出处交给模板单独排版）。
这段文案不写进数据库，只在 `letterBox` 状态里留一个哨兵 id（`FIRST_LETTER_QUOTE_ID`），
因此它不会出现在「我的摘录」里，同一天再打开也仍是同一封。



- **字体子集化 → woff2**：源字体放在 `书签字体/`（不入库），执行
  ```bash
  bash scripts/subset-letter-fonts.sh   # 需 pip install fonttools brotli
  ```
  产出 `public/fonts/` 下的 `华康宋体W3-P.woff2`（中文，保留全部 CJK 以覆盖任意摘录）、
  `Georgia-Bold.woff2`、`Georgia-Italic.woff2`、`TrebuchetMS.woff2`（仅西文与常用标点）。
- **分享卡片字体（两种粒度）**：分享面板选择器上的「字体名」用 `public/fonts/labels/*.woff2`
  （每个约 1KB，`bash scripts/subset-label-fonts.sh` 生成）；卡片正文不再下载整套字体，
  而是请求 `/api/fonts/subset`（Pages Function：`functions/api/fonts/subset.ts`）按**这段摘录
  用到的字**现场子集化，返回十几~几十 KB（原先首访要下整套，最大的一款 7.4MB）。
  服务端做子集化用的是原始 sfnt —— harfbuzz 的 subset wasm 读不了 woff2：
  ```bash
  python3 scripts/build-sfnt-fonts.py   # 需 pip install fonttools brotli；产物入库
  ```
  产出 `public/fonts/sfnt/<face>.ttf|otf` + `index.json`（合计约 48.6MB，字体不变就不用重跑，
  同 `public/fonts/labels/` 的模式）。`dist/hb-subset.wasm` 由 `npm run build` 从
  `node_modules/harfbuzzjs` 拷入 dist，不入库。端点不可用 / 超时 / 超 CPU 预算时，
  前端自动退回整套字体：慢，但一定出图。
- **分享面板按需加载 + 空闲预取**：`ShareSheet` 和导出用的 `html2canvas`（202KB）都是动态
  import，入口统一在 `shareSheetLoader.ts`；书详情页挂载后用 `usePrefetchOnIdle` 一次把两块
  都取回来 —— 点「分享」不用等 chunk，点「保存图片」也不必先在「准备中…」上停一下。静态
  引入这两块等于让每个打开书详情的人都先下载 ≈260KB。
- **贴纸按需加载**：20 款贴纸（原先是 `stickerData.ts` 里合计 768KB 的模板字符串）拆成
  `stickers/NN-<id>.svg`，由
  ```bash
  node scripts/build-sticker-assets.mjs   # 需 Chrome + Pillow；--skip-thumbs 只重生成 index.ts
  ```
  产出 `stickers/index.ts`：默认款静态引入（卡片首帧就要用），其余 19 款各自 lazy chunk，
  选中哪款才下哪款；选择器里 24px 的缩略图是 48×48 的 PNG 蒙版（20 张合计 ≈14KB，构建时
  内联成 data URI），用 `mask-image` + 容器 `background-color` 取主题文字色，保持跟主题联动。
  `ShareSheet` 自身 chunk 因此从 787KB 降到 55KB。
- **字形真实轮廓度量**：排版要按「字形真实可视边界」（≈ Illustrator 的 `visibleBounds`）对齐，
  不能用 Em 文本框（`geometricBounds`）—— Em 框左右带边距、上下带行距留白，视觉不准。执行
  ```bash
  python3 scripts/gen-letter-metrics.py   # 需 pip install fonttools
  ```
  从 `书签字体/` 的源字体提取每个字形的 advance 与墨迹右边界 `xMax`，产出
  `src/app/mailbox/letterMetrics.ts`（约 36 KB，需提交入库）。`svgGenerator.ts` 据此做到：
  ① 出处行「作者末字的最右缘」与「摘录最右一列文字的最右缘」严格对齐；摘录很短而书名作者
  很长时，出处折成「《书名》」/「· 作者」两行，**首行**右缘同样贴住摘录右缘（不会为了塞进
  一行而把整行左移出内容边界）；
  ② 大编号的字形轮廓中心点与右侧小房子中心点重合，且大编号全程是活的 `<text>`
  （不转曲、不轮廓化，字体缺字时才退回粗略估算）；
  ③ 摘录末行 → 出处的间距按「墨迹底 → 墨迹顶」定义：下方宽裕时取 120px，紧张时压到
  85px 为止（旧版 16.5px 的约 5 倍），同时保证出处末行基线距底部横线始终 ≥ 30px；
  再放不下就降摘录字号（45→37），最后才截断摘录。

### 摘录正文排版规范

排版规则集中在 `svgGenerator.ts` 的「摘录正文排版规范」一节，`svgGenerator.test.ts` 里
「摘录正文排版规范」一组用例逐条守着。判定一律走字形真实轮廓，不用 Em 框。

- **版心与对齐**：左起 `QUOTE_X=220`、右界 `RIGHT=960.2`；左对齐、行尾不齐，不做两端对齐
  （两端对齐会为了齐边把字距拉散，卡片上得不偿失）。
- **字号与行距**：45→37 逐档降；行距 = 字号 × 4/3。
- **断行单位**：中文逐字、西文成词、空格单独成词。
- **避头**：收尾标点（`，。、；：！？）」』】〕〉》…`）不得出现在行首。
  撞线时先看能否「悬挂」——全角句读的墨迹只占字身靠左一小段（`，`0.31em、`。`0.36em、
  `！`0.56em），字身右侧的空白本就是留给避头尾的余量；墨迹右缘仍在版心内就留在行末，
  连墨迹都放不下才退回推排（把前一个字一起挪到下一行）。
- **避尾**：起首标点（`（《「『【〔〈`）不得出现在行末，会连同下一段文字一起挪到下一行。
- **连续标点挤压**：相邻标点之间压掉前一个标点 50% 的空白余量，免得 `」。` 这类组合
  在字身之间空出一个整格的洞。
- **中西文间隙**：中文与西文交界处补足 1/4em 空隙（clreq 的「中西文间隙」），
  前一个字自带的右侧空白算在内；空格本身已经是间隔，其后不再补。
- **空格**：行首不出现空格，行末空格随 `trim` 丢弃。

字距调整只改「笔位」不改字形：实现上把一行按调整点切成若干 `<tspan>`，用 `dx` 还原同样的
字距，文字始终是活的 `<text>`，可选中、可编辑。因此断行时的宽度判定（`quoteWidthEm`）
与渲染时的字距输出（`quoteSegments`）是两条独立路径，测试用 SVG 里实际输出的 `dx`
反推字位来交叉校验，两边对不上就会红。
- **出处字号固定 34px**：书名/作者行不随摘录字号联动，摘录在 45→37 之间怎么降都不影响它。
  横线长度（2em）、横线偏移（12/35 em）、两行行距（1.25em）都写成相对单位，与出处字号同步；
  间距换算里的「《」墨迹上界按 34px 计算。
- **直接渲染成图片**：`letterImage.ts` 把模板里的外链字体与底图 `bg01.jpg` 内联成 data URI，
  再走 `<img>` → `<canvas>` → `toBlob` 输出 PNG。SVG 作为图片加载时不会请求外链资源，
  所以必须内联，否则会丢字/丢底图。字体被烘焙进图片，保存或分享到任何设备都保持设计稿的样子。
  浮层里的「保存图片」按钮导出 `折角书摘-<编号>-<日期>.png`。

## 技术栈

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 4
- Dexie.js (IndexedDB)
- html2canvas (图片生成)
- Motion (动画)

## 本地开发

```bash
npm install
npm run dev
```

## OCR 配置

拍照识字用百度 OCR，但**浏览器不直接调百度**：图片先发到本站的 `/api/ocr`
（Cloudflare Pages Function，见 `functions/api/ocr.ts`），由服务端用密钥换 `access_token`、
调用识别接口，并把这张票缓存在 isolate 内存里。好处是浏览器产物里既没有密钥、也没有
30 天就过期的 token，换票不用改前端代码、也不用因此重新发版。

本地开发在 `.env.local` 里填百度应用的 Key（名字不带 `VITE_` 前缀，所以不会被打进
浏览器产物）：

```bash
cp .env.example .env.local
# 编辑 .env.local，填写 BAIDU_OCR_API_KEY / BAIDU_OCR_SECRET_KEY
```

`npm run dev` 和 `vite preview` 下没有 Pages 运行时，`vite.config.ts` 里的中间件会把
`/api/ocr` 接到同一个 handler 上，因此本地不需要额外起 wrangler，也保证了本地和线上
走的是同一份换票/降级/报错逻辑。

Cloudflare Pages 构建时，在 Workers & Pages 项目 `Settings → Environment variables`
中配置同样的 `BAIDU_OCR_API_KEY` 与 `BAIDU_OCR_SECRET_KEY`（Production 分支都要勾选）。
环境变量只在构建与运行时注入，改完需要重新部署一次才会在 Function 里生效。

### 这条链路是跨境的，务必打开 Smart Placement

Function 默认跑在离**用户**最近的机房。问题在于识别这一步是「Function 回源百度」——
默认机房往往在境外（实测落在 San Jose），于是凭空多了一跳跨太平洋的往返。同一张
900KB 的整页图实测：

| 路径 | 耗时 |
| --- | --- |
| 本机（上海）直连百度 | 723ms |
| 经 Cloudflare 边缘回源百度 | 12.7s ~ 16.6s |

18 倍的差距。这也解释了 2026-10 那次用户反馈的「识别超时」：函数里两条腿（换票、识别）
共用一个 15s 超时，恰好压在识别耗时的中位数上，于是三次里挂一次 —— 是必然的偶发，
不是用户网络不好。

治本手段是让 Function 跑在离**百度**更近的机房：Cloudflare 控制台 → 该项目
`Settings → Runtime` → `Placement` → 选 **Smart**。生效需要先打 20~30 次请求
（几分钟后开始起作用），然后用 Functions Metrics 对比请求耗时。

项目里没有 `functions/_middleware.js`，所以不会触发 Smart Placement「静态资源被一起
挪到远处机房」的那个坑；但 `functions/api/fonts/subset.ts` 用了 `env.ASSETS.fetch`，
它取资源的位置会跟着 Function 走，属于可接受的代价（那条路径有缓存，且只看功能不看
绝对延迟）。

## 构建部署

```bash
npm run build
```

构建产物在 `dist/` 目录。Cloudflare Pages 已通过 Git 关联本仓库，
推送 `main` 分支后会自动执行 `npm run build` 并部署 `dist/`。

### 给 Function 加新接口时：别用 502 / 503 / 504

挂在自定义域名（`luyansun.top`）上的 Pages Functions，一旦返回 502 / 503 / 504，
响应体会被 Cloudflare 换成它自带的品牌错误页（一整页 `<!DOCTYPE html>`），**只有
`*.pages.dev` 直连域名才能看到我们写的 JSON**。实测同一个 502：pages.dev 返回
`{"error":"OCR 识别失败：图片格式不支持"}`，`luyansun.top` 返回 HTML，用户侧只剩一句
「HTTP 502」，真正的原因全丢了。`500` 和所有 `4xx` 不受影响，会原样透出。

所以约定是：

- 入参问题 → `400` / `413`
- 业务上「做不了」 → `422`（识别不出文字、上游说图片不合法、超时）
- 服务端自己配错了 → `500`（缺密钥、鉴权失败）

`tests/ocr-api.test.ts` 里有一条回归测试盯着这个约定。

## 在线体验

https://book-excerpts-2dm.pages.dev/
