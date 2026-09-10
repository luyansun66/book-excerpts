// ─── 时光信箱 Provider ─────────────────────────────────────────────────────────
// 提供稳定的 openMailbox() 命令，并负责挂载居中浮层（信封 → 卡片）。
// 卡片以「内嵌字体的 PNG」呈现：拆信后先在后台光栅化，图片就绪即替换 SVG 预览。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import MailboxOverlay from './MailboxOverlay';
import { obtainLetter, type Letter } from './letterLogic';
import { beijingDateKey } from './dates';
import { downloadBlob, letterImageFilename, rasterizeLetter } from './letterImage';

export type MailboxPhase = 'envelope' | 'loading' | 'card' | 'error';

const MailboxCommandsContext = createContext<{ openMailbox: () => void } | null>(null);

export function MailboxProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<MailboxPhase>('envelope');
  const [letter, setLetter] = useState<Letter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const imageBlobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const clearImage = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    imageBlobRef.current = null;
    setImageUrl(null);
  }, []);

  // 后台把 SVG 渲染成 PNG；失败则保留 SVG 预览，不影响阅读
  const renderImage = useCallback((svg: string) => {
    rasterizeLetter(svg)
      .then((blob) => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(blob);
        imageBlobRef.current = blob;
        setImageUrl(objectUrlRef.current);
      })
      .catch((e) => console.warn('[Mailbox] 图片渲染失败，回退 SVG 预览:', e));
  }, []);

  const openMailbox = useCallback(() => {
    setOpen(true);
    setPhase('envelope');
    setLetter(null);
    setError(null);
    setLoading(true);
    clearImage();

    obtainLetter()
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
        } else {
          setLetter(result);
          setPhase((p) => (p === 'loading' ? 'card' : p));
          renderImage(result.svg);
        }
      })
      .catch((e) => {
        console.error('[Mailbox] 获取信件失败:', e);
        setError('信件生成失败，请稍后再试');
      })
      .finally(() => setLoading(false));
  }, [clearImage, renderImage]);

  const close = useCallback(() => setOpen(false), []);

  const openEnvelope = useCallback(() => {
    if (error) {
      setPhase('error');
    } else if (letter) {
      setPhase('card');
    } else if (loading) {
      setPhase('loading');
    }
  }, [error, letter, loading]);

  // 保存 PNG：优先复用已渲染的 Blob，未就绪时现场渲染
  const saveImage = useCallback(async () => {
    if (!letter) return;
    try {
      setSaving(true);
      const blob = imageBlobRef.current ?? (await rasterizeLetter(letter.svg));
      downloadBlob(blob, letterImageFilename(letter.number, beijingDateKey()));
    } catch (e) {
      console.error('[Mailbox] 保存图片失败:', e);
    } finally {
      setSaving(false);
    }
  }, [letter]);

  // 卸载时释放对象地址
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const commands = useMemo(() => ({ openMailbox }), [openMailbox]);

  return (
    <MailboxCommandsContext.Provider value={commands}>
      {children}
      <MailboxOverlay
        open={open}
        phase={phase}
        letter={letter}
        error={error}
        imageUrl={imageUrl}
        saving={saving}
        onClose={close}
        onOpenEnvelope={openEnvelope}
        onSaveImage={saveImage}
      />
    </MailboxCommandsContext.Provider>
  );
}

/** 稳定的打开命令，供 LibraryBuilding 触发使用。 */
export function useOpenMailbox(): () => void {
  const ctx = useContext(MailboxCommandsContext);
  if (!ctx) throw new Error('useOpenMailbox must be used within MailboxProvider');
  return ctx.openMailbox;
}
