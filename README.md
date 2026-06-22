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

## 构建部署

```bash
npm run build
```

构建产物在 `dist/` 目录。

## 在线体验

https://luyansun66.github.io/book-excerpts/
