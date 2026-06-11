import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'capture-integrity-strong-mock');
const isolatedHome = join(isolatedRoot, 'home');
const isolatedDesktop = join(isolatedHome, 'Desktop');
const dbPath = process.env.DOUYIN_LIVE_SUITE_DB_PATH ?? join(isolatedRoot, 'capture-integrity-strong-mock.db');

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

const highlightFile = join(isolatedDesktop, 'highlight_users.txt');
writeFileSync(
  highlightFile,
  [
    'sec_comment_target_001 comment-remark',
    'sec_gift_target_001 gift-remark',
    'https://www.douyin.com/user/sec_gift_payload_link_001 link-remark',
    '',
  ].join('\n'),
  'utf8',
);
assert.equal(existsSync(highlightFile), true, 'fixture highlight file should exist in isolated desktop');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-capture-integrity-strong-mock';
const now = '2026-06-11T07:55:00.000Z';

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'running',
  roomId: '962565925628',
  roomTitle: 'strong mock room',
  hostName: 'strong mock host',
  startedAt: now,
  lastHeartbeatAt: now,
});

service.activeSession = db.getSessionById(sessionId);
service.room = {
  url: 'https://live.douyin.com/962565925628',
  roomId: '962565925628',
  roomTitle: 'strong mock room',
  hostName: 'strong mock host',
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
      sourceId: 'comment-dom-001',
      userName: 'comment-target-user',
      userId: 'sec_comment_target_001',
      userLink: 'https://www.douyin.com/user/sec_comment_target_001',
      text: 'same dom rescan comment',
      rawText: 'comment-target-user: same dom rescan comment',
    },
    {
      category: 'comment',
      sourceId: 'comment-dom-002',
      userName: 'repeat-user',
      userId: 'sec_repeat_user_001',
      userLink: 'https://www.douyin.com/user/sec_repeat_user_001',
      text: 'same sentence repeated',
      rawText: 'repeat-user: same sentence repeated',
    },
    {
      category: 'comment',
      sourceId: 'comment-dom-003',
      userName: 'repeat-user',
      userId: 'sec_repeat_user_001',
      userLink: 'https://www.douyin.com/user/sec_repeat_user_001',
      text: 'same sentence repeated',
      rawText: 'repeat-user: same sentence repeated',
    },
    {
      category: 'comment',
      sourceId: 'comment-dom-004',
      userName: 'other-user',
      userId: 'sec_other_user_001',
      userLink: 'https://www.douyin.com/user/sec_other_user_001',
      text: 'same sentence repeated',
      rawText: 'other-user: same sentence repeated',
    },
    {
      category: 'gift',
      sourceId: 'gift-dom-identity-late',
      userName: 'gift-original-name',
      text: 'gift-original-name -> Heart x1',
      rawText: 'gift-original-name sent Heart x1',
      giftName: 'Heart',
      giftCount: 1,
    },
    {
      category: 'gift',
      sourceId: 'gift-dom-payload-link',
      userName: 'gift-link-name',
      userLink: 'https://www.douyin.com/user/sec_gift_payload_link_001',
      text: 'gift-link-name -> Rose x2',
      rawText: 'gift-link-name sent Rose x2',
      giftName: 'Rose',
      giftCount: 2,
    },
  ],
  sessionId,
);

await service.persistCollectorEvents(
  [
    {
      category: 'comment',
      sourceId: 'comment-dom-001',
      userName: 'comment-target-user',
      userId: 'sec_comment_target_001',
      userLink: 'https://www.douyin.com/user/sec_comment_target_001',
      text: 'same dom rescan comment',
      rawText: 'comment-target-user: same dom rescan comment',
    },
    {
      category: 'gift',
      sourceId: 'gift-dom-identity-late',
      userName: 'gift-original-name',
      userId: 'sec_gift_target_001',
      userLink: 'https://www.douyin.com/user/sec_gift_target_001',
      text: 'gift-original-name -> Heart x1',
      rawText: 'gift-original-name sent Heart x1',
      giftName: 'Heart',
      giftCount: 1,
    },
  ],
  sessionId,
);

const rows = db.getAllEventsForSession(sessionId);
const comments = rows.filter((row) => row.category === 'comment');
const gifts = rows.filter((row) => row.category === 'gift');

assert.equal(comments.length, 4, 'DB must keep four real comments while dropping only the same DOM rescan');
assert.equal(
  comments.filter((row) => row.message === 'same sentence repeated' && row.userId === 'sec_repeat_user_001').length,
  2,
  'DB must keep same-user same-text consecutive real comments',
);
assert.equal(
  comments.filter((row) => row.message === 'same sentence repeated').length,
  3,
  'DB must keep same text from different users and same-user repeats',
);
assert.equal(
  new Set(comments.map((row) => row.uniqueKey)).size,
  comments.length,
  'persisted comments must have distinct unique keys except true rescans',
);

assert.equal(gifts.length, 2, 'DB must keep one identity-late gift and one profile-link gift');
const identityLateGift = gifts.find((row) => row.giftName === 'Heart');
assert.ok(identityLateGift, 'identity-late gift must persist');
assert.equal(identityLateGift.userId, 'sec_gift_target_001', 'later stable gift userId must update persisted row');
assert.equal(
  JSON.parse(identityLateGift.payloadJson).userLink,
  'https://www.douyin.com/user/sec_gift_target_001',
  'later stable gift userLink must update persisted payload',
);

const exportRows = db.getExportEventsForSession(sessionId);
assert.equal(exportRows.length, rows.length, 'export source must include all persisted mock events');
assert.equal(
  exportRows.filter((row) => row.category === 'comment').length,
  comments.length,
  'export source must include all persisted comments',
);
assert.equal(
  exportRows.filter((row) => row.category === 'gift' && row.userId === 'sec_gift_target_001').length,
  1,
  'export source must include the updated gift identity for remark traceability',
);

const highlightSnapshot = await service.getHighlightUsers({ sessionId, includeMatched: true });
assert.equal(highlightSnapshot.filePath, highlightFile, 'highlight lookup should use the isolated mock highlight file');
assert.equal(highlightSnapshot.users.length, 3, 'mock highlight file should load all configured users');
assert.equal(
  highlightSnapshot.matchedEvents.some(
    (row) => row.category === 'comment' && row.userId === 'sec_comment_target_001',
  ),
  true,
  'highlight query must match comments by stable userId',
);
assert.equal(
  highlightSnapshot.matchedEvents.some(
    (row) => row.category === 'gift' && row.userId === 'sec_gift_target_001',
  ),
  true,
  'highlight query must match identity-late gifts after DB identity update',
);
assert.equal(
  highlightSnapshot.matchedEvents.some(
    (row) => row.category === 'gift' && row.userLink?.includes('sec_gift_payload_link_001'),
  ),
  true,
  'highlight query must match gifts by stable profile link',
);

const snapshot = commentDiagnostics.snapshot();
assert.equal(snapshot.ledger['ledger.comment.raw_received'], 5, 'ledger must count four real comments plus one rescan input');
assert.equal(snapshot.ledger['ledger.comment.deduped'], 1, 'ledger must count the same DOM comment rescan as deduped');
assert.equal(snapshot.ledger['ledger.comment.db_inserted'], 4, 'ledger must count all four real comments inserted');
assert.equal(snapshot.ledger['ledger.comment.bus_published'], 4, 'ledger must publish every persisted comment to frontend stream');
assert.equal(snapshot.ledger['ledger.gift.raw_received'], 3, 'ledger must count original gifts plus identity-late update input');
assert.equal(snapshot.ledger['ledger.gift.db_inserted'], 2, 'ledger must count two persisted gift rows');
assert.equal(snapshot.ledger['ledger.gift.deduped'], 1, 'ledger must count identity-late gift as duplicate merge');
assert.equal(
  snapshot.ledger['ledger.gift.identity_update_published'],
  1,
  'ledger must count republished gift identity updates for frontend remark recomputation',
);
assert.equal(snapshot.ledger['ledger.highlight.comment_matched'], 1, 'ledger must count the matched highlight comment');
assert.equal(snapshot.ledger['ledger.highlight.gift_matched'], 2, 'ledger must count both matched highlight gifts');
assert.equal(
  snapshot.highlightMatches.some(
    (item) =>
      item.category === 'gift' &&
      item.remark === 'gift-remark' &&
      item.matchedBy === 'event.userId' &&
      item.matchedValue === 'sec_gift_target_001',
  ),
  true,
  'highlight diagnostics must show identity-late gift matched by event.userId',
);
assert.equal(
  snapshot.highlightMatches.some(
    (item) =>
      item.category === 'gift' &&
      item.remark === 'link-remark' &&
      [
        'event.userId',
        'event.userLink',
        'event.userLink.sec_uid',
        'payload.userLink',
        'payload.userLink.sec_uid',
      ].includes(item.matchedBy) &&
      item.matchedValue === 'sec_gift_payload_link_001',
  ),
  true,
  'highlight diagnostics must show profile-link gift matched by stable link identity',
);

assert.equal(
  published.filter((row) => row.category === 'comment').length,
  4,
  'SSE bus must publish every persisted comment exactly once',
);
assert.equal(
  published.filter((row) => row.category === 'gift').length,
  3,
  'SSE bus must publish two original gifts plus one identity update',
);
assert.equal(
  published.some((row) => row.category === 'gift' && row.userId === 'sec_gift_target_001'),
  true,
  'SSE bus must republish the updated gift so frontend can recalculate remarks',
);

const payloadOnlySessionId = 'session-capture-integrity-payload-only-mock';
db.createSession({
  id: payloadOnlySessionId,
  url: 'https://live.douyin.com/962565925628',
  status: 'stopped',
  roomId: '962565925628',
  roomTitle: 'payload-only mock room',
  hostName: 'payload-only mock host',
  startedAt: now,
  endedAt: now,
  lastHeartbeatAt: now,
});
db.insertEvents([
  {
    uniqueKey: 'payload-only-comment-link',
    sessionId: payloadOnlySessionId,
    category: 'comment',
    createdAt: '2026-06-11T07:56:00.000Z',
    roomId: '962565925628',
    roomTitle: 'payload-only mock room',
    hostName: 'payload-only mock host',
    userName: 'payload-comment-name',
    message: 'payload-only comment identity',
    payloadJson: JSON.stringify({
      category: 'comment',
      text: 'payload-only comment identity',
      rawText: 'payload-comment-name: payload-only comment identity',
      userLink: 'https://www.douyin.com/user/sec_comment_target_001',
    }),
  },
  {
    uniqueKey: 'payload-only-gift-id',
    sessionId: payloadOnlySessionId,
    category: 'gift',
    createdAt: '2026-06-11T07:56:01.000Z',
    roomId: '962565925628',
    roomTitle: 'payload-only mock room',
    hostName: 'payload-only mock host',
    userName: 'payload-gift-name',
    message: 'payload-gift-name -> Heart x1',
    giftName: 'Heart',
    giftCount: 1,
    payloadJson: JSON.stringify({
      category: 'gift',
      text: 'payload-gift-name -> Heart x1',
      rawText: 'payload-gift-name sent Heart x1',
      userId: 'sec_gift_target_001',
    }),
  },
]);

commentDiagnostics.reset();
const payloadOnlyHighlightSnapshot = await service.getHighlightUsers({
  sessionId: payloadOnlySessionId,
  includeMatched: true,
});
assert.equal(
  payloadOnlyHighlightSnapshot.matchedEvents.some(
    (row) => row.category === 'comment' && JSON.parse(row.payloadJson).userLink?.includes('sec_comment_target_001'),
  ),
  true,
  'highlight query must match comments that only carry payload.userLink',
);
assert.equal(
  payloadOnlyHighlightSnapshot.matchedEvents.some(
    (row) => row.category === 'gift' && JSON.parse(row.payloadJson).userId === 'sec_gift_target_001',
  ),
  true,
  'highlight query must match gifts that only carry payload.userId',
);
const payloadOnlyDiagnostics = commentDiagnostics.snapshot();
assert.equal(
  payloadOnlyDiagnostics.highlightMatches.some(
    (item) =>
      item.category === 'comment' &&
      item.remark === 'comment-remark' &&
      item.matchedBy === 'payload.userLink' &&
      item.matchedValue === 'sec_comment_target_001',
  ),
  true,
  'highlight diagnostics must identify payload.userLink for payload-only comments',
);
assert.equal(
  payloadOnlyDiagnostics.highlightMatches.some(
    (item) => item.category === 'gift' && item.remark === 'gift-remark' && item.matchedBy === 'payload.userId',
  ),
  true,
  'highlight diagnostics must identify payload.userId for payload-only gifts',
);

unsubscribe();
db.close();

console.log('capture integrity strong mock regression checks passed');
