/**
 * 两种书架主题共用的搁板横条。
 *
 * 样式从旧版 ShelfRow 原样搬出：这里是「位置移动」，不借机调外观，
 * 经典主题的搁板必须一个像素都不变。
 */
export default function ShelfBoard({ topGap = 4 }: { topGap?: number }) {
  return (
    <div
      style={{
        margin: `${topGap}px 18px 0`,
        height: 9,
        borderRadius: 4,
        background: 'var(--shelf-surface)',
        boxShadow: '0px 4px 6px 0px rgba(0, 0, 0, 0.2)',
      }}
    />
  );
}
