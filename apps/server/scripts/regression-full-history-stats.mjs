import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { AppDatabase } from '../src/db.ts';

const tmp = mkdtempSync(path.join(tmpdir(), 'douyin-full-history-'));
let db;

try {
  db = new AppDatabase(path.join(tmp, 'state.sqlite'));
  const sessionId = 'full-history-session';
  db.createSession({
    id: sessionId,
    url: 'https://live.douyin.com/123456',
    status: 'running',
    roomId: '123456',
    roomTitle: 'Full history regression',
    hostName: 'Host',
    startedAt: new Date('2026-06-09T00:00:00.000Z').toISOString(),
  });

  const totalComments = 53050;
  const rows = [];
  const startedAt = Date.parse('2026-06-09T00:00:00.000Z');
  for (let index = 0; index < totalComments; index += 1) {
    rows.push({
      uniqueKey: `comment-${index}`,
      sessionId,
      category: 'comment',
      createdAt: new Date(startedAt + index).toISOString(),
      roomId: '123456',
      roomTitle: 'Full history regression',
      hostName: 'Host',
      userName: `user-${index % 200}`,
      userId: `uid-${index % 200}`,
      userLink: `https://www.douyin.com/user/${index % 200}`,
      message: `comment ${index}`,
    });
  }

  const result = db.insertEvents(rows);
  assert.equal(result.inserted, totalComments);

  const retained = db.getExportEventsForSession(sessionId);
  assert.ok(retained.length < totalComments, 'raw events should be pruned by retention policy for this regression');

  const stats = db.getStats(sessionId);
  assert.equal(stats.comments, totalComments, 'stats.comments must represent full accepted event history');
  assert.equal(stats.uniqueUsers, 200, 'stats.uniqueUsers must survive raw event pruning');

  console.log('full history stats regression passed');
} finally {
  db?.close();
  rmSync(tmp, { recursive: true, force: true });
}
