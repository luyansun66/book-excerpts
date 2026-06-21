import { useApp } from '../store';
import type { SearchResult } from '../db';

interface SearchResultsProps {
  onSelectResult: (result: SearchResult) => void;
}

export default function SearchResults({ onSelectResult }: SearchResultsProps) {
  const { searchResults, searchQuery } = useApp();

  if (searchResults.length === 0) {
    return (
      <div
        style={{
          padding: '60px 20px',
          textAlign: 'center',
          color: '#b8ae9a',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>&#x201C; &#x201D;</div>
        没有找到匹配「{searchQuery}」的摘录
      </div>
    );
  }

  const highlight = (text: string, keyword: string) => {
    if (!keyword.trim()) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(keyword)})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === keyword.toLowerCase() ? (
        <span key={i} style={{ background: '#d4a83033', fontWeight: 600 }}>{part}</span>
      ) : (
        part
      ),
    );
  };

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          color: '#b8ae9a',
          fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          paddingLeft: 4,
          letterSpacing: 0.3,
        }}
      >
        共 {searchResults.length} 条匹配结果
      </div>
      {searchResults.map((result) => (
        <button
          key={result.quote.id}
          onClick={() => onSelectResult(result)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: '#FFFDF3',
            borderRadius: 14,
            padding: '14px 16px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
        >
          {/* Quote text with highlight */}
          <div
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 12.5,
              lineHeight: 1.7,
              color: '#333',
              marginBottom: 8,
            }}
          >
            {highlight(result.quote.text, searchQuery)}
          </div>

          {/* Book info */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10.5,
              color: '#b8ae9a',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            }}
          >
            <span>
              《{result.bookTitle}》 · {result.bookAuthor}
            </span>
            {result.quote.page && <span>P.{result.quote.page}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
