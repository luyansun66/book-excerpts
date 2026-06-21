import { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import { useApp } from '../../store';
import type { Book } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────
interface AddBookSheetProps {
  open: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AddBookSheet({ open, onClose }: AddBookSheetProps) {
  const { categories, addBook } = useApp();

  // Form state
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');

  // Fix: set default category after categories finish loading
  useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.id === categoryId)) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form
  const reset = () => {
    setTitle('');
    setAuthor('');
    setCategoryId(categories[0]?.id ?? '');
    setCoverDataUrl(null);
    setCoverFile(null);
  };

  // ── Compress image before storing ──────────────────────────────────────
  // Resizes to max 300px on the long side, JPEG 80% quality,
  // reducing base64 size from ~10MB to ~50KB.
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 300;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      const reader = new FileReader();
      reader.onload = (ev) => { img.src = ev.target?.result as string; };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  };

  // File upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    try {
      const compressed = await compressImage(file);
      setCoverDataUrl(compressed);
    } catch {
      // Fallback: store raw
      const reader = new FileReader();
      reader.onload = (ev) => setCoverDataUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Save
  const handleSave = async () => {
    if (!title.trim() || !author.trim() || !categoryId) return;

    let coverType: Book['coverType'] = null;
    let coverData: string | null = null;

    if (coverDataUrl) {
      if (coverFile) {
        // User-uploaded image: store as base64 data URL
        coverType = 'upload';
        coverData = coverDataUrl;
      } else {
        // URL from external source
        coverType = 'url';
        coverData = coverDataUrl;
      }
    }

    await addBook({
      title: title.trim(),
      author: author.trim(),
      categoryId,
      coverType,
      coverData,
    });

    reset();
    onClose();
  };

  const isValid = title.trim() && author.trim() && categoryId;

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
          maxHeight: '85vh',
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
            添加书籍
          </h3>
          <button
            onClick={() => { reset(); onClose(); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <X size={18} color="#8a7a60" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          <input
            type="text"
            placeholder="书名 *"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #d4c4a0',
              background: '#fffcf5',
              fontSize: 13,
              outline: 'none',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              color: '#2c2416',
            }}
          />

          <input
            type="text"
            placeholder="作者 *"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #d4c4a0',
              background: '#fffcf5',
              fontSize: 13,
              outline: 'none',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              color: '#2c2416',
            }}
          />

          {/* Category selector */}
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #d4c4a0',
              background: '#fffcf5',
              fontSize: 13,
              outline: 'none',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              color: '#2c2416',
            }}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* Cover upload */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px dashed #d4c4a0',
                background: '#fffcf5',
                cursor: 'pointer',
                fontSize: 13,
                color: '#8a7a60',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {coverDataUrl ? (
                <>
                  <img
                    src={coverDataUrl}
                    alt="封面预览"
                    style={{ width: 28, height: 40, objectFit: 'cover', borderRadius: 2 }}
                  />
                  <span>点击更换封面</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>上传封面图片（选填）</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <button
            onClick={handleSave}
            disabled={!isValid}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 10,
              border: 'none',
              background: isValid ? '#2a1e0e' : '#c4b498',
              color: isValid ? '#f0e8d4' : '#f5f0e8',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              cursor: isValid ? 'pointer' : 'not-allowed',
              letterSpacing: 0.5,
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
