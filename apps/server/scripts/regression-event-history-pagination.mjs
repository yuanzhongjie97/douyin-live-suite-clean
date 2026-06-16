import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AppDatabase } from '../src/db.ts';

const tempRoot = mkdtempSync(join(tmpdir(), 'douyin-history-regression-'));
const db = new AppDatabase(join(tempRoot, 'history.db'));
const sessionId = 'history-pagination-session';
const baseTime = Date.parse('2026-06-16T12:00:00.000Z');

try {
  db.createSession({
    id: sessionId,
    url: 'https://live.douyin.com/962565925628',
    status: 'stopped',
    roomId: '962565925628',
    roomTitle: 'history room',
    hostName: 'host',
    startedAt: new Date(baseTime).toISOString(),
    endedAt: new Date(baseTime + 3600000).toISOString(),
    lastHeartbeatAt: new Date(baseTime + 3600000).toISOString(),
  });

  db.insertEvents([
    ...Array.from({ length: 205 }, (_, index) => {
      const id = index + 1;
      return {
        uniqueKey: `history-comment-${id}`,
        sessionId,
        category: 'comment',
        createdAt: new Date(baseTime + id * 1000).toISOString(),
        userName: `comment-user-${id}`,
        userId: `sec_comment_${id}`,
        userLink: `https://www.douyin.com/user/sec_comment_${id}`,
        message: id === 3 ? 'very old searchable comment' : `comment body ${id}`,
        payloadJson: JSON.stringify({ sourceId: `source-comment-${id}` }),
      };
    }),
    {
      uniqueKey: 'history-gift-1',
      sessionId,
      category: 'gift',
      createdAt: new Date(baseTime + 206000).toISOString(),
      userName: 'gift-user',
      userId: 'sec_gift_1',
      userLink: 'https://www.douyin.com/user/sec_gift_1',
      message: '送出 小心心',
      giftName: '小心心',
      giftCount: 1,
      payloadJson: JSON.stringify({ userId: 'sec_gift_1' }),
    },
  ]);

  const firstPage = db.getEventHistory({ sessionId, category: 'comment', limit: 200 });
  assert.equal(firstPage.items.length, 200, 'first history page should return the requested 200 comments');
  assert.equal(firstPage.items[0].message, 'comment body 205', 'history should browse newest comments first');
  assert.ok(firstPage.nextCursor, 'first page must expose nextCursor when older comments exist');

  const secondPage = db.getEventHistory({
    sessionId,
    category: 'comment',
    limit: 200,
    cursorCreatedAt: firstPage.nextCursor?.createdAt,
    cursorId: firstPage.nextCursor?.id,
  });
  assert.equal(secondPage.items.length, 5, 'second page should return comments older than the first 200');
  assert.equal(secondPage.items.at(-1)?.message, 'comment body 1', 'pagination must reach oldest retained comments');
  assert.equal(secondPage.nextCursor, undefined, 'last page should not expose nextCursor');

  const searched = db.getEventHistory({ sessionId, category: 'comment', limit: 20, q: 'searchable' });
  assert.deepEqual(
    searched.items.map((item) => item.message),
    ['very old searchable comment'],
    'history search must find old comments outside the realtime UI window',
  );

  const gifts = db.getEventHistory({ sessionId, category: 'gift', limit: 20, q: '小心心' });
  assert.equal(gifts.items.length, 1, 'history search must support gift name queries');
  assert.equal(gifts.items[0].giftName, '小心心', 'gift history rows must preserve giftName for remark checks');
} finally {
  db.close();
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log('event history pagination regression checks passed');
