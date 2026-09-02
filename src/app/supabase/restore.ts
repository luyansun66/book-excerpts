import { prepareImportData, type ExportData, type ImportResult } from '../db/prepare'
import type { Book, Category, Quote } from '../types'

export interface PulledCloudData {
  categories: Category[];
  books: Book[];
  quotes: Quote[];
}

export interface RestoreFromCloudOptions {
  pull: () => Promise<PulledCloudData>;
  replace: (data: ExportData) => Promise<ImportResult>;
  refresh: () => Promise<void>;
}

/**
 * 从云端恢复：
 * 1. 拉取云端数据；
 * 2. 整库替换本地数据（修复分类关联后）；
 * 3. 等本地刷新完成才返回，确保页面立即显示最新书架。
 */
export async function restoreFromCloud({
  pull,
  replace,
  refresh,
}: RestoreFromCloudOptions): Promise<{ repairedCount: number }> {
  const remote = await pull();
  const prepared = prepareImportData({
    exportDate: '',
    version: 1,
    ...remote,
  });
  await replace(prepared.data);
  await refresh();
  return { repairedCount: prepared.repairedCount };
}
