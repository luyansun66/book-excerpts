import { useState, useRef, useEffect, useCallback } from 'react';
import { overlayPortal } from '../overlayPortal';
import { X, Download } from 'lucide-react';
import type { Quote } from '../../types';
import { STICKERS, eagerStickerSvg, loadStickerSvg } from './stickers';
import ShareCard, { CARD_WIDTH } from './ShareCard';
import {
  FONTS,
  applyCardFont,
  applyCardSticker,
  applyCloneSafeColors,
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
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const lum = getLuminance(bgHex);
  if (lum > 0.5) {
    return `#${Math.min(255, r + 40).toString(16).padStart(2, '0')}${Math.max(0, g - 60).toString(16).padStart(2, '0')}${Math.max(0, b - 80).toString(16).padStart(2, '0')}`;
  } else {
    return `#${Math.min(255, r + 100).toString(16).padStart(2, '0')}${Math.min(255, Math.round(g * 0.8 + 80)).toString(16).padStart(2, '0')}${Math.max(0, b - 20).toString(16).padStart(2, '0')}`;
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const META_FONT = '-apple-system, BlinkMacSystemFont, sans-serif';
/** 舞台内边距：卡片铺满「可用宽」，可用宽 = 舞台宽 - 2 * 这个值 */
const STAGE_PAD_X = 20;
/** 顶部额外留白；真正的内边距还要加上 env(safe-area-inset-top)，见 stagePadStyle */
const STAGE_PAD_TOP = 14;
const STAGE_PAD_BOTTOM = 26;
/** 全屏预览的内边距 */
const FS_PAD_X = 20;
/** 卡片在舞台上最多放大到多少（避免短卡片被放得过大） */
const MAX_PREVIEW_SCALE = 1.35;
/** 短卡片为了「整张装下」最多愿意缩到铺满宽度的多少倍；缩过头就改成铺满 + 滚动 */
const FIT_TOLERANCE = 0.72;
/** 下拉关闭的触发距离 */
const DISMISS_DRAG_PX = 90;
/** 「点一下」的判定：位移和时长都在这个范围里才算点按，而不是拖动 / 长按 */
const TAP_SLOP_PX = 8;
const TAP_MAX_MS = 600;
/** 全屏里「长按存相册」的判定 */
const LONG_PRESS_MS = 520;
const LONG_PRESS_SLOP_PX = 10;

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
}

/** 生成好的 PNG 落盘：移动端走系统分享，桌面端直接下载 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [html2canvasReady, setHtml2canvasReady] = useState<boolean | null>(null);
  const [showThoughts, setShowThoughts] = useState(true);
  /** 已经把 @font-face 注入好的 face（子集就位）。 */
  const [subsetReadyFace, setSubsetReadyFace] = useState<string | null>(null);
  /** 子集没拿到、已退回整套字体的 face。 */
  const [subsetFailedFace, setSubsetFailedFace] = useState<string | null>(null);
  /** 当前贴纸的 SVG 源码。选择器用 PNG 蒙版，只有卡片和导出需要真 SVG。 */
  const [stickerSvg, setStickerSvg] = useState<string | null>(null);

  // ── 预览几何：全部来自实测，不猜 ──────────────────────────────────────────
  /** 卡片原尺寸高度（由离屏节点量出来，缩放后就是预览高度） */
  const [cardHeight, setCardHeight] = useState(0);
  /** 舞台滚动区的 clientWidth / clientHeight */
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  /** 舞台实测的上下内边距（顶部含状态栏安全区） */
  const [stagePad, setStagePad] = useState({ top: STAGE_PAD_TOP, bottom: STAGE_PAD_BOTTOM });
  /** 全屏预览滚动区的 clientWidth */
  const [fsWidth, setFsWidth] = useState(0);
  const [dragY, setDragY] = useState(0);

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

  /** 离屏的原尺寸导出节点 —— html2canvas 只截它 */
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /** 舞台里那张卡片的框 —— 点按命中测试用（卡内看全图，卡外关面板） */
  const stageCardRef = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const html2canvasRef = useRef<any>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => { window.clearTimeout(toastTimerRef.current); }, []);

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
    setFullscreen(false);
    setDragY(0);
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

  // 量尺寸：卡片原高（离屏节点，未缩放）+ 舞台宽高 + 全屏宽。
  // 不靠公式推算卡片高度 —— 字体、感悟、贴纸都会改它，量最稳。
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const card = cardRef.current;
      if (card) setCardHeight(prev => (prev === card.offsetHeight ? prev : card.offsetHeight));
      const stage = stageRef.current;
      if (stage) {
        const w = stage.clientWidth, h = stage.clientHeight;
        setStageBox(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
        // 内边距里含 env(safe-area-inset-top)，浏览器只认 px 就得自己量出来 ——
        // 用常量估的话，可用高会多算一个状态栏，长图会被判成「装得下」然后底部被切掉。
        const cs = getComputedStyle(stage);
        const top = parseFloat(cs.paddingTop) || 0;
        const bottom = parseFloat(cs.paddingBottom) || 0;
        setStagePad(prev => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
      }
      const fs = fsRef.current;
      if (fs) setFsWidth(prev => (prev === fs.clientWidth ? prev : fs.clientWidth));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    for (const node of [cardRef.current, stageRef.current, fsRef.current]) {
      if (node) ro.observe(node);
    }
    return () => ro.disconnect();
  }, [
    open, fullscreen, cardFamily, showThoughts, stickerSvg, color.bgColor,
    colorIndex, useCustomColor, customColor, fontIndex, stickerIndex, quote.text, quote.thought,
  ]);

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

    try {
      // 首选字体子集：几十 KB，首访也不慢。这条路不通才退回整套字体。
      // 贴纸和字体两条路并行等，首访不叠加等待。
      const [family, stickerMarkup] = await Promise.all([resolveCardFont(), resolveStickerSvg()]);
      setStickerSvg(stickerMarkup);

      const html2canvas = html2canvasRef.current;
      // 截的是离屏的原尺寸节点：它没有 transform，所以出图尺寸和以前一模一样。
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
          // 渲染根继承的 body 颜色是 oklch，html2canvas 解析不了，先换成 hex。
          applyCloneSafeColors(doc, color.textColor);
          applyCardFont(doc, family);
          // 贴纸同理：刚 setStickerSvg 还没渲染，克隆里那张还是空的。
          // 颜色也得一起钉：克隆里的 <svg> 会被单独序列化，够不到页面的 CSS 继承。
          applyCardSticker(doc, stickerMarkup, color.textColor);
        },
      });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });

      // 生成即落地：能唤起系统分享就唤起（存相册），不能就直接下载。
      // 不再把图片插回面板里让用户长按 —— 那一步会把面板又撑长一截。
      const file = new File([blob], `摘录-${bookTitle}.png`, { type: 'image/png' });
      const canShareFiles =
        typeof navigator.share === 'function' &&
        (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));

      if (canShareFiles) {
        try {
          await navigator.share({ files: [file], title: `摘录：${bookTitle}` });
          showToast('已生成 · 在分享面板里选「存储图像」');
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') return;
          downloadBlob(blob, `摘录-${bookTitle}.png`);
          showToast('已下载到本地');
        }
      } else {
        downloadBlob(blob, `摘录-${bookTitle}.png`);
        showToast('已下载到本地');
      }
    } catch (e: any) {
      console.error('[ShareSheet] Export failed:', e?.message || e, e?.stack || '');
      setErrorMsg(e?.message ? `图片生成失败：${e.message}` : '图片生成失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // ── 下拉把手关闭 ────────────────────────────────────────────────────────────
  const dragRef = useRef<{ startY: number; id: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st || st.id !== e.pointerId) return;
    const dy = e.clientY - st.startY;
    setDragY(dy > 0 ? dy : 0);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const st = dragRef.current;
    if (!st || st.id !== e.pointerId) return;
    dragRef.current = null;
    setDragY(prev => {
      if (prev > DISMISS_DRAG_PX) onClose();
      return 0;
    });
  };

  // ── 点卡片 = 看全图 ──────────────────────────────────────────────────────────
  // 舞台本身是能滚的（长图），所以不能直接挂 onClick：手指拖完滚屏，浏览器
  // 照样会补一个 click，用户只想往上翻却弹出全屏。这里自己判定一次 ——
  // 位移和时长都在阈值内才算点按；滚动一开始浏览器就会发 pointercancel，
  // 那一下也就自动作废了。
  const tapRef = useRef<{ x: number; y: number; at: number; id: number } | null>(null);
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tapRef.current = { x: e.clientX, y: e.clientY, at: Date.now(), id: e.pointerId };
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    const st = tapRef.current;
    if (!st || st.id !== e.pointerId) return;
    if (Math.abs(e.clientX - st.x) > TAP_SLOP_PX || Math.abs(e.clientY - st.y) > TAP_SLOP_PX) {
      tapRef.current = null;
    }
  };
  const onStagePointerUp = (e: React.PointerEvent) => {
    const st = tapRef.current;
    tapRef.current = null;
    if (!st || st.id !== e.pointerId) return;
    if (Date.now() - st.at > TAP_MAX_MS) return;
    if (Math.abs(e.clientX - st.x) > TAP_SLOP_PX || Math.abs(e.clientY - st.y) > TAP_SLOP_PX) return;
    // 点卡片 = 看全图；点卡片外的空白 = 关面板（面板没有标题行，空白处是它的关闭靶子）。
    // 舞台现在铺满整屏，这条空白就只剩内边距那一圈了。
    if (stageCardRef.current?.contains(e.target as Node)) setFullscreen(true);
    else if (e.target === stageRef.current) onClose();
  };
  const onStagePointerCancel = () => { tapRef.current = null; };

  // ── 全屏里长按 = 存相册 ─────────────────────────────────────────────────────
  // 卡片是 DOM 不是 <img>，长按拿不到系统那套「存储图像」，所以自己计时：
  // 按住不动够久就跑一遍导出，能唤起分享面板就唤起（iOS 上那里面就是
  // 「存储图像」）。计时器在 gesture 之后 500ms 上下触发，浏览器还认这次用户
  // 手势（Chromium 的 transient activation 有 5 秒窗口）；万一哪家把
  // navigator.share 拦掉，handleSave 里也会退回下载，不会白按。
  const longPressRef = useRef<{ timer: number; x: number; y: number; id: number } | null>(null);
  /** 上一次按下用的是手指还是鼠标 —— 长按的「上下文菜单」只在触摸时要拦掉。 */
  const pointerKindRef = useRef<string>('mouse');
  const cancelLongPress = useCallback(() => {
    const st = longPressRef.current;
    if (!st) return;
    window.clearTimeout(st.timer);
    longPressRef.current = null;
  }, []);
  useEffect(() => () => cancelLongPress(), [cancelLongPress]);

  const onCardPointerDown = (e: React.PointerEvent) => {
    pointerKindRef.current = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (saving) return;
    cancelLongPress();
    const { clientX: x, clientY: y, pointerId: id } = e;
    longPressRef.current = {
      x, y, id,
      timer: window.setTimeout(() => {
        longPressRef.current = null;
        // 安卓上震一下：不用盯着屏幕也知道已经触发了
        if (typeof navigator.vibrate === 'function') navigator.vibrate(15);
        handleSave();
      }, LONG_PRESS_MS),
    };
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    const st = longPressRef.current;
    if (!st || st.id !== e.pointerId) return;
    if (Math.abs(e.clientX - st.x) > LONG_PRESS_SLOP_PX || Math.abs(e.clientY - st.y) > LONG_PRESS_SLOP_PX) {
      cancelLongPress();
    }
  };

  if (!open) return null;

  // ── 舞台几何 ────────────────────────────────────────────────────────────────
  const availW = Math.max(0, stageBox.w - STAGE_PAD_X * 2);
  const availH = Math.max(0, stageBox.h - stagePad.top - stagePad.bottom);
  // 铺满宽度：卡片宽度撑满舞台可用宽（最多放大到 MAX_PREVIEW_SCALE，免得短卡片被拉得过大）
  const fillScale = availW > 0 ? Math.min(availW / CARD_WIDTH, MAX_PREVIEW_SCALE) : 0;
  // 整张装下：再按可用高收一次，短卡片就不用滚动了
  const fitScale = cardHeight > 0 ? Math.min(fillScale, availH / cardHeight) : fillScale;
  // 只差一点点就整体缩一点装下；差太多（长图）就铺满宽度、留给自己拖
  const previewScale = fitScale >= fillScale * FIT_TOLERANCE ? fitScale : fillScale;
  const previewH = cardHeight * previewScale;
  const previewScrollable = previewScale > 0 && cardHeight > 0 && previewH > availH + 1;

  const fsAvailW = Math.max(0, fsWidth - FS_PAD_X * 2);
  const fsScale = fsAvailW > 0 ? Math.min(fsAvailW / CARD_WIDTH, MAX_PREVIEW_SCALE) : 0;

  const themeName = color.name;
  const fontName = font.name;
  const stickerName = sticker ? sticker.name : '无';
  const buttonBusy = saving || html2canvasReady === null;

  // 必须挂到 body 上（见 overlayPortal）：留在带 transform 的页面层里，
  // fixed 的包含块会变成那一层，叠上 body 的 safe-area padding，
  // 顶部就会露出米白底色 —— 就是「顶部一层米白遮罩」。
  return overlayPortal(
    <>
      {/* 离屏的原尺寸导出节点：没有 transform，html2canvas 只截它。
          舞台里那份是缩放过的，绝不能被截到 —— 所以必须是两个节点。 */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: CARD_WIDTH,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <div ref={cardRef}>
          <ShareCard
            quote={quote}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            theme={color}
            cardFamily={cardFamily}
            showThoughts={showThoughts}
            stickerSvg={stickerSvg}
          />
        </div>
      </div>

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
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            // 卡片那一层不垫底色：卡片直接浮在压暗的页面上，背后不再有一块
            // 米白「容器」把整张卡包起来。米白只留给下面的控制面板。
            background: 'transparent',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            overflowX: 'hidden',
            transform: dragY ? `translateY(${dragY}px)` : undefined,
            transition: dragY ? 'none' : 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          {/* ─── 舞台：只放卡片，高度固定，卡片在里面缩放 / 滚动 ─── */}
          <div style={{ flex: '1 1 auto', minHeight: 140, position: 'relative' }}>
            <div
              ref={stageRef}
              className="hide-scrollbar"
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerUp}
              onPointerCancel={onStagePointerCancel}
              style={{
                position: 'absolute',
                inset: 0,
                padding: stagePadStyle,
                boxSizing: 'border-box',
                overflowY: previewScrollable ? 'auto' : 'hidden',
                overflowX: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: previewScrollable ? 'flex-start' : 'center',
              }}
            >
              {previewScale > 0 && (
                <div
                  ref={stageCardRef}
                  style={{
                    width: CARD_WIDTH * previewScale,
                    height: previewH,
                    margin: '0 auto',
                    position: 'relative',
                    flex: 'none',
                    // 舞台整体是「点按看全图」的靶子，别让按住时选中文字
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }}
                >
                  <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${previewScale})`, transformOrigin: 'top left' }}>
                    <ShareCard
                      quote={quote}
                      bookTitle={bookTitle}
                      bookAuthor={bookAuthor}
                      theme={color}
                      cardFamily={cardFamily}
                      showThoughts={showThoughts}
                      stickerSvg={stickerSvg}
                      shadow="0 14px 40px rgba(0,0,0,0.34)"
                    />
                  </div>
                </div>
              )}
            </div>

            {previewScrollable && !toast && (
              <button
                onClick={() => setFullscreen(true)}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 8,
                  transform: 'translateX(-50%)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 10.5,
                  fontFamily: META_FONT,
                  color: 'rgba(255,255,255,0.86)',
                  background: 'rgba(28,22,16,0.42)',
                  padding: '5px 12px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                }}
              >
                长图 · 可上下拖动 · 点按看全图
              </button>
            )}

            {toast && (
              <div style={{ position: 'absolute', left: '50%', bottom: 8, transform: 'translateX(-50%)', ...toastBubbleStyle }}>
                {toast}
              </div>
            )}
          </div>

          {/* ─── 控制面板：高度固定，永远在同一个位置 ─── */}
          <div
            style={{
              flex: 'none',
              // 圆角从整块面板挪到控制面板上：上面那截已经透明，露出来的是背景
              borderRadius: '24px 24px 0 0',
              // 卡片是从面板底下滑过去的，给一条向上的阴影才读得出「面板压在卡片上」
              boxShadow: '0 -10px 28px rgba(28,22,16,0.22)',
              padding: '10px 20px 0',
              background: 'var(--color-bg)',
            }}
          >
            {/* 把手 = 关闭手势区（面板没有标题行，靠它和点空白处关闭） */}
            <div
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 12px', touchAction: 'none', cursor: 'grab' }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
            </div>

            {/* 主题 */}
            <div style={{ marginTop: 2 }}>
              <div style={labelStyle}>
                主题<span style={valueStyle}> · {themeName}</span>
              </div>
              <div style={swatchRowStyle}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <input
                    type="color"
                    value={customColor || '#FEFCF8'}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomColor(v);
                      setUseCustomColor(true);
                      try { localStorage.setItem('share-custom-bg', v); } catch {}
                    }}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      appearance: 'none',
                      WebkitAppearance: 'none',
                      background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                      flexShrink: 0,
                      boxShadow: useCustomColor ? swatchRingActive : swatchRing,
                    }}
                    title="自定义颜色"
                  />
                </div>
                {COLOR_THEMES.map((t, i) => {
                  const active = !useCustomColor && i === colorIndex;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setColorIndex(i); setUseCustomColor(false); }}
                      title={t.name}
                      aria-label={`主题 ${t.name}`}
                      style={{
                        flex: 'none',
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        background: t.bgColor,
                        boxShadow: active ? swatchRingActive : swatchRing,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* 字体 */}
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>
                字体<span style={valueStyle}> · {fontName}</span>
              </div>
              <div style={rowStyle}>
                {FONTS.map((f, i) => {
                  const active = i === fontIndex;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFontIndex(i)}
                      style={{
                        ...pillStyle,
                        // 按钮只用「字体名」子集（每个约 1KB），整套中文字体等用户
                        // 真的选了再按需下载 —— 否则一开面板就是 22MB。
                        fontFamily: f.labelFamily,
                        ...(active ? pillActiveStyle : null),
                      }}
                    >
                      {f.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 贴纸 */}
            <div style={{ marginTop: 14 }}>
              <div style={labelStyle}>
                贴纸<span style={valueStyle}> · {stickerName}</span>
              </div>
              <div style={rowStyle}>
                <button
                  onClick={() => setStickerIndex(0)}
                  title="无贴纸"
                  style={{ ...stickerStyle, ...(stickerIndex === 0 ? stickerActiveStyle : null) }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={stickerIndex === 0 ? 'var(--color-text)' : 'var(--color-text-muted)'} strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
                  </svg>
                </button>
                {STICKERS.map((s, i) => {
                  const active = i + 1 === stickerIndex;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStickerIndex(i + 1)}
                      title={s.name}
                      style={{ ...stickerStyle, ...(active ? stickerActiveStyle : null) }}
                    >
                      <div
                        aria-hidden="true"
                        style={{
                          height: 24,
                          width: 24,
                          flex: 'none',
                          // 面板底色是米色，蒙版固定用中性色 —— 跟主题文字色走的话，
                          // 浅色主题下浅色蒙版会直接看不见。
                          backgroundColor: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
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
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 包含感悟 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--color-text)', fontFamily: META_FONT, fontWeight: 500 }}>
                包含感悟
              </span>
              <button
                onClick={() => setShowThoughts(!showThoughts)}
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

            {errorMsg && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12,
                  color: 'var(--color-danger)',
                  fontFamily: META_FONT,
                  textAlign: 'center',
                  padding: '8px 16px',
                  background: '#fff0ec',
                  borderRadius: 8,
                }}
              >
                {errorMsg}
              </div>
            )}

            {/* 保存 */}
            <div style={{ paddingTop: 16, paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
              <button
                onClick={handleSave}
                disabled={buttonBusy}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 48,
                  borderRadius: 12,
                  border: 'none',
                  background: buttonBusy ? 'var(--color-btn-disabled)' : 'var(--color-btn)',
                  color: 'var(--color-btn-text)',
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: META_FONT,
                  cursor: buttonBusy ? 'not-allowed' : 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                <Download size={16} />
                {saving ? '生成中…' : html2canvasReady === null ? '准备中…' : '保存图片'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 全屏预览：舞台上 1:1 看细节 ─── */}
      {fullscreen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: '#100C06',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              // 浮层现在盖到屏幕最顶上，按钮得让开状态栏
              padding: 'calc(18px + env(safe-area-inset-top, 0px)) 20px 12px',
            }}
          >
            <button
              onClick={() => setFullscreen(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.16)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <X size={16} />
            </button>
            <button
              onClick={handleSave}
              disabled={buttonBusy}
              style={{
                border: 'none',
                background: 'rgba(255,255,255,0.16)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: META_FONT,
                padding: '8px 16px',
                borderRadius: 20,
                cursor: buttonBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? '生成中…' : '保存'}
            </button>
          </div>

          <div
            ref={fsRef}
            className="hide-scrollbar"
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: `0 ${FS_PAD_X}px`,
            }}
          >
            {fsScale > 0 && (
              <div
                onPointerDown={onCardPointerDown}
                onPointerMove={onCardPointerMove}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(e) => {
                  // 触摸长按时别让系统弹出「选中 / 拷贝」那一套，把长按留给我们
                  if (pointerKindRef.current !== 'mouse') e.preventDefault();
                }}
                style={{
                  width: CARD_WIDTH * fsScale,
                  height: cardHeight * fsScale,
                  margin: '0 auto',
                  position: 'relative',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
              >
                <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${fsScale})`, transformOrigin: 'top left' }}>
                  <ShareCard
                    quote={quote}
                    bookTitle={bookTitle}
                    bookAuthor={bookAuthor}
                    theme={color}
                    cardFamily={cardFamily}
                    showThoughts={showThoughts}
                    stickerSvg={stickerSvg}
                    shadow="0 18px 44px rgba(0,0,0,0.4)"
                  />
                </div>
              </div>
            )}
          </div>

          {toast && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
                transform: 'translateX(-50%)',
                ...toastBubbleStyle,
              }}
            >
              {toast}
            </div>
          )}

          <div
            style={{
              flex: 'none',
              textAlign: 'center',
              padding: '14px 20px calc(22px + env(safe-area-inset-bottom, 0px))',
              fontSize: 11.5,
              fontFamily: META_FONT,
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            上下拖动查看整张卡片 · 长按保存到相册
          </div>
        </div>
      )}
    </>,
  );
}

// ─── 面板里复用的小样式 ───────────────────────────────────────────────────────
/** 舞台内边距。顶部含状态栏安全区：滚动时内边距会跟着滚走，卡片因此能一直滑到屏幕最顶上。 */
const stagePadStyle = `calc(env(safe-area-inset-top, 0px) + ${STAGE_PAD_TOP}px) ${STAGE_PAD_X}px ${STAGE_PAD_BOTTOM}px`;

/** toast 气泡：舞台和全屏共用（位置各自定，气泡长一样） */
const toastBubbleStyle: React.CSSProperties = {
  background: 'rgba(28,22,16,0.88)',
  color: 'var(--color-btn-text)',
  fontSize: 12,
  fontFamily: META_FONT,
  padding: '8px 15px',
  borderRadius: 20,
  whiteSpace: 'nowrap',
  boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
  animation: 'fadeIn 0.2s ease',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  fontFamily: META_FONT,
  letterSpacing: 0.3,
  marginBottom: 8,
};

const valueStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontWeight: 500,
};

/** 选择器行横向铺到面板边缘（负 margin 出血），滑动时选项从屏幕边缘进出 */
const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  overflowY: 'hidden',
  margin: '0 -20px',
  padding: '0 20px 2px',
  scrollbarWidth: 'none',
};

/** 主题色行：选中的环画在圆外面（box-shadow 外扩 4px），这一行得上下各留出 4px，
 *  否则 rowStyle 的 overflowY: hidden 会把环的顶部切掉（底部同样会被切掉 2px）。
 *  负 margin 把多出来的上边距收回去，圆的视觉位置不变。 */
const swatchRowStyle: React.CSSProperties = {
  ...rowStyle,
  padding: '4px 20px 6px',
  margin: '-4px -20px 0',
};

const swatchRing = 'inset 0 0 0 1px rgba(28,22,16,0.10)';
const swatchRingActive = 'inset 0 0 0 1px rgba(28,22,16,0.10), 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-btn)';

const pillStyle: React.CSSProperties = {
  flex: 'none',
  height: 34,
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border-light)',
  background: 'var(--color-bg-card)',
  color: 'var(--color-text)',
  fontSize: 13,
  fontFamily: META_FONT,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
};

const pillActiveStyle: React.CSSProperties = {
  border: '1.5px solid var(--color-btn)',
  background: 'var(--color-bg-card-alt)',
  fontWeight: 600,
  padding: '0 13.5px',
  boxShadow: '0 1px 3px rgba(28,22,16,0.10)',
};

const stickerStyle: React.CSSProperties = {
  flex: 'none',
  width: 40,
  height: 40,
  borderRadius: '50%',
  border: '1px solid var(--color-border-light)',
  background: 'var(--color-bg-card)',
  cursor: 'pointer',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const stickerActiveStyle: React.CSSProperties = {
  border: '1.5px solid var(--color-btn)',
  background: 'var(--color-bg-card-alt)',
  boxShadow: '0 1px 3px rgba(28,22,16,0.10)',
};
