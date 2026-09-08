import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Book } from '../../types';
import { useApp } from '../../store';
import { addReadingTime } from '../../db';
import { computeReadingStats } from '../../db/readingTime';
import { localDateKey } from '../../db/readingTimeUtils';
import ReadingTimerSheet from './ReadingTimerSheet';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerSummary {
  minutes: number;
  todayMinutes: number;
}

interface ReadingTimerState {
  status: TimerStatus;
  bookId: string | null;
  sheetOpen: boolean;
  notice: string | null;
  summary: TimerSummary | null;
  elapsedMs: number;
  books: Book[];
  openSheet: () => void;
  closeSheet: () => void;
  startTimer: (bookId: string) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  endTimer: () => Promise<void>;
  dismissSummary: () => void;
  dismissNotice: () => void;
}

const CommandsContext = createContext<{ openSheet: () => void } | null>(null);
const ReadingTimerContext = createContext<ReadingTimerState | null>(null);

const AUTO_PAUSE_MS = 3 * 60 * 60 * 1000;

export function ReadingTimerProvider({ children }: { children: ReactNode }) {
  const { books } = useApp();
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [bookId, setBookId] = useState<string | null>(null);
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [segmentStartAt, setSegmentStartAt] = useState<number | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [summary, setSummary] = useState<TimerSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());

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
  const dismissNotice = useCallback(() => setNotice(null), []);

  const resetToIdle = useCallback(() => {
    setStatus('idle');
    setBookId(null);
    setAccumulatedMs(0);
    setSegmentStartAt(null);
    setSegmentCount(0);
    setLastActivityAt(null);
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
    summary,
    elapsedMs,
    books,
    openSheet,
    closeSheet,
    startTimer,
    pauseTimer,
    resumeTimer,
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
