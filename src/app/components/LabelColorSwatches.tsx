import { FINISHED_LABEL_PRESETS } from '../bookLabel';

/**
 * 「读完」角标的 6 个预设色。
 *
 * 编辑书籍面板和设置页的默认值都要用同一排色块，所以抽出来一份：
 * 两处的选中态（外圈圆环）能保持一致，也免得改色板时漏掉一处。
 * 不做自由取色——预设之外的颜色在封面上读不清，见 bookLabel.ts。
 */
export default function LabelColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    // 上下各留 4px：选中环画在圆外面，贴着行边会被上下的容器裁掉。
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '4px 2px' }}>
      {FINISHED_LABEL_PRESETS.map((preset) => {
        const active = value === preset.bg;
        return (
          <button
            key={preset.bg}
            type="button"
            onClick={() => onChange(preset.bg)}
            aria-label={`角标颜色：${preset.name}`}
            aria-pressed={active}
            title={preset.name}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              padding: 0,
              cursor: 'pointer',
              background: preset.bg,
              border: 'none',
              boxShadow: active
                ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${preset.bg}`
                : '0 0 0 1px var(--color-border-light)',
              transition: 'box-shadow 0.15s ease',
            }}
          />
        );
      })}
    </div>
  );
}
