// ─── 分享面板的按需加载入口 ────────────────────────────────────────────────────
//
// ShareSheet 自己带着 770KB 的贴纸 SVG 数据，导出图片用的 html2canvas 是另一个
// 197KB 的 chunk。两个都只在用户点「分享」之后才用得到，静态引入等于让每个打开
// 书详情的人都先下载它们 —— 所以走动态 import，并在书详情页空闲时一起预取。
//
// html2canvas 原先只在分享面板打开的那一瞬间才去取，于是「保存图片」按钮会先在
// 「准备中…」上停一下（首访时还要跟字体抢带宽）。这里把两块绑在一个入口，
// prefetchShareSheet() 一次就都拿到。

export const loadShareSheet = () => import('./ShareSheet');

export const prefetchShareSheet = () =>
  Promise.all([loadShareSheet(), import('html2canvas')]);
