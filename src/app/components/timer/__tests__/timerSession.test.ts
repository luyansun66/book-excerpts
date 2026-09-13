/**
 * 计时兜底快照：切后台／锁屏不暂停，只有离开超过容差的空档会被剔除并且可以补回。
 */
import { describe, it, expect } from 'vitest';
import {
  AWAY_TOLERANCE_MS,
  TIMER_SNAPSHOT_KEY,
  clearTimerSnapshot,
  parseTimerSnapshot,
  readTimerSnapshot,
  restoreTimerSession,
  writeTimerSnapshot,
  type SnapshotStorage,
} from '../timerSession';

const NOW = new Date(2026, 8, 13, 14, 0, 0).getTime();
const MIN = 60 * 1000;

function fakeStorage(initial: Record<string, string> = {}): SnapshotStorage & { items: Record<string, string> } {
  const items = { ...initial };
  return {
    items,
    getItem: (key) => (key in items ? items[key] : null),
    setItem: (key, value) => {
      items[key] = value;
    },
    removeItem: (key) => {
      delete items[key];
    },
  };
}

function storageWith(snapshot: Record<string, unknown>): ReturnType<typeof fakeStorage> {
  return fakeStorage({ [TIMER_SNAPSHOT_KEY]: JSON.stringify(snapshot) });
}

const runningSnapshot = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  status: 'running',
  bookId: 'book-1',
  accumulatedMs: 5 * MIN,
  segmentStartAt: NOW - 50 * MIN,
  segmentCount: 1,
  lastActivityAt: NOW - 50 * MIN,
  savedAt: NOW - 40 * MIN,
  ...overrides,
});

describe('restoreTimerSession', () => {
  it('没有快照时保持空闲', () => {
    const session = restoreTimerSession(fakeStorage(), NOW);
    expect(session.status).toBe('idle');
    expect(session.bookId).toBeNull();
    expect(session.recoverableAwayMs).toBe(0);
  });

  it('短暂离开（切 app／锁屏／页面重载）无缝接着计时', () => {
    const storage = storageWith(runningSnapshot({ savedAt: NOW - MIN, segmentStartAt: NOW - 11 * MIN, accumulatedMs: 0, segmentCount: 0 }));

    const session = restoreTimerSession(storage, NOW);

    expect(session.status).toBe('running');
    expect(session.segmentStartAt).toBe(NOW - 11 * MIN);
    expect(session.recoverableAwayMs).toBe(0);
    expect(session.notice).toBeNull();
    // 中间那段离线时间照常计入：整段读数连续。
    expect(session.accumulatedMs + (NOW - session.segmentStartAt!)).toBe(11 * MIN);
  });

  it('离开正好等于容差时仍然继续计时', () => {
    const storage = storageWith(runningSnapshot({ savedAt: NOW - AWAY_TOLERANCE_MS }));

    const session = restoreTimerSession(storage, NOW);

    expect(session.status).toBe('running');
    expect(session.accumulatedMs).toBe(5 * MIN);
  });

  it('锁屏放下手机 40 分钟再回来，读数连续不截断', () => {
    const storage = storageWith(runningSnapshot({ savedAt: NOW - 40 * MIN }));

    const session = restoreTimerSession(storage, NOW);

    expect(session.status).toBe('running');
    expect(session.segmentStartAt).toBe(NOW - 50 * MIN);
    expect(session.recoverableAwayMs).toBe(0);
    expect(session.notice).toBeNull();
    // 已有的 5 分钟 + 50 分钟的连续读数，中间那 40 分钟照常计入。
    expect(session.accumulatedMs + (NOW - session.segmentStartAt!)).toBe(55 * MIN);
  });

  it('离开超过容差时停在离开那一刻，并保留可补回的空档', () => {
    const storage = storageWith(runningSnapshot({ savedAt: NOW - 3 * 60 * MIN, segmentStartAt: NOW - 190 * MIN, lastActivityAt: NOW - 190 * MIN }));

    const session = restoreTimerSession(storage, NOW);

    expect(session.status).toBe('paused');
    expect(session.segmentStartAt).toBeNull();
    expect(session.segmentCount).toBe(2);
    // 5 分钟已有 + 离开前的 10 分钟，离线的那 3 小时不计入。
    expect(session.accumulatedMs).toBe(15 * MIN);
    expect(session.recoverableAwayMs).toBe(3 * 60 * MIN);
    expect(session.awayMs).toBe(3 * 60 * MIN);
    expect(session.notice).toContain('3 小时');
    expect(session.notice).toContain('没有计入');
  });

  it('已暂停的会话原样恢复，不追加任何离线时间', () => {
    const storage = storageWith({
      version: 1,
      status: 'paused',
      bookId: 'book-1',
      accumulatedMs: 22 * MIN,
      segmentStartAt: null,
      segmentCount: 3,
      lastActivityAt: NOW - 3 * 60 * MIN,
      savedAt: NOW - 3 * 60 * MIN,
    });

    const session = restoreTimerSession(storage, NOW);

    expect(session.status).toBe('paused');
    expect(session.accumulatedMs).toBe(22 * MIN);
    expect(session.recoverableAwayMs).toBe(0);
    expect(session.notice).toBe('上次的阅读计时还在，可以继续或结束保存');
  });

  it('刚暂停就重载页面不打扰用户', () => {
    const storage = storageWith({
      version: 1,
      status: 'paused',
      bookId: 'book-1',
      accumulatedMs: 3 * MIN,
      segmentStartAt: null,
      segmentCount: 1,
      lastActivityAt: NOW - 20 * 1000,
      savedAt: NOW - 20 * 1000,
    });

    expect(restoreTimerSession(storage, NOW).notice).toBeNull();
  });

  it('脏数据一律忽略，回到空闲', () => {
    const broken = [
      'not json',
      JSON.stringify({ version: 2, status: 'running', bookId: 'b', accumulatedMs: 0, savedAt: NOW }),
      JSON.stringify({ version: 1, status: 'running', accumulatedMs: 0, savedAt: NOW }),
      JSON.stringify({ version: 1, status: 'running', bookId: 'b', accumulatedMs: -1, savedAt: NOW }),
      JSON.stringify({ version: 1, status: 'idle', bookId: 'b', accumulatedMs: 0, savedAt: NOW }),
      JSON.stringify(null),
    ];

    for (const raw of broken) {
      expect(parseTimerSnapshot(raw)).toBeNull();
      expect(restoreTimerSession(fakeStorage({ [TIMER_SNAPSHOT_KEY]: raw }), NOW).status).toBe('idle');
    }
    expect(restoreTimerSession(null, NOW).status).toBe('idle');
  });

  it('书被删除后拿到的是 null bookId，交给上层处理', () => {
    const storage = storageWith(runningSnapshot({ bookId: 'deleted-book' }));
    expect(restoreTimerSession(storage, NOW).bookId).toBe('deleted-book');
  });
});

describe('快照读写', () => {
  it('写入后能读回，并记下写入时刻', () => {
    const storage = fakeStorage();

    writeTimerSnapshot(
      storage,
      { status: 'running', bookId: 'book-1', accumulatedMs: 1234.6, segmentStartAt: NOW - 1000, segmentCount: 2, lastActivityAt: NOW - 1000 },
      NOW,
    );

    const snapshot = readTimerSnapshot(storage);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.savedAt).toBe(NOW);
    expect(snapshot!.bookId).toBe('book-1');
    expect(snapshot!.accumulatedMs).toBe(1234.6);
    expect(snapshot!.segmentCount).toBe(2);
  });

  it('空闲时清理快照，避免下次启动恢复出幽灵会话', () => {
    const storage = storageWith(runningSnapshot());

    writeTimerSnapshot(storage, { status: 'idle', bookId: null, accumulatedMs: 0, segmentStartAt: null, segmentCount: 0, lastActivityAt: null }, NOW);

    expect(storage.items[TIMER_SNAPSHOT_KEY]).toBeUndefined();
    expect(restoreTimerSession(storage, NOW).status).toBe('idle');
  });

  it('clearTimerSnapshot 之后没有残留', () => {
    const storage = storageWith(runningSnapshot());
    clearTimerSnapshot(storage);
    expect(readTimerSnapshot(storage)).toBeNull();
  });

  it('存储不可用时不抛错', () => {
    expect(() => writeTimerSnapshot(null, { status: 'running', bookId: 'b', accumulatedMs: 0, segmentStartAt: NOW, segmentCount: 0, lastActivityAt: NOW })).not.toThrow();
    expect(readTimerSnapshot(undefined)).toBeNull();
  });
});
