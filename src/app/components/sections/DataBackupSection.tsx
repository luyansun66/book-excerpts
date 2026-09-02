import { useState, useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { exportAllData, exportMarkdown, importAllData } from '../../db';
import type { ExportData } from '../../db';
import { useApp } from '../../store';

export default function DataBackupSection() {
  const { refreshData } = useApp();
  const [importPreview, setImportPreview] = useState<ExportData | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div style={{
        background: 'var(--color-bg-card)',
        borderRadius: 14,
        padding: '28px 16px',
        border: '1px solid var(--color-border-light)',
        boxShadow: 'var(--shadow-card)',
        marginTop: 4,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
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
              padding: '10px 16px', borderRadius: 8, border: '1px solid #d4c4a0',
              background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
              fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Download size={13} strokeWidth={1.8} />
            导出 JSON
          </button>
          <button
            onClick={async () => {
              try {
                const md = await exportMarkdown();
                const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `摘录备份-${new Date().toISOString().slice(0, 10)}.md`;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                  document.body.removeChild(link);
                  URL.revokeObjectURL(url);
                }, 300);
              } catch (e: any) {
                console.error('导出 Markdown 失败', e);
              }
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 8, border: '1px solid #d4c4a0',
              background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
              fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Download size={13} strokeWidth={1.8} />
            导出 Markdown
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 8, border: '1px solid #d4c4a0',
              background: '#fffcf5', color: 'var(--color-text-secondary)', fontSize: 12,
              fontWeight: 600, fontFamily: '-apple-system, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Upload size={13} strokeWidth={1.8} />
            导入备份
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 10, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif', opacity: 0.6 }}>
          导入备份，仅支持 JSON 格式
        </div>
      </div>

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

      {importPreview && (
        <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, background: 'var(--color-bg-card)', boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
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
                  setImportPreview(null);
                  await refreshData();
                  setImportMsg(`✅ 导入完成：${result.categories} 个分类、${result.books} 本书、${result.quotes} 条摘录`);
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

      {importMsg && (
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: importMsg.includes('✅') ? 'var(--color-success-text)' : 'var(--color-danger)', fontFamily: '-apple-system, sans-serif' }}>
          {importMsg}
        </div>
      )}
    </div>
  );
}
