import { useState } from 'react';
import type { Book } from '../types';
import { STACK_HOVER_OFFSET, type PlacedUnit } from './shelfLayoutV2';
import SpineV2 from './SpineV2';

type StackUnit = Extract<PlacedUnit, { kind: 'stack' }>;

export interface BookStackProps {
  /** 排布引擎给出的 stack 单位；尺寸、错位、微旋转一律直接用 */
  unit: StackUnit;
  onSelect: (book: Book) => void;
}

interface StackBookProps {
  book: Book;
  length: number;
  thickness: number;
  left: number;
  rotate: number;
  bottom: number;
  zIndex: number;
  onSelect: (book: Book) => void;
}

function StackBook({
  book,
  length,
  thickness,
  left,
  rotate,
  bottom,
  zIndex,
  onSelect,
}: StackBookProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        left,
        bottom,
        width: length,
        height: thickness,
        zIndex,
        transform: `translateX(${hovered ? STACK_HOVER_OFFSET : 0}px) rotate(${rotate}deg)`,
        transition: 'transform 160ms ease-out',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <SpineV2
        book={book}
        width={length}
        height={thickness}
        vertical={false}
        thickness={thickness}
        onSelect={onSelect}
      />
    </div>
  );
}

/**
 * 一摞横放的书。
 *
 * 每本的水平长度、贡献高度、错位、微旋转全部来自引擎；这里只按引擎给的 `bottom`
 * 把它们摞起来，hover 时让被指到的那一本单独向右探出 8px。
 */
export default function BookStack({ unit, onSelect }: BookStackProps) {
  let bottom = 0;

  return (
    <div style={{ position: 'relative', width: unit.width, height: unit.height }}>
      {unit.items.map((item, index) => {
        const itemBottom = bottom;
        bottom += item.thickness;

        return (
          <StackBook
            key={item.book.id}
            book={item.book}
            length={item.length}
            thickness={item.thickness}
            left={item.left}
            rotate={item.rotate}
            bottom={itemBottom}
            zIndex={index}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
