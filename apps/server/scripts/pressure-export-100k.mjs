import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { AppDatabase } from '../src/db.ts';
import { buildWorkbookBuffer } from '../src/exporter.ts';

const EVENT_COUNTS = [10000, 50000, 100000];
const categories = ['comment', 'entry', 'interaction', 'gift', 'log'];

function mb(value) {
  return Number((value / 1024 / 1024).toFixed(1));
}

function nowMetrics() {
  const memory = process.memoryUsage();
  return {
    heapUsedMb: mb(memory.heapUsed),
    rssMb: mb(memory.rss),
  };
}

function buildEvent(sessionId, index) {
  const category = categories[index % categories.length];
  const userIndex = index % 5000;
  const createdAt = new Date(Date.parse('2026-06-09T09:00:00.000Z') + index * 10).toISOString();
  return {
    uniqueKey: `${sessionId}-event-${index}`,
    sessionId,
    category,
    createdAt,
    roomId: '1234567890',
    roomTitle: 'pressure room',
    hostName: 'pressure-host',
    userName: category === 'log' ? undefined : `用户${userIndex}`,
    userId: category === 'log' ? undefined : `MS4w-pressure-${String(userIndex).padStart(6, '0')}`,
    userLink: category === 'log' ? undefined : `https://www.douyin.com/user/MS4w-pressure-${String(userIndex).padStart(6, '0')}`,
    message: category === 'log' ? `采集日志 ${index}` : `压力测试事件 ${index}`,
    giftName: category === 'gift' ? `礼物${index % 20}` : undefined,
    giftCount: category === 'gift' ? (index % 5) + 1 : undefined,
    payloadJson:
      category === 'log'
        ? JSON.stringify({ level: 'info', message: `采集日志 ${index}` })
        : JSON.stringify({
            userName: `用户${userIndex}`,
            userId: `MS4w-pressure-${String(userIndex).padStart(6, '0')}`,
            userLink: `https://www.douyin.com/user/MS4w-pressure-${String(userIndex).padStart(6, '0')}`,
            text: `压力测试事件 ${index}`,
            sourceId: `source-${index}`,
          }),
  };
}

async function runCase(eventCount, root) {
  const sessionId = `pressure-${eventCount}-session`;
  const dbPath = path.join(root, `${sessionId}.sqlite`);
  const xlsxPath = path.join(root, `${sessionId}.xlsx`);
  const appDb = new AppDatabase(dbPath);
  appDb.createSession({
    id: sessionId,
    url: 'https://live.douyin.com/1234567890',
    status: 'stopped',
    roomId: '1234567890',
    roomTitle: `${eventCount} pressure room`,
    hostName: 'pressure-host',
    startedAt: '2026-06-09T09:00:00.000Z',
    endedAt: '2026-06-09T10:00:00.000Z',
    lastHeartbeatAt: '2026-06-09T10:00:00.000Z',
  });

  const baselineMemory = process.memoryUsage();
  const startedAt = performance.now();
  const insertStartedAt = performance.now();
  const batchSize = 1000;
  for (let start = 0; start < eventCount; start += batchSize) {
    const rows = [];
    for (let index = start; index < Math.min(start + batchSize, eventCount); index += 1) {
      rows.push(buildEvent(sessionId, index));
    }
    const result = appDb.insertEvents(rows);
    assert.equal(result.inserted, rows.length, 'pressure insert should not drop synthetic rows');
  }
  const insertMs = performance.now() - insertStartedAt;

  const statsStartedAt = performance.now();
  const stats = appDb.getStats(sessionId);
  const statsMs = performance.now() - statsStartedAt;
  const totalStats = stats.comments + stats.entries + stats.interactions + stats.gifts + stats.logs;
  assert.equal(totalStats, eventCount, 'stats should include full accepted pressure history');

  const readStartedAt = performance.now();
  const events = appDb.getExportEventsForSession(sessionId);
  const readMs = performance.now() - readStartedAt;
  assert.ok(events.length <= 50000, 'retained event details should stay bounded by retention policy');

  const exportStartedAt = performance.now();
  const session = appDb.getSessionById(sessionId);
  assert.ok(session, 'pressure session should exist');
  const buffer = await buildWorkbookBuffer(session, stats, events);
  const exportMs = performance.now() - exportStartedAt;
  assert.ok(buffer.length > 0, 'Excel export buffer should not be empty');
  writeFileSync(xlsxPath, buffer);
  const xlsxBytes = statSync(xlsxPath).size;
  assert.equal(xlsxBytes, buffer.length, 'written Excel file should match export buffer size');

  appDb.close();

  const finalMemory = process.memoryUsage();
  return {
    eventCount,
    retainedDetailRows: events.length,
    metrics: {
      insertMs: Math.round(insertMs),
      statsMs: Math.round(statsMs),
      exportReadMs: Math.round(readMs),
      exportBuildMs: Math.round(exportMs),
      totalMs: Math.round(performance.now() - startedAt),
      xlsxBytes,
      xlsxMb: mb(xlsxBytes),
      heapDeltaMb: mb(finalMemory.heapUsed - baselineMemory.heapUsed),
      rssDeltaMb: mb(finalMemory.rss - baselineMemory.rss),
      finalMemory: nowMetrics(),
    },
  };
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'douyin-live-pressure-'));
try {
  const results = [];
  for (const eventCount of EVENT_COUNTS) {
    results.push(await runCase(eventCount, tempRoot));
  }
  const result = {
    eventCounts: EVENT_COUNTS,
    currentSourceRetentionLimit: 50000,
    fullHistoryStatsEnabled: true,
    retainedBoundaryChanged: false,
    results,
    conclusion:
      'Stats represent full accepted history through aggregate tables. Excel details remain bounded to retained raw events and include a full-history summary sheet.',
  };

  console.log(`PRESSURE_RESULT_JSON=${JSON.stringify(result)}`);
} finally {
  if (process.env.PRESSURE_KEEP_ARTIFACT !== '1') {
    rmSync(tempRoot, { recursive: true, force: true });
  } else {
    console.log(`PRESSURE_ARTIFACT_DIR=${tempRoot}`);
  }
}
