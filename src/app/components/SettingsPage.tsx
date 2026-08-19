import { useState, useRef } from 'react';
import { ArrowLeft, Layers, ChartColumnIncreasing, Database } from 'lucide-react';
import CategorySection from './sections/CategorySection';
import StatsSection from './sections/StatsSection';
import DataBackupSection from './sections/DataBackupSection';

type SegmentKey = 'cat' | 'stats' | 'backup';

const SEGMENTS: { key: SegmentKey; label: string; icon: typeof Layers }[] = [
  { key: 'cat', label: '分类管理', icon: Layers },
  { key: 'stats', label: '阅读统计', icon: ChartColumnIncreasing },
  { key: 'backup', label: '数据备份', icon: Database },
];

interface SettingsPageProps {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const backupRef = useRef<HTMLElement>(null);
  const [activeSegment, setActiveSegment] = useState<SegmentKey>('cat');

  const scrollToSection = (key: SegmentKey) => {
    const el = key === 'cat' ? catRef.current : key === 'stats' ? statsRef.current : backupRef.current;
    const scrollEl = scrollRef.current;
    if (!el || !scrollEl) return;
    setActiveSegment(key);
    // Segment control is now fixed outside scroll area — no need to subtract its height
    const extraPad = 12;
    const targetY = el.offsetTop - extraPad;
    scrollEl.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
  };

  const handleScroll = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    const containerTop = scrollEl.getBoundingClientRect().top;
    const offset = containerTop + 20; // small headroom
    const statsTop = statsRef.current?.getBoundingClientRect().top ?? Infinity;
    const backupTop = backupRef.current?.getBoundingClientRect().top ?? Infinity;
    if (backupTop <= offset) setActiveSegment('backup');
    else if (statsTop <= offset) setActiveSegment('stats');
    else setActiveSegment('cat');
  };

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
          paddingTop: 'calc(2px + env(safe-area-inset-top))',
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

      {/* Fixed segmented control — outside scroll area */}
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
                onClick={() => scrollToSection(seg.key)}
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

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          padding: '0 18px 48px',
        } as React.CSSProperties}
      >
        {/* Section 1: Category management */}
        <section ref={catRef} style={{ marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <Layers size={14} strokeWidth={1.8} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 'bold', color: 'var(--color-text)' }}>分类管理</div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginTop: 1 }}>新增、重命名与删除书架分类</div>
            </div>
          </div>
          <div style={{ background: 'var(--color-bg-card)', borderRadius: 14, padding: 14, border: '1px solid var(--color-border-light)', boxShadow: 'var(--shadow-card)' }}>
            <CategorySection />
          </div>
        </section>

        {/* Section 2: Reading stats */}
        <section ref={statsRef} style={{ marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <ChartColumnIncreasing size={14} strokeWidth={1.8} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 'bold', color: 'var(--color-text)' }}>阅读统计</div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginTop: 1 }}>连续阅读、月度节奏与日历热力图</div>
            </div>
          </div>
          <StatsSection />
        </section>

        {/* Section 3: Data backup */}
        <section ref={backupRef}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 12 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--color-bg-card)', border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <Database size={14} strokeWidth={1.8} />
            </span>
            <div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 'bold', color: 'var(--color-text)' }}>数据备份</div>
              <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', marginTop: 1 }}>导出或导入全部书籍与摘录数据</div>
            </div>
          </div>
          <div style={{ background: 'var(--color-bg-card)', borderRadius: 14, padding: 16, border: '1px solid var(--color-border-light)', boxShadow: 'var(--shadow-card)' }}>
            <DataBackupSection />
          </div>
        </section>
      </div>
    </div>
  );
}
