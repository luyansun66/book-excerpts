import { useState, useRef, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import { useApp } from '../../store';
import type { Book } from '../../types';

// ─── Props ────────────────────────────────────────────────────────────────────
interface AddBookSheetProps {
  open: boolean;
  onClose: () => void;
}

interface BookCandidate {
  title: string;
  author: string;
  year: string | null;
  isbn: string | null;
  cover: string | null;
  source: 'google' | 'openlibrary';
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

  // Smart search state
  const [searchResults, setSearchResults] = useState<BookCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form
  const reset = () => {
    setTitle('');
    setAuthor('');
    setCategoryId(categories[0]?.id ?? '');
    setCoverDataUrl(null);
    setCoverFile(null);
    setSearchResults([]);
    setSearching(false);
    setShowResults(false);
  };

  // ── Smart search: debounce title input ────────────────────────────────
  useEffect(() => {
    const q = title.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      setShowResults(false);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const resp = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await resp.json()) as { results?: BookCandidate[] };
        if (!active) return;
        setSearchResults(data.results ?? []);
        setShowResults(true);
      } catch (err) {
        if (active && (err as Error).name !== 'AbortError') {
          setSearchResults([]);
          setShowResults(false);
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [title]);

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

  // Select a search candidate and auto-fill author + cover
  const handleSelectCandidate = (candidate: BookCandidate) => {
    // 只有当候选标题是中文原文时才覆盖用户输入的书名，
    // 避免用 Google 返回的拼音/英文标题替换掉用户输入的中文书名。
    if (/[\u4e00-\u9fff]/.test(candidate.title)) {
      setTitle(candidate.title);
    }
    setAuthor(candidate.author);
    setCoverDataUrl(candidate.cover);
    setCoverFile(null);
    setSearchResults([]);
    setShowResults(false);
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
          background: 'var(--color-bg)',
          borderRadius: '20px 20px 0 0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--color-border)' }} />
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
              color: 'var(--color-text)',
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

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="书名 *"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 13,
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: 'var(--color-text)',
              }}
            />

            {showResults && (searching || searchResults.length > 0) && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  borderRadius: 10,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: '#fffcf5',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                  overflow: 'hidden',
                }}
              >
                {searching && searchResults.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>
                    搜索中…
                  </div>
                ) : (
                  searchResults.map((candidate) => (
                    <button
                      key={`${candidate.source}-${candidate.title}-${candidate.author}`}
                      onClick={() => handleSelectCandidate(candidate)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        borderBottom: '1px solid rgba(0,0,0,0.05)',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      }}
                    >
                      {candidate.cover ? (
                        <img
                          src={candidate.cover}
                          alt=""
                          style={{ width: 26, height: 36, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 26, height: 36, borderRadius: 2, flexShrink: 0, background: '#ece4d8' }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.author || '未知作者'}{candidate.year ? ` · ${candidate.year}` : ''}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

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
              color: 'var(--color-text)',
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
              color: 'var(--color-text)',
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
                color: 'var(--color-text-secondary)',
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
              background: isValid ? 'var(--color-btn)' : 'var(--color-btn-disabled)',
              color: isValid ? 'var(--color-btn-text)' : '#f5f0e8',
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
