import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const isolatedRoot = join(projectRoot, 'tmp', 'highlight-short-id-diagnostics');
const isolatedHome = join(isolatedRoot, 'home');
const isolatedDesktop = join(isolatedHome, 'Desktop');
const dbPath = join(isolatedRoot, 'highlight-short-id-diagnostics.db');

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
    '83208545044 short-id-remark',
    'sec_display_id_001 sec-remark',
    '',
  ].join('\n'),
  'utf8',
);
assert.equal(existsSync(highlightFile), true, 'fixture highlight file should exist');

const db = new AppDatabase(dbPath);
const service = new CaptureService(db);
const sessionId = 'session-highlight-short-id-diagnostics';
const now = '2026-06-25T03:55:00.000Z';

db.createSession({
  id: sessionId,
  url: 'https://live.douyin.com/127874409138',
  status: 'running',
  roomId: '127874409138',
  roomTitle: 'highlight short id mock room',
  hostName: 'highlight short id mock host',
  startedAt: now,
  lastHeartbeatAt: now,
});

db.insertEvents([
  {
    uniqueKey: 'gift-display-id-direct',
    sessionId,
    category: 'gift',
    createdAt: '2026-06-25T03:55:01.000Z',
    roomId: '127874409138',
    roomTitle: 'highlight short id mock room',
    hostName: 'highlight short id mock host',
    userName: 'short-id-user',
    userId: '83208545044',
    userLink: 'https://www.douyin.com/user/MS4wLjABAAAAYsu9gGNsRSghL9Kwi3DItdNecsVNt_hFbcb9Dnhd7o6VMGYku1oa2AmD19h-Pp1F',
    message: 'short-id-user -> 粉丝灯牌 x1',
    giftName: '粉丝灯牌',
    giftCount: 1,
    payloadJson: JSON.stringify({
      category: 'gift',
      text: 'short-id-user -> 粉丝灯牌 x1',
      rawText: 'short-id-user 送礼 粉丝灯牌 x1',
      userId: '83208545044',
      userLink: 'https://www.douyin.com/user/MS4wLjABAAAAYsu9gGNsRSghL9Kwi3DItdNecsVNt_hFbcb9Dnhd7o6VMGYku1oa2AmD19h-Pp1F',
    }),
  },
  {
    uniqueKey: 'gift-display-id-payload',
    sessionId,
    category: 'gift',
    createdAt: '2026-06-25T03:55:02.000Z',
    roomId: '127874409138',
    roomTitle: 'highlight short id mock room',
    hostName: 'highlight short id mock host',
    userName: 'payload-display-id-user',
    userId: 'sec_display_id_001',
    userLink: 'https://www.douyin.com/user/sec_display_id_001',
    message: 'payload-display-id-user -> 小心心 x1',
    giftName: '小心心',
    giftCount: 1,
    payloadJson: JSON.stringify({
      category: 'gift',
      text: 'payload-display-id-user -> 小心心 x1',
      rawText: 'payload-display-id-user 送礼 小心心 x1',
      displayId: '83208545044',
      shortId: '83208545044',
      uniqueId: '83208545044',
      userId: 'sec_display_id_001',
      userLink: 'https://www.douyin.com/user/sec_display_id_001',
    }),
  },
  {
    uniqueKey: 'gift-short-id-unresolved',
    sessionId,
    category: 'gift',
    createdAt: '2026-06-25T03:55:03.000Z',
    roomId: '127874409138',
    roomTitle: 'highlight short id mock room',
    hostName: 'highlight short id mock host',
    userName: 'unresolved-short-id-user',
    userId: 'MS4wLjABAAAAUNRESOLVED000000000000000000',
    userLink: 'https://www.douyin.com/user/MS4wLjABAAAAUNRESOLVED000000000000000000',
    message: 'unresolved-short-id-user -> 人气票 x1',
    giftName: '人气票',
    giftCount: 1,
    payloadJson: JSON.stringify({
      category: 'gift',
      text: 'unresolved-short-id-user -> 人气票 x1',
      rawText: 'unresolved-short-id-user 送礼 人气票 x1',
      userId: 'MS4wLjABAAAAUNRESOLVED000000000000000000',
      userLink: 'https://www.douyin.com/user/MS4wLjABAAAAUNRESOLVED000000000000000000',
    }),
  },
]);

commentDiagnostics.reset();
const snapshot = await service.getHighlightUsers({ sessionId, includeMatched: true });

assert.equal(snapshot.users.length, 2, 'short-id and sec-id highlight configs must load');
assert.equal(
  snapshot.users.some((user) => user.userId === '83208545044' && user.identityKind === 'short_id'),
  true,
  `short numeric highlight config must be classified as short_id, got ${JSON.stringify(snapshot.users)}`,
);
assert.equal(
  snapshot.matchedEvents.some((row) => row.uniqueKey === 'gift-display-id-direct'),
  true,
  'gift carrying the same short numeric userId must match short-id highlight config',
);
assert.equal(
  snapshot.matchedEvents.some((row) => row.uniqueKey === 'gift-display-id-payload'),
  true,
  'gift carrying payload displayId/shortId/uniqueId must match short-id highlight config',
);
assert.equal(
  snapshot.matchedEvents.some((row) => row.uniqueKey === 'gift-short-id-unresolved'),
  false,
  'gift with only unrelated sec_uid must not match short-id highlight config by nickname or unrelated identity',
);

const diagnostics = commentDiagnostics.snapshot();
assert.equal(
  diagnostics.highlightConfig.some(
    (item) =>
      item.userId === '83208545044' &&
      item.identityKind === 'short_id' &&
      item.status === 'partially_resolvable',
  ),
  true,
  `short-id config diagnostics must explain partial resolvability, got ${JSON.stringify(diagnostics.highlightConfig)}`,
);
assert.equal(
  diagnostics.highlightMisses.some(
    (item) =>
      item.category === 'gift' &&
      item.uniqueKey === 'gift-short-id-unresolved' &&
      item.reason === 'short_id_not_resolved_to_event_identity',
  ),
  true,
  `diagnostics must explain short-id misses when event only has sec_uid, got ${JSON.stringify(diagnostics.highlightMisses)}`,
);
assert.equal(
  diagnostics.highlightMatches.some(
    (item) =>
      item.uniqueKey === 'gift-display-id-payload' &&
      ['payload.displayId', 'payload.shortId', 'payload.uniqueId'].includes(item.matchedBy) &&
      item.matchedValue === '83208545044',
  ),
  true,
  `diagnostics must record short-id payload match source, got ${JSON.stringify(diagnostics.highlightMatches)}`,
);

db.close();
console.log('highlight short-id diagnostics regression checks passed');
