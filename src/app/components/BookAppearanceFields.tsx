import type { CSSProperties } from 'react';
import type { Book, BookLayout } from '../types';
import { SPINE_TEMPLATES } from '../shelf/spineTemplates';

export interface BookAppearanceFieldsProps {
  layout: BookLayout;
  spineTemplate: string;
  onLayoutChange: (layout: BookLayout) => void;
  onSpineTemplateChange: (id: string) => void;
}

const LAYOUT_OPTIONS: Array<{ value: BookLayout; name: string }> = [
  { value: 'auto', name: '自动' },
  { value: 'spine', name: '竖放·书脊' },
  { value: 'cover', name: '竖放·书封' },
  { value: 'stack', name: '横放·堆叠' },
];

/**
 * 书脊样式的预览样本。书脊模版只认书名和作者，其余字段排不到，所以这里造一本
 * 最小可用的样书——不用真书，免得逐本改书名时预览跟着跳。
 */
const PREVIEW_BOOK = { title: '书名', author: '作者' } as unknown as Book;
/**
 * 预览的尺寸：宽高比和书架上的书脊完全一致（27 : 145），整体收小一档当缩略图用。
 * 18 套模版并排时一屏能多放几张，不用来回滚；字号也跟着变小一档，仍是所见即所得。
 */
const PREVIEW_WIDTH = 24;
const PREVIEW_HEIGHT = 129;

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--color-text-accent)',
  fontFamily: 'var(--font-sans)',
} as const;

const groupStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
} as const;

function chipStyle(selected: boolean): CSSProperties {
  return {
    flex: '1 1 68px',
    minWidth: 0,
    padding: '9px 8px',
    borderRadius: 8,
    border: `1px solid ${selected ? 'var(--color-btn)' : 'var(--color-field-border)'}`,
    background: selected ? 'var(--color-btn)' : 'var(--color-field-bg)',
    color: selected ? 'var(--color-btn-text)' : 'var(--color-text-secondary)',
    fontFamily: 'var(--font-sans)',
    textAlign: 'left',
    cursor: 'pointer',
  };
}

/**
 * 书脊卡片：里面直接放一条真书脊，不留名字。
 *
 * 底色不跟着选中态走——「哑光黑」「晕染」这类深色书脊压在选中态的深底上会糊成
 * 一块，所以选中改用外圈套一道描边表示，卡片自己只留输入框那层底色。
 */
function spineChipStyle(selected: boolean): CSSProperties {
  return {
    display: 'block',
    padding: 3,
    borderRadius: 6,
    lineHeight: 0,
    background: 'var(--color-field-bg)',
    border: `1px solid ${selected ? 'var(--color-btn)' : 'var(--color-field-border)'}`,
    boxShadow: selected ? '0 0 0 2px var(--color-btn)' : undefined,
    cursor: 'pointer',
  };
}

/**
 * 添加/编辑书籍共用的「摆放形式 + 书脊样式」控件组。
 *
 * 默认值由调用方的 state 初值负责，这里不提供「未选择」分支：用户不点，
 * 保存的就是「自动」与默认书脊模版。
 */
export default function BookAppearanceFields({
  layout,
  spineTemplate,
  onLayoutChange,
  onSpineTemplateChange,
}: BookAppearanceFieldsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={labelStyle}>摆放形式</div>
      <div role="group" aria-label="摆放形式" style={groupStyle}>
        {LAYOUT_OPTIONS.map((option) => {
          const selected = layout === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onLayoutChange(option.value)}
              style={chipStyle(selected)}
            >
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                {option.name}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ ...labelStyle, marginTop: 2 }}>书脊样式</div>
      <div role="group" aria-label="书脊样式" style={groupStyle}>
        {SPINE_TEMPLATES.map((template) => {
          const selected = spineTemplate === template.id;
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={selected}
              /** 卡片里只有画，名字留给读屏和长按提示 */
              aria-label={template.name}
              title={template.name}
              onClick={() => onSpineTemplateChange(template.id)}
              style={spineChipStyle(selected)}
            >
              {template.render({
                book: PREVIEW_BOOK,
                width: PREVIEW_WIDTH,
                height: PREVIEW_HEIGHT,
                vertical: true,
                thickness: PREVIEW_WIDTH,
              })}
            </button>
          );
        })}
      </div>
    </div>
  );
}
