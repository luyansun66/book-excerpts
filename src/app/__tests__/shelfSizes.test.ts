/**
 * 书架 v2 的尺寸层（设计文档 §3 / §11.2 第 2–4 条）。
 *
 * 一本书只有两个内在量：书高 L、书脊厚 T。这里守住三件事：
 * 值永远落在定义域里、2+2 个档位的分布接近权重表、L 与 T 的种子互相独立。
 */
import { describe, expect, it } from 'vitest';
import {
  COVER_FACE_HEIGHT,
  COVER_FACE_WIDTH,
  COVER_TOTAL_WIDTH,
  HEIGHT_BANDS,
  MAX_BOOK_HEIGHT,
  MIN_SPINE_HEIGHT,
  THICKNESS_BANDS,
  bookHeight,
  bookThickness,
  type SizeBand,
} from '../shelf/sizes';

const IDS = Array.from({ length: 1000 }, (_, i) => `book-${i}`);

function countByBand(values: number[], bands: readonly SizeBand[]): number[] {
  const counts = bands.map(() => 0);
  for (const value of values) {
    const index = bands.findIndex((band) => value >= band.min && value <= band.max);
    if (index < 0) throw new Error(`尺寸 ${value} 不落在任何档位内`);
    counts[index] += 1;
  }
  return counts;
}

describe('尺寸定义域', () => {
  it('1000 个 id 的 L 全落在 132–145，T 全落在 19–32', () => {
    const heights = IDS.map(bookHeight);
    const thicknesses = IDS.map(bookThickness);

    expect(heights.every(Number.isInteger)).toBe(true);
    expect(thicknesses.every(Number.isInteger)).toBe(true);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(MIN_SPINE_HEIGHT);
    expect(MIN_SPINE_HEIGHT).toBe(132);
    expect(Math.max(...heights)).toBeLessThanOrEqual(MAX_BOOK_HEIGHT);
    expect(MAX_BOOK_HEIGHT).toBe(145);
    expect(Math.min(...thicknesses)).toBeGreaterThanOrEqual(19);
    expect(Math.max(...thicknesses)).toBeLessThanOrEqual(32);
  });
});

describe('档位分布', () => {
  it('L / T 的档位频次与权重表偏差在 5 个百分点内', () => {
    const heightCounts = countByBand(IDS.map(bookHeight), HEIGHT_BANDS);
    const thicknessCounts = countByBand(IDS.map(bookThickness), THICKNESS_BANDS);

    HEIGHT_BANDS.forEach((band, index) => {
      expect(Math.abs(heightCounts[index] / IDS.length - band.weight)).toBeLessThanOrEqual(0.05);
    });
    THICKNESS_BANDS.forEach((band, index) => {
      expect(Math.abs(thicknessCounts[index] / IDS.length - band.weight)).toBeLessThanOrEqual(0.05);
    });
  });
});

describe('种子解耦', () => {
  it('高 141+ 的书里，薄 / 中两档书脊都必须出现', () => {
    const tallThicknesses = IDS.filter((id) => bookHeight(id) >= 141).map(bookThickness);
    const counts = countByBand(tallThicknesses, THICKNESS_BANDS);

    expect(tallThicknesses.length).toBeGreaterThan(0);
    expect(counts.every((count) => count > 0)).toBe(true);
  });
});

describe('封面展示尺寸', () => {
  it('封面正面与经典书架一致，固定 94 × 145', () => {
    expect(COVER_FACE_WIDTH).toBe(94);
    expect(COVER_FACE_HEIGHT).toBe(145);
  });

  it('只展示正面，总占位宽 = 94', () => {
    expect(COVER_TOTAL_WIDTH).toBe(94);
    expect(COVER_TOTAL_WIDTH).toBe(COVER_FACE_WIDTH);
  });
});
