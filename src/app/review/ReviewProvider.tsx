// ─── 摘录回顾 Provider ────────────────────────────────────────────────────────
//
// 和时光信箱一样，书架插画里的红色邮箱需要一个"打开"命令，但不该让整页去感知回顾页的
// 存在。这里只做两件事：提供稳定的 openReview()，以及在需要时把回顾页整页推到最上层。
//
// 回顾页（含名片架的手势与 3D 动画）只在点开时才用到，所以走动态 import：
// 平时空闲预取，首屏主包不背它。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, lazy, Suspense, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePrefetchOnIdle } from '../hooks/usePrefetchOnIdle';
import { COLORS, SERIF_STACK } from './rolodex/tokens';

const loadReviewPage = () => import('./ReviewPage');
const ReviewPage = lazy(loadReviewPage);

interface ReviewCommands {
  openReview: () => void;
}

const ReviewCommandsContext = createContext<ReviewCommands | null>(null);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openReview = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  usePrefetchOnIdle(loadReviewPage);

  // Esc 由页面自己处理（它要知道是不是开着全文弹层），这里只管组件被卸载时不留状态。
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const commands = useMemo(() => ({ openReview }), [openReview]);

  return (
    <ReviewCommandsContext.Provider value={commands}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.div
            key="review-page"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'var(--color-bg)' }}
          >
            <Suspense fallback={<Loading />}>
              <ReviewPage onBack={close} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </ReviewCommandsContext.Provider>
  );
}

function Loading() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 和 ReviewPage 用同一个主题底色，加载态到正文之间不会闪一下。
        background: 'var(--color-bg)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div className="review-spinner" />
        <div style={{ fontFamily: SERIF_STACK, fontSize: 13, letterSpacing: 1.5, color: COLORS.inkSoft }}>
          正在取摘录…
        </div>
      </div>
    </div>
  );
}

/** 稳定的"打开摘录回顾"命令，供书架插画里的红色邮箱触发。 */
export function useOpenReview(): () => void {
  const ctx = useContext(ReviewCommandsContext);
  if (!ctx) throw new Error('useOpenReview must be used within ReviewProvider');
  return ctx.openReview;
}
