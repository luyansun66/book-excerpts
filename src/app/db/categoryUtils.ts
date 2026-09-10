import type { Category } from '../types';

/**
 * 删掉 deletingId 这个分类后，它里面的书该搬到哪儿。
 *
 * 返回「剩下的第一个分类」（调用方已按 order 升序排好），一个都不剩时返回 null。
 * 关键是「剩下的」第一个：如果照搬「原来的第一个」，删的正好是第一个分类时
 * 会算出那个已经被删掉的分类，书就被留在一个不存在的 categoryId 上——数据还在
 * 库里，但没有哪个分类行会渲染它们，看起来就是凭空消失了。
 */
export function pickMoveTargetOnDelete(
  categoriesInOrder: Category[],
  deletingId: string,
): Category | null {
  return categoriesInOrder.find((c) => c.id !== deletingId) ?? null;
}
