import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

// ─── 摘录下方的感悟：过长时折叠 ────────────────────────────────────────────────
//
// 感悟是用户随手写的分析，长度不受控：一篇千字长文挂在摘录下面，能把一张卡片撑满
// 好几屏，后面的摘录全被顶出视野。这里给它一个默认高度上限，想看全文就地展开。
//
// 截断交给 CSS（-webkit-line-clamp），由浏览器按真实排版算，中英混排、标点避头尾、
// 换行都算得准 —— 项目里已经用在分类网格的书名和复习卡片正文上。
//
// 方向很重要：**先按「会被截断」渲染，再量**。整段渲染时 scrollHeight 恒等于
// clientHeight，量多少次都量不出溢出 —— 「先量、再决定裁不裁」的写法结论永远是
// 「不裁」，功能等于没做（实测踩过：千字感悟一张都没折，页面还是一片正常）。
// 所以未知就先截断、量出「确实没超 N 行」再从折叠态放开。反过来也安全：
// 就算测量彻底失效（jsdom、老浏览器），也是老老实实截断，不会把内容撑爆。

/** 折叠时最多显示几行。改动请连卡片整体高度一起看，别顺手往上加。 */
export const THOUGHT_MAX_LINES = 3;

/**
 * 亚像素误差会让「刚好 N 行」的内容量出 1px 的差，不设容差就会给一行感悟挂上展开按钮。
 * 一行 20.6px，真的多出一行不会差这么点。
 */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * 短到不可能溢出的判据，用来跳过测量（一屏几百条摘录时能省下绝大多数测量和观察）。
 * 按最窄的手机算：320px 屏、去掉各处内边距后一行只放得下约 16 个汉字，这里按 10 个算，
 * 留足余量 —— N 行以内、且没有换行，就一定不会超。
 */
const CHARS_PER_LINE_GUESS = 10;

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", sans-serif';

/**
 * 折叠态专用的整理：`pre-wrap` 下空行是实打实的一行，而折叠后总共只有几行 ——
 * 一段以几个空行开头的感悟，不加处理会变成一个「空的灰框 + 展开按钮」。
 * 所以开头的空行直接去掉，中间连续空行压成一个（段落间隔还在）。
 * 只作用于折叠态：展开后是用户写的原文，一个字都不动。
 */
export function collapseBlankLines(text: string): string {
  return text.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

/** 短到不用量：没有换行、总长也远小于 maxLines 行能装的字数。 */
export function canSkipMeasurement(thought: string, maxLines: number = THOUGHT_MAX_LINES): boolean {
  return !thought.includes('\n') && thought.length <= CHARS_PER_LINE_GUESS * maxLines;
}

/** 折叠后内容比可见区高，就是被截断了 —— 只有这时才该给展开按钮。 */
export function isOverflowing(scrollHeight: number, clientHeight: number): boolean {
  return scrollHeight > clientHeight + OVERFLOW_TOLERANCE_PX;
}

/**
 * 灰框：底色和内边距归这一层。
 *
 * 内边距不能写在被截断的那个元素上 —— `-webkit-line-clamp` 的裁剪边界是 padding box
 * 而不是行边界，底部内边距会变成一条「缝」：下一行的字头正好从缝里漏出来，看着就是
 * 一行被腰斩的字（无头 Chrome 逐行扫像素实测，6px 内边距漏出 3px 字头）。
 * 分开之后，被截断的元素自己没有内边距，裁剪边界和行边界重合，缝就没了。
 */
const BOX_STYLE: CSSProperties = {
  margin: '2px 0 0',
  background: 'var(--color-bg-thought)',
  padding: '6px 10px',
  borderRadius: 6,
};

const TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 12.5,
  lineHeight: 1.65,
  color: 'var(--color-quote-thought)',
  whiteSpace: 'pre-wrap',
  // 长英文单词 / URL 不会自己断行，会把卡片横向顶出去
  overflowWrap: 'anywhere',
  overflow: 'hidden',
};

const ARROW_STYLE: CSSProperties = {
  color: 'var(--color-quote-mark)',
  fontSize: 13,
  lineHeight: 1,
  marginTop: 3,
  flexShrink: 0,
  userSelect: 'none',
};

const TOGGLE_STYLE: CSSProperties = {
  margin: '4px 0 0 10px',
  padding: 0,
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontFamily: SANS,
  fontSize: 11,
  lineHeight: 1.4,
  color: 'var(--color-quote-thought)',
  opacity: 0.75,
};

interface CollapsibleThoughtProps {
  thought: string;
  maxLines?: number;
}

export default function CollapsibleThought({
  thought,
  maxLines = THOUGHT_MAX_LINES,
}: CollapsibleThoughtProps) {
  const skippable = canSkipMeasurement(thought, maxLines);
  const [expanded, setExpanded] = useState(false);
  /**
   * 折叠结论。null = 还没量过、或结论已作废（宽度变了），此时按「会被截断」渲染。
   * 只有量出「确实没超 maxLines 行」才变成 false，也就是那一帧起才不再截断。
   */
  const [truncated, setTruncated] = useState<boolean | null>(skippable ? false : null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // 换了内容（编辑摘录、翻到另一条）就不能沿用上一条的结论，也不能还停在展开态。
  const [measuredThought, setMeasuredThought] = useState(thought);
  if (measuredThought !== thought) {
    setMeasuredThought(thought);
    setTruncated(canSkipMeasurement(thought, maxLines) ? false : null);
    setExpanded(false);
  }

  // 量一次就够：量的时候必然是折叠态（见上面 truncated 的说明），展开态量不到溢出。
  useLayoutEffect(() => {
    if (expanded || skippable || truncated !== null) return;
    const el = textRef.current;
    if (!el) return;
    setTruncated(isOverflowing(el.scrollHeight, el.clientHeight));
  }, [expanded, skippable, truncated, thought, maxLines]);

  // 宽度一变，结论作废：窄屏被截断的感悟，宽屏可能两行就放下了；反过来更常见 ——
  // 桌面看好好的，手机上一开就撑满屏。观察外层灰框，它的宽度不随折叠/展开变，
  // 只在真的换了可用宽度时才变，所以不会自己触发自己。
  useLayoutEffect(() => {
    if (skippable) return;
    const box = boxRef.current;
    if (!box) return;

    let width = box.clientWidth;
    const onWidthChange = () => {
      const next = box.clientWidth;
      if (next === width) return;
      width = next;
      // 展开态量不到溢出（高度跟着内容长），先留着手上的结论，等收起来再重算
      if (expanded) return;
      setTruncated(null);
    };

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(onWidthChange);
      observer.observe(box);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', onWidthChange);
    return () => window.removeEventListener('resize', onWidthChange);
  }, [skippable, expanded]);

  if (!thought) return null;

  // 折叠 = 还没量完（null）或量出会截断，且用户没点开。只有量出「放得下」才整段显示。
  const clamped = !expanded && truncated !== false;

  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 4, paddingLeft: 2 }}>
      <span style={ARROW_STYLE}>↳</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={boxRef} style={BOX_STYLE}>
          <p
            ref={textRef}
            style={
              clamped
                ? {
                    ...TEXT_STYLE,
                    display: '-webkit-box',
                    WebkitLineClamp: maxLines,
                    WebkitBoxOrient: 'vertical',
                  }
                : TEXT_STYLE
            }
          >
            {clamped ? collapseBlankLines(thought) : thought}
          </p>
        </div>
        {truncated === true && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            style={TOGGLE_STYLE}
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
    </div>
  );
}
