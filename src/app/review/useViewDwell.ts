import { useEffect, useRef } from 'react';
import { createDwellClock, VIEW_DWELL_MS, type DwellClock } from './excerptFeedState';

/**
 * 阅读弹窗可见时累计时间。分享编辑器、后台切换或锁屏只冻结时钟，
 * 关闭遮挡后从冻结值继续，不会把已阅读的时间清零。
 */
export function useViewDwell({
  active,
  occluded,
  onReached,
  thresholdMs = VIEW_DWELL_MS,
}: {
  active: boolean;
  occluded: boolean;
  onReached: () => void;
  thresholdMs?: number;
}): void {
  const callbackRef = useRef(onReached);
  const occludedRef = useRef(occluded);
  const clockRef = useRef<DwellClock | null>(null);
  const syncRef = useRef<() => void>(() => undefined);
  callbackRef.current = onReached;
  occludedRef.current = occluded;

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      clockRef.current = null;
      return;
    }
    const clock = createDwellClock(thresholdMs);
    clockRef.current = clock;
    let windowBlurred = false;
    let completed = false;

    const sync = () => {
      const visible = document.visibilityState !== 'hidden' && !windowBlurred && !occludedRef.current;
      clock.setActive(visible);
      if (!completed && clock.reached()) {
        completed = true;
        callbackRef.current();
      }
    };
    syncRef.current = sync;

    const onVisibility = () => sync();
    const onBlur = () => {
      windowBlurred = true;
      sync();
    };
    const onFocus = () => {
      windowBlurred = false;
      sync();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    sync();
    const timer = window.setInterval(sync, 100);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      syncRef.current = () => undefined;
      clockRef.current = null;
    };
  }, [active, thresholdMs]);

  useEffect(() => {
    syncRef.current();
  }, [occluded]);
}
