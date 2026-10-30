/**
 * 书架 v2 的排布引擎（设计文档 §6）。
 *
 * 纯函数：不读时间、不读随机源、不读 DOM。所有随机决定都由 `book.id` 派生，
 * 所以同一份输入必得同一份输出，插入/删除一本书也不会让别书的尺寸和朝向变脸。
 */
import type { Book } from '../types';
import { resolveLayout } from './bookLayout';
import { chance } from './rng';
import {
  COVER_FACE_HEIGHT,
  COVER_TOTAL_WIDTH,
  bookHeight,
  bookThickness,
} from './sizes';

// ─── 可调常量（全部集中在这里，渲染层不要再写一遍） ───────────────────────────
// 单层内容高度与经典主题一致：经典书架一层就是一本书封面的高度（145），
// 搁板由两边共用的 ShelfBoard 追加，所以两套主题的层高完全对齐。
export const ROW_HEIGHT = COVER_FACE_HEIGHT;
export const ROW_GAP = 0; // 横放摞与相邻单位贴合，不留缝
// 只有「封面 → 封面」这一种相邻关系需要留缝；书脊与书脊、
// 书脊与封面、横放摞与任何单位都严格贴合。
export const COVER_COVER_GAP = 2;
// 横放书摞也不能顶出这一层：摞高上限就是行高。
export const STACK_MAX_HEIGHT = ROW_HEIGHT;
export const STACK_MIN_BOOKS = 3;
export const STACK_MAX_BOOKS = 5;
export const STACK_PROBABILITY = 0.25; // 起摞概率
export const COVER_PROBABILITY = 0.17; // 特色位（封面朝外）概率 ≈ 1/6
export const STACK_JITTER = 7; // 横放错位 ±px
export const STACK_ROTATE = 0.8; // 横放微旋转 ±deg

/**
 * hover 时单本横放书向右探出的距离。
 *
 * **不参与占位宽**：摞的占位宽就是它的可见轮廓，左右两侧因此都和邻居贴合成 0
 * 间距（原来把这一条加在轮廓右侧，表现出来就是「左边贴着、右边空 8px」）。
 * 探出去的那 8px 落在行左右留白里（`ShelfRowV2` 的 18px，窄视口 12px），不会
 * 顶出搁板；代价是它和右边那个单位会短暂重叠 8px —— hover 是一次性的手势，
 * 换掉的是常驻的缝，划算。
 */
export const STACK_HOVER_OFFSET = 8;

export type PlacedUnit =
  | {
      kind: 'standing';
      book: Book;
      orientation: 'spine' | 'cover';
      /** 竖放·书脊 = T；竖放·书封 = 正面 94 */
      width: number;
      height: number; // = L
      thickness: number; // = T，渲染层画书脊侧面要用
      gapBefore: number;
      gapAfter: number;
    }
  | {
      kind: 'stack';
      /** length = L（这本横躺占的水平长度）；thickness = T（它在这摞里占的高） */
      items: {
        book: Book;
        length: number;
        thickness: number;
        jitter: number;
        /** 相对摞左边界的位置；按可见轮廓收窄后不会留下透明留白 */
        left: number;
        rotate: number;
      }[];
      width: number;
      height: number;
      gapBefore: number;
      gapAfter: number;
    };

export interface ShelfRow {
  units: PlacedUnit[];
  height: number;
}

type BaseCategory = 'spine' | 'cover' | 'stack' | 'absorbable';

/** 第一遍：只看这本书自己的种子，算出基准类别。 */
function baseCategoryFor(book: Book): BaseCategory {
  const layout = resolveLayout(book);
  if (layout === 'spine') return 'spine';
  if (layout === 'cover') return 'cover';
  if (layout === 'stack') return 'stack';
  return chance('O:', book.id) < COVER_PROBABILITY ? 'cover' : 'absorbable';
}

function standingUnit(book: Book, orientation: 'spine' | 'cover'): PlacedUnit {
  const thickness = bookThickness(book.id);
  // 封面朝外是固定的展示尺寸（与经典书架的 94 × 145 一致）；
  // 书脊朝外才按书籍自身的书高档位（132–145）取高。
  const height = orientation === 'cover' ? COVER_FACE_HEIGHT : bookHeight(book.id);
  // 书封只展示正面，占位宽是固定值、与真实书厚无关。
  const width = orientation === 'spine' ? thickness : COVER_TOTAL_WIDTH;

  return {
    kind: 'standing',
    book,
    orientation,
    width,
    height,
    thickness,
    gapBefore: 0,
    gapAfter: 0,
  };
}

function stackUnit(books: Book[]): PlacedUnit {
  const rawItems = books.map((book) => ({
    book,
    length: bookHeight(book.id),
    thickness: bookThickness(book.id),
    jitter: Math.round((chance('J:', book.id) * 2 - 1) * STACK_JITTER),
    rotate: (chance('R:', book.id) * 2 - 1) * STACK_ROTATE,
  }));

  // 先按“以最长书居中 + 错位”算出每本书的相对位置，再按旋转后的
  // 外接框平移、收窄整摞：否则旋转边角会在窄视口越过行右边界，而较短的书
  // 又会在左侧留下透明空白。收窄之后占位宽就等于可见轮廓本身，左右两侧
  // 都是 0 间距 —— 不再额外给 hover 的右移留位置（见 STACK_HOVER_OFFSET）。
  const maxLength = Math.max(...rawItems.map((item) => item.length));
  const rawLefts = rawItems.map((item) => (maxLength - item.length) / 2 + item.jitter);
  const visualBounds = rawItems.map((item, index) => {
    const center = (rawLefts[index] ?? 0) + item.length / 2;
    const radians = (Math.abs(item.rotate) * Math.PI) / 180;
    const visualWidth =
      item.length * Math.cos(radians) + item.thickness * Math.sin(radians);
    return {
      left: center - visualWidth / 2,
      right: center + visualWidth / 2,
    };
  });
  const minLeft = Math.min(...visualBounds.map((bounds) => bounds.left));
  const maxRight = Math.max(...visualBounds.map((bounds) => bounds.right));

  const items = rawItems.map((item, index) => ({
    ...item,
    left: (rawLefts[index] ?? 0) - minLeft,
  }));

  return {
    kind: 'stack',
    items,
    width: maxRight - minLeft,
    height: items.reduce((sum, item) => sum + item.thickness, 0),
    gapBefore: 0,
    gapAfter: 0,
  };
}

/**
 * 第二遍：从左往右把「横躺 + 可吸收」的连续段收成一摞。
 *
 * 显式 stack 只吸收紧邻的显式 stack；auto 摞只吸收紧邻的可吸收书。
 * 两者都受 STACK_MAX_HEIGHT 约束，被顶出来的书会轮到它自己时另起一摞。
 */
function buildUnits(books: Book[]): PlacedUnit[] {
  const categories = books.map(baseCategoryFor);
  const units: PlacedUnit[] = [];
  let index = 0;

  while (index < books.length) {
    const category = categories[index];

    if (category === 'stack') {
      const group = [books[index]];
      let sum = bookThickness(books[index].id);
      let next = index + 1;

      while (next < books.length && categories[next] === 'stack') {
        const thickness = bookThickness(books[next].id);
        if (sum + thickness > STACK_MAX_HEIGHT) break;
        group.push(books[next]);
        sum += thickness;
        next += 1;
      }

      units.push(stackUnit(group));
      index = next;
      continue;
    }

    if (category === 'absorbable' && chance('S:', books[index].id) < STACK_PROBABILITY) {
      const target =
        STACK_MIN_BOOKS +
        Math.floor(
          chance('Sn:', books[index].id) * (STACK_MAX_BOOKS - STACK_MIN_BOOKS + 1),
        );
      const group = [books[index]];
      let sum = bookThickness(books[index].id);
      let next = index + 1;

      while (
        next < books.length &&
        categories[next] === 'absorbable' &&
        group.length < target
      ) {
        const thickness = bookThickness(books[next].id);
        if (sum + thickness > STACK_MAX_HEIGHT) break;
        group.push(books[next]);
        sum += thickness;
        next += 1;
      }

      // 末尾只剩起始本时整摞取消，退回竖放·书脊；≥2 本保留。
      if (group.length >= 2) {
        units.push(stackUnit(group));
        index = next;
      } else {
        units.push(standingUnit(books[index], 'spine'));
        index += 1;
      }
      continue;
    }

    units.push(standingUnit(books[index], category === 'cover' ? 'cover' : 'spine'));
    index += 1;
  }

  return withHorizontalGaps(units);
}

/**
 * 间距只取决于相邻两个单位的摆放形式：只有两张封面朝外并排时留 2px，
 * 其余组合（书脊/书脊、书脊/封面、横放摞/任意单位）都贴合为 0。
 * 行首单位不带上一个单位的间距，由 packRows 在折行时清掉。
 */
function gapBetween(previous: PlacedUnit, next: PlacedUnit): number {
  if (
    previous.kind === 'standing' &&
    previous.orientation === 'cover' &&
    next.kind === 'standing' &&
    next.orientation === 'cover'
  ) {
    return COVER_COVER_GAP;
  }
  return 0;
}

function withHorizontalGaps(units: PlacedUnit[]): PlacedUnit[] {
  units.forEach((unit, index) => {
    unit.gapBefore = index === 0 ? 0 : gapBetween(units[index - 1]!, unit);
    unit.gapAfter = 0;
  });
  return units;
}

/** 折行：按「前一个单位 → 当前单位」的间距计算宽度，装不下就换搁板。 */
function packRows(units: PlacedUnit[], rowWidth: number): ShelfRow[] {
  if (units.length === 0 || rowWidth <= 0) return [];

  const rows: ShelfRow[] = [];
  let current: PlacedUnit[] = [];
  let used = 0;

  for (const unit of units) {
    if (current.length > 0 && used + unit.gapBefore + unit.width > rowWidth) {
      rows.push({ units: current, height: ROW_HEIGHT });
      current = [];
      used = 0;
    }

    if (current.length === 0) {
      // 行首不继承上一行末尾的间距。
      current.push({ ...unit, gapBefore: 0, gapAfter: 0 });
      used = unit.width;
    } else {
      current.push(unit);
      used += unit.gapBefore + unit.width;
    }
  }

  if (current.length > 0) rows.push({ units: current, height: ROW_HEIGHT });
  return rows;
}

/**
 * 把已按 sortOrder 排好的一批书排成多块搁板。
 *
 * 返回值的几何全部算好：`width` / `height` / `thickness` / `length` /
 * `gapBefore` / `gapAfter` 渲染层直接吃，不再自己查档位表。
 * `gapBefore` 表示与同一行前一个单位之间的间距，行首恒为 0。
 */
export function layoutShelfV2(books: Book[], rowWidth: number): ShelfRow[] {
  if (rowWidth <= 0) return [];
  return packRows(buildUnits(books), rowWidth);
}
