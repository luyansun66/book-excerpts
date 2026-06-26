import { useState, useEffect } from 'react';
import { X, Camera } from 'lucide-react';
import { recognizeText, compressImage } from '../../ocr';
import type { Quote } from '../../types';
import ImageCropper from '../ImageCropper';

interface AddQuoteSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: { text: string; thought: string; page: number | null; date: string }) => Promise<void>;
  editQuote?: Quote | null; // if provided, we're editing
}

export default function AddQuoteSheet({ open, onClose, onSave, editQuote }: AddQuoteSheetProps) {
  const [text, setText] = useState(editQuote?.text ?? '');
  const [thought, setThought] = useState(editQuote?.thought ?? '');
  const [page, setPage] = useState(editQuote?.page?.toString() ?? '');
  const [date, setDate] = useState(editQuote?.date ?? new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);

  // Sync form state when editQuote changes
  useEffect(() => {
    if (editQuote) {
      setText(editQuote.text);
      setThought(editQuote.thought);
      setPage(editQuote.page?.toString() ?? '');
      setDate(editQuote.date);
    }
  }, [editQuote]);

  const reset = () => {
    if (!editQuote) {
      setText('');
      setThought('');
      setPage('');
      setDate(new Date().toISOString().slice(0, 10));
    }
  };

  const handleSave = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        text: text.trim(),
        thought: thought.trim(),
        page: page ? parseInt(page, 10) : null,
        date,
      });
      reset();
      onClose();
    } catch (e: unknown) {
      const msg = (e instanceof Error) ? e.message : String(e);
      console.error('Failed to save quote:', msg);
      setSaveError('保存失败: ' + msg.slice(0, 60));
    } finally {
      setSaving(false);
    }
  };

  const isValid = text.trim();

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '82vh',
          background: '#F6F0E7',
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d4c4a0' }} />
        </div>

        {/* Header */}
        <div
          style={{
            padding: '4px 20px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontFamily: 'Georgia, serif',
              fontWeight: 'bold',
              color: '#2c2416',
            }}
          >
            {editQuote ? '编辑摘录' : '添加摘录'}
          </h3>
          <button
            onClick={() => { reset(); onClose(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <X size={18} color="#8a7a60" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quote text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', letterSpacing: 0.3 }}>
              摘录原文 *
            </label>
            <textarea
              placeholder="输入引用的原文段落…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 13,
                lineHeight: 1.7,
                fontFamily: 'Georgia, serif',
                color: '#333',
                outline: 'none',
                resize: 'none',
              }}
            />

            {/* OCR scan button */}
            <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              <button
                onClick={async () => {
                  if (ocrLoading) return;
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.capture = 'environment';
                  input.click();
                  const file: File = await new Promise((resolve, reject) => {
                    input.onchange = () => input.files?.[0] ? resolve(input.files[0]) : reject(new Error('未选择图片'));
                    input.onerror = () => reject(new Error('拍照失败'));
                  });
                  const dataUrl = await compressImage(file, 1280);
                  setCropImage(dataUrl);
                }}
                disabled={ocrLoading}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 6, border: '1px solid #d4c4a0',
                  background: ocrLoading ? '#ece4d8' : '#fffcf5',
                  color: ocrLoading ? '#b8ae9a' : '#8a7a60',
                  fontSize: 11, fontWeight: 600, cursor: ocrLoading ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, sans-serif',
                }}
              >
                <Camera size={12} strokeWidth={1.8} />
                {ocrLoading ? '识别中…' : '拍照识别'}
              </button>
            </div>
          </div>

          {/* Crop dialog */}
          {cropImage && (
            <ImageCropper
              src={cropImage}
              onCrop={async (croppedUrl) => {
                setCropImage(null);
                setOcrLoading(true);
                try {
                  const text = await recognizeText(croppedUrl);
                  if (text.trim()) {
                    setText((prev) => prev ? prev + '\n' + text : text);
                  }
                } catch (e: any) {
                  setSaveError('OCR识别失败: ' + (e?.message || String(e)).slice(0, 60));
                } finally {
                  setOcrLoading(false);
                }
              }}
              onCancel={() => setCropImage(null)}
            />
          )}

          {/* Page */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', letterSpacing: 0.3 }}>
              页码
            </label>
            <input
              type="number"
              placeholder="页码（选填）"
              value={page}
              onChange={(e) => setPage(e.target.value)}
              min={1}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 13,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: '#2c2416',
                outline: 'none',
              }}
            />
          </div>

          {/* Thought */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', letterSpacing: 0.3 }}>
              我的感悟
            </label>
            <textarea
              placeholder="输入你对这段话的想法…"
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              rows={3}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 12.5,
                lineHeight: 1.6,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: '#555',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>

          {/* Date */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#8a7a60', fontFamily: '-apple-system, sans-serif', letterSpacing: 0.3 }}>
              日期
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 13,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: '#2c2416',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          {saveError && (
            <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: '#fff0ee', color: '#a04030', fontSize: 11, fontFamily: '-apple-system, sans-serif', textAlign: 'center' }}>
              {saveError}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 10,
              border: 'none',
              background: isValid && !saving ? '#3F3F3F' : '#c4b498',
              color: isValid && !saving ? '#ffffff' : '#f5f0e8',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              cursor: isValid && !saving ? 'pointer' : 'not-allowed',
              letterSpacing: 0.5,
            }}
          >
            {saving ? '保存中…' : (editQuote ? '保存修改' : '保存')}
          </button>
        </div>
      </div>
    </div>
  );
}
