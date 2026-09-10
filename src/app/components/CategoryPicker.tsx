/**
 * 「添加书籍」里的分类选择器 —— iOS 风格的磨砂玻璃面板。
 *
 * 材质沿用 tokens.css 里那套 glass 令牌（阅读计时器、确认弹窗同款）：
 * backdrop-filter 负责磨砂，背景只给一层极淡的 tint，上缘一道内高光勾出玻璃厚度。
 * 面板是一整块浮起来的材质，所以磨砂比小碎片更厚、阴影更深。
 *
 * 几个刻意的取舍：
 * - 文字不用纯灰。隔着模糊读小字本来就吃力，所以正文用主色、标题用次级色 + 600 字重，
 *   让文字靠对比度和字重站稳，而不是靠颜色。（vibrancy）
 * - 出场是弹簧缩放进场（scale + blur 一起走），起点锚在触发它的那一行上，
 *   这样「点哪儿 → 从哪儿冒出来」的空间关系是连着的。（materials / spatial consistency）
 * - 按压反馈走 :active，按下就响应，不等抬手。（response）
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { Category } from '../types';

/**
 * 一整块浮起来的材质，磨砂给厚一点；小碎片用 14px 就够。
 * 半径得够大，是因为面板后面压着一整屏内容（插画、表单文字）：
 * 糊不开的话，tint 再厚也会透出可辨认的形状，看着乱；
 * 糊开了才只剩一片色晕，这时候把 tint 调薄反而是玻璃感的来源。
 * brightness 让透过来的底色发亮，iOS 的材质就是这么「亮」起来的。
 */
const GLASS_FILTER = 'blur(40px) saturate(180%) brightness(1.08)';
/** 临界阻尼、不 overshoot：材质到位就停，不该弹跳。 */
const MATERIALIZE = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 } as const;
/** iOS 的最小可点尺寸，行和行尾按钮都不低于它。 */
const TAP_TARGET = 44;
/**
 * 列表行的实际高度。压在 44 的可点下限之上一点点，是为了让 14px 的字
 * 上下各有约 15px 的呼吸位 —— 再高列表就显得松散，再矮就顶到可点下限了。
 */
const ROW_HEIGHT = 45;
/** 这一层叠在「添加书籍」弹窗之上，父层再压暗一档，否则两层字会互相干扰。 */
const STACKED_SCRIM = 'rgba(28,22,12,0.35)';

/**
 * 玻璃的出场动效只能动 transform 和 opacity —— 不能在它身上或它的任何祖先身上挂
 * filter。带 filter 的祖先会新建一个 backdrop root，backdrop-filter 就采样不到
 * 面板后面的东西了：磨砂静默失效，面板退化成一块半透明底色（看着就像纯色卡片）。
 * 所以要虚化出场的话，只能虚化里面的内容层，不能虚化玻璃自己。
 */
const MATERIALIZE_GLASS = { opacity: 0, scale: 0.92 } as const;
const MATERIALIZE_CONTENT = { filter: 'blur(8px)' } as const;

/** getBoundingClientRect 里我们真正用到的那几个值。 */
export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 面板的缩放锚点：落在触发元素中心，这样面板像是从那行里长出来的
 * （transform-origin 相对面板自己的左上角）。
 * 拿不到尺寸时返回 null，调用方兜底回到中心 —— 否则会算出 NaN，
 * 整块面板会直接渲染不出来。
 */
export function scaleOriginFor(panel: RectLike, anchor: RectLike): string | null {
  if (!panel.width || !panel.height || !anchor.width || !anchor.height) return null;
  const x = anchor.left + anchor.width / 2 - panel.left;
  const y = anchor.top + anchor.height / 2 - panel.top;
  return `${Math.round(x)}px ${Math.round(y)}px`;
}

interface CategoryPickerProps {
  open: boolean;
  categories: Category[];
  selectedId: string;
  canDelete: boolean;
  /** 触发这个面板的元素，用来算缩放的锚点。 */
  anchorEl: HTMLElement | null;
  onSelect: (id: string) => void;
  onDelete: (category: Category) => void;
  onCreate: () => void;
  onClose: () => void;
}

export default function CategoryPicker({
  open,
  categories,
  selectedId,
  canDelete,
  anchorEl,
  onSelect,
  onDelete,
  onCreate,
  onClose,
}: CategoryPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState('50% 50%');
  // 列表滚起来了才在标题底下淡出，没滚的时候第一行不该被削掉一块
  const [scrolled, setScrolled] = useState(false);

  // 缩放锚点落在触发元素上，面板像是从那行分类里长出来的。
  useLayoutEffect(() => {
    if (!open) return setOrigin('50% 50%');
    const panel = panelRef.current;
    if (!panel || !anchorEl) return;
    const next = scaleOriginFor(panel.getBoundingClientRect(), anchorEl.getBoundingClientRect());
    if (next) setOrigin(next);
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      {/* 背景压暗一层，把底下的内容推远，玻璃浮在上面 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0, background: STACKED_SCRIM }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="选择分类"
        initial={MATERIALIZE_GLASS}
        animate={{ opacity: 1, scale: 1 }}
        transition={MATERIALIZE}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: 320,
          maxHeight: '60vh',
          transformOrigin: origin,
          background: 'var(--color-glass-panel)',
          backdropFilter: GLASS_FILTER,
          WebkitBackdropFilter: GLASS_FILTER,
          border: '1px solid var(--color-glass-panel-edge)',
          borderRadius: 22,
          boxShadow: '0 18px 48px rgba(28,22,12,0.28)',
          overflow: 'hidden',
        }}
      >
        {/* 内容层：整块字从虚化里对焦出来。filter 挂在这里是安全的（见上面那段注释） */}
        <motion.div
          initial={MATERIALIZE_CONTENT}
          animate={{ filter: 'blur(0px)' }}
          transition={MATERIALIZE}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <h3
            style={{
              margin: 0,
              padding: '16px 20px 10px',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.01em',
              color: 'var(--color-text-secondary)',
            }}
          >
            选择分类
          </h3>

          <div
            className="hide-scrollbar glass-scroll-fade"
            data-scrolled={scrolled}
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
            style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
          >
            {categories.map((cat, i) => {
              const selected = cat.id === selectedId;
              return (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                  {/* iOS 的分隔线不顶到左边，从文字起始处开始 */}
                  {i > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        left: 20,
                        right: 0,
                        top: 0,
                        height: 1,
                        background: 'rgba(28,22,12,0.09)',
                      }}
                    />
                  )}
                  <button
                    type="button"
                    className="glass-row"
                    aria-label={`选择分类 ${cat.name}`}
                    data-category-id={cat.id}
                    aria-pressed={selected}
                    onClick={() => onSelect(cat.id)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: ROW_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '0 4px 0 20px',
                      border: 'none',
                      background: 'transparent',
                      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                      fontSize: 14,
                      fontWeight: selected ? 600 : 400,
                      color: 'var(--color-text)',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cat.name}
                    </span>
                    {selected && <Check size={17} strokeWidth={2.5} color="var(--color-gold)" style={{ flexShrink: 0 }} />}
                  </button>
                  <button
                    type="button"
                    className="glass-icon-btn"
                    aria-label={`删除分类 ${cat.name}`}
                    title={canDelete ? `删除分类 ${cat.name}` : '至少保留一个分类'}
                    disabled={!canDelete}
                    onClick={() => onDelete(cat)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: TAP_TARGET,
                      minHeight: ROW_HEIGHT,
                      alignSelf: 'stretch',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--color-text-muted)',
                      opacity: canDelete ? 1 : 0.35,
                      cursor: canDelete ? 'pointer' : 'not-allowed',
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="glass-row"
            aria-label="弹窗内新建分类"
            onClick={onCreate}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minHeight: ROW_HEIGHT,
              border: 'none',
              borderTop: '1px solid rgba(28,22,12,0.09)',
              background: 'transparent',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 14,
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              paddingLeft: 20,
            }}
          >
            <Plus size={17} strokeWidth={2.5} color="var(--color-gold)" />
            新建分类
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
