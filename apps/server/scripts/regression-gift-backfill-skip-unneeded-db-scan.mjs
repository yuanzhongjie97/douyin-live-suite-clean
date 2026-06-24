import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'gift-backfill-skip-unneeded-db-scan');
const isolatedHome = join(isolatedRoot, 'home');
const dbPath = join(isolatedRoot, 'gift-backfill-skip-unneeded-db-scan.db');

rmSync(isolatedRoot, { recursive: true, force: true });
mkdirSync(isolatedHome, { recursive: true });

process.env.USERPROFILE = isolatedHome;
process.env.HOME = isolatedHome;
process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = isolatedRoot;
process.env.DOUYIN_LIVE_SUITE_DB_PATH = dbPath;
process.env.DOUYIN_LIVE_SUITE_DESKTOP_DIR = join(isolatedHome, 'Desktop');
process.env.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = join(isolatedHome, 'Documents');

const { AppDatabase } = await import('../src/db.ts');
const { CaptureService } = await import('../src/capture-service.ts');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-gift-backfill-skip-unneeded-db-scan';
const now = '2026-06-24T09:00:00.000Z';

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'running',
  roomId: '962565925628',
  roomTitle: 'skip unneeded DB scan room',
  hostName: 'skip unneeded DB scan host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/962565925628',
  roomId: '962565925628',
  roomTitle: 'skip unneeded DB scan room',
  hostName: 'skip unneeded DB scan host',
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

let pendingGiftCandidateQueries = 0;
const originalCandidateQuery = db.getPendingGiftIdentityBackfillCandidates.bind(db);
db.getPendingGiftIdentityBackfillCandidates = (...args) => {
  pendingGiftCandidateQueries += 1;
  return originalCandidateQuery(...args);
};

const comments = Array.from({ length: 80 }, (_, index) => ({
  category: 'comment',
  sourceId: `comment-stable-identity-${index}`,
  userName: `clean-user-${index}`,
  userId: `sec_clean_identity_${index}`,
  userLink: `https://www.douyin.com/user/sec_clean_identity_${index}`,
  text: `normal comment ${index}`,
  rawText: `clean-user-${index}: normal comment ${index}`,
}));

await service.persistCollectorEvents(comments, sessionId);

assert.equal(
  pendingGiftCandidateQueries,
  0,
  'stable identity observations must not scan historical gift rows when no gift is pending identity backfill',
);

db.close();

console.log('gift backfill skips unneeded DB scans regression checks passed');
