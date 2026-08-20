import { useState } from 'react';
import { ArrowLeft, Layers, ChartColumnIncreasing } from 'lucide-react';
import CategorySection from './sections/CategorySection';
import StatsSection from './sections/StatsSection';
import DataBackupSection from './sections/DataBackupSection';

type SegmentKey = 'stats' | 'cat';

const SEGMENTS: { key: SegmentKey; label: string; icon: typeof Layers }[] = [
  { key: 'stats', label: '阅读统计', icon: ChartColumnIncreasing },
  { key: 'cat', label: '分类管理', icon: Layers },
];

interface SettingsPageProps {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('stats');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Top navigation bar */}
      <div
        style={{
          paddingTop: 'clamp(30px, env(safe-area-inset-top), 35px)',
          paddingLeft: 14,
          paddingRight: 14,
          paddingBottom: 2,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: '#7a6a50',
            padding: '4px 0',
            zIndex: 1,
          }}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }}>
            书架
          </span>
        </button>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 'bold', color: 'var(--color-text)', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          设置与统计
        </span>
        <div style={{ width: 40, visibility: 'hidden' }} />
      </div>

      {/* Fixed segmented control */}
      <div
        style={{
          flexShrink: 0,
          padding: '30px 18px 12px',
          background: 'var(--color-bg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            background: 'var(--color-bg-card)',
            borderRadius: 12,
            padding: 3,
            border: '1px solid var(--color-border-light)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {SEGMENTS.map((seg) => {
            const Icon = seg.icon;
            const isActive = activeSegment === seg.key;
            return (
              <button
                key={seg.key}
                onClick={() => setActiveSegment(seg.key)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  padding: '9px 4px',
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--color-btn)' : 'transparent',
                  color: isActive ? 'var(--color-btn-text)' : 'var(--color-text-secondary)',
                  fontSize: 11.5,
                  fontWeight: isActive ? 700 : 500,
                  fontFamily: '-apple-system, sans-serif',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                <Icon size={13} strokeWidth={2} />
                {seg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active section content — each scrolls independently */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeSegment === 'stats' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'none',
              padding: '0 18px 48px',
            } as React.CSSProperties}
          >
            <StatsSection />
            <div style={{ marginTop: 24 }}>
              <DataBackupSection />
            </div>
          </div>
        )}
        {activeSegment === 'cat' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'none',
              padding: '0 18px 48px',
            } as React.CSSProperties}
          >
            <CategorySection />
          </div>
        )}
      </div>
    </div>
  );
}
