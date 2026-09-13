import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Book } from '../../types';
import { useApp } from '../../store';
import { addReadingTime } from '../../db';
import { computeReadingStats } from '../../db/readingTime';
import { localDateKey } from '../../db/readingTimeUtils';
import ReadingTimerSheet from './ReadingTimerSheet';
import { formatMinutesHuman } from './format';
import {
  AWAY_TOLERANCE_MS,
  restoreTimerSession,
  safeLocalStorage,
  writeTimerSnapshot,
  type TimerSession,
  type TimerStatus,
} from './timerSession';

export type { TimerStatus } from './timerSession';

export interface TimerSummary {
  minutes: number;
  todayMinutes: number;
}

interface ReadingTimerState {
  status: TimerStatus;
  bookId: string | null;
  sheetOpen: boolean;
  notice: string | null;
  /** 离开太久被剔除、可以一键补回的毫秒数；0 表示没有可补回的部分。 */
  recoverableAwayMs: number;
  summary: TimerSummary | null;
  elapsedMs: number;
  books: Book[];
  openSheet: () => void;
  closeSheet: () => void;
  startTimer: (bookId: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  recoverAway: () => void;
  endTimer: () => Promise<void>;
  dismissSummary: () => void;
  dismissNotice: () => void;
}

const CommandsContext = createContext<{ openSheet: () => void } | null>(null);
const ReadingTimerContext = createContext<ReadingTimerState | null>(null);

const AUTO_PAUSE_MS = 3 * 60 * 60 * 1000;

export function ReadingTimerProvider({ children }: { children: ReactNode }) {
  const { books } = useApp();
  const [restored] = useState(() => restoreTimerSession(safeLocalStorage()));
  const [status, setStatus] = useState<TimerStatus>(restored.status);
  const [bookId, setBookId] = useState<string | null>(restored.bookId);
  const [accumulatedMs, setAccumulatedMs] = useState(restored.accumulatedMs);
  const [segmentStartAt, setSegmentStartAt] = useState<number | null>(restored.segmentStartAt);
  const [segmentCount, setSegmentCount] = useState(restored.segmentCount);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(restored.lastActivityAt);
  const [recoverableAwayMs, setRecoverableAwayMs] = useState(restored.recoverableAwayMs);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(restored.notice);
  const [summary, setSummary] = useState<TimerSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // 事件回调里需要读到最新会话，用 ref 兜住，避免把监听器绑在当前渲染闭包上。
  const sessionRef = useRef<TimerSession>({
    status,
    bookId,
    accumulatedMs,
    segmentStartAt,
    segmentCount,
    lastActivityAt,
  });
  sessionRef.current = { status, bookId, accumulatedMs, segmentStartAt, segmentCount, lastActivityAt };
  const hiddenAtRef = useRef<number | null>(null);

  // 会话一变就落一次快照，页面被回收时不至于整段丢失。
  useEffect(() => {
    writeTimerSnapshot(safeLocalStorage(), { status, bookId, accumulatedMs, segmentStartAt, segmentCount, lastActivityAt });
  }, [status, bookId, accumulatedMs, segmentStartAt, segmentCount, lastActivityAt]);

  // 切后台／锁屏照常计时：只在离开超过容差时，把空档停在离开那一刻，并留出补回的入口。
  useEffect(() => {
    if (status === 'idle') return;

    const persist = () => {
      const session = sessionRef.current;
      if (session.status === 'idle') return;
      writeTimerSnapshot(safeLocalStorage(), session);
    };

    const settleAway = (hiddenAt: number) => {
      const session = sessionRef.current;
      if (session.status !== 'running' || session.segmentStartAt == null) return;

      const awayMs = Date.now() - hiddenAt;
      if (awayMs <= AWAY_TOLERANCE_MS) return;

      setAccumulatedMs(session.accumulatedMs + Math.max(0, hiddenAt - session.segmentStartAt));
      setSegmentCount(session.segmentCount + 1);
      setSegmentStartAt(null);
      setLastActivityAt(hiddenAt);
      setStatus('paused');
      setRecoverableAwayMs(awayMs);
      setNotice(`离开 ${formatMinutesHuman(awayMs / 60000)}，这段时间没有计入`);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        persist();
        return;
      }
      const hiddenAt = hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (hiddenAt != null) settleAway(hiddenAt);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', persist);
    const id = window.setInterval(persist, 15000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', persist);
      window.clearInterval(id);
    };
  }, [status]);

  // Live ticking while running.
  useEffect(() => {
    if (status !== 'running') return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [status]);

  const elapsedMs = useMemo(() => {
    if (status === 'idle') return 0;
    return accumulatedMs + (segmentStartAt != null ? Math.max(0, now - segmentStartAt) : 0);
  }, [status, accumulatedMs, segmentStartAt, now]);

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const dismissSummary = useCallback(() => {
    setSummary(null);
    setSheetOpen(false);
  }, []);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    setRecoverableAwayMs(0);
  }, []);

  const resetToIdle = useCallback(() => {
    setStatus('idle');
    setBookId(null);
    setAccumulatedMs(0);
    setSegmentStartAt(null);
    setSegmentCount(0);
    setLastActivityAt(null);
    setRecoverableAwayMs(0);
    setNotice(null);
  }, []);

  const startTimer = (nextBookId: string) => {
    const t = Date.now();
    setStatus('running');
    setBookId(nextBookId);
    setAccumulatedMs(0);
    setSegmentStartAt(t);
    setSegmentCount(0);
    setLastActivityAt(t);
    setSheetOpen(true);
    setNotice(null);
    setRecoverableAwayMs(0);
    setSummary(null);
  };

  const pauseTimer = () => {
    if (status !== 'running' || segmentStartAt == null) return;
    const t = Date.now();
    setAccumulatedMs((prev) => prev + Math.max(0, t - segmentStartAt));
    setSegmentCount((c) => c + 1);
    setSegmentStartAt(null);
    setLastActivityAt(t);
    setStatus('paused');
  };

  const resumeTimer = () => {
    if (status !== 'paused') return;
    const t = Date.now();
    setSegmentStartAt(t);
    setLastActivityAt(t);
    setNotice(null);
    setStatus('running');
  };

  /** 把离开太久被剔除的空档补回来，并接着计时。 */
  const recoverAway = () => {
    if (recoverableAwayMs <= 0 || status === 'idle') return;
    const t = Date.now();
    setAccumulatedMs((prev) => prev + recoverableAwayMs);
    setSegmentStartAt(t);
    setSegmentCount((c) => c + 1);
    setLastActivityAt(t);
    setRecoverableAwayMs(0);
    setNotice(null);
    setStatus('running');
  };

  const endTimer = async () => {
    if (status === 'idle') return;
    const t = Date.now();
    const finalElapsedMs = accumulatedMs + (segmentStartAt != null ? Math.max(0, t - segmentStartAt) : 0);
    const sessions = segmentCount + (segmentStartAt != null ? 1 : 0);

    if (finalElapsedMs <= 0 || !bookId) {
      resetToIdle();
      setSheetOpen(false);
      return;
    }

    const minutes = Math.round((finalElapsedMs / 60000) * 10) / 10;
    const date = localDateKey(new Date(t));

    try {
      await addReadingTime({ date, minutes, sessions, bookId });
      const stats = await computeReadingStats();
      setSummary({ minutes, todayMinutes: stats.todayMinutes });
    } catch (e) {
      console.error('[ReadingTimer] 保存失败:', e);
    }

    resetToIdle();
    setSheetOpen(true);
  };

  // Auto-pause after 3 hours without interaction.
  useEffect(() => {
    if (status !== 'running' || lastActivityAt == null) return;

    const fire = () => {
      const t = Date.now();
      setAccumulatedMs((prev) => prev + Math.max(0, t - (segmentStartAt ?? t)));
      setSegmentCount((c) => c + 1);
      setSegmentStartAt(null);
      setLastActivityAt(t);
      setStatus('paused');
      setNotice('已自动暂停：超过 3 小时无操作');
      setSheetOpen(true);
    };

    const remaining = AUTO_PAUSE_MS - (Date.now() - lastActivityAt);
    if (remaining <= 0) {
      fire();
      return;
    }

    const id = window.setTimeout(fire, remaining);
    return () => window.clearTimeout(id);
  }, [status, lastActivityAt, segmentStartAt]);

  const commands = useMemo(() => ({ openSheet }), [openSheet]);

  const value: ReadingTimerState = {
    status,
    bookId,
    sheetOpen,
    notice,
    recoverableAwayMs,
    summary,
    elapsedMs,
    books,
    openSheet,
    closeSheet,
    startTimer,
    pauseTimer,
    resumeTimer,
    recoverAway,
    endTimer,
    dismissSummary,
    dismissNotice,
  };

  return (
    <CommandsContext.Provider value={commands}>
      <ReadingTimerContext.Provider value={value}>
        {children}
        <ReadingTimerSheet />
      </ReadingTimerContext.Provider>
    </CommandsContext.Provider>
  );
}

/** Stable command access for components that only need to open the sheet. */
export function useOpenTimerSheet(): () => void {
  const ctx = useContext(CommandsContext);
  if (!ctx) throw new Error('useOpenTimerSheet must be used within ReadingTimerProvider');
  return ctx.openSheet;
}

/** Full timer state — intended for the timer bar and sheet. */
export function useReadingTimer(): ReadingTimerState {
  const ctx = useContext(ReadingTimerContext);
  if (!ctx) throw new Error('useReadingTimer must be used within ReadingTimerProvider');
  return ctx;
}
