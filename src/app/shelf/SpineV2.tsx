import type { Book } from '../types';
import { resolveSpineTemplate } from './bookLayout';
import { getSpineTemplate } from './spineTemplates';

export interface SpineV2Props {
  book: Book;
  /** 竖放 = T；横放 = L */
  width: number;
  /** 竖放 = L；横放 = T */
  height: number;
  /** true 竖排文字 / false 横排文字 */
  vertical: boolean;
  /** 书脊厚 T，字号按它推 */
  thickness: number;
  onSelect?: (book: Book) => void;
}

/**
 * 一条书脊。几何全部由排布引擎传进来，这里只负责查模版并渲染。
 *
 * hover 不在这里做：竖放由 ShelfRowV2 抬起，堆叠里的每一本由 BookStack 处理，
 * 这样书脊模版本身可以保持纯展示。
 */
export default function SpineV2({
  book,
  width,
  height,
  vertical,
  thickness,
  onSelect,
}: SpineV2Props) {
  const template = getSpineTemplate(resolveSpineTemplate(book));

  return (
    <div
      onClick={onSelect ? () => onSelect(book) : undefined}
      style={{
        width,
        height,
        cursor: onSelect ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {template.render({ book, width, height, vertical, thickness })}
    </div>
  );
}
