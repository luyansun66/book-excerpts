// ─── Library Building Illustration ──────────────────────────────────────────────
// SVG inlined via raw import.
// Uses the padding-bottom aspect-ratio hack (works on ALL browsers, including
// older Safari where `aspect-ratio` is unsupported).
//
// SVG viewBox: 0 0 918.8 813.4 → aspect ratio ≈ 813.4/918.8 ≈ 88.5%
// 浅色/深色是同一张插画的两版导出（结构和坐标完全一致，只有配色和飘带文字不同），
// 跟着系统外观切换，见下面的 usePrefersDark。

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import lightSvg from '../../assets/library-decoration.svg?raw';
import darkSvg from '../../assets/library-decoration-dark.svg?raw';

interface LibraryBuildingProps {
  onClockClick?: () => void;
  onMailboxClick?: () => void;
  /** 今天的信还没拆 → 在邮筒右上角亮一个未读气泡。 */
  hasUnreadLetter?: boolean;
}

// 未读气泡的定位：圆心落在邮筒右上角外侧，与小黄旗零重叠。
// 都用百分比，插画缩放时气泡自动跟随，不需要监听 resize。
// 数值由插画 viewBox(918.8 × 813.4) 换算：圆心 (838.3, 582)、直径 13px @320 宽。
const UNREAD_BADGE = {
  left: '91.24%',
  top: '71.55%',
  size: '4.0625%',   // 13 / 320
} as const;

/**
 * 邮筒右上角的未读信封气泡。纯装饰，不接收指针事件，以免挡住邮筒的点击。
 *
 * 外层只负责定位（含 translate 居中），内层才做 scale —— motion 会接管内层的
 * transform，两者放同一个元素上，居中位移会被动效覆盖掉。
 */
function UnreadBadge() {
  const reduceMotion = useReducedMotion();
  return (
    <span
      aria-hidden="true"
      data-unread-badge=""
      style={{
        position: 'absolute',
        left: UNREAD_BADGE.left,
        top: UNREAD_BADGE.top,
        width: UNREAD_BADGE.size,
        height: 0,
        paddingBottom: UNREAD_BADGE.size,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
    >
      <motion.span
        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 24, mass: 0.6 }}
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: '#C0392B',
          // 米色描边圈把气泡从邮筒上「抬」起来，不然红压红会糊成一团
          boxShadow: '0 0 0 1.5px var(--color-bg), 0 1px 3px rgba(60, 40, 20, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="#fff"
             strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.6" />
          <path d="M3.6 6.6 12 12.9l8.4-6.3" />
        </svg>
      </motion.span>
    </span>
  );
}

// 插画里两处可点的东西墨迹都很小：邮筒整块才约 25×53 CSS px（而且「旗子 + 身子 +
// 细杆 + 底座」之间有空隙，按上去经常落空），挂钟约 19×23 CSS px。所以各补一块透明
// 命中矩形，把可点范围撑到至少 48×48 CSS px（iOS HIG 的最小点击尺寸是 44，再留点余量）。
// 矩形跟着 SVG 的用户单位走，缩放时自动跟着变，不需要监听 resize。
const MIN_TAP_PX = 48;
const SVG_NS = 'http://www.w3.org/2000/svg';

interface InkBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TapTarget {
  selector: string;
  /** 墨迹在插画 viewBox(918.8 × 813.4) 里的范围，浏览器里由 getBBox() 实测，
   *  这里只是给没有布局引擎的环境（jsdom）兜底，保证命中区始终有确定尺寸。 */
  fallbackBox: InkBox;
}

const TAP_TARGETS: TapTarget[] = [
  { selector: '#time-mailbox', fallbackBox: { x: 757.2, y: 606.8, width: 72.7, height: 151.9 } },
  { selector: '#reading-clock', fallbackBox: { x: 465.9, y: 443, width: 53.5, height: 65.4 } },
];

function inkBox(node: SVGGraphicsElement, fallbackBox: InkBox): InkBox {
  try {
    const box = node.getBBox();
    if (box && box.width > 0 && box.height > 0) return box;
  } catch {
    // jsdom 没有 getBBox，走兜底
  }
  return fallbackBox;
}

function ensureHitArea(node: SVGGraphicsElement, box: InkBox, unitsPerPx: number) {
  if (node.querySelector('[data-tap-hit]')) return;   // StrictMode 下 effect 会跑两次

  const minUnits = MIN_TAP_PX * unitsPerPx;
  const width = Math.max(box.width, minUnits);
  const height = Math.max(box.height, minUnits);

  const hit = node.ownerDocument.createElementNS(SVG_NS, 'rect');
  hit.setAttribute('data-tap-hit', '');
  hit.setAttribute('x', String(box.x + (box.width - width) / 2));
  hit.setAttribute('y', String(box.y + (box.height - height) / 2));
  hit.setAttribute('width', String(width));
  hit.setAttribute('height', String(height));
  // transparent 也是「有涂色」，默认的 pointer-events:visiblePainted 就会命中；
  // 再显式写 all，免得以后有人把它改成 fill="none" 又把命中区弄丢。
  hit.setAttribute('fill', 'transparent');
  hit.setAttribute('pointer-events', 'all');
  // 插画整体不接收指针事件（见下面 effect 里的说明），所以光标要热区自己带。
  hit.setAttribute('style', 'cursor:pointer');

  node.insertBefore(hit, node.firstChild);
}

// 插画最宽按 320px 渲染，命中区必须按「SVG 用户单位 / CSS px」换算，否则小屏上撑不到 48px。
function unitsPerPxOf(svg: SVGSVGElement) {
  const renderedWidth = svg.getBoundingClientRect().width;
  const viewWidth = svg.viewBox.baseVal.width || renderedWidth || 1;
  return viewWidth / (renderedWidth || viewWidth);
}

// 深色模式用夜版插画。判据跟 styles/tokens.css 里的 @media (prefers-color-scheme: dark)
// 保持一致 —— 应用里没有主题切换入口，系统外观就是唯一真源，所以不复用 .dark class。
const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribeDark(onChange: () => void) {
  // jsdom / 老浏览器没有 matchMedia，此时永远按浅色渲染。
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function usePrefersDark() {
  return useSyncExternalStore(
    subscribeDark,
    () => typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

export default function LibraryBuilding({ onClockClick, onMailboxClick, hasUnreadLetter }: LibraryBuildingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDarkArt = usePrefersDark();
  const svgContent = isDarkArt ? darkSvg : lightSvg;

  useEffect(() => {
    const root = containerRef.current;
    const svg = root?.querySelector<SVGSVGElement>('svg');
    if (!root || !svg) return;

    // 夜版插画比日版多了几层「天上 + 地上」的装饰（星空、中景暖光、地面光斑），
    // 它们都画在建筑之后 —— SVG 里后画的在上层，正好盖住挂钟那一片，点下去命中的是装饰，
    // closest('#reading-clock') 直接落空。与其挨个给装饰加 pointer-events="none"
    // （每次重新导出都会丢、还得重新找），不如把整张插画关掉指针事件，只把两块热区
    // 单独放回来：装饰再多也盖不住。
    svg.style.pointerEvents = 'none';

    // 标一下这是哪一版插画。st* class 名每轮重新导出都会被 Illustrator 重排，
    // 飘带文字也改成形状了，导出的内部结构没有一处能当稳定判据，所以自己打标记。
    svg.setAttribute('data-art', isDarkArt ? 'dark' : 'light');

    const unitsPerPx = unitsPerPxOf(svg);
    // 插画是静态注入的，命中区补一次就够（ensureHitArea 内部做了重复检查）。
    for (const { selector, fallbackBox } of TAP_TARGETS) {
      const node = root.querySelector<SVGGraphicsElement>(selector);
      if (node) ensureHitArea(node, inkBox(node, fallbackBox), unitsPerPx);
    }
    // 换插画时 React 会重灌 innerHTML，命中区得跟着重补，所以依赖 svgContent。
  }, [svgContent, isDarkArt]);

  const playLidPop = () => {
    const lid = containerRef.current?.querySelector('#time-mailbox-lid');
    if (!lid) return;
    lid.classList.remove('mailbox-lid-pop');
    // Force reflow so the animation can restart on rapid clicks.
    void (lid as SVGGraphicsElement).getBoundingClientRect();
    lid.classList.add('mailbox-lid-pop');
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== 'function') return;

    if (target.closest('#reading-clock')) {
      onClockClick?.();
      return;
    }

    if (target.closest('#time-mailbox')) {
      playLidPop();
      onMailboxClick?.();
    }
  };

  return (
    <div style={{ width: '100%', maxWidth: 320, margin: '0 auto' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingBottom: '88.5%',
          overflow: 'hidden',
        }}
      >
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: svgContent }}
          onClick={handleClick}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            lineHeight: 0,
          }}
        />
        {hasUnreadLetter && <UnreadBadge />}
      </div>
    </div>
  );
}
