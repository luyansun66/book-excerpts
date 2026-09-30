import { useEffect, useState } from 'react';
import { useApp } from '../../store';
import LabelColorSwatches from '../LabelColorSwatches';
import { MAX_LABEL_TEXT_LENGTH, resolveLabelStyle } from '../../bookLabel';

/**
 * 「读完」角标的全局默认文案与颜色。
 *
 * 这里是默认值，不是唯一值：单本书可以在「编辑书籍信息」里覆盖。
 * 文案用本地 state、失焦/回车才提交——直接绑 store 的话，清空输入框会被
 * 立刻归一成「读完」，反而打不出新文案。
 */
export default function FinishedLabelSection() {
  const { finishedLabel, setFinishedLabel } = useApp();
  const [text, setText] = useState(finishedLabel.text);

  useEffect(() => {
    setText(finishedLabel.text);
  }, [finishedLabel.text]);

  const commitText = () => setFinishedLabel({ text, color: finishedLabel.color });
  // 预览直接走和封面同一套解析，所见即所得
  const preview = resolveLabelStyle({ label: { text: text || null, color: finishedLabel.color } }, finishedLabel);

  return (
    <div
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 14,
        padding: 16,
        border: '1px solid var(--color-border-light)',
        boxShadow: 'var(--shadow-card)',
        marginBottom: 12,
      }}
    >
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 'bold', color: 'var(--color-text)', marginBottom: 5 }}>
        读完角标
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'var(--font-sans)', lineHeight: 1.6, marginBottom: 12 }}>
        标记过「读完」的书，会在书封右上角显示这个角标。单本书可以在「编辑书籍信息」里单独改。
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {/* 照着封面右上角那块画一个预览，改完不用翻回书架确认 */}
        <div
          aria-hidden
          style={{
            width: 46,
            height: 68,
            flexShrink: 0,
            borderRadius: '3px 4px 4px 3px',
            background: 'linear-gradient(160deg, #4A3927 0%, #2A2118 70%)',
            boxShadow: '2px 4px 12px rgba(0,0,0,0.22)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              maxWidth: '92%',
              padding: '1.5px 4px',
              background: preview.bg,
              color: preview.fg,
              fontFamily: 'var(--font-sans)',
              fontSize: 7,
              fontWeight: 600,
              letterSpacing: 0.25,
              lineHeight: 1.25,
              borderBottomLeftRadius: 2.5,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {preview.text}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            type="text"
            value={text}
            maxLength={MAX_LABEL_TEXT_LENGTH}
            placeholder="读完"
            aria-label="角标文案"
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg-card-alt)',
              fontSize: 13,
              outline: 'none',
              fontFamily: '-apple-system, sans-serif',
              color: 'var(--color-text)',
            }}
          />
          <LabelColorSwatches
            value={finishedLabel.color}
            onChange={(color) => setFinishedLabel({ text, color })}
          />
        </div>
      </div>
    </div>
  );
}
