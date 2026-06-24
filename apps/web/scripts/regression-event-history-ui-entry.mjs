import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
const apiSource = readFileSync(resolve(scriptDir, '../src/api.ts'), 'utf8');

assert.match(
  appSource,
  /const\s+EVENT_LIMITS:\s*Record<EventCategory,\s*number>\s*=\s*\{[\s\S]*comment:\s*200,[\s\S]*gift:\s*120,/u,
  'main realtime panels must keep comment 200 and gift 120 display windows',
);
assert.match(
  apiSource,
  /getEventHistory\(/u,
  'web API client must expose getEventHistory for full-history UI browsing',
);
assert.match(
  apiSource,
  /\/api\/events\/history\?/u,
  'getEventHistory must call the DB-backed history endpoint',
);
assert.match(
  appSource,
  /function\s+EventHistoryPanel/u,
  'App must include an EventHistoryPanel separate from realtime EventList',
);
assert.match(
  appSource,
  /历史查询/u,
  'UI must expose a visible history query entry point',
);
assert.match(
  appSource,
  /api\.getEventHistory/u,
  'history panel must load rows through api.getEventHistory instead of realtime arrays',
);
assert.match(
  appSource,
  /setHistoryRows\(\(current\)\s*=>\s*\[\.\.\.current,\s*\.\.\.response\.items\]\)/u,
  'history panel must append pages so users can inspect beyond the first page',
);
assert.match(
  appSource,
  /historyCategory\s*===\s*'comment'\s*\?\s*'评论'\s*:\s*'礼物'/u,
  'history panel must support both comment and gift categories',
);
assert.match(
  appSource,
  /historyRequestSeqRef\.current\s*!==\s*requestSeq/u,
  'history panel must ignore stale responses after category/search changes',
);

console.log('event history UI entry regression checks passed');
