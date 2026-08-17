// ─── Reading Statistics Page ───────────────────────────────────────────────────
import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { computeStats } from '../db/stats';
import { exportAllData, importAllData } from '../db';
import type { StatsData } from '../db/stats';
import type { ExportData } from '../db';
import ReadingHeatmap from './ReadingHeatmap';
import { useApp } from '../store';

interface StatsPageProps {
  onBack: () => void;
}

export default function StatsPage({ onBack }: StatsPageProps) {
  const { refreshData } = useApp();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [importPreview, setImportPreview] = useState<ExportData | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const isMounted = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStats = async () => {
    if (!isMounted.current) return;
    setLoading(true);
    setError('');
    try {
      const data = await computeStats();
      if (isMounted.current) {
        setStats(data);
        // Default to most recent year with data
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

  // Monthly activity for the selected year
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

  // This calendar month's quote count
  const thisMonthCount = useMemo(() => {
    if (!stats) return 0;
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return Object.entries(stats.dailyCounts).reduce((sum, [day, count]) => day.startsWith(key) ? sum + count : sum, 0);
  }, [stats]);

  const maxMonthlyCount = Math.max(...monthlyCounts, 1);

  // ─── Render ─────────────────────────────────────────────────────────────
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
          paddingTop: 10,
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
          阅读统计
        </span>
        <div style={{ width: 40, visibility: 'hidden' }} />
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            margin: '4px 14px 0', padding: '8px 12px', borderRadius: 8,
            background: 'var(--color-danger-bg)', color: '#a04030', fontSize: 11,
            fontFamily: '-apple-system, sans-serif', textAlign: 'center',
          }}
        >
          {error}
          <button onClick={loadStats}
            style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a04030', fontWeight: 600, fontSize: 11 }}>
            重试
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          padding: '12px 18px 40px',
        } as React.CSSProperties}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)', fontSize: 12, fontFamily: '-apple-system, sans-serif' }}>
            加载中…
          </div>
        ) : (
          <>
            {/* Hero streak */}
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div
                style={{
                  width: 112, height: 112, margin: '0 auto', borderRadius: '50%',
                  background: 'radial-gradient(circle at 50% 32%, var(--color-bg-card-alt) 0%, var(--color-bg-card) 72%)',
                  border: '1px solid var(--color-gold-light)',
                  boxShadow: '0 0 0 7px var(--color-gold-pale), var(--shadow-md)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 'bold', color: 'var(--color-gold)', lineHeight: 1 }}>
                  {stats?.currentStreak ?? 0}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', letterSpacing: 1.5, marginTop: 2 }}>
                  连续阅读天数
                </span>
              </div>
            </div>

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

            {/* Reading heatmap — always visible, even with no data */}
            <ReadingHeatmap
              dailyCounts={stats?.dailyCounts ?? {}}
              year={selectedYear}
              onYearChange={setSelectedYear}
              minYear={stats?.yearRange?.min ?? new Date().getFullYear()}
              maxYear={stats?.yearRange?.max ?? new Date().getFullYear()}
            />

            {/* Export / Import buttons — side by side */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, marginBottom: 30 }}>
              <button
                onClick={async () => {
                  try {
                    const data = await exportAllData();
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `摘录备份-${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }, 300);
                  } catch (e: any) {
                    console.error('导出失败', e);
                  }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer',
                }}
              >
                <Download size={13} strokeWidth={1.8} />
                导出
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 24px', borderRadius: 8, border: '1px solid #d4c4a0',
                  background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
                  fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer',
                }}
              >
                <Upload size={13} strokeWidth={1.8} />
                导入
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data: ExportData = JSON.parse(text);
                  if (!data.version || !Array.isArray(data.categories) || !Array.isArray(data.books) || !Array.isArray(data.quotes)) {
                    setImportMsg('❌ 无效的备份文件格式');
                    return;
                  }
                  setImportPreview(data);
                } catch {
                  setImportMsg('❌ 文件解析失败，请选择正确的备份 JSON 文件');
                }
                e.target.value = '';
              }}
            />

            {/* Import preview / confirmation */}
            {importPreview && (
              <div style={{ marginTop: 0, marginBottom: 8, padding: '14px 16px', borderRadius: 10, background: 'var(--color-bg-card)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', fontFamily: '-apple-system, sans-serif', marginBottom: 6 }}>
                  即将导入以下数据：
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: '-apple-system, sans-serif', lineHeight: 1.7 }}>
                  📂 {importPreview.categories.length} 个分类<br />
                  📚 {importPreview.books.length} 本书<br />
                  💬 {importPreview.quotes.length} 条摘录
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    onClick={async () => {
                      try {
                        const result = await importAllData(importPreview);
                        setImportMsg(`✅ 导入完成：${result.categories} 个分类、${result.books} 本书、${result.quotes} 条摘录`);
                        setImportPreview(null);
                        loadStats();
                        refreshData();
                      } catch (e: any) {
                        setImportMsg('❌ 导入失败：' + (e?.message || String(e)));
                        setImportPreview(null);
                      }
                    }}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 6, border: 'none',
                      background: 'var(--color-btn)', color: 'var(--color-btn-text)', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer', fontFamily: '-apple-system, sans-serif',
                    }}
                  >
                    确认导入
                  </button>
                  <button
                    onClick={() => setImportPreview(null)}
                    style={{
                      padding: '9px 16px', borderRadius: 6, border: '1px solid #d4c4a0',
                      background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer', fontFamily: '-apple-system, sans-serif',
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {/* Import result message */}
            {importMsg && (
              <div style={{ textAlign: 'center', marginBottom: 8, fontSize: 11, color: importMsg.includes('✅') ? 'var(--color-success-text)' : 'var(--color-danger)', fontFamily: '-apple-system, sans-serif' }}>
                {importMsg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
