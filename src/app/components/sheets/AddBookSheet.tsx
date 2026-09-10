import { useState, useRef, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { useApp } from '../../store';
import type { Book } from '../../types';

const SOURCE_LABEL: Record<BookCandidate['source'], string> = {
  douban: '豆瓣',
  google: 'Google Books',
  openlibrary: 'Open Library',
};

/** 封面缩略图：图挂了（代理返回 404、或网络抖动）就退回空封面框。
 *  直接 <img> 的话浏览器会留一个破图图标，比空框更像 bug。
 *  记的是「哪张图挂了」而不是布尔值，这样换一本书时能自动恢复。 */
function CoverThumb({ src, width, height, radius }: { src: string | null; width: number; height: number; radius: number }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const box = { width, height, borderRadius: radius, flexShrink: 0, background: '#ece4d8' } as const;

  if (!src || brokenSrc === src) return <div style={box} />;

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBrokenSrc(src)}
      style={{ ...box, objectFit: 'cover' }}
    />
  );
}

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
  publisher: string | null;
  cover: string | null;
  source: 'douban' | 'google' | 'openlibrary';
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

  // ── Smart search: enter key trigger ─────────────────────────────────────
  const handleSearch = async () => {
    const q = title.trim();
    if (q.length < 2) return;

    setSearching(true);
    setShowResults(true);
    setSearchResults([]);

    try {
      const resp = await fetch(`/api/books/search?q=${encodeURIComponent(q)}`);
      const data = (await resp.json()) as { results?: BookCandidate[] };
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  // ── Compress image before storing ──────────────────────────────────────
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
      const reader = new FileReader();
      reader.onload = (ev) => setCoverDataUrl(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Select a search candidate and auto-fill author + cover
  const handleSelectCandidate = (candidate: BookCandidate) => {
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
        coverType = 'upload';
        coverData = coverDataUrl;
      } else {
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

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: '#a09070',
    marginBottom: 8,
    fontFamily: '-apple-system, sans-serif',
  };

  const cardStyle: React.CSSProperties = {
    borderRadius: 10,
    background: '#fffcf5',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  };

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
          maxHeight: '60vh',
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

        {/* Header: 取消 / 添加书籍 / 添加 (pill buttons) */}
        <div
          style={{
            padding: '4px 20px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <button
            onClick={() => { reset(); onClose(); }}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: '1px solid #d4c4a0',
              background: '#fffcf5',
              cursor: 'pointer',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              fontFamily: '-apple-system, sans-serif',
            }}
          >
            取消
          </button>
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
            onClick={handleSave}
            disabled={!isValid}
            style={{
             padding: '6px 16px',
             borderRadius: 20,
             border: 'none',
              background: isValid ? '#2C2216' : '#E0D8C8',
              cursor: isValid ? 'pointer' : 'not-allowed',
             fontSize: 14,
             fontWeight: 600,
              color: isValid ? '#FFFFFF' : '#8A7A60',
             fontFamily: '-apple-system, sans-serif',
           }}
         >
           添加
         </button>
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── First Section: Search ── */}
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="搜索书名"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setShowResults(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 14,
                outline: 'none',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                color: 'var(--color-text)',
              }}
            />

            {showResults && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  borderRadius: 12,
                  border: '1px solid rgba(0,0,0,0.08)',
                  background: '#fffcf5',
                  boxShadow: '0 12px 28px rgba(0,0,0,0.16)',
                  overflow: 'hidden',
                }}
              >
                {searching ? (
                  <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>
                    搜索中…
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((candidate) => (
                    <button
                      key={`${candidate.source}-${candidate.title}-${candidate.author}`}
                      onClick={() => handleSelectCandidate(candidate)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        width: '100%',
                        padding: '12px 16px',
                        border: 'none',
                        borderBottom: '1px solid rgba(0,0,0,0.05)',
                        background: 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      }}
                    >
                      <CoverThumb src={candidate.cover} width={56} height={78} radius={4} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.title}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {candidate.author || '未知作者'}{candidate.year ? ` · ${candidate.year}` : ''}
                        </div>
                        <div style={{ fontSize: 11, color: '#9a8a70', marginTop: 2 }}>
                          {SOURCE_LABEL[candidate.source]}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>
                    未找到，可手动填写
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Second Section: Basic Info ── */}
          <div>
            <div style={sectionTitleStyle}>基本信息</div>
            <div style={cardStyle}>
              {/* Title */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ width: 60, fontSize: 14, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>书名 *</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    flex: 1,
                    marginLeft: 15,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                   color: 'var(--color-text)',
                    textAlign: 'left',
                 }}
               />
             </div>
             {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ width: 60, fontSize: 14, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>作者 *</span>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  style={{
                    flex: 1,
                    marginLeft: 15,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                   color: 'var(--color-text)',
                    textAlign: 'left',
                 }}
               />
             </div>
              {/* Category — text centered inside the select */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
                <span style={{ width: 60, fontSize: 14, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif' }}>分类</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  style={{
                    flex: 1,
                    marginLeft: 15,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    outline: 'none',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    color: 'var(--color-text)',
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Third Section: Cover ── */}
          <div>
            <div style={sectionTitleStyle}>封面</div>
            <div style={cardStyle}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
                {coverDataUrl ? (
                  <CoverThumb src={coverDataUrl} width={80} height={120} radius={6} />
                ) : (
                  <div style={{ width: 80, height: 120, borderRadius: 6, background: '#ece4d8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Upload size={24} color="#b0a080" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 20,
                    border: '1px solid #d4c4a0',
                    background: '#fffcf5',
                    fontSize: 13,
                    color: 'var(--color-text)',
                    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  从相册选择
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
