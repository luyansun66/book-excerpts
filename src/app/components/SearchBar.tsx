import { Search, X } from 'lucide-react';
import { useApp } from '../store';

export default function SearchBar() {
  const { searchQuery, setSearchQuery } = useApp();

  return (
    <div
      style={{
        padding: '10px 18px 0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255,255,255,0.55)',
          borderRadius: 10,
          padding: '8px 12px',
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <Search size={14} color="#9a8a6a" strokeWidth={2} />
        <input
          type="text"
          placeholder="搜索摘录内容…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            outline: 'none',
            fontSize: 13,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
            color: '#2c2416',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              lineHeight: 1,
            }}
          >
            <X size={14} color="#9a8a6a" strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
