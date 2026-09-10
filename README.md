# 摘录 — 阅读摘录管理 PWA

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

- **字体子集化 → woff2**：源字体放在 `书签字体/`（不入库），执行
  ```bash
  bash scripts/subset-letter-fonts.sh   # 需 pip install fonttools brotli
  ```
  产出 `public/fonts/` 下的 `华康宋体W3-P.woff2`（中文，保留全部 CJK 以覆盖任意摘录）、
  `Georgia-Bold.woff2`、`Georgia-Italic.woff2`、`TrebuchetMS.woff2`（仅西文与常用标点）。
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
  再放不下就降摘录字号（45→40），最后才截断摘录。
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

拍照识字使用百度 OCR，密钥不写入源码，通过环境变量注入：

```bash
cp .env.example .env.local
# 编辑 .env.local，填写 VITE_OCR_ACCESS_TOKEN / VITE_OCR_TOKEN_EXPIRES
```

Cloudflare Pages 构建时，在 Workers & Pages 项目 `Settings → Environment variables`
中配置 `VITE_OCR_ACCESS_TOKEN` 与 `VITE_OCR_TOKEN_EXPIRES`（Production 分支都要勾选），
保存后重新部署会自动注入。

> 注意：纯前端静态站无法真正隐藏密钥，发布版中的 token 仍可被查看。生产环境建议改用服务端代理刷新并调用 OCR。

## 构建部署

```bash
npm run build
```

构建产物在 `dist/` 目录。Cloudflare Pages 已通过 Git 关联本仓库，
推送 `main` 分支后会自动执行 `npm run build` 并部署 `dist/`。

## 在线体验

https://book-excerpts-2dm.pages.dev/
