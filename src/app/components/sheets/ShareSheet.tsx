import { useState, useRef, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import type { Quote } from '../../types';
import { STICKERS } from './stickerData';

// ─── Color themes ─────────────────────────────────────────────────────────────
interface ColorTheme {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
}

const COLOR_THEMES: ColorTheme[] = [
  { id: 'athens', name: '雅典黑', bgColor: '#1B1C1F', textColor: '#F4E1B8', accentColor: '#C8A96E' },
  { id: 'deepblue', name: '深蓝', bgColor: '#233073', textColor: '#CCEDFF', accentColor: '#FFD700' },
  { id: 'darkbrown', name: '深棕色', bgColor: '#2C2415', textColor: '#D5CABE', accentColor: '#C8A96E' },
  { id: 'grayblue', name: '灰蓝', bgColor: '#6A85B6', textColor: '#FFFFFF', accentColor: '#F4E1B8' },
  { id: 'lavender', name: '烟灰紫', bgColor: '#F0EFF5', textColor: '#3B3545', accentColor: '#7A6B8E' },
  { id: 'freshgreen', name: '清新绿', bgColor: '#F0F5EC', textColor: '#2D4A2E', accentColor: '#5A8A5' },
  { id: 'plainwhite', name: '素白', bgColor: '#FAFAFA', textColor: '#2D1F16', accentColor: '#A69060' },
  { id: 'bookcream', name: '书卷米', bgColor: '#FEFCF8', textColor: '#2D1F16', accentColor: '#B08D57' },
];

// ─── Font options ─────────────────────────────────────────────────────────────
interface FontOption {
  id: string;
  name: string;
  family: string;
  face: string; // primary face for document.fonts.load
}

const FONTS: FontOption[] = [
  { id: 'system', name: '系统默认', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', face: 'system' },
  { id: 'siyuan', name: '思源宋体', family: '"SourceHanSerifCN", "Noto Serif SC", Georgia, serif', face: 'SourceHanSerifCN' },
  { id: 'lanting', name: '兰亭细黑', family: '"FZLanTingXiHei", "PingFang SC", sans-serif', face: 'FZLanTingXiHei' },
  { id: 'beiwei', name: '北魏楷书', family: '"FZBeiWeiKaiShu", "KaiTi", serif', face: 'FZBeiWeiKaiShu' },
  { id: 'songhei', name: '宋黑', family: '"FZSongHei", "PingFang SC", sans-serif', face: 'FZSongHei' },
  { id: 'xiaozhuan', name: '小篆体', family: '"FZXiaoZhuan", serif', face: 'FZXiaoZhuan' },
  { id: 'zhengxian', name: '正纤黑', family: '"FZZhengXianHei", "PingFang SC", sans-serif', face: 'FZZhengXianHei' },
  { id: 'mingchao', name: '明朝体', family: '"HuiWenMingChao", "Noto Serif SC", serif', face: 'HuiWenMingChao' },
];



// Preview at 270px, output at 1080px wide (scale=4), height auto
const CARD_W = 270;

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
}

export default function ShareSheet({ open, onClose, quote, bookTitle, bookAuthor }: ShareSheetProps) {
  const [colorIndex, setColorIndex] = useState(4); // default: bookcream (书卷米)
  const [fontIndex, setFontIndex] = useState(0);  // default: system
  const [stickerIndex, setStickerIndex] = useState(1); // default: Kitty (index 1, 0 = 无贴纸)
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState(false);
  const [html2canvasReady, setHtml2canvasReady] = useState<boolean | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);

  const color = COLOR_THEMES[colorIndex];
  const font = FONTS[fontIndex];
  const sticker = stickerIndex > 0 ? STICKERS[stickerIndex - 1] : null;

  const cardRef = useRef<HTMLDivElement>(null);
  const html2canvasRef = useRef<any>(null);

  // Pre-load html2canvas when the sheet opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHtml2canvasReady(null);
    setErrorMsg(null);
    (async () => {
      try {
        const mod = await import('html2canvas');
        if (!cancelled) {
          html2canvasRef.current = mod.default;
          setHtml2canvasReady(true);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('[ShareSheet] html2canvas preload failed:', e);
          setHtml2canvasReady(false);
          setErrorMsg('图片库加载失败，请刷新页面后重试');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

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




  const handleSave = async () => {
    if (!cardRef.current || saving) return;
    if (!html2canvasRef.current) {
      setErrorMsg('图片库未加载完成，请稍后再试');
      return;
    }

    // Preload selected font in main document before capture
    if (font.face !== 'system') {
      try {
        await document.fonts.load(`14px "${font.face}"`);
      } catch { /* continue */ }
    }

    setSaving(true);
    setErrorMsg(null);
    setImageUrl(null);

    try {
      const html2canvas = html2canvasRef.current;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });

      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      // Also try to share
      const shareFile = new File([blob], `摘录-${bookTitle}.png`, { type: 'image/png' });
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [shareFile], title: `摘录：${bookTitle}` });
        } catch (shareErr: any) {
          if (shareErr.name !== 'AbortError') {
            setSaveHint(true);
            setTimeout(() => setSaveHint(false), 6000);
          }
        }
      } else {
        setSaveHint(true);
        setTimeout(() => setSaveHint(false), 6000);
      }
    } catch (e: any) {
      console.error('[ShareSheet] Export failed:', e?.message || e, e?.stack || '');
      setErrorMsg(e?.message ? `图片生成失败：${e.message}` : '图片生成失败，请重试');
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
          background: 'var(--color-bg)',
          borderRadius: '20px 20px 0 0',
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px 20px 28px',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
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
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontWeight: 600,
              color: 'var(--color-text)',
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

        {/* Card preview */}
        <div
          ref={cardRef}
          style={{
            width: CARD_W,
            padding: '28px 26px 22px',
            background: color.bgColor,
            color: color.textColor,
            borderRadius: 0,
            boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
          }}
        >
          <span
            style={{
              fontFamily: font.family,
              fontSize: Math.min(quoteFontSize * 1.8, 34),
              color: color.accentColor,
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
              fontFamily: font.family,
              fontSize: quoteFontSize,
              lineHeight: 1.7,
              color: color.textColor,
              margin: 0,
              padding: '0 2px',
              wordBreak: 'break-word',
              textAlign: 'justify',
              textJustify: 'inter-character' as any,
              lineBreak: 'strict' as any,
              whiteSpace: 'pre-wrap',
            }}
          >
            {quote.text}
          </p>
          <div style={{ textAlign: 'right', marginTop: 2 }}>
            <span
              style={{
                fontFamily: font.family,
                fontSize: Math.min(quoteFontSize * 1.8, 34),
                color: color.accentColor,
                lineHeight: 0.7,
                opacity: 0.35,
                userSelect: 'none',
              }}
            >
              &rdquo;
            </span>
          </div>
          {showThoughts && quote.thought && (
            <div
              style={{
                fontSize: 10,
                lineHeight: 1.5,
                color: color.textColor,
                opacity: 0.5,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                borderTop: `1px solid ${color.accentColor}22`,
                paddingTop: 8,
                marginTop: 4,
                whiteSpace: 'pre-wrap',
              }}
            >
              {quote.thought}
            </div>
          )}

          {/* Bottom: sticker + book info */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              marginTop: 8,
              height: 55,
            }}
          >
            {/* Sticker — fixed bottom-left */}
            {sticker ? (
              <div
                dangerouslySetInnerHTML={{ __html: sticker.svg }}
                style={{
                  height: 40,
                  width: 'auto',
                  maxWidth: 45,
                  opacity: 0.9,
                  flex: 'none',
                  lineHeight: 0,
                  color: color.textColor,
                }}
              />
            ) : (
              <div style={{ width: 40, flex: 'none' }} />
            )}
            <div style={{ textAlign: 'right', flex: 1 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  color: color.textColor,
                  opacity: 0.6,
                  lineHeight: 1.4,
                }}
              >
                {bookTitle}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  color: color.textColor,
                  opacity: 0.6,
                  lineHeight: 1.4,
                }}
              >
                {bookAuthor}
              </div>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 400,
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  color: color.textColor,
                  opacity: 0.6,
                  lineHeight: 1.4,
                }}
              >
                {quote.page != null && <span>{/^\d+$/.test(quote.page) ? `P.${quote.page}` : quote.page} · </span>}
                <span>{quote.date}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Selectors ───────────────────────────────────────────────────── */}

        {/* Color selector */}
        <div style={{ width: '100%', marginTop: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, fontFamily: '-apple-system, sans-serif' }}>
            颜色
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {COLOR_THEMES.map((t, i) => (
              <button
                key={t.id}
                onClick={() => { setColorIndex(i); setImageUrl(null); }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: i === colorIndex ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
                  background: t.bgColor,
                  flexShrink: 0,
                  cursor: 'pointer',
                  padding: 0,
                }}
                title={t.name}
              />
            ))}
          </div>
        </div>

        {/* Font selector */}
        <div style={{ width: '100%', marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, fontFamily: '-apple-system, sans-serif' }}>
            字体
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {FONTS.map((f, i) => (
              <button
                key={f.id}
                onClick={() => { setFontIndex(i); setImageUrl(null); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: i === fontIndex ? '1px solid var(--color-btn)' : '1px solid var(--color-border-light)',
                  background: i === fontIndex ? 'var(--color-btn)' : 'var(--color-bg-card)',
                  color: i === fontIndex ? 'var(--color-btn-text)' : 'var(--color-text)',
                  fontFamily: f.family,
                  fontSize: 12,
                  flexShrink: 0,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sticker selector */}
        <div style={{ width: '100%', marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8, fontFamily: '-apple-system, sans-serif' }}>
            贴纸
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            {/* "无贴纸" option */}
              <button
                onClick={() => { setStickerIndex(0); setImageUrl(null); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: stickerIndex === 0 ? '1px solid var(--color-btn)' : '1px solid var(--color-border-light)',
                  background: stickerIndex === 0 ? 'var(--color-btn)' : 'var(--color-bg-card)',
                  flexShrink: 0,
                  cursor: 'pointer',
                  minWidth: 56,
                }}
              >
                <div style={{ height: 24, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                </div>
                <span style={{ fontSize: 9, color: stickerIndex === 0 ? 'var(--color-btn-text)' : 'var(--color-text-muted)', whiteSpace: 'nowrap', fontFamily: '-apple-system, sans-serif' }}>无</span>
              </button>
            {STICKERS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => { setStickerIndex(i + 1); setImageUrl(null); }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: i + 1 === stickerIndex ? '1px solid var(--color-btn)' : '1px solid var(--color-border-light)',
                  background: i + 1 === stickerIndex ? 'var(--color-btn)' : 'var(--color-bg-card)',
                  flexShrink: 0,
                  cursor: 'pointer',
                  minWidth: 56,
                }}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: s.svg }}
                  style={{ height: 24, width: 'auto', maxWidth: 28, lineHeight: 0, color: color.textColor }}
                />
                <span
                  style={{
                    fontSize: 9,
                    color: i + 1 === stickerIndex ? 'var(--color-btn-text)' : 'var(--color-text-muted)',
                    whiteSpace: 'nowrap',
                    fontFamily: '-apple-system, sans-serif',
                  }}
                >
                  {s.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── 包含感悟 toggle ──────────────────────────────────────── */}
        <div style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif', fontWeight: 500 }}>
            包含感悟
          </span>
          <button
            onClick={() => { setShowThoughts(!showThoughts); setImageUrl(null); }}
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              border: 'none',
              background: showThoughts ? 'var(--color-btn)' : 'var(--color-border)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              padding: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: showThoughts ? 21 : 3,
                transition: 'left 0.2s',
              }}
            />
          </button>
        </div>

        {/* Save button */}
        <div style={{ marginTop: 20, width: '100%' }}>
          <button
            onClick={handleSave}
            disabled={saving || html2canvasReady === null}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '13px 0',
              borderRadius: 10,
              border: 'none',
              background: saving || html2canvasReady === null ? '#5a4a3a' : 'var(--color-btn)',
              color: 'var(--color-btn-text)',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              cursor: saving || html2canvasReady === null ? 'not-allowed' : 'pointer',
              letterSpacing: 0.5,
            }}
          >
            <Download size={15} />
            {saving ? '生成中…' : html2canvasReady === null ? '准备中…' : '保存图片'}
          </button>
        </div>

        {/* Generated image */}
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
                color: 'var(--color-text-secondary)',
                fontFamily: '-apple-system, sans-serif',
                margin: 0,
                fontWeight: 600,
              }}
            >
              ✅ 图片已生成 — 长按↓保存到相册
            </p>
            {saveHint && (
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--color-danger)',
                  fontFamily: '-apple-system, sans-serif',
                  margin: 0,
                  fontWeight: 700,
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                💡 系统分享不可用，长按上方图片即可保存到相册
              </p>
            )}
            <img
              src={imageUrl}
              alt="摘录卡片"
              style={{
                width: '100%',
                maxHeight: 320,
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                background: color.bgColor.includes('gradient') ? '#FEFCF8' : color.bgColor,
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
              color: 'var(--color-danger)',
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
