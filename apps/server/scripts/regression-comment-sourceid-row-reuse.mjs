import assert from 'node:assert/strict';
import { rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..', '..', '..');
const storageRoot = join(projectRoot, 'tmp', 'comment-sourceid-row-reuse');
const dbPath = join(storageRoot, 'row-reuse.db');

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });
process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = storageRoot;
process.env.DOUYIN_LIVE_SUITE_DB_PATH = dbPath;

const { AppDatabase } = await import('../dist/db.js');
const { CaptureService } = await import('../dist/capture-service.js');
const { commentDiagnostics } = await import('../dist/comment-diagnostics.js');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'sourceid-row-reuse-session';
const now = new Date().toISOString();

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/127874409138',
  status: 'running',
  roomId: '127874409138',
  roomTitle: 'row reuse regression',
  hostName: 'host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/127874409138',
  roomId: '127874409138',
  roomTitle: 'row reuse regression',
  hostName: 'host',
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

await service.persistCollectorEvents([
  {
    category: 'comment',
    sourceId: 'reused-dom-row-source',
    collectorClientId: 'client-1',
    userName: '用户A',
    userId: 'user-a',
    userLink: 'https://www.douyin.com/user/user-a',
    rawText: '用户A ： 第一条真实评论',
    text: '第一条真实评论',
  },
  {
    category: 'comment',
    sourceId: 'reused-dom-row-source',
    collectorClientId: 'client-2',
    userName: '用户B',
    userId: 'user-b',
    userLink: 'https://www.douyin.com/user/user-b',
    rawText: '用户B ： 第二条真实评论',
    text: '第二条真实评论',
  },
], sessionId);

const comments = db.getAllEventsForSession(sessionId).filter((row) => row.category === 'comment');
assert.equal(comments.length, 2, 'same sourceId with different user/text must not be dropped as a duplicate row reuse');
assert.deepEqual(
  comments.map((row) => row.message),
  ['第一条真实评论', '第二条真实评论'],
  'both reused-row comments must retain their own message text',
);

const snapshot = commentDiagnostics.snapshot();
assert.equal(snapshot.ledger['ledger.comment.raw_received'], 2, 'ledger should receive both comments');
assert.equal(snapshot.ledger['ledger.comment.db_inserted'], 2, 'ledger should insert both comments');
assert.equal(snapshot.ledger['ledger.comment.deduped'] ?? 0, 0, 'reused sourceId with changed content must not be source-deduped');

console.log('comment sourceId row reuse regression checks passed');
