import type { CSSProperties, MouseEvent } from 'react';
import type { RichScope } from '../richText';
import {
  CUSTOM_MARK_FALLBACK,
  MARK_COLOR_PRESETS,
  normalizeMarkColor,
} from '../quoteMarkColors';

// ─── 编辑页那一行格式按钮 ────────────────────────────────────────────────────
//
// 只在 <textarea> 上做「选区包裹」，不换 contenteditable：换掉要连自动增高、
// OCR 追加、光标恢复、中文输入法组合态一起重做（见设计文档 §6.1）。
//
// 按钮的 onMouseDown 必须 preventDefault —— 否则点一下 textarea 就失焦，
// selectionStart/End 归零，标记会插到文本末尾（第一条踩的就是这个）。

export type FormatCommand = 'bold' | 'mark';

interface CommandSpec {
  cmd: FormatCommand;
  label: string;
  title: string;
}

const COMMANDS: Record<RichScope, CommandSpec[]> = {
  quote: [{ cmd: 'mark', label: '高亮', title: '高亮' }],
  thought: [
    { cmd: 'bold', label: 'B', title: '加粗' },
    { cmd: 'mark', label: '高亮', title: '高亮' },
  ],
};

const BAR_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
};

const BUTTON_STYLE: CSSProperties = {
  minWidth: 26,
  height: 24,
  padding: '0 7px',
  borderRadius: 5,
  border: '1px solid var(--color-field-border)',
  background: 'var(--color-field-bg)',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  cursor: 'pointer',
  lineHeight: 1,
};

const CLEAR_BUTTON_STYLE: CSSProperties = {
  ...BUTTON_STYLE,
  color: 'var(--color-text-muted)',
};

const DIVIDER_STYLE: CSSProperties = {
  width: 1,
  height: 16,
  margin: '0 2px',
  background: 'var(--color-border-light)',
};

const COLOR_GROUP_STYLE: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 5,
  alignItems: 'center',
};

const COLOR_LABEL_STYLE: CSSProperties = {
  marginRight: 1,
  color: 'var(--color-text-muted)',
  fontSize: 10,
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  whiteSpace: 'nowrap',
};

const SWATCH_STYLE: CSSProperties = {
  width: 18,
  height: 18,
  padding: 0,
  borderRadius: '50%',
  cursor: 'pointer',
  outline: 'none',
  flexShrink: 0,
};

interface FormatToolbarProps {
  scope: RichScope;
  onCommand: (cmd: FormatCommand) => void;
  /** 当前这一栏选中的高亮底色；空 = 主题默认 */
  markColor?: string;
  onMarkColorChange?: (color: string) => void;
  /** 本栏是否还有可清除的成对高亮标记 */
  hasHighlights?: boolean;
  onClearHighlights?: () => void;
}

export default function FormatToolbar({
  scope,
  onCommand,
  markColor,
  onMarkColorChange,
  hasHighlights = false,
  onClearHighlights,
}: FormatToolbarProps) {
  const stopBlur = (e: MouseEvent<HTMLButtonElement>) => e.preventDefault();
  const selected = normalizeMarkColor(markColor) ?? '';
  const selectedUpper = selected.toUpperCase();
  const selectedIsPreset = MARK_COLOR_PRESETS.some((item) => item.color.toUpperCase() === selectedUpper);
  const customSelected = Boolean(selected) && !selectedIsPreset;
  const scopeLabel = scope === 'quote' ? '摘录原文' : '我的感悟';

  return (
    <div style={BAR_STYLE} role="toolbar" aria-label={scope === 'quote' ? '摘录原文格式' : '感悟格式'}>
      {COMMANDS[scope].map((spec) => (
        <button
          key={spec.cmd}
          type="button"
          aria-label={spec.title}
          title={spec.title}
          onMouseDown={stopBlur}
          onClick={() => onCommand(spec.cmd)}
          style={BUTTON_STYLE}
        >
          {spec.label}
        </button>
      ))}

      {onClearHighlights && (
        <button
          type="button"
          aria-label={`清除${scopeLabel}全部高亮`}
          title="清除本栏全部高亮（保留文字）"
          disabled={!hasHighlights}
          onMouseDown={stopBlur}
          onClick={onClearHighlights}
          style={{
            ...CLEAR_BUTTON_STYLE,
            opacity: hasHighlights ? 1 : 0.45,
            cursor: hasHighlights ? 'pointer' : 'default',
          }}
        >
          清除高亮
        </button>
      )}

      {onMarkColorChange && (
        <>
          <span aria-hidden="true" style={DIVIDER_STYLE} />
          <div role="group" aria-label={`${scopeLabel}高亮颜色`} style={COLOR_GROUP_STYLE}>
            <span aria-hidden="true" style={COLOR_LABEL_STYLE}>高亮色</span>
            {MARK_COLOR_PRESETS.map((item) => {
              const active = item.color.toUpperCase() === selectedUpper;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.name}
                  aria-pressed={active}
                  title={item.name}
                  onMouseDown={stopBlur}
                  onClick={() => onMarkColorChange(item.color)}
                  style={{
                    ...SWATCH_STYLE,
                    background: item.color || 'var(--color-quote-mark-bg)',
                    border: 'none',
                    boxShadow: active
                      ? '0 0 0 1.5px var(--color-bg), 0 0 0 3px var(--color-text)'
                      : 'inset 0 0 0 1px rgba(0,0,0,0.16)',
                  }}
                />
              );
            })}

            <label
              title="自定义高亮颜色"
              style={{
                ...SWATCH_STYLE,
                position: 'relative',
                background: customSelected
                  ? selected
                  : 'conic-gradient(#e8b4b8, #f3d9a4, #b9dcc0, #b4cde8, #cdbde0, #e8b4b8)',
                boxShadow: customSelected
                  ? '0 0 0 1.5px var(--color-bg), 0 0 0 3px var(--color-text)'
                  : 'inset 0 0 0 1px rgba(0,0,0,0.16)',
              }}
            >
              <input
                type="color"
                aria-label={`${scopeLabel}自定义高亮颜色`}
                value={customSelected ? selected : CUSTOM_MARK_FALLBACK}
                onChange={(e) => onMarkColorChange(normalizeMarkColor(e.target.value) ?? '')}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
