import { useState, useRef, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import type { Quote } from '../../types';
import { STICKERS, eagerStickerSvg, loadStickerSvg } from './stickers';
import {
  FONTS,
  applyCardFont,
  applyCardSticker,
  applySubsetFont,
  buildIgnoreElements,
  clearSubsetFont,
  collectCardText,
  ensureFontReady,
  fetchSubsetFont,
  preloadFont,
  subsetFamily,
} from './shareCardExport';

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
  { id: 'moss', name: '苔藓绿', bgColor: '#3F5429', textColor: '#F6D6AC', accentColor: '#D4A854' },
  { id: 'grayblue', name: '灰蓝', bgColor: '#6A85B6', textColor: '#FFFFFF', accentColor: '#F4E1B8' },
  { id: 'lavender', name: '烟灰紫', bgColor: '#F0EFF5', textColor: '#3B3545', accentColor: '#7A6B8E' },
  { id: 'freshgreen', name: '清新绿', bgColor: '#F0F5EC', textColor: '#2D4A2E', accentColor: '#5A8A5' },
  { id: 'plainwhite', name: '素白', bgColor: '#FAFAFA', textColor: '#2D1F16', accentColor: '#A69060' },
  { id: 'bookcream', name: '书卷米', bgColor: '#FEFCF8', textColor: '#2D1F16', accentColor: '#B08D57' },
];
// ─── Color helpers ────────────────────────────────────────────────────────────
function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const [R, G, B] = [r, g, b].map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function getTextColor(bgHex: string): string {
  return getLuminance(bgHex) > 0.5 ? '#2D1F16' : '#F4E1B8';
}

function getAccentColor(bgHex: string): string {
  // Use a slightly muted complementary tone
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const lum = getLuminance(bgHex);
  if (lum > 0.5) {
    // Light bg → warm accent
    return `#${Math.min(255, r + 40).toString(16).padStart(2, '0')}${Math.max(0, g - 60).toString(16).padStart(2, '0')}${Math.max(0, b - 80).toString(16).padStart(2, '0')}`;
  } else {
    // Dark bg → golden accent
    return `#${Math.min(255, r + 100).toString(16).padStart(2, '0')}${Math.min(255, Math.round(g * 0.8 + 80)).toString(16).padStart(2, '0')}${Math.max(0, b - 20).toString(16).padStart(2, '0')}`;
  }
}





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
  const [customColor, setCustomColor] = useState<string | null>(() => {
    try { return localStorage.getItem('share-custom-bg'); } catch { return null; }
  });
  const [useCustomColor, setUseCustomColor] = useState(customColor !== null);
  const [fontIndex, setFontIndex] = useState(0);  // default: system
  const [stickerIndex, setStickerIndex] = useState(1); // default: Kitty (index 1, 0 = 无贴纸)
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState(false);
  const [html2canvasReady, setHtml2canvasReady] = useState<boolean | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);
  /** 已经把 @font-face 注入好的 face（子集就位）。 */
  const [subsetReadyFace, setSubsetReadyFace] = useState<string | null>(null);
  /** 子集没拿到、已退回整套字体的 face。 */
  const [subsetFailedFace, setSubsetFailedFace] = useState<string | null>(null);
  /** 当前贴纸的 SVG 源码。选择器用 PNG 蒙版，只有卡片和导出需要真 SVG。 */
  const [stickerSvg, setStickerSvg] = useState<string | null>(null);

  const color = useCustomColor && customColor
    ? {
        id: 'custom',
        name: '自定义',
        bgColor: customColor,
        textColor: getTextColor(customColor),
        accentColor: getAccentColor(customColor),
      }
    : COLOR_THEMES[colorIndex];
  const font = FONTS[fontIndex];
  const sticker = stickerIndex > 0 ? STICKERS[stickerIndex - 1] : null;

  // 三档字体栈，优先级从高到低：
  //   子集就位   → 子集 + 系统兜底（不点名整款字体，所以不会有 7.4MB 的下载）
  //   子集在路上 → 只用系统兜底。要点：这里**不能**用 font.family ——
  //                那等于在「还没决定用哪条路」的时候就把整套字体拉下来，
  //                首访 41s 就是这么来的。
  //   子集失败   → font.family，也就是修复前的行为。
  const subsetStack = `"${subsetFamily(font.face)}", ${font.fallbackFamily}`;
  const subsetReady = font.id !== 'system' && subsetReadyFace === font.face;
  const subsetFailed = font.id !== 'system' && subsetFailedFace === font.face;
  const cardFamily = subsetReady ? subsetStack : subsetFailed ? font.family : font.fallbackFamily;

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

  // 选中字体后立刻拉「这段摘录用到的字形」子集（十几~几十 KB），而不是整套字体。
  // 拿到之前卡片先用系统兜底，拿到之后预览和导出一起切过去。
  useEffect(() => {
    if (!open) return;

    if (font.id === 'system') {
      clearSubsetFont();
      setSubsetReadyFace(null);
      setSubsetFailedFace(null);
      return;
    }

    let cancelled = false;
    setSubsetReadyFace(null);
    setSubsetFailedFace(null);
    const text = collectCardText(quote.text);
    (async () => {
      const subset = await fetchSubsetFont(font.face, text);
      // 拉取期间用户换了字体：这次结果作废，连注入都不要做，
      // 否则迟到的响应会覆盖掉新字体的 @font-face。
      if (cancelled) return;
      if (subset) {
        await applySubsetFont(subset, text);
        if (cancelled) return;
        setSubsetReadyFace(font.face);
        return;
      }
      // 子集不可用（端点没部署、CPU 超限、断网…）：回到修复前的行为。
      setSubsetFailedFace(font.face);
      preloadFont(font.face, [quote.text, font.name]);
    })();

    return () => { cancelled = true; };
  }, [open, fontIndex, font.id, font.face, font.name, quote.text]);

  // 面板关掉就放掉子集的 blob（HTTP 缓存里那份留着，再打开不会重新下载）。
  useEffect(() => {
    if (open) return;
    clearSubsetFont();
    setSubsetReadyFace(null);
    setSubsetFailedFace(null);
  }, [open]);

  // 卡片上的贴纸要真 SVG（矢量、跟随主题色），选择器里只要 PNG 蒙版。
  // 默认贴纸是静态引入的，剩下 19 张按需拉 —— 每张一个独立 chunk。
  useEffect(() => {
    if (!open || !sticker) { setStickerSvg(null); return; }
    const eager = eagerStickerSvg(sticker.id);
    if (eager) { setStickerSvg(eager); return; }
    let cancelled = false;
    setStickerSvg(null);
    loadStickerSvg(sticker.id)
      .then((svg) => { if (!cancelled) setStickerSvg(svg); })
      .catch((e) => {
        if (cancelled) return;
        console.warn('[ShareSheet] 贴纸加载失败：', sticker.id, e);
        setStickerSvg(null);
      });
    return () => { cancelled = true; };
  }, [open, sticker]);

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

  /**
   * 决定这次导出用哪条字体栈，并确保它已经能渲染。
   * 永远返回「已经可用」的栈：子集拿不到就退回整套字体（等一下），绝不返回半成品。
   */
  const resolveCardFont = async (): Promise<string> => {
    if (font.id === 'system') return font.family;
    if (subsetReady) return subsetStack;

    const text = collectCardText(quote.text);
    const subset = await fetchSubsetFont(font.face, text);
    if (subset) {
      await applySubsetFont(subset, text);
      setSubsetReadyFace(font.face);
      setSubsetFailedFace(null);
      return subsetStack;
    }

    // 降级路径：等的是「卡片要用的这一款」整套字体，不是 document.fonts.ready
    // —— 后者会把页面上其它字体一起等进来。等不到也照常出图，只是可能用兜底字体。
    setSubsetFailedFace(font.face);
    await ensureFontReady(font.face, [quote.text, font.name]);
    return font.family;
  };

  /**
   * 导出要用的贴纸 SVG。永远不抛：贴纸 chunk 拉不到就当作「没选贴纸」，
   * 让图照常出，而不是把整次导出拖失败。
   */
  const resolveStickerSvg = async (): Promise<string | null> => {
    if (!sticker) return null;
    const eager = eagerStickerSvg(sticker.id);
    if (eager) return eager;
    try {
      return await loadStickerSvg(sticker.id);
    } catch (e) {
      console.warn('[ShareSheet] 贴纸加载失败，导出时略过：', sticker.id, e);
      return null;
    }
  };

  const handleSave = async () => {
    if (!cardRef.current || saving) return;
    if (!html2canvasRef.current) {
      setErrorMsg('图片库未加载完成，请稍后再试');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setImageUrl(null);

    try {
      // 首选字体子集：几十 KB，首访也不慢。这条路不通才退回整套字体。
      // 贴纸和字体两条路并行等，首访不叠加等待。
      const [family, stickerMarkup] = await Promise.all([resolveCardFont(), resolveStickerSvg()]);
      setStickerSvg(stickerMarkup);

      const html2canvas = html2canvasRef.current;
      const canvas = await html2canvas(cardRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        // html2canvas 默认把整个 <html> 克隆进隐藏 iframe，于是书架的封面图、
        // 面板上的字体都要在克隆里重新加载一遍（WebKit 还会等全部图片 load）。
        // 只留卡片本身，克隆里没有别的图片和字体可等。
        ignoreElements: buildIgnoreElements(cardRef.current),
        // 字体栈直接钉在克隆 DOM 上。上面刚 await 完子集，setState 还没渲染完，
        // 靠状态的话这次截图用的还是旧字体栈 —— 静默退化，最难查。
        onclone: (doc: Document) => {
          applyCardFont(doc, family);
          // 贴纸同理：刚 setStickerSvg 还没渲染，克隆里那张还是空的。
          applyCardSticker(doc, stickerMarkup);
        },
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
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
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
        className="hide-scrollbar"
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
            data-share-card-font=""
            style={{
              fontFamily: cardFamily,
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
            data-share-card-font=""
            style={{
              fontFamily: cardFamily,
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
              data-share-card-font=""
              style={{
                fontFamily: cardFamily,
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
              marginTop: 14,
              height: 55,
            }}
          >
            {/* Sticker — fixed bottom-left */}
            {sticker ? (
              <div
                data-share-sticker=""
                dangerouslySetInnerHTML={{ __html: stickerSvg ?? '' }}
                style={{
                  height: 40,
                  width: 40,
                  overflow: "hidden",
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
            {/* Custom color picker */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                type="color"
                value={customColor || '#FEFCF8'}
                onChange={(e) => {
                  const v = e.target.value;
                  setCustomColor(v);
                  setUseCustomColor(true);
                  setImageUrl(null);
                  try { localStorage.setItem('share-custom-bg', v); } catch {}
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: useCustomColor ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
                  padding: 0,
                  cursor: 'pointer',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                  flexShrink: 0,
                }}
                title="自定义颜色"
              />
              {useCustomColor && (
                <div style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: color.textColor,
                  border: '1px solid var(--color-border)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
            {COLOR_THEMES.map((t, i) => (
              <button
                key={t.id}
                onClick={() => { setColorIndex(i); setUseCustomColor(false); setImageUrl(null); }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: !useCustomColor && i === colorIndex ? '2px solid var(--color-text)' : '1px solid var(--color-border)',
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
                  // 按钮只用「字体名」子集（每个约 1KB），整套中文字体等用户
                  // 真的选中了这款再下（见 shareCardExport.ts 的 labelFamily）。
                  fontFamily: f.labelFamily,
                  fontWeight: 400,
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
                  aria-hidden="true"
                  style={{
                    height: 24,
                    width: 24,
                    flex: 'none',
                    backgroundColor: color.textColor,
                    WebkitMaskImage: `url(${s.thumb})`,
                    maskImage: `url(${s.thumb})`,
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                  }}
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
