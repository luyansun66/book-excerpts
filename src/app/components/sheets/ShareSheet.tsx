import { useState, useRef, useEffect } from 'react';
import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Quote, ThemePreset } from '../../types';
import catSvg from '../../../assets/icon-cat.svg?raw';

// ─── Theme presets ────────────────────────────────────────────────────────────
const PRESETS: ThemePreset[] = [
  { id: 'warm', name: '暖黄复古', bgColor: '#FFFDF4', textColor: '#333333', accentColor: '#d4a830', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'clean', name: '极简白', bgColor: '#ffffff', textColor: '#1a1a1a', accentColor: '#555555', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'dark', name: '深色典雅', bgColor: '#2c2416', textColor: '#e8ddd0', accentColor: '#d4a830', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'green', name: '清新绿', bgColor: '#f0f5ec', textColor: '#2d4a2e', accentColor: '#5a8a5c', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'blue', name: '静谧蓝', bgColor: '#eef3f8', textColor: '#2c3e50', accentColor: '#5a7a9a', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'cream', name: '暖白', bgColor: '#FEFCF8', textColor: '#333333', accentColor: '#d4a830', fontFamily: "'FWKaiShu', Georgia, serif" },
  { id: 'navy', name: '深蓝', bgColor: '#233073', textColor: '#CBECFE', accentColor: '#d4a830', fontFamily: "'FWKaiShu', Georgia, serif" },
];

// Preview at 270px, output at 1080px wide (scale=4), height auto
const CARD_W = 270; // preview width — output is 1080×1440

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
}

export default function ShareSheet({ open, onClose, quote, bookTitle, bookAuthor }: ShareSheetProps) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const theme = PRESETS[themeIndex];
  const cardRef = useRef<HTMLDivElement>(null);

  // Adaptive font size based on text length
  const quoteLen = quote.text.length;
  const quoteFontSize =
    quoteLen <= 50 ? 15 :
    quoteLen <= 100 ? 13.5 :
    quoteLen <= 180 ? 12 :
    quoteLen <= 300 ? 11 :
    quoteLen <= 500 ? 10 :
    9;

  // Cleanup object URL when component unmounts
  const imageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    imageUrlRef.current = imageUrl;
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, [imageUrl]);

  // html2canvas can't parse `oklch()` colors (Tailwind CSS 4 default).
  // Walk the cloned element subtree and override any computed style containing
  // `oklch` with an inline style — preventing html2canvas's CSS parser from choking.
  const onClone = async (_doc: Document, _element: HTMLElement) => {
    // Force-load the custom font in the cloned document (fonts.ready may
    // resolve immediately when no font is actively loading in the clone)
    try {
      await _doc.fonts.load('14px "FWKaiShu"');
    } catch { /* fallback fonts will be used */ }

    const walk = (el: HTMLElement) => {
      const cs = _doc.defaultView?.getComputedStyle(el);
      if (!cs) return;
      for (let i = 0; i < cs.length; i++) {
        const prop = cs[i];
        if (cs.getPropertyValue(prop).includes('oklch')) {
          const isBg = /background|bg/i.test(prop);
          el.style.setProperty(prop, isBg ? 'transparent' : theme.textColor, 'important');
        }
      }
      Array.from(el.children).forEach((c) => walk(c as HTMLElement));
    };
    walk(_element);
  };

  const handleSave = async () => {
    if (!cardRef.current || saving) return;
    setSaving(true);
    setErrorMsg(null);
    setImageUrl(null);
    try {
      // Ensure the custom font is loaded before capturing
      try {
        await document.fonts.load('14px "FWKaiShu"');
      } catch { /* fallback fonts will be used */ }

      // Dynamic import html2canvas
      const html2canvas = (await import('html2canvas')).default;

      // Capture at natural (auto) height, scale=4 → output width 1080px
      const rawCanvas = await html2canvas(cardRef.current, {
        backgroundColor: theme.bgColor,
        scale: 4,
        useCORS: true,
        allowTaint: false,
        logging: false,
        onclone: onClone,
      });

      // Output at 1080px wide with dynamic height (no fixed aspect ratio)
      const TARGET_W = 1080;
      const TARGET_H = rawCanvas.height;
      const canvas = document.createElement('canvas');
      canvas.width = TARGET_W;
      canvas.height = TARGET_H;
      const ctx = canvas.getContext('2d')!;

      // Fill background
      ctx.fillStyle = theme.bgColor;
      ctx.fillRect(0, 0, TARGET_W, TARGET_H);

      // Draw at native resolution (scale=4 already gives us 1080px width)
      ctx.drawImage(rawCanvas, 0, 0);

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) {
        throw new Error('图片生成失败，请重试');
      }

      // Create object URL
      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      // Also try to share (iOS/Android system share sheet → user can save to photos)
      const shareFile = new File([blob], `摘录-${bookTitle}.png`, { type: 'image/png' });
      // Check if share is available — use feature detection
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({
            title: `摘录 - ${bookTitle}`,
            files: [shareFile],
          });
          // User completed sharing — done
          setSaving(false);
          return;
        } catch {
          // User cancelled share or share failed — image is already displayed below,
          // user can long-press to save. No action needed.
        }
      }

      // Fallback: on desktop, try download via link
      if (window.navigator.userAgent.includes('Windows') || window.navigator.userAgent.includes('Macintosh') || window.navigator.userAgent.includes('Linux')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `摘录-${bookTitle}.png`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 300);
      }
    } catch (err: any) {
      const msg = err?.message || '图片生成失败';
      console.error('Save image failed:', err);
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={(e) => {
        // Close when tapping backdrop, release object URL
        if (e.target === e.currentTarget) {
          if (imageUrl) URL.revokeObjectURL(imageUrl);
          onClose();
        }
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '92vh',
          background: '#F6F0E7',
          borderRadius: '20px 20px 0 0',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 20px 28px',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d4c4a0' }} />
        </div>

        {/* Header */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontFamily: "'FWKaiShu', Georgia, serif",
              fontWeight: 'bold',
              color: '#2c2416',
            }}
          >
            分享摘录
          </h3>
          <button
            onClick={() => { if (imageUrl) URL.revokeObjectURL(imageUrl); onClose(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <X size={18} color="#8a7a60" />
          </button>
        </div>

        {/* Card preview — simple block layout, no overflow hidden or ellipsis
            html2canvas has known flexbox height miscalculation issues with
            overflow:hidden + textOverflow:ellipsis, which clips the last line.
            A share card should show ALL content — no clipping at all. */}
        <div
          ref={cardRef}
          style={{
            width: CARD_W,
            padding: '28px 26px 22px',
            background: theme.bgColor,
            borderRadius: 12,
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              fontFamily: theme.fontFamily,
              fontSize: Math.min(quoteFontSize * 1.8, 34),
              color: theme.accentColor,
              lineHeight: 0.7,
              opacity: 0.35,
              userSelect: 'none',
              marginBottom: 4,
            }}
          >
            &ldquo;
          </span>
          <p
            style={{
              fontFamily: theme.fontFamily,
              fontSize: quoteFontSize,
              lineHeight: 1.7,
              color: theme.textColor,
              margin: 0,
              padding: '0 2px',
              wordBreak: 'break-word',
              textAlign: 'justify',
            }}
          >
            {quote.text}
          </p>
          <div style={{ textAlign: 'right', marginTop: 2 }}>
            <span
              style={{
                fontFamily: theme.fontFamily,
                fontSize: Math.min(quoteFontSize * 1.8, 34),
                color: theme.accentColor,
                lineHeight: 0.7,
                opacity: 0.35,
                userSelect: 'none',
              }}
            >
              &rdquo;
            </span>
          </div>
          {quote.thought && (
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: theme.textColor,
                opacity: 0.5,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                borderTop: `1px solid ${theme.accentColor}22`,
                paddingTop: 8,
                marginTop: 4,
              }}
            >
              {quote.thought.length > 80 ? quote.thought.slice(0, 78) + '…' : quote.thought}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginTop: 8,
              height: 55,
            }}
          >
            {/* Cat icon — fill matches text color on dark themes */}
            <div
              dangerouslySetInnerHTML={{
                __html: ['navy', 'dark'].includes(theme.id)
                  ? catSvg.replace(/#442e1e/g, theme.textColor)
                  : catSvg,
              }}
              style={{
                width: 30,
                height: 45,
                opacity: 0.9,
                flex: 'none',
                lineHeight: 0,
              }}
            />
            <div style={{ textAlign: 'right', flex: 1 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'Georgia, serif',
                  color: theme.accentColor,
                  lineHeight: 1.3,
                }}
              >
                {bookTitle}
              </div>
              <div
                style={{
                  fontSize: 8.5,
                  color: theme.textColor,
                  opacity: 0.5,
                  fontFamily: 'Georgia, serif',
                  marginTop: 1,
                }}
              >
                {bookAuthor}
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: theme.textColor,
                  opacity: 0.35,
                  fontFamily: 'Georgia, serif',
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {quote.page != null && <span>P.{quote.page} · </span>}
                <span>{quote.date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Theme switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <button
            onClick={() => { setImageUrl(null); setThemeIndex((i) => (i - 1 + PRESETS.length) % PRESETS.length); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <ChevronLeft size={16} color="#8a7a60" />
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {PRESETS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { setImageUrl(null); setThemeIndex(i); }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  border: i === themeIndex ? '2px solid #2c2416' : '1px solid #d4c4a0',
                  background: p.bgColor,
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
          <button
            onClick={() => { setImageUrl(null); setThemeIndex((i) => (i + 1) % PRESETS.length); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            <ChevronRight size={16} color="#8a7a60" />
          </button>
        </div>
        <div
          style={{
            fontSize: 10,
            color: '#b8ae9a',
            fontFamily: '-apple-system, sans-serif',
            marginTop: 4,
          }}
        >
          {PRESETS[themeIndex].name}
        </div>

        {/* Save button */}
        <div style={{ marginTop: 18, width: '100%' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '13px 0',
              borderRadius: 10,
              border: 'none',
              background: saving ? '#5a4a3a' : '#2a1e0e',
              color: '#f0e8d4',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5,
            }}
          >
            <Download size={15} />
            {saving ? '生成中…' : '保存图片'}
          </button>
        </div>

        {/* Generated image — shown after generation */}
        {imageUrl && (
          <div
            style={{
              width: '100%',
              marginTop: 14,
              padding: 14,
              background: 'rgba(255,255,255,0.5)',
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <p
              style={{
                fontSize: 11,
                color: '#8a7a60',
                fontFamily: '-apple-system, sans-serif',
                margin: 0,
                fontWeight: 600,
              }}
            >
              ✅ 图片已生成 — 长按↓保存到相册
            </p>
            <img
              src={imageUrl}
              alt="摘录卡片"
              style={{
                width: '100%',
                maxHeight: 320,
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                background: theme.bgColor,
              }}
            />
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: '#c0392b',
              fontFamily: '-apple-system, sans-serif',
              textAlign: 'center',
              padding: '8px 16px',
              background: '#fff0ec',
              borderRadius: 8,
            }}
          >
            ❌ {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
