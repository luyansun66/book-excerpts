/**
 * 阅读计时的本地兜底快照。
 *
 * 计时按墙钟时间累加，切后台／锁屏不会暂停——阅读时不可能全程停在亮屏前台。
 * 真正需要防的是两件事：一是页面被系统回收后 React 状态全丢，整段计时凭空消失；
 * 二是离开太久（锁屏过夜）回来后被一次性计入。
 *
 * 所以这里把会话同步写进 localStorage（同步 API，pagehide 里也写得完），
 * 下次启动时按「离开多久」决定是接着计时，还是停在离开的那一刻并允许一键补回。
 */
export const TIMER_SNAPSHOT_KEY = 'readingTimerSession';

/**
 * 离开不超过这个时长视为正常阅读中断，无缝接着计。
 *
 * 定成 2 小时是为了覆盖「锁屏放着手机、读纸质书或干别的」这种真实场景：
 * 回来时读数连续，不会被截断，也不需要用户确认。
 */
export const AWAY_TOLERANCE_MS = 2 * 60 * 60 * 1000;

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerSession {
  status: TimerStatus;
  bookId: string | null;
  accumulatedMs: number;
  segmentStartAt: number | null;
  segmentCount: number;
  lastActivityAt: number | null;
}

export interface RestoredSession extends TimerSession {
  /** 上次页面存活到现在的间隔。 */
  awayMs: number;
  /** 被剔除掉的空档，可以补齐回来；0 表示没有可补回的部分。 */
  recoverableAwayMs: number;
  notice: string | null;
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface TimerSnapshot {
  version: 1;
  status: 'running' | 'paused';
  bookId: string;
  accumulatedMs: number;
  segmentStartAt: number | null;
  segmentCount: number;
  lastActivityAt: number | null;
  savedAt: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** localStorage 在隐私模式／禁用 Cookie 时会直接抛错，这里统一吞掉。 */
export function safeLocalStorage(): SnapshotStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function parseTimerSnapshot(raw: string | null): TimerSnapshot | null {
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const snapshot = data as Partial<TimerSnapshot>;
  if (snapshot.version !== 1) return null;
  if (snapshot.status !== 'running' && snapshot.status !== 'paused') return null;
  if (typeof snapshot.bookId !== 'string' || snapshot.bookId.length === 0) return null;
  if (!isFiniteNumber(snapshot.accumulatedMs) || snapshot.accumulatedMs < 0) return null;
  if (!isFiniteNumber(snapshot.savedAt)) return null;
  if (snapshot.segmentStartAt != null && !isFiniteNumber(snapshot.segmentStartAt)) return null;

  return {
    version: 1,
    status: snapshot.status,
    bookId: snapshot.bookId,
    accumulatedMs: snapshot.accumulatedMs,
    segmentStartAt: snapshot.segmentStartAt ?? null,
    segmentCount: isFiniteNumber(snapshot.segmentCount) && snapshot.segmentCount > 0 ? Math.floor(snapshot.segmentCount) : 0,
    lastActivityAt: isFiniteNumber(snapshot.lastActivityAt) ? snapshot.lastActivityAt : null,
    savedAt: snapshot.savedAt,
  };
}

export function readTimerSnapshot(storage: SnapshotStorage | null | undefined): TimerSnapshot | null {
  if (!storage) return null;
  try {
    return parseTimerSnapshot(storage.getItem(TIMER_SNAPSHOT_KEY));
  } catch {
    return null;
  }
}

export function writeTimerSnapshot(
  storage: SnapshotStorage | null | undefined,
  session: TimerSession,
  now: number = Date.now(),
): void {
  if (!storage) return;

  if (session.status === 'idle' || !session.bookId) {
    clearTimerSnapshot(storage);
    return;
  }

  const snapshot: TimerSnapshot = {
    version: 1,
    status: session.status,
    bookId: session.bookId,
    accumulatedMs: Math.max(0, session.accumulatedMs),
    segmentStartAt: session.segmentStartAt,
    segmentCount: Math.max(0, Math.floor(session.segmentCount)),
    lastActivityAt: session.lastActivityAt,
    savedAt: now,
  };

  try {
    storage.setItem(TIMER_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* 存储写满或被禁用时忽略：丢的只是兜底，不影响正常计时 */
  }
}

export function clearTimerSnapshot(storage: SnapshotStorage | null | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(TIMER_SNAPSHOT_KEY);
  } catch {
    /* 同上 */
  }
}

function idleSession(): RestoredSession {
  return {
    status: 'idle',
    bookId: null,
    accumulatedMs: 0,
    segmentStartAt: null,
    segmentCount: 0,
    lastActivityAt: null,
    awayMs: 0,
    recoverableAwayMs: 0,
    notice: null,
  };
}

function formatAway(ms: number): string {
  const total = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分`;
  if (hours > 0) return `${hours} 小时`;
  return `${minutes} 分钟`;
}

/** 已暂停的会话离开超过这么久，才值得提示一句。 */
const RESTORED_NOTICE_MS = 10 * 60 * 1000;

export function restoreTimerSession(
  storage: SnapshotStorage | null | undefined,
  now: number = Date.now(),
): RestoredSession {
  const snapshot = readTimerSnapshot(storage);
  if (!snapshot) return idleSession();

  const awayMs = Math.max(0, now - snapshot.savedAt);
  const base: TimerSession = {
    status: snapshot.status,
    bookId: snapshot.bookId,
    accumulatedMs: snapshot.accumulatedMs,
    segmentStartAt: snapshot.segmentStartAt,
    segmentCount: snapshot.segmentCount,
    lastActivityAt: snapshot.lastActivityAt,
  };

  if (snapshot.status === 'running' && snapshot.segmentStartAt != null) {
    // 短暂离开（切 app、锁屏、页面被重载）照常接着计，读数会跳一下但时间是真的。
    if (awayMs <= AWAY_TOLERANCE_MS) {
      return { ...base, awayMs, recoverableAwayMs: 0, notice: null };
    }

    // 离开太久：停在离开那一刻，不把空档算进去，但保留补回的入口。
    const lastAliveAt = snapshot.savedAt;
    return {
      ...base,
      status: 'paused',
      accumulatedMs: snapshot.accumulatedMs + Math.max(0, lastAliveAt - snapshot.segmentStartAt),
      segmentStartAt: null,
      segmentCount: snapshot.segmentCount + 1,
      lastActivityAt: lastAliveAt,
      awayMs,
      recoverableAwayMs: awayMs,
      notice: `离开 ${formatAway(awayMs)}，这段时间没有计入`,
    };
  }

  return {
    ...base,
    segmentStartAt: null,
    awayMs,
    recoverableAwayMs: 0,
    notice: awayMs > RESTORED_NOTICE_MS ? '上次的阅读计时还在，可以继续或结束保存' : null,
  };
}
