/**
 * 书架主题偏好：一台设备的显示偏好，不是书籍数据。
 *
 * 所以它不进 store、不进 Dexie、不进云同步——只写 localStorage。放进
 * `store.tsx` 那 266 行的数据上下文会让「切主题」触发所有 `useApp()` 消费者重渲染。
 *
 * 用 `useSyncExternalStore` + 模块级订阅集合：设置页（写）和书架页（读）
 * 天然同步。只保证同一标签页内，不监听 `storage` 事件做跨标签同步。
 */
import { useSyncExternalStore } from 'react';
import { safeLocalStorage } from '../components/timer/timerSession';

export type ShelfTheme = 'classic' | 'shelfV2';

export const SHELF_THEME_KEY = 'bookwrite:shelfTheme';

export const DEFAULT_SHELF_THEME: ShelfTheme = 'classic';

export interface ShelfThemeOption {
  id: ShelfTheme;
  name: string;
  description: string;
}

/** 设置页里两张卡片的内容。默认经典：装了新版但没进过设置页的人，看到的还是老样子 */
export const SHELF_THEME_OPTIONS: ShelfThemeOption[] = [
  { id: 'classic', name: '经典', description: '封面朝外，一行横滑' },
  { id: 'shelfV2', name: '书架 v2', description: '书脊混排、横放可堆叠' },
];

function isShelfTheme(value: unknown): value is ShelfTheme {
  return value === 'classic' || value === 'shelfV2';
}

export function readShelfTheme(): ShelfTheme {
  const storage = safeLocalStorage();
  if (!storage) return DEFAULT_SHELF_THEME;
  try {
    const raw = storage.getItem(SHELF_THEME_KEY);
    return isShelfTheme(raw) ? raw : DEFAULT_SHELF_THEME;
  } catch {
    // 隐私模式下 getItem 也可能抛（Safari 老版本行为），回默认值就行
    return DEFAULT_SHELF_THEME;
  }
}

export function writeShelfTheme(theme: ShelfTheme): void {
  const storage = safeLocalStorage();
  if (storage) {
    try {
      storage.setItem(SHELF_THEME_KEY, theme);
    } catch {
      // 存不进去只是「重启后回到经典」，不能让它把点击也一起炸掉
    }
  }
  notify();
}

const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useShelfTheme(): [ShelfTheme, (theme: ShelfTheme) => void] {
  const theme = useSyncExternalStore(subscribe, readShelfTheme, () => DEFAULT_SHELF_THEME);
  return [theme, writeShelfTheme];
}
