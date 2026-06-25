import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'comment-latency-diagnostics');
const isolatedHome = join(isolatedRoot, 'home');
const isolatedDesktop = join(isolatedHome, 'Desktop');
const dbPath = join(isolatedRoot, 'comment-latency-diagnostics.db');

rmSync(isolatedRoot, { recursive: true, force: true });
mkdirSync(isolatedDesktop, { recursive: true });

process.env.USERPROFILE = isolatedHome;
process.env.HOME = isolatedHome;
process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = isolatedRoot;
process.env.DOUYIN_LIVE_SUITE_DB_PATH = dbPath;
process.env.DOUYIN_LIVE_SUITE_DESKTOP_DIR = isolatedDesktop;
process.env.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = join(isolatedHome, 'Documents');

const { AppDatabase } = await import('../src/db.ts');
const { CaptureService } = await import('../src/capture-service.ts');
const { commentDiagnostics } = await import('../src/comment-diagnostics.ts');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-comment-latency-diagnostics';
const now = new Date().toISOString();
const collectorObservedAt = new Date(Date.now() - 180).toISOString();
const collectorFlushedAt = new Date(Date.now() - 60).toISOString();

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/127874409138',
  status: 'running',
  roomId: '127874409138',
  roomTitle: 'comment latency mock room',
  hostName: 'comment latency mock host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/127874409138',
  roomId: '127874409138',
  roomTitle: 'comment latency mock room',
  hostName: 'comment latency mock host',
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
const published = [];
const unsubscribe = service.bus.subscribe((message) => {
  if (message.type === 'event') {
    published.push(message.payload);
  }
});

await service.persistCollectorEvents(
  [
    {
      category: 'comment',
      sourceId: 'latency-comment-001',
      collectorClientId: 'latency-client-001',
      collectorTraceId: 'trace-latency-comment-001',
      collectorObservedAt,
      collectorFlushedAt,
      userName: 'latency-user',
      userId: 'sec_latency_user_001',
      userLink: 'https://www.douyin.com/user/sec_latency_user_001',
      text: 'latency trace comment',
      rawText: 'latency-user: latency trace comment',
    },
  ],
  sessionId,
);

assert.equal(published.length, 1, 'comment should be published once');
const row = published[0];
const payload = JSON.parse(row.payloadJson);
assert.equal(payload.collectorTraceId, 'trace-latency-comment-001', 'payload must preserve trace id');
assert.equal(payload.collectorFlushedAt, collectorFlushedAt, 'payload must preserve collector flush timestamp');
assert.equal(typeof payload.serverReceivedAt, 'string', 'payload must include server receive timestamp');
assert.equal(typeof payload.dbInsertedAt, 'string', 'payload must include DB insert timestamp');
assert.equal(typeof payload.busPublishedAt, 'string', 'payload must include bus publish timestamp');

const diagnostics = commentDiagnostics.snapshot();
assert.equal(
  diagnostics.latency.comment.count,
  1,
  `comment latency summary must count persisted comments, got ${JSON.stringify(diagnostics.latency)}`,
);
assert.equal(
  diagnostics.latency.comment.maxCollectorToServerMs < 1000,
  true,
  `collector-to-server latency should stay below 1s in mock, got ${JSON.stringify(diagnostics.latency.comment)}`,
);
assert.equal(
  diagnostics.latency.comment.maxServerToBusMs < 1000,
  true,
  `server-to-bus latency should stay below 1s in mock, got ${JSON.stringify(diagnostics.latency.comment)}`,
);
assert.equal(
  diagnostics.recent.some(
    (item) =>
      item.reason === 'latency.comment_published' &&
      item.extra?.collectorToServerMs !== undefined &&
      item.extra?.serverToBusMs !== undefined,
  ),
  true,
  `recent diagnostics must expose comment latency segments, got ${JSON.stringify(diagnostics.recent)}`,
);

unsubscribe();
db.close();
console.log('comment latency diagnostics regression checks passed');
