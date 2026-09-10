// ─── Library Building Illustration ──────────────────────────────────────────────
// SVG inlined via raw import.
// Uses the padding-bottom aspect-ratio hack (works on ALL browsers, including
// older Safari where `aspect-ratio` is unsupported).
//
// SVG viewBox: 0 0 882.2 781 → aspect ratio ≈ 781/882.2 ≈ 88.5%

import { useEffect, useRef } from 'react';
import svgContent from '../../assets/library-decoration.svg?raw';

interface LibraryBuildingProps {
  onClockClick?: () => void;
  onMailboxClick?: () => void;
}

// 插画里两处可点的东西墨迹都很小：邮筒整块才约 25×51 CSS px（而且「屋顶 + 身子 +
// 细杆 + 底座」之间有空隙，按上去经常落空），挂钟约 22×27 CSS px。所以各补一块透明
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
  /** 墨迹在插画 viewBox(882.2 × 781) 里的范围，浏览器里由 getBBox() 实测，
   *  这里只是给没有布局引擎的环境（jsdom）兜底，保证命中区始终有确定尺寸。 */
  fallbackBox: InkBox;
}

const TAP_TARGETS: TapTarget[] = [
  { selector: '#time-mailbox', fallbackBox: { x: 724.5, y: 578.7, width: 70.4, height: 140.1 } },
  { selector: '#reading-clock', fallbackBox: { x: 410.1, y: 397.4, width: 60.8, height: 74.2 } },
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

  node.insertBefore(hit, node.firstChild);
}

// 插画最宽按 320px 渲染，命中区必须按「SVG 用户单位 / CSS px」换算，否则小屏上撑不到 48px。
function unitsPerPxOf(svg: SVGSVGElement) {
  const renderedWidth = svg.getBoundingClientRect().width;
  const viewWidth = svg.viewBox.baseVal.width || renderedWidth || 1;
  return viewWidth / (renderedWidth || viewWidth);
}

export default function LibraryBuilding({ onClockClick, onMailboxClick }: LibraryBuildingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = containerRef.current;
    const svg = root?.querySelector<SVGSVGElement>('svg');
    if (!root || !svg) return;

    const unitsPerPx = unitsPerPxOf(svg);
    // 插画是静态注入的，命中区补一次就够（ensureHitArea 内部做了重复检查）。
    for (const { selector, fallbackBox } of TAP_TARGETS) {
      const node = root.querySelector<SVGGraphicsElement>(selector);
      if (node) ensureHitArea(node, inkBox(node, fallbackBox), unitsPerPx);
    }
  }, []);

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
      </div>
    </div>
  );
}
