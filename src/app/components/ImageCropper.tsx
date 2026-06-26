// ─── Simple image crop dialog ─────────────────────────────────────────────────
import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageCropperProps {
  src: string;             // data URL
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

export default function ImageCropper({ src, onCrop, onCancel }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection rect (percentage of displayed image)
  const [sel, setSel] = useState({ x: 10, y: 10, w: 80, h: 60 });
  const [dragging, setDragging] = useState<null | 'move' | 'nw' | 'ne' | 'sw' | 'se'>(null);
  const dragStart = useRef({ x: 0, y: 0, sel: { x: 0, y: 0, w: 0, h: 0 } });

  const onPointerDown = useCallback((e: React.PointerEvent, handle: typeof dragging) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(handle);
    dragStart.current = { x: e.clientX, y: e.clientY, sel: { ...sel } };
  }, [sel]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const dx = (e.clientX - dragStart.current.x) / containerRef.current.clientWidth * 100;
    const dy = (e.clientY - dragStart.current.y) / containerRef.current.clientHeight * 100;
    const s = dragStart.current.sel;
    let { x, y, w, h } = s;

    if (dragging === 'move') { x = s.x + dx; y = s.y + dy; }
    else if (dragging === 'se') { w = s.w + dx; h = s.h + dy; }
    else if (dragging === 'nw') { x = s.x + dx; y = s.y + dy; w = s.w - dx; h = s.h - dy; }
    else if (dragging === 'ne') { y = s.y + dy; w = s.w + dx; h = s.h - dy; }
    else if (dragging === 'sw') { x = s.x + dx; w = s.w - dx; h = s.h + dy; }

    // Clamp
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    w = Math.max(5, Math.min(100 - x, w));
    h = Math.max(5, Math.min(100 - y, h));
    setSel({ x, y, w, h });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(null), []);

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const cw = img.naturalWidth;
    const ch = img.naturalHeight;
    const sx = Math.round(sel.x / 100 * cw);
    const sy = Math.round(sel.y / 100 * ch);
    const sw = Math.round(sel.w / 100 * cw);
    const sh = Math.round(sel.h / 100 * ch);
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    onCrop(canvas.toDataURL('image/jpeg', 0.9));
  };

  // Handle touch events via pointer events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        background: '#000',
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
          <X size={20} />
        </button>
        <span style={{ color: '#fff', fontSize: 14, fontFamily: '-apple-system, sans-serif', fontWeight: 600 }}>
          选择识别区域
        </span>
        <button onClick={handleCrop} style={{
          background: '#d4a830', border: 'none', borderRadius: 6,
          padding: '8px 18px', color: '#2c2416', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          识别
        </button>
      </div>

      {/* Image area */}
      <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' }}>
        <img
          ref={imgRef}
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
          draggable={false}
        />

        {/* Dimmed overlay outside selection */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {/* Top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${sel.y}%`, background: 'rgba(0,0,0,0.5)' }} />
          {/* Bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${100 - sel.y - sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
          {/* Left */}
          <div style={{ position: 'absolute', top: `${sel.y}%`, left: 0, width: `${sel.x}%`, height: `${sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
          {/* Right */}
          <div style={{ position: 'absolute', top: `${sel.y}%`, right: 0, width: `${100 - sel.x - sel.w}%`, height: `${sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
        </div>

        {/* Selection rectangle */}
        <div
          style={{
            position: 'absolute', left: `${sel.x}%`, top: `${sel.y}%`,
            width: `${sel.w}%`, height: `${sel.h}%`,
            border: '2px solid #d4a830', boxSizing: 'border-box',
            pointerEvents: 'auto', cursor: dragging === 'move' ? 'grabbing' : 'grab',
          }}
          onPointerDown={(e) => onPointerDown(e, 'move')}
        >
          {/* Corner handles */}
          {['nw', 'ne', 'sw', 'se'].map((h) => (
            <div
              key={h}
              onPointerDown={(e) => onPointerDown(e, h as typeof dragging)}
              style={{
                position: 'absolute',
                width: 20, height: 20,
                background: '#d4a830', borderRadius: '50%',
                ...(h.includes('n') ? { top: -10 } : { bottom: -10 }),
                ...(h.includes('w') ? { left: -10 } : { right: -10 }),
                cursor: `${h}-resize`, pointerEvents: 'auto',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
