import { useState, useEffect, useRef, useMemo } from 'react';
import { computeStats } from '../../db/stats';
import type { StatsData } from '../../db/stats';
import ReadingHeatmap from '../ReadingHeatmap';

export default function StatsSection() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const isMounted = useRef(true);

  const loadStats = async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError('');
    try {
      const data = await computeStats();
      if (isMounted.current) {
        setStats(data);
        if (data.yearRange.max > 0) {
          setSelectedYear((prev) => Math.max(prev, data.yearRange.max));
        }
        setLoading(false);
      }
    } catch (e: any) {
      if (isMounted.current) {
        setError('加载统计数据失败: ' + (e?.message || String(e)).slice(0, 60));
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    loadStats();
    return () => { isMounted.current = false; };
  }, []);

  const monthlyCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    if (!stats) return counts;
    const prefix = String(selectedYear);
    for (const [day, count] of Object.entries(stats.dailyCounts)) {
      if (day.startsWith(prefix)) {
        const month = parseInt(day.slice(5, 7), 10) - 1;
        if (month >= 0 && month < 12) counts[month] += count;
      }
    }
    return counts;
  }, [stats, selectedYear]);

  const thisMonthCount = useMemo(() => {
    if (!stats) return 0;
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Object.entries(stats.dailyCounts).reduce((sum, [day, count]) => day.startsWith(key) ? sum + count : sum, 0);
  }, [stats]);

  const maxMonthlyCount = Math.max(...monthlyCounts, 1);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 12, fontFamily: '-apple-system, sans-serif' }}>
        加载中…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: 24, fontSize: 11, color: 'var(--color-danger)', fontFamily: '-apple-system, sans-serif' }}>
        {error}
        <button onClick={loadStats} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', fontWeight: 600, fontSize: 11 }}>
          重试
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Summary cards — 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {[
          { icon: '📚', label: '书籍', value: stats?.totalBooks ?? 0 },
          { icon: '💬', label: '摘录', value: stats?.totalQuotes ?? 0 },
          { icon: '🏆', label: '最长连续', value: stats?.longestStreak ?? 0 },
          { icon: '📅', label: '本月', value: thisMonthCount },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              background: 'var(--color-bg-card)',
              borderRadius: 14,
              padding: '16px 12px',
              boxShadow: 'var(--shadow-card)',
              border: '1px solid var(--color-border-light)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, opacity: 0.035, backgroundImage: 'radial-gradient(circle at 20% 20%, var(--color-gold) 1px, transparent 1px), radial-gradient(circle at 80% 80%, var(--color-gold) 1px, transparent 1px)', backgroundSize: '26px 26px', pointerEvents: 'none' }} />
            <div style={{ fontSize: 15, marginBottom: 6, lineHeight: 1 }}>{card.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 'bold', fontFamily: 'var(--font-serif)', color: 'var(--color-text)', lineHeight: 1.1, marginBottom: 5 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', letterSpacing: 0.8 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly activity bars */}
      <div style={{ marginBottom: 18, padding: '14px 16px', background: 'var(--color-bg-card)', borderRadius: 14, boxShadow: 'var(--shadow-card)', border: '1px solid var(--color-border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 'bold', color: 'var(--color-text)' }}>
            {selectedYear} 年阅读节奏
          </span>
          {stats?.mostActiveMonth && stats.mostActiveMonth.startsWith(String(selectedYear)) && (
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)' }}>
              最活跃：{stats.mostActiveMonth.slice(5)}月
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {monthlyCounts.map((count, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, fontSize: 9, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', textAlign: 'right' }}>
                {i + 1}月
              </span>
              <div style={{ flex: 1, height: 8, background: 'var(--color-bg-skeleton)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${Math.max((count / maxMonthlyCount) * 100, count > 0 ? 4 : 0)}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-gold), var(--color-gold-soft))', borderRadius: 4, transition: 'width var(--transition-normal)' }} />
              </div>
              <span style={{ width: 22, fontSize: 9, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', textAlign: 'left' }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, #d4c4a0 30%, #d4c4a0 70%, transparent 100%)', opacity: 0.4, marginBottom: 16 }} />

      {/* Reading heatmap */}
      <ReadingHeatmap
        dailyCounts={stats?.dailyCounts ?? {}}
        year={selectedYear}
        onYearChange={setSelectedYear}
        minYear={stats?.yearRange?.min ?? new Date().getFullYear()}
        maxYear={stats?.yearRange?.max ?? new Date().getFullYear()}
      />
    </>
  );
}
