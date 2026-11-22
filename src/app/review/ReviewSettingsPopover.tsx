import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type {
  ReviewPreferences,
  ReviewReadFilter,
  ReviewSortMode,
  ReviewViewMode,
} from './excerptFeedState';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLDivElement | null>;
  preferences: ReviewPreferences;
  onChange: (next: ReviewPreferences) => void;
  onShuffle: () => void;
}

type Position = { top: number; left: number };

function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 6.5h16" />
        <path d="M4 12h16" />
        <path d="M4 17.5h16" />
      </g>
      <g fill="currentColor">
        <circle cx="8.2" cy="6.5" r="2.1" />
        <circle cx="15.6" cy="12" r="2.1" />
        <circle cx="10.2" cy="17.5" r="2.1" />
      </g>
    </svg>
  );
}

function OptionButton({
  checked,
  children,
  onSelect,
}: {
  checked: boolean;
  children: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className="review-settings-option"
      onClick={onSelect}
    >
      {children}
    </button>
  );
}

export default function ReviewSettingsPopover({
  open,
  onOpenChange,
  anchorRef,
  preferences,
  onChange,
  onShuffle,
}: Props) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const [position, setPosition] = useState<Position>({ top: 12, left: 12 });

  const updatePosition = () => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const width = popover?.offsetWidth || Math.min(292, window.innerWidth - 24);
    const height = popover?.offsetHeight || 260;
    const margin = 12;
    const below = anchorRect.bottom + 8;
    const above = anchorRect.top - height - 8;
    const top = below + height <= window.innerHeight - margin
      ? below
      : Math.max(margin, above);
    const left = Math.max(
      margin,
      Math.min(anchorRect.right - width, window.innerWidth - width - margin),
    );
    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const close = () => {
    try {
      if (window.history.state?.reviewSettings) {
        window.history.back();
        return;
      }
    } catch {
      // 没有 history 的 WebView 直接改本地状态。
    }
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) buttonRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }
    wasOpenRef.current = true;
    try {
      if (!window.history.state?.reviewSettings) {
        window.history.pushState({ ...(window.history.state || {}), reviewSettings: true }, '');
      }
    } catch {
      // 无 history 时仍可通过点击外部和 Esc 关闭。
    }
    const popover = popoverRef.current;
    const first = popover?.querySelector<HTMLElement>(
      'button[aria-checked="true"], button',
    );
    first?.focus();

    const onPopState = () => onOpenChange(false);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !popoverRef.current) return;
      const focusable = Array.from(
        popoverRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    const onViewportChange = () => updatePosition();

    window.addEventListener('popstate', onPopState);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, onOpenChange]);

  const setView = (viewMode: ReviewViewMode) => onChange({ ...preferences, viewMode });
  const setRead = (readFilter: ReviewReadFilter) => onChange({ ...preferences, readFilter });
  const setSort = (sortMode: ReviewSortMode) => onChange({ ...preferences, sortMode });

  return (
    <div className="review-settings-anchor" ref={anchorRef}>
      <button
        ref={buttonRef}
        type="button"
        className="review-settings-button"
        aria-label={open ? '关闭回顾视图与筛选' : '打开回顾视图与筛选'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="review-settings-popover"
        onClick={() => (open ? close() : onOpenChange(true))}
      >
        <SlidersIcon />
      </button>

      {open && (
        <div
          id="review-settings-popover"
          ref={popoverRef}
          className="review-settings-popover"
          role="dialog"
          aria-modal="false"
          aria-label="回顾视图与筛选"
          style={position}
        >
          <fieldset className="review-settings-group">
            <legend className="review-settings-legend">视图</legend>
            <div className="review-settings-options" role="radiogroup" aria-label="视图">
              <OptionButton checked={preferences.viewMode === 'flip'} onSelect={() => setView('flip')}>
                翻页
              </OptionButton>
              <OptionButton checked={preferences.viewMode === 'feed'} onSelect={() => setView('feed')}>
                双列
              </OptionButton>
            </div>
          </fieldset>

          <fieldset className="review-settings-group">
            <legend className="review-settings-legend">筛选</legend>
            <div className="review-settings-options" role="radiogroup" aria-label="阅读状态">
              <OptionButton checked={preferences.readFilter === 'all'} onSelect={() => setRead('all')}>
                全部
              </OptionButton>
              <OptionButton checked={preferences.readFilter === 'unread'} onSelect={() => setRead('unread')}>
                未看
              </OptionButton>
              <OptionButton checked={preferences.readFilter === 'viewed'} onSelect={() => setRead('viewed')}>
                看过
              </OptionButton>
            </div>
          </fieldset>

          <fieldset className="review-settings-group">
            <legend className="review-settings-legend">收藏</legend>
            <div className="review-settings-switch-row">
              <span id="favorites-only-label">只看摘录收藏</span>
              <button
                type="button"
                role="switch"
                className="review-settings-switch"
                aria-checked={preferences.favoritesOnly}
                aria-labelledby="favorites-only-label"
                onClick={() =>
                  onChange({ ...preferences, favoritesOnly: !preferences.favoritesOnly })
                }
              >
                <span aria-hidden="true" />
              </button>
            </div>
          </fieldset>

          <fieldset className="review-settings-group">
            <legend className="review-settings-legend">排序</legend>
            <div className="review-settings-options" role="radiogroup" aria-label="排序">
              <OptionButton checked={preferences.sortMode === 'latest'} onSelect={() => setSort('latest')}>
                最新添加
              </OptionButton>
              <OptionButton checked={preferences.sortMode === 'random'} onSelect={() => setSort('random')}>
                随机
              </OptionButton>
            </div>
            {preferences.sortMode === 'random' && (
              <button type="button" className="review-settings-shuffle" onClick={onShuffle}>
                换一换
              </button>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}
