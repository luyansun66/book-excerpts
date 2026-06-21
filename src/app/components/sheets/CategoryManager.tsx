import { useState } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../store';

interface CategoryManagerProps {
  open: boolean;
  onClose: () => void;
}

export default function CategoryManager({ open, onClose }: CategoryManagerProps) {
  const { categories, addCategory, renameCategory, deleteCategory } = useApp();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await addCategory(newName.trim());
    setNewName('');
  };

  const handleRename = async (id: string) => {
    if (!editingName.trim()) return;
    await renameCategory(id, editingName.trim());
    setEditingId(null);
    setEditingName('');
  };

  const handleDelete = async (id: string) => {
    await deleteCategory(id);
    setConfirmDelete(null);
  };

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
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} />

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxHeight: '80vh',
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
            管理分类
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <X size={18} color="#8a7a60" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {categories.map((cat) => (
            <div
              key={cat.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fffcf5',
                border: '1px solid #e8ddd0',
              }}
            >
              {editingId === cat.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename(cat.id)}
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #d4c4a0',
                    fontSize: 13,
                    fontFamily: '-apple-system, sans-serif',
                    color: '#2c2416',
                    outline: 'none',
                    background: '#fff',
                  }}
                />
              ) : (
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: '-apple-system, sans-serif',
                    color: '#2c2416',
                    fontWeight: cat.isPreset ? 600 : 400,
                  }}
                >
                  {cat.name}
                  {cat.isPreset && (
                    <span style={{ fontSize: 10, color: '#b8ae9a', marginLeft: 6 }}>
                      预置
                    </span>
                  )}
                </span>
              )}

              {/* Actions */}
              {editingId === cat.id ? (
                <>
                  <button
                    onClick={() => handleRename(cat.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 11, color: '#8a7a60', fontFamily: '-apple-system, sans-serif' }}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={13} color="#8a7a60" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditingId(cat.id); setEditingName(cat.name); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                  >
                    <Pencil size={13} color="#b8ae9a" strokeWidth={1.5} />
                  </button>
                  {confirmDelete === cat.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        style={{
                          background: '#c0392b',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          fontSize: 10,
                          fontFamily: '-apple-system, sans-serif',
                        }}
                      >
                        确认
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <X size={13} color="#8a7a60" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(cat.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}
                    >
                      <Trash2 size={13} color="#b8ae9a" strokeWidth={1.5} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Add new category */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              type="text"
              placeholder="新分类名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              style={{
                flex: 1,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #d4c4a0',
                background: '#fffcf5',
                fontSize: 13,
                fontFamily: '-apple-system, sans-serif',
                color: '#2c2416',
                outline: 'none',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: newName.trim() ? '#2a1e0e' : '#c4b498',
                color: '#f0e8d4',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: '-apple-system, sans-serif',
                cursor: newName.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              <Plus size={14} />
              添加
            </button>
          </div>
        </div>

        {/* Footer hint */}
        <div
          style={{
            padding: '8px 20px 24px',
            fontSize: 11,
            color: '#b8ae9a',
            fontFamily: '-apple-system, sans-serif',
            textAlign: 'center',
            borderTop: '1px solid rgba(0,0,0,0.04)',
          }}
        >
          删除分类后，其中的书籍将移至首个分类
        </div>
      </div>
    </div>
  );
}
