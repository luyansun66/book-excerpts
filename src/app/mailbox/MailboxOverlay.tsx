// ─── 时光信箱浮层：信封 → 点击拆信 → 展示 SVG 引言卡 ─────────────────────────
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import type { Letter } from './letterLogic';
import type { MailboxPhase } from './MailboxProvider';

interface Props {
  open: boolean;
  phase: MailboxPhase;
  letter: Letter | null;
  error: string | null;
  onClose: () => void;
  onOpenEnvelope: () => void;
}

// 信封（矢量版，奶油信封 + 橙色折边）
function Envelope() {
  return (
    <svg viewBox="0 0 671 454.1" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="信封">
      <rect fill="#f9f5e3" x="12.8" y="15" width="644" height="424" rx="8" />
      <path
        fill="#d98a4a"
        d="M12.9,14.9c73.8,54.8,204.8,153.6,277,207.7,20.1,14,44.8,19.8,68.2,10.8,7.5-2.8,14.6-6.6,21.2-11.2,0,0,39.2-30.1,39.2-30.1,64-49.1,133-100.5,198-148.1,51.6-37.7,54.8-39.6,1.6,2.2-63.5,49.8-131.6,102.3-196.2,150.7,0,0-39.6,29.7-39.6,29.7-7,4.8-14.5,8.8-22.6,11.6-24.8,9.2-51.3,3.1-72.4-12C217,171.6,82,70.2,12.9,14.9h0Z"
      />
      <path
        fill="#d98a4a"
        d="M12.8,439c95.4-65.8,203.2-138.4,300-202C217.4,302.8,109.6,375.3,12.8,439h0Z"
      />
      <path
        fill="#d98a4a"
        d="M656.8,439c-96.8-63.6-204.6-136.2-300-202,96.8,63.6,204.6,136.2,300,202h0Z"
      />
    </svg>
  );
}

export default function MailboxOverlay({ open, phase, letter, error, onClose, onOpenEnvelope }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="mailbox-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 130,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={onClose}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(20, 16, 10, 0.45)' }} />

          <AnimatePresence mode="wait">
            {phase === 'envelope' && (
              <motion.button
                key="envelope"
                initial={{ scale: 0.6, y: 46, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.86, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEnvelope();
                }}
                style={{
                  position: 'relative',
                  width: 280,
                  maxWidth: '82vw',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.35))',
                }}
              >
                <Envelope />
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: -34,
                    transform: 'translateX(-50%)',
                    fontSize: 13,
                    color: '#F5EFE0',
                    whiteSpace: 'nowrap',
                    letterSpacing: 1,
                    fontFamily: '-apple-system, sans-serif',
                    opacity: 0.85,
                  }}
                >
                  点击拆信
                </span>
              </motion.button>
            )}

            {phase === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ position: 'relative', color: '#F5EFE0', textAlign: 'center' }}
              >
                <div className="mailbox-spinner" style={{ margin: '0 auto 12px' }} />
                <p style={{ margin: 0, fontSize: 14, letterSpacing: 1, fontFamily: '-apple-system, sans-serif' }}>
                  拆信中…
                </p>
              </motion.div>
            )}

            {phase === 'card' && letter && (
              <motion.div
                key="card"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.94, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'relative' }}
              >
                <div className="letter-card" dangerouslySetInnerHTML={{ __html: letter.svg }} />
                <button
                  onClick={onClose}
                  aria-label="关闭"
                  style={{
                    position: 'absolute',
                    top: -14,
                    right: -14,
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: '1px solid rgba(255,255,255,0.4)',
                    background: 'rgba(44, 34, 22, 0.75)',
                    color: '#F5EFE0',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  <X size={18} />
                </button>
              </motion.div>
            )}

            {phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'relative',
                  maxWidth: 320,
                  width: '100%',
                  padding: '24px 20px',
                  borderRadius: 20,
                  background: 'var(--color-glass)',
                  border: '1px solid var(--color-glass-edge)',
                  backdropFilter: 'blur(14px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                  textAlign: 'center',
                }}
              >
                <p style={{ margin: 0, fontSize: 15, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif' }}>
                  {error}
                </p>
                <button
                  onClick={onClose}
                  style={{
                    marginTop: 16,
                    padding: '10px 28px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--color-btn)',
                    color: 'var(--color-btn-text)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  知道了
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
