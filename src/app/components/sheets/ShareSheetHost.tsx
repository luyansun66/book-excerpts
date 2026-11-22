import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { LoaderCircle, RotateCcw, X } from 'lucide-react';
import type { Quote } from '../../types';
import { overlayPortal } from '../overlayPortal';
import { loadShareSheet } from './shareSheetLoader';
import { SHARE_SHEET_Z_INDEX } from './shareSheetLayers';
import type { ShareTemplate } from './shareTemplates';

export interface ShareSheetRuntimeProps {
  open: boolean;
  onClose: () => void;
  quote: Quote;
  bookTitle: string;
  bookAuthor: string;
  initialTemplate?: ShareTemplate;
}

interface ShareSheetModule {
  default: ComponentType<ShareSheetRuntimeProps>;
}

interface ShareSheetHostProps extends ShareSheetRuntimeProps {
  /** 测试与预加载可注入；生产默认为现有 shareSheetLoader。 */
  loader?: () => Promise<ShareSheetModule>;
}

export default function ShareSheetHost({
  open,
  onClose,
  quote,
  bookTitle,
  bookAuthor,
  initialTemplate = 'original',
  loader = loadShareSheet,
}: ShareSheetHostProps) {
  const [Sheet, setSheet] = useState<ComponentType<ShareSheetRuntimeProps> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSheet(null);
    setError('');

    loader()
      .then((module) => {
        if (!cancelled) setSheet(() => module.default);
      })
      .catch((loadError) => {
        console.error('[ShareSheetHost] 图片编辑器加载失败:', loadError);
        if (!cancelled) setError('图片编辑器加载失败');
      });

    return () => { cancelled = true; };
  }, [attempt, loader, open]);

  useEffect(() => {
    if (!open || Sheet) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Sheet, onClose, open]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (!open) return null;
  if (Sheet) {
    return (
      <Sheet
        open
        onClose={onClose}
        quote={quote}
        bookTitle={bookTitle}
        bookAuthor={bookAuthor}
        initialTemplate={initialTemplate}
      />
    );
  }

  return overlayPortal(
    <section
      className="share-sheet-loading"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-sheet-loading-title"
      aria-busy={!error}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: SHARE_SHEET_Z_INDEX,
        display: 'grid',
        placeItems: 'center',
        padding: 'max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom))',
        background: 'rgba(28, 23, 18, 0.28)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 320px)',
          padding: '22px 20px 18px',
          borderRadius: 20,
          background: 'rgba(255, 253, 249, 0.94)',
          color: '#26211d',
          boxShadow: '0 24px 64px rgba(28, 23, 18, 0.24)',
          textAlign: 'center',
        }}
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="关闭图片编辑器"
          onClick={onClose}
          style={{
            float: 'right',
            width: 44,
            height: 44,
            margin: '-14px -10px -8px 8px',
            padding: 0,
            border: 0,
            background: 'transparent',
            color: 'rgba(38, 33, 29, 0.58)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <X size={18} />
        </button>

        {error ? (
          <>
            <h2 id="share-sheet-loading-title" style={{ margin: '8px 0 8px', fontSize: 17 }}>
              {error}
            </h2>
            <p role="alert" style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.65, color: '#74695f' }}>
              请检查网络后重试，摘录内容本身没有丢失。
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                style={secondaryButtonStyle}
              >
                返回阅读
              </button>
              <button
                type="button"
                onClick={retry}
                style={primaryButtonStyle}
              >
                <RotateCcw size={15} />
                重试
              </button>
            </div>
          </>
        ) : (
          <>
            <LoaderCircle size={26} strokeWidth={1.7} style={{ animation: 'spin 0.9s linear infinite' }} />
            <h2 id="share-sheet-loading-title" style={{ margin: '12px 0 6px', fontSize: 17 }}>
              正在打开图片编辑器
            </h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#74695f' }}>
              {initialTemplate === 'calendar' ? '正在准备你的日历书摘模板…' : '正在准备你的图片模板…'}
            </p>
          </>
        )}
      </div>
    </section>,
  );
}

const primaryButtonStyle = {
  flex: 1,
  minHeight: 44,
  border: 0,
  borderRadius: 12,
  background: '#2c2216',
  color: '#f5efe0',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
} as const;

const secondaryButtonStyle = {
  flex: 1,
  minHeight: 44,
  border: '1px solid rgba(44, 34, 22, 0.16)',
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.64)',
  color: '#2c2216',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
} as const;
