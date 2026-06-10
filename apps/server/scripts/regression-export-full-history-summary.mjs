import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildWorkbookBuffer } from '../src/exporter.ts';

const session = {
  id: 'export-summary-session',
  url: 'https://live.douyin.com/123456',
  status: 'stopped',
  roomId: '123456',
  roomTitle: 'Export summary regression',
  hostName: 'Host',
  startedAt: '2026-06-09T00:00:00.000Z',
  endedAt: '2026-06-09T01:00:00.000Z',
  lastHeartbeatAt: '2026-06-09T01:00:00.000Z',
};

const stats = {
  sessionId: session.id,
  comments: 53050,
  entries: 300,
  interactions: 200,
  gifts: 100,
  giftUnits: 260,
  logs: 12,
  uniqueUsers: 1800,
  topGifts: [{ name: '小心心', total: 200 }],
  activeUsers: [],
};

const retainedEvents = [
  {
    uniqueKey: 'comment-retained-1',
    sessionId: session.id,
    category: 'comment',
    createdAt: '2026-06-09T00:59:00.000Z',
    userName: '用户A',
    userId: 'uid-a',
    userLink: 'https://www.douyin.com/user/uid-a',
    message: '保留明细评论',
  },
];

const buffer = await buildWorkbookBuffer(session, stats, retainedEvents);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(buffer);

const summary = workbook.getWorksheet('全量统计汇总');
assert.ok(summary, 'workbook must include a full-history summary sheet');
assert.equal(summary.getCell('A1').value, '统计口径');
assert.equal(summary.getCell('B1').value, '尽量代表全量直播历史');

const detailNote = workbook.getWorksheet('当前保留明细说明');
assert.ok(detailNote, 'workbook must include a retained-detail scope note sheet');
assert.match(String(detailNote.getCell('A2').value), /明细.*当前保留/u);

const comments = workbook.getWorksheet('评论');
assert.ok(comments, 'workbook must still include retained comment details');
assert.equal(comments.rowCount, 2, 'retained detail sheets should include only provided retained events plus header');

console.log('export full history summary regression passed');
