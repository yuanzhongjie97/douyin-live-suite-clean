import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'gift-pending-identity-backfill');
const isolatedHome = join(isolatedRoot, 'home');
const isolatedDesktop = join(isolatedHome, 'Desktop');
const dbPath = join(isolatedRoot, 'gift-pending-identity-backfill.db');

rmSync(isolatedRoot, { recursive: true, force: true });
mkdirSync(isolatedDesktop, { recursive: true });

process.env.USERPROFILE = isolatedHome;
process.env.HOME = isolatedHome;
process.env.DOUYIN_LIVE_SUITE_STORAGE_ROOT = isolatedRoot;
process.env.DOUYIN_LIVE_SUITE_DB_PATH = dbPath;
process.env.DOUYIN_LIVE_SUITE_DESKTOP_DIR = isolatedDesktop;
process.env.DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = join(isolatedHome, 'Documents');

writeFileSync(join(isolatedDesktop, 'highlight_users.txt'), 'sec_late_identity_001 late-remark\n', 'utf8');

const { AppDatabase } = await import('../src/db.ts');
const { CaptureService } = await import('../src/capture-service.ts');
const { commentDiagnostics } = await import('../src/comment-diagnostics.ts');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-gift-pending-identity-backfill';
const now = '2026-06-23T09:00:00.000Z';

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'running',
  roomId: '962565925628',
  roomTitle: 'pending identity mock room',
  hostName: 'pending identity mock host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/962565925628',
  roomId: '962565925628',
  roomTitle: 'pending identity mock room',
  hostName: 'pending identity mock host',
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
      category: 'gift',
      sourceId: 'gift-before-identity',
      userName: 'late-display-name',
      text: 'late-display-name -> Heart x1',
      rawText: 'late-display-name sent Heart x1',
      giftName: 'Heart',
      giftCount: 1,
    },
  ],
  sessionId,
);

let gift = db.getAllEventsForSession(sessionId).find((row) => row.category === 'gift');
assert.ok(gift, 'gift without stable identity should still be persisted');
assert.equal(gift.userId || '', '', 'fixture must start with a gift that has no stable userId');

await service.persistCollectorEvents(
  [
    {
      category: 'comment',
      sourceId: 'comment-after-gift-identity',
      userName: 'late-display-name',
      userId: 'sec_late_identity_001',
      userLink: 'https://www.douyin.com/user/sec_late_identity_001',
      text: 'identity arrives after the gift',
      rawText: 'late-display-name: identity arrives after the gift',
    },
  ],
  sessionId,
);

gift = db.getAllEventsForSession(sessionId).find((row) => row.category === 'gift');
assert.equal(
  gift?.userId,
  'sec_late_identity_001',
  'gift that arrived before identity must be backfilled after a later stable same-session identity observation',
);
assert.equal(
  JSON.parse(gift.payloadJson).identityBackfillSource,
  'identity_cache',
  'backfilled gift payload must record identity_cache as the remark source',
);
assert.equal(
  published.some((row) => row.category === 'gift' && row.uniqueKey === gift.uniqueKey && row.userId === 'sec_late_identity_001'),
  true,
  'backfilled gift must be republished with the same uniqueKey so the UI can recompute the special-follow remark',
);

const highlightSnapshot = await service.getHighlightUsers({ sessionId, includeMatched: true });
assert.equal(
  highlightSnapshot.matchedEvents.some((row) => row.category === 'gift' && row.userId === 'sec_late_identity_001'),
  true,
  'highlight lookup must include the backfilled gift after later identity arrival',
);

const snapshot = commentDiagnostics.snapshot();
assert.equal(
  snapshot.recent.some((row) => row.reason === 'gift.pending_identity' && row.userName === 'late-display-name'),
  true,
  'diagnostics must show that the gift initially waited for a stable identity',
);
assert.equal(
  snapshot.recent.some((row) => row.reason === 'gift.pending_identity_backfilled' && row.userName === 'late-display-name'),
  true,
  'diagnostics must show that the pending gift was later backfilled',
);
assert.equal(
  snapshot.ledger['ledger.gift.identity_update_published'],
  1,
  'identity backfill must publish exactly one gift identity update',
);

const sameBatchSessionId = 'session-gift-same-batch-identity-backfill';
db.createSession({
  id: sameBatchSessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'running',
  roomId: '962565925628',
  roomTitle: 'same batch identity mock room',
  hostName: 'same batch identity mock host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sameBatchSessionId);
service.room = {
  url: 'https://live.douyin.com/962565925628',
  roomId: '962565925628',
  roomTitle: 'same batch identity mock room',
  hostName: 'same batch identity mock host',
  isLive: true,
  lastHeartbeatAt: now,
};
service.liveStats = {
  sessionId: sameBatchSessionId,
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
const sameBatchPublishedStart = published.length;
await service.persistCollectorEvents(
  [
    {
      category: 'gift',
      sourceId: 'gift-same-batch-before-identity',
      userName: 'same-batch-display-name',
      text: 'same-batch-display-name -> Heart x1',
      rawText: 'same-batch-display-name sent Heart x1',
      giftName: 'Heart',
      giftCount: 1,
    },
    {
      category: 'comment',
      sourceId: 'comment-same-batch-after-gift-identity',
      userName: 'same-batch-display-name',
      userId: 'sec_late_identity_001',
      userLink: 'https://www.douyin.com/user/sec_late_identity_001',
      text: 'same batch identity arrives after the gift',
      rawText: 'same-batch-display-name: same batch identity arrives after the gift',
    },
  ],
  sameBatchSessionId,
);

const sameBatchGift = db.getAllEventsForSession(sameBatchSessionId).find((row) => row.category === 'gift');
assert.equal(
  sameBatchGift?.userId,
  'sec_late_identity_001',
  'gift earlier in the same collector batch must be backfilled when a later row in that batch establishes stable identity',
);
assert.equal(
  JSON.parse(sameBatchGift.payloadJson).identityBackfillSource,
  'identity_cache',
  'same-batch gift backfill must record identity_cache as the remark source',
);
assert.equal(
  published
    .slice(sameBatchPublishedStart)
    .some((row) => row.category === 'gift' && row.uniqueKey === sameBatchGift.uniqueKey && row.userId === 'sec_late_identity_001'),
  true,
  'same-batch gift must be published with backfilled identity on its first visible event',
);

unsubscribe();
db.close();

console.log('gift pending identity backfill regression checks passed');
