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
