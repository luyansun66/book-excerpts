/**
 * 逐本的摆放形式与书脊模版：读取侧的兜底。
 *
 * 两个字段都是可选的，缺省值只在这里定义一次。真正会「缺字段」的是三批数据：
 * 旧库、旧备份导入、云同步拉回来的书（云同步本轮不带新字段，见 §5.4）。
 * 渲染层和引擎都走这两个函数，`undefined` 不会漏进后面的代码。
 */
import type { Book, BookLayout } from '../types';

export const BOOK_LAYOUTS: BookLayout[] = ['auto', 'spine', 'cover', 'stack'];

/** 书脊模版的默认 id。模版注册表在 `spineTemplates.tsx`，这里留常量免掉纯模块互相 import */
export const DEFAULT_SPINE_TEMPLATE_ID = 'default';

export function resolveLayout(book: Book): BookLayout {
  const value = book?.layout;
  return value && BOOK_LAYOUTS.includes(value) ? value : 'auto';
}

export function resolveSpineTemplate(book: Book): string {
  const value = book?.spineTemplate;
  return value && value.length > 0 ? value : DEFAULT_SPINE_TEMPLATE_ID;
}
