import { useState } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../store';

export default function CategorySection() {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                color: 'var(--color-text)',
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
                color: 'var(--color-text)',
                fontWeight: cat.isPreset ? 600 : 400,
              }}
            >
              {cat.name}
              {cat.isPreset && (
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                  预置
                </span>
              )}
            </span>
          )}

          {editingId === cat.id ? (
            <>
              <button
                onClick={() => handleRename(cat.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: '-apple-system, sans-serif' }}
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
                      background: 'var(--color-danger)',
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

      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
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
            color: 'var(--color-text)',
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
            background: newName.trim() ? 'var(--color-btn)' : 'var(--color-btn-disabled)',
            color: 'var(--color-btn-text)',
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

      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: '-apple-system, sans-serif', textAlign: 'center', paddingTop: 4 }}>
        删除分类后，其中的书籍将移至首个分类
      </div>
    </div>
  );
}
