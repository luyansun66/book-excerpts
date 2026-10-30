// 每条摘录自己的高亮底色。存 `#RRGGBB`，空值表示交给主题令牌。
//
// 分类色（quote.color）是卡片左侧竖条和蒙层用的，不能拿来当高亮色：
// 同一条摘录可以「分类是绿色、正文高亮是米黄」，两个维度要分开。

export interface MarkColorPreset {
  id: string;
  name: string;
  /** 空字符串 = 主题默认的荧光笔底色 */
  color: string;
}

export const MARK_COLOR_PRESETS: readonly MarkColorPreset[] = [
  { id: 'theme', name: '默认', color: '' },
  { id: 'gold', name: '米黄', color: '#F6E6BC' },
  { id: 'yellow', name: '浅黄', color: '#F7E7A8' },
  { id: 'green', name: '薄荷', color: '#CFE8D5' },
  { id: 'blue', name: '天蓝', color: '#CFE0F2' },
  { id: 'pink', name: '浅粉', color: '#F3D3D8' },
  { id: 'grey', name: '浅灰', color: '#E4E0D8' },
] as const;

/** 自定义取色器第一次打开时的起始色。 */
export const CUSTOM_MARK_FALLBACK = '#F6E6BC';

/**
 * 只接受六位十六进制色值。旧备份 / 手改的云数据里可能有任意字符串，
 * 认不出来就当作没设过，回落到主题默认，而不是把非法值塞进 style。
 */
export function normalizeMarkColor(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : undefined;
}
