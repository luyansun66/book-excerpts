// ─── Library Building Illustration ──────────────────────────────────────────────
// SVG inlined via raw import.
// Uses the padding-bottom aspect-ratio hack (works on ALL browsers, including
// older Safari where `aspect-ratio` is unsupported).
//
// SVG viewBox: 0 0 882.2 781 → aspect ratio ≈ 781/882.2 ≈ 88.5%

import { useRef } from 'react';
import svgContent from '../../assets/library-decoration.svg?raw';

interface LibraryBuildingProps {
  onClockClick?: () => void;
  onMailboxClick?: () => void;
}

export default function LibraryBuilding({ onClockClick, onMailboxClick }: LibraryBuildingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

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
