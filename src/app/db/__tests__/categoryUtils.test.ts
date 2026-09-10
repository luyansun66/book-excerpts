/**
 * 删除分类时「书搬去哪个分类」的决策。
 *
 * 这里守的是一个真实的坑：老实现取的是「原来的第一个分类」，所以删的正好是
 * 第一个分类时，算出来的接盘分类就是它自己——搬运被跳过，书全留在一个不存在的
 * categoryId 上，界面上整批消失（数据还在库里，但没有分类行会渲染它们）。
 */
import { describe, it, expect } from 'vitest';
import { pickMoveTargetOnDelete } from '../categoryUtils';
import type { Category } from '../../types';

function cat(id: string, order: number): Category {
  return { id, name: id, isPreset: false, order, createdAt: '2026-01-01T00:00:00.000Z' };
}

const ordered = [cat('cat-lit', 0), cat('cat-soc', 1), cat('cat-phi', 2)];

describe('删除分类后，书搬到哪个分类', () => {
  it('删中间的分类：接盘的是剩下排第一的那个', () => {
    expect(pickMoveTargetOnDelete(ordered, 'cat-soc')?.id).toBe('cat-lit');
  });

  it('删的就是第一个分类：接盘的是原来的第二个，不是已被删掉的它自己', () => {
    const target = pickMoveTargetOnDelete(ordered, 'cat-lit');
    expect(target?.id).toBe('cat-soc');
    expect(target?.id).not.toBe('cat-lit');
  });

  it('删最后一个：接盘的是第一个', () => {
    expect(pickMoveTargetOnDelete(ordered, 'cat-phi')?.id).toBe('cat-lit');
  });

  it('只剩一个分类时返回 null，调用方据此拒绝删除', () => {
    expect(pickMoveTargetOnDelete([cat('cat-lit', 0)], 'cat-lit')).toBeNull();
  });

  it('分类是空的时候返回 null', () => {
    expect(pickMoveTargetOnDelete([], 'cat-lit')).toBeNull();
  });

  it('删一个不存在的 id：不影响接盘对象', () => {
    expect(pickMoveTargetOnDelete(ordered, 'cat-nope')?.id).toBe('cat-lit');
  });

  it('不改动传入的数组', () => {
    const input = [...ordered];
    pickMoveTargetOnDelete(input, 'cat-lit');
    expect(input.map((c) => c.id)).toEqual(['cat-lit', 'cat-soc', 'cat-phi']);
  });
});
