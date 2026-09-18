/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

/**
 * harfbuzz 子集化 wasm：wrangler 构建 functions/ 时会把它编成 WebAssembly.Module
 * （见 functions/api/fonts/subset.ts）。functions/ 不在本 tsconfig 的 include 里，
 * 这里只保证编辑器打开那个文件时这行 import 不是「找不到模块」。
 */
declare module '*.wasm' {
  const wasmModule: WebAssembly.Module;
  export default wasmModule;
}
