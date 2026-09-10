import { useEffect, useRef } from 'react';

/**
 * 首屏之后空闲时预取一个动态 chunk。
 *
 * 贴纸数据、信件排版这类模块只有用户点开对应界面才用得到，静态 import 会把它们
 * 塞进首屏主包（慢网下首访直接多等几百 KB）。改成动态 import 之后首屏轻了，
 * 但用户点开的那一下会停下来等 chunk —— 所以空闲时先把它取回来，两头都不吃亏。
 *
 * load 建议用模块级常量，避免每次渲染都换新函数：
 *   const loadShareSheet = () => import('./sheets/ShareSheet');
 */
export function usePrefetchOnIdle(load: () => Promise<unknown>): void {
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    const run = () => {
      loadRef.current().catch(() => {}); // 预取失败无所谓，真正打开时还会再取一次
    };
    // 不支持 requestIdleCallback 的浏览器（Safari）退化成首屏后延迟取
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, []);
}
