// ─── Simple image crop dialog ─────────────────────────────────────────────────
// Works with both touch (mobile) and mouse (desktop) events.

import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageCropperProps {
  src: string;
  onCrop: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export default function ImageCropper({ src, onCrop, onCancel }: ImageCropperProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [sel, setSel] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [dragging, setDragging] = useState<Handle | null>(null);
  const drag = useRef({ startX: 0, startY: 0, sel: { x: 0, y: 0, w: 0, h: 0 } });

  // Shared start/move/end for both touch and mouse
  const startDrag = (clientX: number, clientY: number, handle: Handle) => {
    setDragging(handle);
    drag.current = { startX: clientX, startY: clientY, sel: { ...sel } };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = (clientX - drag.current.startX) / rect.width * 100;
    const dy = (clientY - drag.current.startY) / rect.height * 100;

    let { x, y, w, h } = drag.current.sel;
    switch (dragging) {
      case 'move': x += dx; y += dy; break;
      case 'se':   w += dx; h += dy; break;
      case 'nw':   x += dx; y += dy; w -= dx; h -= dy; break;
      case 'ne':   y += dy; w += dx; h -= dy; break;
      case 'sw':   x += dx; w -= dx; h += dy; break;
    }
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    w = Math.max(8, Math.min(100 - x, w));
    h = Math.max(8, Math.min(100 - y, h));
    setSel({ x, y, w, h });
  };

  const endDrag = () => setDragging(null);

  // ── Mouse events ──────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent, handle: Handle) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY, handle);
  };

  // ── Touch events ──────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent, handle: Handle) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY, handle);
  };

  // Attach move/end to document for reliable tracking
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      moveDrag(clientX, clientY);
    };
    const onEnd = () => endDrag();
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  }, [dragging]);

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

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column',
        background: '#000',
      }}
    >
      {/* Header — with safe area padding */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '44px 16px 8px', flexShrink: 0,
      }}>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
          padding: '8px 12px', fontSize: 15,
        }}>
          <X size={22} />
        </button>
        <span style={{ color: '#fff', fontSize: 15, fontFamily: '-apple-system, sans-serif', fontWeight: 600 }}>
          选择识别区域
        </span>
        <button onClick={handleCrop} style={{
          background: '#d4a830', border: 'none', borderRadius: 8,
          padding: '10px 22px', color: '#2c2416', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', zIndex: 10,
        }}>
          识别
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
          draggable={false}
        />

        {/* Dimmed overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${sel.y}%`, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${100 - sel.y - sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: `${sel.y}%`, left: 0, width: `${sel.x}%`, height: `${sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'absolute', top: `${sel.y}%`, right: 0, width: `${100 - sel.x - sel.w}%`, height: `${sel.h}%`, background: 'rgba(0,0,0,0.5)' }} />
        </div>

        {/* Selection box */}
        <div
          style={{
            position: 'absolute', left: `${sel.x}%`, top: `${sel.y}%`,
            width: `${sel.w}%`, height: `${sel.h}%`,
            border: '2px solid #d4a830', boxSizing: 'border-box',
            pointerEvents: 'auto',
          }}
          onMouseDown={(e) => onMouseDown(e, 'move')}
          onTouchStart={(e) => onTouchStart(e, 'move')}
        >
          {/* Corner handles — larger for touch */}
          {(['nw','ne','sw','se'] as const).map((h) => (
            <div
              key={h}
              onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, h); }}
              onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e, h); }}
              style={{
                position: 'absolute',
                width: 36, height: 36,
                margin: -18,
                ...(h.includes('n') ? { top: 0 } : { bottom: 0 }),
                ...(h.includes('w') ? { left: 0 } : { right: 0 }),
                cursor: `${h}-resize`, pointerEvents: 'auto',
                zIndex: 5,
              }}
            >
              {/* Visible dot inside handle */}
              <div style={{
                width: 14, height: 14, borderRadius: '50%',
                background: '#d4a830', border: '2px solid #fff',
                margin: '11px auto',
              }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
