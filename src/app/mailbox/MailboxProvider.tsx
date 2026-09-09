// ─── 时光信箱 Provider ─────────────────────────────────────────────────────────
// 提供稳定的 openMailbox() 命令，并负责挂载居中浮层（信封 → 卡片）。

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import MailboxOverlay from './MailboxOverlay';
import { obtainLetter, type Letter } from './letterLogic';

export type MailboxPhase = 'envelope' | 'loading' | 'card' | 'error';

const MailboxCommandsContext = createContext<{ openMailbox: () => void } | null>(null);

export function MailboxProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<MailboxPhase>('envelope');
  const [letter, setLetter] = useState<Letter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openMailbox = useCallback(() => {
    setOpen(true);
    setPhase('envelope');
    setLetter(null);
    setError(null);
    setLoading(true);

    obtainLetter()
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
        } else {
          setLetter(result);
          setPhase((p) => (p === 'loading' ? 'card' : p));
        }
      })
      .catch((e) => {
        console.error('[Mailbox] 获取信件失败:', e);
        setError('信件生成失败，请稍后再试');
      })
      .finally(() => setLoading(false));
  }, []);

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

  const commands = useMemo(() => ({ openMailbox }), [openMailbox]);

  return (
    <MailboxCommandsContext.Provider value={commands}>
      {children}
      <MailboxOverlay
        open={open}
        phase={phase}
        letter={letter}
        error={error}
        onClose={close}
        onOpenEnvelope={openEnvelope}
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
