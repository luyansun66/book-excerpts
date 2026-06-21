// ─── Reading Statistics Page ───────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Upload } from 'lucide-react';
import { computeStats } from '../db/stats';
import { exportAllData, importAllData } from '../db';
import type { StatsData } from '../db/stats';
import type { ExportData } from '../db';
import ReadingHeatmap from './ReadingHeatmap';

interface StatsPageProps {
  onBack: () => void;
}

export default function StatsPage({ onBack }: StatsPageProps) {
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

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: '#F6F0E7',
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
          }}
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          <span style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 12, fontWeight: 500, letterSpacing: 0.1 }}>
            书架
          </span>
        </button>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 'bold', color: '#2c2416', marginRight: 32 }}>
          阅读统计
        </span>
        <div style={{ width: 40 }} />
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            margin: '4px 14px 0', padding: '8px 12px', borderRadius: 8,
            background: '#fff0ee', color: '#a04030', fontSize: 11,
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
          <div style={{ textAlign: 'center', padding: 40, color: '#b8ae9a', fontSize: 12, fontFamily: '-apple-system, sans-serif' }}>
            加载中…
          </div>
        ) : !stats || (stats.totalBooks === 0 && stats.totalQuotes === 0) ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#b8ae9a', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 13, lineHeight: 1.8 }}>
            暂无统计数据
            <br />
            <span style={{ fontSize: 11 }}>添加书籍和摘录后，这里会显示你的阅读日历</span>
          </div>
        ) : (
          <>
            {/* Summary cards — 2×2 grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: '📚  书籍', value: stats.totalBooks },
                { label: '💬  摘录', value: stats.totalQuotes },
                { label: '🔥  当前连续', value: `${stats.currentStreak} 天` },
                { label: '🏆  最长连续', value: `${stats.longestStreak} 天` },
              ].map((card) => (
                <div
                  key={card.label}
                  style={{
                    background: '#FFFDF3',
                    borderRadius: 12,
                    padding: '14px 12px',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 'bold', fontFamily: 'Georgia, serif', color: '#2c2416', lineHeight: 1.2, marginBottom: 4 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 10, color: '#b8ae9a', fontFamily: '-apple-system, sans-serif', letterSpacing: 0.3 }}>
                    {card.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Most active month */}
            {stats.mostActiveMonth && (
              <div style={{ textAlign: 'center', marginBottom: 16, fontSize: 11, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', lineHeight: 1.5 }}>
                最活跃月份：
                <span style={{ fontWeight: 600, color: '#2c2416' }}>
                  {stats.mostActiveMonth.replace('-', '年')}月
                </span>
                （{stats.mostActiveMonthCount} 条摘录）
              </div>
            )}

            {/* Divider */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, transparent 0%, #d4c4a0 30%, #d4c4a0 70%, transparent 100%)', opacity: 0.4, marginBottom: 16 }} />

            {/* Reading heatmap */}
            <ReadingHeatmap
              dailyCounts={stats.dailyCounts}
              year={selectedYear}
              onYearChange={setSelectedYear}
              minYear={stats.yearRange.min}
              maxYear={stats.yearRange.max}
            />

            {/* Export / Import buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
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
                  background: '#fffcf5', color: '#8a7a60', fontSize: 12,
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
                  background: '#fffcf5', color: '#8a7a60', fontSize: 12,
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
              <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: '#FFFDF3', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2c2416', fontFamily: '-apple-system, sans-serif', marginBottom: 6 }}>
                  即将导入以下数据：
                </div>
                <div style={{ fontSize: 11, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', lineHeight: 1.7 }}>
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
                      } catch (e: any) {
                        setImportMsg('❌ 导入失败：' + (e?.message || String(e)));
                        setImportPreview(null);
                      }
                    }}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 6, border: 'none',
                      background: '#2a1e0e', color: '#f0e8d4', fontSize: 12,
                      fontWeight: 700, cursor: 'pointer', fontFamily: '-apple-system, sans-serif',
                    }}
                  >
                    确认导入
                  </button>
                  <button
                    onClick={() => setImportPreview(null)}
                    style={{
                      padding: '9px 16px', borderRadius: 6, border: '1px solid #d4c4a0',
                      background: 'transparent', color: '#8a7a60', fontSize: 12,
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
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: importMsg.includes('✅') ? '#2d6a30' : '#c0392b', fontFamily: '-apple-system, sans-serif' }}>
                {importMsg}
              </div>
            )}

            {/* Data source note */}
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 9, color: '#ccc6b8', fontFamily: '-apple-system, sans-serif' }}>
              数据来源：你的摘录记录
            </div>
          </>
        )}
      </div>
    </div>
  );
}
