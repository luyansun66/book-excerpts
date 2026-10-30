import { describe, expect, it } from 'vitest';
import type { Book } from '../types';
import { resolveLayout } from '../shelf/bookLayout';
import type { PlacedUnit, ShelfRow } from '../shelf/shelfLayoutV2';
import {
  COVER_COVER_GAP,
  ROW_GAP,
  ROW_HEIGHT,
  STACK_HOVER_OFFSET,
  STACK_MAX_HEIGHT,
  layoutShelfV2,
} from '../shelf/shelfLayoutV2';
import {
  COVER_FACE_HEIGHT,
  COVER_FACE_WIDTH,
  COVER_TOTAL_WIDTH,
  MAX_BOOK_HEIGHT,
  MIN_SPINE_HEIGHT,
  bookHeight,
  bookThickness,
} from '../shelf/sizes';
import { getSpineTemplate } from '../shelf/spineTemplates';

/** 这 6 个 id 的 T 都是厚档上限 32px（由固定种子派生）。 */
const THICK_IDS = [
  'book-245',
  'book-290',
  'book-312',
  'book-180',
  'book-199',
  'book-309',
];

function makeBook(id: string, layout?: Book['layout']): Book {
  return { id, ...(layout ? { layout } : {}) } as Book;
}

function unitsOf(rows: ShelfRow[]): PlacedUnit[] {
  return rows.flatMap((row) => row.units);
}

interface BookGeometry {
  orientation: 'spine' | 'cover' | 'stack';
  width: number;
  height: number;
  thickness: number;
  jitter?: number;
  rotate?: number;
}

function geometryById(rows: ShelfRow[]): Map<string, BookGeometry> {
  const result = new Map<string, BookGeometry>();

  for (const unit of unitsOf(rows)) {
    if (unit.kind === 'standing') {
      result.set(unit.book.id, {
        orientation: unit.orientation,
        width: unit.width,
        height: unit.height,
        thickness: unit.thickness,
      });
    } else {
      for (const item of unit.items) {
        result.set(item.book.id, {
          orientation: 'stack',
          width: item.length,
          height: item.thickness,
          thickness: item.thickness,
          jitter: item.jitter,
          rotate: item.rotate,
        });
      }
    }
  }

  return result;
}

describe('§11.2 排布引擎', () => {
  it('1. 同输入两次调用深度相等（确定性）', () => {
    const buildBooks = () => [
      makeBook('book-312'),
      makeBook('book-245', 'spine'),
      makeBook('book-564', 'cover'),
      makeBook('book-659'),
      makeBook('book-786', 'stack'),
      makeBook('book-290'),
    ];

    expect(layoutShelfV2(buildBooks(), 420)).toEqual(layoutShelfV2(buildBooks(), 420));
  });

  it('5. 显式 spine / cover / stack 各自生效，且显式 spine 永不被吸入摞', () => {
    const explicit = [
      makeBook('book-245', 'stack'),
      makeBook('book-290', 'spine'),
      makeBook('book-312', 'cover'),
    ];
    const units = unitsOf(layoutShelfV2(explicit, 1000));
    expect(units).toHaveLength(3);

    const stack = units[0];
    expect(stack?.kind).toBe('stack');
    if (stack?.kind === 'stack') {
      expect(stack.items.map((item) => item.book.id)).toEqual(['book-245']);
      const item = stack.items[0]!;
      const radians = (Math.abs(item.rotate) * Math.PI) / 180;
      const visualWidth =
        item.length * Math.cos(radians) + item.thickness * Math.sin(radians);
      // 占位宽 = 可见轮廓：不再给 hover 的右移留位置（见 STACK_HOVER_OFFSET）
      expect(stack.width).toBeCloseTo(visualWidth, 6);
      expect(stack.height).toBe(bookThickness('book-245'));
      expect(stack.gapBefore).toBe(ROW_GAP);
      expect(stack.gapAfter).toBe(ROW_GAP);
      // 不同摆放形式之间也完全贴合，不再出现空隙。
      expect(ROW_GAP).toBe(0);
    }

    const spine = units[1];
    expect(spine?.kind).toBe('standing');
    if (spine?.kind === 'standing') {
      expect(spine.orientation).toBe('spine');
      expect(spine.width).toBe(bookThickness('book-290'));
      expect(spine.height).toBe(bookHeight('book-290'));
      expect(spine.gapBefore).toBe(0);
      expect(spine.gapAfter).toBe(0);
    }

    const cover = units[2];
    expect(cover?.kind).toBe('standing');
    if (cover?.kind === 'standing') {
      expect(cover.orientation).toBe('cover');
      // 封面只展示正面，占位宽固定为 94，与真实书厚无关。
      expect(cover.width).toBe(COVER_TOTAL_WIDTH);
      expect(cover.width).toBe(COVER_FACE_WIDTH);
      expect(cover.height).toBe(COVER_FACE_HEIGHT);
      expect(cover.height).toBe(145);
      // 封面紧跟在书脊后面：书脊 ↔ 封面贴合为 0。
      expect(cover.gapBefore).toBe(0);
      expect(cover.gapAfter).toBe(0);
    }

    // book-312 的 S 种子会起摞，book-564 紧邻且可吸收；夹在中间的显式 spine
    // 必须切断吸收，自己保持竖放。
    const mixed = [
      makeBook('book-312'),
      makeBook('book-564'),
      makeBook('book-245', 'spine'),
      makeBook('book-659'),
    ];
    const mixedUnits = unitsOf(layoutShelfV2(mixed, 10000));

    const first = mixedUnits[0];
    expect(first?.kind).toBe('stack');
    if (first?.kind === 'stack') {
      expect(first.items.map((item) => item.book.id)).toEqual(['book-312', 'book-564']);
    }

    const explicitSpine = mixedUnits.find(
      (unit) => unit.kind === 'standing' && unit.book.id === 'book-245',
    );
    expect(explicitSpine?.kind).toBe('standing');
    if (explicitSpine?.kind === 'standing') {
      expect(explicitSpine.orientation).toBe('spine');
    }
    expect(
      mixedUnits.some(
        (unit) =>
          unit.kind === 'stack' && unit.items.some((item) => item.book.id === 'book-245'),
      ),
    ).toBe(false);
  });

  it('5.1 仅封面与封面相邻为 2px，其余组合均为 0', () => {
    expect(COVER_COVER_GAP).toBe(2);
    expect(ROW_GAP).toBe(0);

    const covers = [
      makeBook('book-245', 'cover'),
      makeBook('book-290', 'cover'),
      makeBook('book-312', 'cover'),
    ];
    const coverUnits = unitsOf(layoutShelfV2(covers, 10000));
    expect(coverUnits.map((unit) => unit.gapBefore)).toEqual([0, 2, 2]);
    expect(coverUnits.every((unit) => unit.gapAfter === 0)).toBe(true);

    const mixed = [
      makeBook('book-245', 'cover'),
      makeBook('book-290', 'spine'),
      makeBook('book-312', 'cover'),
      makeBook('book-564', 'stack'),
      makeBook('book-659', 'cover'),
    ];
    const mixedUnits = unitsOf(layoutShelfV2(mixed, 10000));
    // 封面→书脊 0，书脊→封面 0，封面→横放 0，横放→封面 0。
    expect(mixedUnits.map((unit) => unit.gapBefore)).toEqual([0, 0, 0, 0, 0]);

    // 两张封面并排需要 94 + 2 + 94 = 190px；少 1px 就必须折行。
    const pair = layoutShelfV2(
      [makeBook('book-245', 'cover'), makeBook('book-290', 'cover')],
      190,
    );
    expect(pair.map((row) => row.units.length)).toEqual([2]);
    expect(pair[0]?.units[1]?.gapBefore).toBe(2);

    const wrapped = layoutShelfV2(
      [makeBook('book-245', 'cover'), makeBook('book-290', 'cover')],
      189,
    );
    expect(wrapped.map((row) => row.units.length)).toEqual([1, 1]);
    // 折行后的行首不能继承上一行末尾的封面间距。
    expect(wrapped[1]?.units[0]?.gapBefore).toBe(0);
  });

  it('6. 六本全厚（32px）书横放时，每摞高度不超过 STACK_MAX_HEIGHT', () => {
    for (const id of THICK_IDS) {
      expect(bookThickness(id)).toBe(32);
    }

    const books = THICK_IDS.map((id) => makeBook(id, 'stack'));
    const units = unitsOf(layoutShelfV2(books, 10000));
    const stacks = units.filter((unit) => unit.kind === 'stack');

    // 4 × 32 = 128 放得下；再加第 5 本就是 160 > 145（行高），所以必须另起一摞。
    expect(stacks).toHaveLength(2);
    expect(stacks.map((unit) => (unit.kind === 'stack' ? unit.items.length : 0))).toEqual([
      4, 2,
    ]);
    for (const unit of stacks) {
      if (unit.kind !== 'stack') continue;
      expect(unit.height).toBe(unit.items.length * 32);
      expect(unit.height).toBeLessThanOrEqual(STACK_MAX_HEIGHT);
    }

    expect(
      stacks.flatMap((unit) =>
        unit.kind === 'stack' ? unit.items.map((item) => item.book.id) : [],
      ),
    ).toEqual(THICK_IDS);
  });

  it('6.1 横放摞的占位宽按可见轮廓收窄，左右不留透明空白', () => {
    const books = [
      makeBook('book-245', 'stack'),
      makeBook('book-290', 'stack'),
      makeBook('book-312', 'stack'),
      makeBook('book-564', 'stack'),
      makeBook('book-659', 'stack'),
    ];
    const stacks = unitsOf(layoutShelfV2(books, 10000)).filter(
      (unit) => unit.kind === 'stack',
    );

    expect(stacks.length).toBeGreaterThan(0);
    for (const unit of stacks) {
      if (unit.kind !== 'stack') continue;

      const bounds = unit.items.map((item) => {
        const center = item.left + item.length / 2;
        const radians = (Math.abs(item.rotate) * Math.PI) / 180;
        const visualWidth =
          item.length * Math.cos(radians) + item.thickness * Math.sin(radians);
        return {
          left: center - visualWidth / 2,
          right: center + visualWidth / 2,
        };
      });
      const left = Math.min(...bounds.map((bound) => bound.left));
      const right = Math.max(...bounds.map((bound) => bound.right));
      expect(left).toBeCloseTo(0, 6);
      expect(right).toBeCloseTo(unit.width, 6);
    }
  });

  it('6.2 260px 窄视口下旋转后的外接框不越出行宽', () => {
    const books = [
      makeBook('book-245', 'stack'),
      makeBook('book-290', 'stack'),
      makeBook('book-312', 'stack'),
      makeBook('book-564', 'stack'),
      makeBook('book-659', 'stack'),
    ];
    const rowWidth = 260 - 12 * 2;
    const rows = layoutShelfV2(books, rowWidth);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const unit of row.units) {
        expect(unit.width).toBeLessThanOrEqual(rowWidth);
        if (unit.kind !== 'stack') continue;

        const right = Math.max(
          ...unit.items.map((item) => {
            const center = item.left + item.length / 2;
            const radians = (Math.abs(item.rotate) * Math.PI) / 180;
            const visualWidth =
              item.length * Math.cos(radians) + item.thickness * Math.sin(radians);
            return center + visualWidth / 2;
          }),
        );
        expect(right).toBeLessThanOrEqual(unit.width + 1e-6);
      }
    }
  });

  it('6.3 夹在两本竖放书之间的横放摞，左右两侧都贴合为 0 间距', () => {
    // 用户报的就是这个位置：摞的左边贴着，右边空一截。根因是占位宽把 hover 的
    // 8px 加在了轮廓右侧。现在两侧都按可见轮廓算，两侧的间距也就都是 0。
    const books = [
      makeBook('probe-l', 'spine'),
      makeBook('book-245', 'stack'),
      makeBook('book-290', 'stack'),
      makeBook('book-312', 'stack'),
      makeBook('probe-r', 'spine'),
    ];
    const units = unitsOf(layoutShelfV2(books, 10000));
    expect(units.map((unit) => unit.kind)).toEqual(['standing', 'stack', 'standing']);

    const stack = units[1]!;
    expect(stack.kind).toBe('stack');
    if (stack.kind !== 'stack') return;

    const ink = stack.items.map((item) => {
      const center = item.left + item.length / 2;
      const radians = (Math.abs(item.rotate) * Math.PI) / 180;
      const visualWidth =
        item.length * Math.cos(radians) + item.thickness * Math.sin(radians);
      return { left: center - visualWidth / 2, right: center + visualWidth / 2 };
    });

    // 摞的占位宽 = 可见轮廓：左边贴 0，右边贴满
    expect(Math.min(...ink.map((bound) => bound.left))).toBeCloseTo(0, 6);
    expect(Math.max(...ink.map((bound) => bound.right))).toBeCloseTo(stack.width, 6);

    // 两侧的邻居都不带间距（gapBefore 为 0 时 flex 里就是紧挨着）
    expect(stack.gapBefore).toBe(0);
    expect(units[2]!.gapBefore).toBe(0);

    // hover 探出的 8px 不再占位：它现在会压过右邻居一点，靠行左右留白
    // （ShelfRowV2 的 18px / 窄视口 12px）兜住，不会顶出搁板。
    expect(STACK_HOVER_OFFSET).toBeLessThanOrEqual(12);
  });

  it('7. 150px 窄宽下折行，行宽与手算行数一致', () => {
    const books = THICK_IDS.map((id) => makeBook(id, 'spine'));
    const rows = layoutShelfV2(books, 150);

    // 每本 32px：4 本 = 128px 放得下，第 5 本 = 160px 必须换行。
    expect(rows.map((row) => row.units.length)).toEqual([4, 2]);
    expect(rows.map((row) => row.height)).toEqual([ROW_HEIGHT, ROW_HEIGHT]);

    for (const row of rows) {
      const used = row.units.reduce(
        (sum, unit) => sum + unit.gapBefore + unit.width + unit.gapAfter,
        0,
      );
      expect(used).toBeLessThanOrEqual(150);
    }
  });

  it('8. 空数组 / 单本 / 零宽', () => {
    expect(layoutShelfV2([], 320)).toEqual([]);

    const single = layoutShelfV2([makeBook('book-245')], 320);
    expect(single).toHaveLength(1);
    expect(single[0]?.units).toHaveLength(1);

    const unit = single[0]?.units[0];
    expect(unit?.kind).toBe('standing');
    if (unit?.kind === 'standing') {
      expect(unit.orientation).toBe('spine');
      expect(unit.width).toBe(bookThickness('book-245'));
      expect(unit.height).toBe(bookHeight('book-245'));
    }

    expect(layoutShelfV2([makeBook('book-245')], 0)).toEqual([]);
  });

  it('9. 删除一本不在摞内的书，其余书几何与朝向不变', () => {
    const beforeBooks = [
      makeBook('book-245', 'stack'),
      makeBook('book-290', 'stack'),
      makeBook('book-564', 'cover'),
      makeBook('book-312', 'spine'),
      makeBook('book-659', 'cover'),
    ];
    const afterBooks = beforeBooks.filter((book) => book.id !== 'book-564');

    const before = geometryById(layoutShelfV2(beforeBooks, 10000));
    const after = geometryById(layoutShelfV2(afterBooks, 10000));

    for (const book of afterBooks) {
      expect(after.get(book.id)).toEqual(before.get(book.id));
    }
  });

  it('10. 缺字段时 resolveLayout 回 auto', () => {
    expect(resolveLayout({} as Book)).toBe('auto');
    expect(resolveLayout(makeBook('book-without-layout'))).toBe('auto');
    expect(getSpineTemplate('不存在').id).toBe('default');
  });

  it('11. 竖放书脊与横放长度落在 132–145，封面朝外固定 145 高', () => {
    const books = Array.from({ length: 80 }, (_, index) => makeBook(`book-${index}`));
    const units = unitsOf(layoutShelfV2(books, 10000));

    for (const unit of units) {
      if (unit.kind === 'standing') {
        if (unit.orientation === 'cover') {
          expect(unit.height).toBe(COVER_FACE_HEIGHT);
          expect(COVER_FACE_HEIGHT).toBe(MAX_BOOK_HEIGHT);
        } else {
          expect(unit.height).toBeGreaterThanOrEqual(MIN_SPINE_HEIGHT);
          expect(unit.height).toBeLessThanOrEqual(MAX_BOOK_HEIGHT);
        }
      } else {
        for (const item of unit.items) {
          expect(item.length).toBeGreaterThanOrEqual(MIN_SPINE_HEIGHT);
          expect(item.length).toBeLessThanOrEqual(MAX_BOOK_HEIGHT);
        }
      }
    }
  });

  it('12. 单层内容高度与经典主题的封面高度一致，横放摞不超出层高', () => {
    expect(ROW_HEIGHT).toBe(COVER_FACE_HEIGHT);
    expect(ROW_HEIGHT).toBe(145);
    expect(STACK_MAX_HEIGHT).toBe(ROW_HEIGHT);

    const books = Array.from({ length: 120 }, (_, index) => makeBook(`book-${index}`));
    for (const row of layoutShelfV2(books, 320)) {
      expect(row.height).toBe(ROW_HEIGHT);
      for (const unit of row.units) {
        expect(unit.height).toBeLessThanOrEqual(ROW_HEIGHT);
      }
    }
  });
});
