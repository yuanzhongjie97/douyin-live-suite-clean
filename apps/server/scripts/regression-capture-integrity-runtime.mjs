import assert from 'node:assert/strict';
import { join } from 'node:path';
import { AppDatabase } from '../src/db.ts';
import { CaptureService } from '../src/capture-service.ts';
import { commentDiagnostics } from '../src/comment-diagnostics.ts';

const dbPath = process.env.DOUYIN_LIVE_SUITE_DB_PATH ?? join(process.cwd(), 'tmp', 'capture-integrity-runtime.db');
const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-capture-integrity-runtime';
const now = new Date('2026-06-11T00:00:00.000Z').toISOString();

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'running',
  roomId: '962565925628',
  roomTitle: 'runtime regression room',
  hostName: 'host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/962565925628',
  roomId: '962565925628',
  roomTitle: 'runtime regression room',
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
      sourceId: 'comment-source-1',
      userName: 'user-a',
      userId: 'sec_comment_user_a',
      userLink: 'https://www.douyin.com/user/sec_comment_user_a',
      text: 'same text',
      rawText: 'user-a: same text',
    },
    {
      category: 'comment',
      sourceId: 'comment-source-2',
      userName: 'user-a',
      userId: 'sec_comment_user_a',
      userLink: 'https://www.douyin.com/user/sec_comment_user_a',
      text: 'same text',
      rawText: 'user-a: same text',
    },
    {
      category: 'gift',
      sourceId: 'gift-source-1',
      userName: 'gift-user',
      text: 'gift-user -> Rose x1',
      rawText: 'gift-user sent Rose x1',
      giftName: 'Rose',
      giftCount: 1,
    },
  ],
  sessionId,
);

await service.persistCollectorEvents(
  [
    {
      category: 'gift',
      sourceId: 'gift-source-1',
      userName: 'gift-user',
      userId: 'sec_gift_user_123456789',
      userLink: 'https://www.douyin.com/user/sec_gift_user_123456789',
      text: 'gift-user -> Rose x1',
      rawText: 'gift-user sent Rose x1',
      giftName: 'Rose',
      giftCount: 1,
    },
  ],
  sessionId,
);

const rows = db.getEvents({ sessionId, limit: 1000 });
const comments = rows.filter((row) => row.category === 'comment');
const gifts = rows.filter((row) => row.category === 'gift');
const snapshotBeforeHighlight = commentDiagnostics.snapshot();

assert.equal(comments.length, 2, 'two real same-user same-text comments with different sourceId must both persist');
assert.equal(gifts.length, 1, 'same gift source must persist once');
assert.equal(gifts[0].userId, 'sec_gift_user_123456789', 'later stable gift identity must update persisted gift userId');
assert.equal(
  JSON.parse(gifts[0].payloadJson).userLink,
  'https://www.douyin.com/user/sec_gift_user_123456789',
  'later stable gift identity must update persisted gift payload',
);

assert.equal(snapshotBeforeHighlight.ledger['ledger.comment.raw_received'], 2, 'comment raw ledger should count both comments');
assert.equal(snapshotBeforeHighlight.ledger['ledger.comment.db_inserted'], 2, 'comment inserted ledger should count both comments');
assert.equal(snapshotBeforeHighlight.ledger['ledger.comment.bus_published'], 2, 'comment publish ledger should count both comments');
assert.equal(snapshotBeforeHighlight.ledger['ledger.gift.raw_received'], 2, 'gift raw ledger should include original and later identity row');
assert.equal(snapshotBeforeHighlight.ledger['ledger.gift.db_inserted'], 1, 'gift insert ledger should count the original persisted gift');
assert.equal(snapshotBeforeHighlight.ledger['ledger.gift.deduped'], 1, 'gift dedupe ledger should count the later identity duplicate');
assert.equal(
  snapshotBeforeHighlight.ledger['ledger.gift.identity_update_published'],
  1,
  'later gift identity update must be republished for frontend remark recomputation',
);
assert.equal(
  published.filter((row) => row.category === 'gift').length,
  2,
  'frontend should receive original gift row and later identity update row',
);

commentDiagnostics.recordHighlightMatch({
  sessionId,
  category: 'gift',
  uniqueKey: gifts[0].uniqueKey,
  userId: gifts[0].userId,
  userLink: gifts[0].userLink,
  remark: 'remark-user',
  matchedBy: 'event.userId',
  matchedValue: 'sec_gift_user_123456789',
  message: gifts[0].message,
});
commentDiagnostics.incrementLedger('highlight', 'gift_matched');
const snapshot = commentDiagnostics.snapshot();
assert.equal(snapshot.ledger['ledger.highlight.gift_matched'], 1, 'highlight gift match ledger should be recorded');
assert.equal(snapshot.highlightMatches[0].matchedBy, 'event.userId', 'highlight diagnostics should record matched identity field');
assert.equal(snapshot.highlightMatches[0].category, 'gift', 'highlight diagnostics should record gift category');

unsubscribe();
db.close();

console.log('capture integrity runtime regression checks passed');
