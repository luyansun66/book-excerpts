import { Check } from 'lucide-react';
import {
  SHELF_THEME_OPTIONS,
  useShelfTheme,
  type ShelfTheme,
} from '../../shelf/shelfTheme';

function ClassicPreview() {
  const bars = [
    { height: 42, opacity: 0.72 },
    { height: 50, opacity: 0.52 },
    { height: 46, opacity: 0.64 },
  ];

  return (
    <div
      aria-hidden="true"
      style={{
        height: 58,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {bars.map((bar, index) => (
        <div
          key={index}
          style={{
            width: 16,
            height: bar.height,
            borderRadius: 2,
            background: 'var(--color-text)',
            opacity: bar.opacity,
          }}
        />
      ))}
    </div>
  );
}

function ShelfV2Preview() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 58,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
        <div style={{ width: 7, height: 40, borderRadius: 1, background: 'var(--color-text)', opacity: 0.56 }} />
        <div style={{ width: 10, height: 50, borderRadius: 1, background: 'var(--color-text)', opacity: 0.72 }} />
        <div style={{ width: 6, height: 35, borderRadius: 1, background: 'var(--color-text)', opacity: 0.46 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div style={{ width: 27, height: 7, borderRadius: 1, marginRight: 2, marginBottom: 3, background: 'var(--color-text)', opacity: 0.62 }} />
        <div style={{ width: 30, height: 7, borderRadius: 1, background: 'var(--color-text)', opacity: 0.5 }} />
        <div style={{ width: 34, height: 2, marginTop: 4, borderRadius: 1, background: 'var(--color-text)', opacity: 0.16 }} />
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: ShelfTheme }) {
  return theme === 'classic' ? <ClassicPreview /> : <ShelfV2Preview />;
}

export default function ShelfThemeSection() {
  const [theme, setTheme] = useShelfTheme();

  return (
    <section>
      <div style={{ marginBottom: 10 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: 'Georgia, serif',
            fontSize: 14,
            fontWeight: 'bold',
            color: 'var(--color-text)',
          }}
        >
          书架主题
        </h3>
      </div>

      <div
        role="group"
        aria-label="书架主题"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 10,
        }}
      >
        {SHELF_THEME_OPTIONS.map((option) => {
          const isActive = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTheme(option.id)}
              style={{
                position: 'relative',
                minWidth: 0,
                padding: '10px 10px 11px',
                borderRadius: 12,
                border: isActive
                  ? '1.5px solid var(--color-btn)'
                  : '1px solid var(--color-border-light)',
                background: 'var(--color-bg-card)',
                boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
                color: 'var(--color-text)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              }}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 7,
                    right: 7,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-btn)',
                    color: 'var(--color-btn-text)',
                  }}
                >
                  <Check size={11} strokeWidth={2.8} />
                </span>
              )}

              <ThemePreview theme={option.id} />

              <div style={{ marginTop: 7, fontSize: 12.5, fontWeight: 700 }}>
                {option.name}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 10.5,
                  lineHeight: 1.45,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {option.description}
              </div>
            </button>
          );
        })}
      </div>

      <p
        style={{
          margin: '10px 1px 0',
          fontSize: 10.5,
          lineHeight: 1.55,
          color: 'var(--color-text-secondary)',
        }}
      >
        摆放形式和书脊样式在「书架 v2」主题下生效，在「编辑书籍」里逐本设置。
      </p>
    </section>
  );
}
