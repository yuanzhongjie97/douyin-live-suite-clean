import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'real-room-message-integrity');
const dbPath = join(isolatedRoot, 'real-room-message-integrity.db');
const defaultStorageRoot = resolve(projectRoot, '..', 'storage');

rmSync(isolatedRoot, { recursive: true, force: true });
mkdirSync(isolatedRoot, { recursive: true });

process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = isolatedRoot;
process.env.DOUYIN_LIVE_SUITE_DB_PATH = dbPath;
process.env.DOUYIN_LIVE_SUITE_BROWSER_PROFILE_DIR = join(defaultStorageRoot, 'browser-profile');
process.env.DOUYIN_LIVE_SUITE_PLAYWRIGHT_BROWSERS_PATH = join(defaultStorageRoot, 'ms-playwright');
process.env.DOUYIN_LIVE_SUITE_VISIBLE_BROWSER = process.env.DOUYIN_LIVE_SUITE_VISIBLE_BROWSER || '1';

const { AppDatabase } = await import('../dist/db.js');
const { CaptureService } = await import('../dist/capture-service.js');
const { DouyinCollector } = await import('../dist/collector.js');
const { commentDiagnostics } = await import('../dist/comment-diagnostics.js');

const url = process.argv[2] || 'https://live.douyin.com/127874409138';
const durationMs = Number(process.env.REAL_ROOM_SMOKE_MS || 90000);
const sessionId = `real-smoke-${Date.now()}`;
const now = new Date().toISOString();

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);

db.createSession({
  id: sessionId,
  url,
  status: 'running',
  roomId: (url.match(/\/(\d{6,})(?:[/?#]|$)/u) || [])[1] || '',
  roomTitle: 'real room smoke',
  hostName: '',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url,
  roomId: service.activeSession?.roomId,
  roomTitle: 'real room smoke',
  hostName: '',
  isLive: true,
  lastHeartbeatAt: now,
};
service.liveStats = {
  sessionId,
  comments: 0,
  entries: 0,
  interactions: 0,
  gifts: 0,
  giftUnits: 0,
  logs: 0,
  uniqueUsers: 0,
  giftMap: new Map(),
  activeUserMap: new Map(),
};

commentDiagnostics.reset();
const rawCounters = {
  batches: 0,
  total: 0,
  comment: 0,
  gift: 0,
  entry: 0,
  interaction: 0,
};
let lastRawAt = '';
const recentRawComments = [];
const published = [];
const unsubscribe = service.bus.subscribe((message) => {
  if (message.type === 'event') {
    published.push(message.payload);
  }
});

const collector = new DouyinCollector(
  url,
  process.env.DOUYIN_LIVE_SUITE_BROWSER_PROFILE_DIR,
  {
    onEvents: async (events) => {
      rawCounters.batches += 1;
      rawCounters.total += events.length;
      lastRawAt = new Date().toISOString();
      for (const event of events) {
        rawCounters[event.category] = (rawCounters[event.category] ?? 0) + 1;
        if (event.category === 'comment') {
          recentRawComments.push({
            sourceId: event.sourceId,
            collectorClientId: event.collectorClientId,
            userName: event.userName,
            text: event.text,
            rawText: event.rawText,
          });
          recentRawComments.splice(0, Math.max(0, recentRawComments.length - 20));
        }
      }
      await service.persistCollectorEvents(events, sessionId);
    },
    onStatus: async (message, level = 'info') => {
      console.log(`[collector:${level}] ${message}`);
    },
    onRoomUpdate: async (snapshot) => {
      service.room = {
        url: snapshot.url ?? service.room?.url ?? url,
        roomId: snapshot.roomId ?? service.room?.roomId,
        roomTitle: snapshot.roomTitle ?? service.room?.roomTitle,
        hostName: snapshot.hostName ?? service.room?.hostName,
        isLive: snapshot.isLive ?? service.room?.isLive ?? true,
        lastHeartbeatAt: snapshot.lastHeartbeatAt ?? new Date().toISOString(),
      };
    },
    onFatal: async (error) => {
      console.error(`[collector:fatal] ${error instanceof Error ? error.message : String(error)}`);
    },
  },
);

try {
  await collector.start();
  await new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
} finally {
  await collector.stop('real-room-smoke').catch(() => undefined);
  unsubscribe();
}

const rows = db.getAllEventsForSession(sessionId);
const comments = rows.filter((row) => row.category === 'comment');
const gifts = rows.filter((row) => row.category === 'gift');
const snapshot = commentDiagnostics.snapshot();
const result = {
  url,
  durationMs,
  sessionId,
  room: service.room,
  rawCounters,
  lastRawAt,
  persisted: {
    total: rows.length,
    comments: comments.length,
    gifts: gifts.length,
    entries: rows.filter((row) => row.category === 'entry').length,
    interactions: rows.filter((row) => row.category === 'interaction').length,
  },
  published: {
    total: published.length,
    comments: published.filter((row) => row.category === 'comment').length,
    gifts: published.filter((row) => row.category === 'gift').length,
  },
  ledger: snapshot.ledger,
  counters: snapshot.counters,
  recentRawComments,
  recentPersistedComments: comments.slice(-20).map((row) => ({
    id: row.id,
    uniqueKey: row.uniqueKey,
    userName: row.userName,
    message: row.message,
    payload: row.payloadJson ? JSON.parse(row.payloadJson) : undefined,
  })),
};

console.log(JSON.stringify(result, null, 2));

assert.equal(
  snapshot.ledger['ledger.comment.db_inserted'] ?? 0,
  comments.length,
  'comment ledger inserted count must equal persisted comment rows',
);
assert.equal(
  snapshot.ledger['ledger.comment.bus_published'] ?? 0,
  comments.length,
  'comment ledger bus published count must equal persisted comment rows',
);
assert.equal(
  new Set(comments.map((row) => row.uniqueKey)).size,
  comments.length,
  'persisted comments must not contain duplicate unique keys',
);

if (rawCounters.comment > 0) {
  assert.ok(comments.length > 0, 'real room smoke collected comments but persisted none');
  assert.ok(
    comments.every((row) => {
      const payload = row.payloadJson ? JSON.parse(row.payloadJson) : {};
      return payload.sourceId || payload.collectorClientId;
    }),
    'every persisted comment should carry a stable sourceId or collectorClientId for traceability',
  );
}

console.log('real room message integrity smoke passed');
