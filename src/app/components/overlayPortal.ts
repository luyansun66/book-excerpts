import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * 浮层统一挂载点：把 fixed 浮层挂到 document.body 下。
 *
 * 为什么非挂 body 不可：应用里每个页面层都是带 transform 的 motion.div（翻页 / 滑动返回），
 * transform 会把 position: fixed 的包含块从视口换成那一层；而 body 上有
 * padding-top: env(safe-area-inset-top)，浮层于是被整体顶下去一个状态栏的高度，
 * 顶部那条安全区就露出 body 的米白底色 —— PWA 上就是「顶部一层米白遮罩」。
 * 挂到 body 下，fixed 才重新相对视口，遮罩才能盖满整屏。
 *
 * 代价：挂到 body 之后浮层不再受 body 的 safe-area padding 保护，所以贴边的面板
 * 得自己用 env(safe-area-inset-*) 让开状态栏（顶部）和 Home 指示条（底部）。
 */
export function overlayPortal(node: ReactNode) {
  return createPortal(node, document.body);
}
