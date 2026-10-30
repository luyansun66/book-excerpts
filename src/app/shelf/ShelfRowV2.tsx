import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEventHandler } from 'react';
import type { Book } from '../types';
import CategoryHeading from '../components/CategoryHeading';
import ShelfBoard from '../components/ShelfBoard';
import { layoutShelfV2, type PlacedUnit } from './shelfLayoutV2';
import SpineV2 from './SpineV2';
import ShelfCover from './ShelfCover';
import BookStack from './BookStack';

/** 与 `ShelfBoard` 的左右 margin 保持一致，书脚和搁板两端对齐。 */
const SIDE_PADDING = 18;
/** 极窄视口下收窄左右留白，给横放书摞和 hover 外扩留出空间。 */
const NARROW_BREAKPOINT = 320;
const NARROW_SIDE_PADDING = 12;
/** 搁板下沿到下一层书顶的留白；最后一层不需要。 */
const ROW_SPACING = 16;

type StandingUnit = Extract<PlacedUnit, { kind: 'standing' }>;

export interface ShelfRowV2Props {
  name: string;
  /** 已按 sortOrder 排好的一批书 */
  books: Book[];
  /** 分类的总书数（标题右侧计数器用，可能包含当前筛选外的书） */
  bookCount: number;
  onSelect: (book: Book) => void;
  onOpenCategory?: () => void;
  onCatDragPointerDown?: PointerEventHandler<HTMLElement>;
  isCatDragged?: boolean;
}

function StandingSpine({
  unit,
  onSelect,
}: {
  unit: StandingUnit;
  onSelect: (book: Book) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: unit.width,
        height: unit.height,
        transform: hovered ? 'translateY(-8px)' : 'translateY(0)',
        transition: 'transform 160ms ease-out',
      }}
    >
      <SpineV2
        book={unit.book}
        width={unit.width}
        height={unit.height}
        vertical
        thickness={unit.thickness}
        onSelect={onSelect}
      />
    </div>
  );
}

/**
 * 书架 v2 的一个分类：标题 + 多块搁板纵向折行，横向不滚动。
 *
 * 宽度由 ResizeObserver 量出；排布全部交给纯函数引擎。本主题不提供长按拖拽重排。
 */
export default function ShelfRowV2({
  name,
  books,
  bookCount,
  onSelect,
  onOpenCategory,
  onCatDragPointerDown,
  isCatDragged = false,
}: ShelfRowV2Props) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const element = measureRef.current;
    if (!element) return;

    const apply = (fullWidth: number) => {
      setContainerWidth(Math.max(0, Math.floor(fullWidth)));
    };

    apply(element.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) apply(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sidePadding =
    containerWidth > 0 && containerWidth <= NARROW_BREAKPOINT
      ? NARROW_SIDE_PADDING
      : SIDE_PADDING;
  const rowWidth = Math.max(0, containerWidth - sidePadding * 2);
  const rows = useMemo(
    () => layoutShelfV2(books, rowWidth),
    [books, rowWidth],
  );

  // 测量用的 div 必须常驻 DOM：分类一开始是空的时候什么都不渲染，如果测量元素
  // 也跟着消失，上面那个只跑一次的 effect 就取不到 element，ResizeObserver 也就
  // 挂不上（ResizeObserver 不会自己重跑）。等这个分类后来才加进第一本书时，
  // containerWidth 会一直停在 0，排布引擎拿到 rowWidth=0 直接返回空数组 —— 表现
  // 就是「标题有了、书一本都不显示」。测量 div 空的时候高度是 0，所以
  // 「空分类不占高度」仍然成立，和经典主题的取数口径保持一致。
  return (
    <div ref={measureRef} style={{ width: '100%' }}>
      {books.length > 0 && (
        <>
          <CategoryHeading
            name={name}
            bookCount={bookCount}
            onOpenCategory={onOpenCategory}
            onCatDragPointerDown={onCatDragPointerDown}
            isCatDragged={isCatDragged}
          />

          {rows.map((row, rowIndex) => (
            <div
              key={rowIndex}
              style={{
                paddingBottom: rowIndex < rows.length - 1 ? ROW_SPACING : 0,
              }}
            >
              <div
                style={{
                  height: row.height,
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: `0 ${sidePadding}px`,
                }}
              >
                {row.units.map((unit) => {
                  const key =
                    unit.kind === 'standing'
                      ? unit.book.id
                      : unit.items[0]?.book.id ?? `stack-${rowIndex}`;

                  return (
                    <div
                      key={key}
                      style={{
                        flex: '0 0 auto',
                        marginLeft: unit.gapBefore,
                        marginRight: unit.gapAfter,
                        display: 'flex',
                        alignItems: 'flex-end',
                      }}
                    >
                      {unit.kind === 'standing' ? (
                        unit.orientation === 'cover' ? (
                          <ShelfCover
                            book={unit.book}
                            onClick={() => onSelect(unit.book)}
                          />
                        ) : (
                          <StandingSpine unit={unit} onSelect={onSelect} />
                        )
                      ) : (
                        <BookStack unit={unit} onSelect={onSelect} />
                      )}
                    </div>
                  );
                })}
              </div>

              <ShelfBoard topGap={0} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
