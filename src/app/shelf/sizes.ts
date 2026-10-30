/**
 * 一本书在书架上的两个内在量：书高 `L`、书脊厚 `T`（设计文档 §3）。
 *
 * 竖放、横放、堆叠全都是把这两个数换个方向摆，所以尺寸只有这一处定义。
 * 值不手填、不进数据库，全部由 `book.id` 派生——零迁移，且换台设备也一致。
 */
import { hashSeed, mulberry32 } from './rng';
import { SHELF_COVER_HEIGHT, SHELF_COVER_WIDTH } from '../shelfScroll';

export interface SizeBand {
  min: number;
  max: number;
  weight: number;
}

/**
 * 书高基准：标准（132–139）/ 高（141–145）。
 *
 * v2 主题的竖放书脊高度控制在 132–145px，横放时这也就是书的长度。
 * 竖放·封面朝外是另一个人工规定的展示尺寸：严格 94 × 145，与经典书架一致。
 */
export const MIN_SPINE_HEIGHT = 132;
export const MAX_BOOK_HEIGHT = SHELF_COVER_HEIGHT;

export const HEIGHT_BANDS: readonly SizeBand[] = [
  { min: 132, max: 139, weight: 0.30 },
  { min: 141, max: 145, weight: 0.70 },
];

/** 书脊厚：薄（19–26）/ 中（27–32） */
export const THICKNESS_BANDS: readonly SizeBand[] = [
  { min: 19, max: 26, weight: 0.65 },
  { min: 27, max: 32, weight: 0.35 },
];

/** 书脊厚的上下限。字号按厚度推（厚书脊的字大），所以区间要能一眼查到 */
export const MIN_SPINE_THICKNESS = THICKNESS_BANDS[0].min;
export const MAX_SPINE_THICKNESS = THICKNESS_BANDS[THICKNESS_BANDS.length - 1].max;

/** 按累计权重挑一档 */
export function pickBand(bands: readonly SizeBand[], r: number): SizeBand {
  let acc = 0;
  for (const band of bands) {
    acc += band.weight;
    if (r < acc) return band;
  }
  return bands[bands.length - 1];
}

/**
 * 定档 + 档内抖动。
 *
 * 取数顺序固定：第 1 抽选档，第 2 抽在 [min, max] 上均匀取整。所以同一档里
 * 的书高也不一样，不是 4 个死值（那是参考实现 `HEIGHTS = [210, 228, 246]`
 * 的机械感来源）。
 */
export function sampleBand(bands: readonly SizeBand[], salt: string, id: string): number {
  const rng = mulberry32(hashSeed(salt + id));
  const band = pickBand(bands, rng());
  const jitter = rng();
  return Math.round(band.min + jitter * (band.max - band.min));
}

/** 书高 L：132–145（132–139 / 141–145 两档） */
export function bookHeight(bookId: string): number {
  return sampleBand(HEIGHT_BANDS, 'L:', bookId);
}

/** 书脊厚 T：19–32。竖放时它是书脊占的宽，横放堆叠时它是这本占的高度 */
export function bookThickness(bookId: string): number {
  return sampleBand(THICKNESS_BANDS, 'T:', bookId);
}

/**
 * 封面朝外展示时的正面尺寸，与经典书架保持一致。
 *
 * 书封只展示正面：严格 94 × 145，不再额外接一条侧面书脊，
 * 也不会比经典书架大一圈。
 */
export const COVER_FACE_WIDTH = SHELF_COVER_WIDTH;
export const COVER_FACE_HEIGHT = SHELF_COVER_HEIGHT;
/** 封面朝外时占位总宽：只算正面 94。 */
export const COVER_TOTAL_WIDTH = COVER_FACE_WIDTH;
