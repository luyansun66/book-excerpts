/**
 * 确定性伪随机：同一个字符串种子每次派生出同一串数。
 *
 * 书架 v2 里「这本书多高、多厚、封面朝不朝外、要不要起一摞」全都是从
 * `book.id` 派生出来的。用固定种子的好处是——插入或删除一本书，其它书的
 * 尺寸和朝向一个像素都不变（见设计文档 §4）。随机数本身不参与渲染，只在这里。
 */

/** 字符串 → 32 位种子（FNV-1a） */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 固定种子的伪随机数发生器，取值 [0, 1) */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 取一个种子对应的 [0,1) 抽样值。
 *
 * 每个决定用一条**独立**的随机流（靠种子盐区分），所以同一个 `id` 上的
 * 「书高」和「书脊厚」互不干扰——否则厚书必然高，排出来一眼假（§3.4）。
 */
export function chance(salt: string, id: string): number {
  return mulberry32(hashSeed(salt + id))();
}
