import { useReadingTimer } from './ReadingTimerProvider';
import { formatClock } from './format';

export default function ReadingTimerBar() {
  const { status, sheetOpen, notice, elapsedMs, openSheet, dismissNotice } = useReadingTimer();

  if (sheetOpen || status === 'idle') return null;

  if (notice) {
    return (
      <div
        style={{
          margin: '10px 18px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 14,
          background: 'rgba(44, 34, 22, 0.92)',
          color: '#fff8e0',
          fontSize: 13,
          fontFamily: '-apple-system, sans-serif',
          boxShadow: '0 6px 20px rgba(28,22,12,0.25)',
        }}
      >
        <span style={{ flex: 1, textAlign: 'center' }}>{notice}</span>
        <button
          onClick={openSheet}
          style={{
            background: '#fff8e0',
            color: '#2C2216',
            border: 'none',
            borderRadius: 12,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: '-apple-system, sans-serif',
            cursor: 'pointer',
          }}
        >
          继续
        </button>
        <button
          onClick={dismissNotice}
          aria-label="关闭提醒"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,248,224,0.7)',
            fontSize: 16,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 18px 0' }}>
      <button
        onClick={openSheet}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '8px 16px',
          borderRadius: 16,
          background: 'rgba(44, 34, 22, 0.72)',
          backdropFilter: 'blur(14px) saturate(160%)',
          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.16)',
          color: '#fff8e0',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: '-apple-system, sans-serif',
          cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(28,22,12,0.2)',
        }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>📖</span>
        <span>{status === 'running' ? '计时中' : '已暂停'}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5 }}>{formatClock(elapsedMs)}</span>
      </button>
    </div>
  );
}
