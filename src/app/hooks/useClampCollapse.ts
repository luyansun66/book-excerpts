import { useCallback, useLayoutEffect, useRef, useState } from 'react';

// ─── 「太长就折起来」的公共测量逻辑 ────────────────────────────────────────────
//
// 摘录下方的感悟、摘录正文本身，都要「先量出溢出、再决定折不折」。这套状态机踩过坑
// （见下面 useClampCollapse 的注释），两处各写一份，迟早有一边漏改 —— 所以放在这儿共用。
//
// 这里只管「折不折」：折叠成几行、按钮放哪儿、什么配色，都归各自的组件。

/** 亚像素误差会让「刚好到顶」的内容量出 1px 的差，不设容差就会给它挂上展开按钮。 */
export const OVERFLOW_TOLERANCE_PX = 1;

/** 折叠后内容比可见区高，就是被截断了 —— 只有这时才该给展开按钮。 */
export function isOverflowing(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + OVERFLOW_TOLERANCE_PX;
}

/**
 * 短到不可能溢出的判据，用来跳过测量（一屏几百条摘录时能省下绝大多数测量和观察）。
 * 按最窄的手机算：320px 屏、去掉各处内边距后一行只放得下约 16 个汉字，这里按 10 个算，
 * 留足余量 —— maxLines 行以内、且没有换行，就一定不会超。
 */
const CHARS_PER_LINE_GUESS = 10;

export function canSkipMeasurement(text: string, maxLines: number): boolean {
  return !text.includes('\n') && text.length <= CHARS_PER_LINE_GUESS * maxLines;
}

interface ClampCollapseOptions {
  /** 内容本身。换了内容（编辑、翻到另一条）就重算，并且收回展开态。 */
  contentKey: string;
  /** 短到不用量：不测也不观察，直接判定「放得下」。 */
  skippable: boolean;
}

/**
 * 先按「会被截断」渲染，再量。
 *
 * 方向很重要：整段渲染时 scrollHeight 恒等于 clientHeight，量多少次都量不出溢出 ——
 * 「先量、再决定裁不裁」的写法结论永远是「不裁」，功能等于没做（实测踩过：千字感悟
 * 一张都没折，页面还是一片正常）。所以未知就先截断、量出「确实没放满」再从折叠态放开。
 * 反过来也安全：就算测量彻底失效（jsdom、老浏览器），也是老老实实截断，不会把内容撑爆。
 */
export function useClampCollapse<T extends HTMLElement>({
  contentKey,
  skippable,
}: ClampCollapseOptions) {
  const [expanded, setExpanded] = useState(false);
  /**
   * 折叠结论。null = 还没量过、或结论已作废（见 invalidate），此时按「会被截断」渲染。
   * 只有量出「确实没超」才变成 false，也就是那一帧起才不再截断。
   */
  const [truncated, setTruncated] = useState<boolean | null>(skippable ? false : null);
  const measureRef = useRef<T | null>(null);

  // 换了内容就不能沿用上一条的结论，也不能还停在展开态。
  const [measuredKey, setMeasuredKey] = useState(contentKey);
  if (measuredKey !== contentKey) {
    setMeasuredKey(contentKey);
    setTruncated(skippable ? false : null);
    setExpanded(false);
  }

  // 量一次就够：量的时候必然是折叠态（见上面 truncated 的说明），展开态量不到溢出。
  useLayoutEffect(() => {
    if (expanded || skippable || truncated !== null) return;
    const el = measureRef.current;
    if (!el) return;
    setTruncated(isOverflowing(el.scrollHeight, el.clientHeight));
  }, [expanded, skippable, truncated, contentKey]);

  /**
   * 上限变了就作废结论、重量一次：宽度变了（桌面 → 手机）、视口高度变了（转屏、地址栏
   * 收放），同一段文字折不折出来的答案就不一样了。展开态先留着手上的结论 —— 收起来
   * 那一刻自然会重算。已经作废（null）时这次调用只是空转，不会多渲染一轮。
   */
  const invalidate = useCallback(() => setTruncated(null), []);

  // 宽度一变，结论作废：窄屏被截断的，宽屏可能两行就放下了；反过来更常见 —— 桌面看
  // 好好的，手机上一开就撑满屏。观察被截断的那个元素：它是个块级元素，宽度只由外层
  // 容器决定，不随折叠/展开变，所以不会自己触发自己（折叠只换行数，不换宽度）。
  // 只拖宽不拖高的窗口边、转屏、折叠屏展开都在这儿兜住。视口高度这类不体现在元素宽度
  // 上的上限，由用它的组件另外调 invalidate。
  useLayoutEffect(() => {
    if (skippable) return;
    const el = measureRef.current;
    if (!el) return;

    let width = el.clientWidth;
    const onWidthChange = () => {
      const next = el.clientWidth;
      if (next === width) return;
      width = next;
      invalidate();
    };

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(onWidthChange);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', onWidthChange);
    return () => window.removeEventListener('resize', onWidthChange);
  }, [skippable, invalidate]);

  return {
    /** 当前该不该截断：量出会截断、或还没量完，且用户没点开。 */
    clamped: !expanded && truncated !== false,
    truncated,
    expanded,
    toggle: useCallback(() => setExpanded((prev) => !prev), []),
    measureRef,
    invalidate,
  };
}
