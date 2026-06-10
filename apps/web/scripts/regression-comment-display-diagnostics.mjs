import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(
  appSource,
  /api\.getEvents\(\s*'comment'\s*,\s*targetSessionId\s*,\s*1000\s*\)/u,
  'SSE error/history backfill should request up to 1000 comments',
);

assert.match(
  appSource,
  /frontendDiagnosticsRef\s*=\s*useRef/u,
  'frontend diagnostics counters should be stored in a ref',
);
assert.match(
  appSource,
  /queueOverflow/u,
  'frontend diagnostics should count incoming queue overflow',
);
assert.match(
  appSource,
  /historyCommentBackfill/u,
  'frontend diagnostics should count comment history backfill rows',
);
assert.match(
  appSource,
  /sseCommentRows/u,
  'frontend diagnostics should count comment rows received from SSE',
);
assert.match(
  appSource,
  /displayDuplicate/u,
  'frontend diagnostics should count display duplicate drops',
);
assert.match(
  appSource,
  /复制诊断/u,
  'toolbar should expose a copy diagnostics action',
);
assert.match(
  appSource,
  /navigator\.clipboard\.writeText/u,
  'copy diagnostics action should write JSON to clipboard',
);
assert.match(
  appSource,
  /recentComments/u,
  'copy diagnostics should include recent visible comment summaries',
);
assert.match(
  appSource,
  /recentSkippedComments/u,
  'copy diagnostics should include recent skipped comment samples',
);
assert.match(
  appSource,
  /matchedExisting/u,
  'skipped duplicate diagnostics should include the matched existing row',
);
assert.match(
  appSource,
  /duplicateWindowMs/u,
  'copy diagnostics should expose the duplicate window configuration',
);
assert.match(
  appSource,
  /incomingQueueLengths/u,
  'copy diagnostics should include incoming queue lengths',
);
assert.match(
  appSource,
  /displayLimits/u,
  'copy diagnostics should expose frontend display retention limits',
);
assert.match(
  appSource,
  /commentStatsMinusDisplay/u,
  'copy diagnostics should expose whether stats exceed the retained comment display rows',
);
assert.match(
  appSource,
  /lastSseCommentReceivedAt/u,
  'frontend diagnostics should expose when the latest comment reached SSE onmessage',
);
assert.match(
  appSource,
  /lastCommentDisplayFlushAt/u,
  'frontend diagnostics should expose when comments last flushed into display state',
);
assert.match(
  appSource,
  /maxCommentQueueLength/u,
  'frontend diagnostics should expose historical comment queue pressure',
);
assert.match(
  appSource,
  /commentRowsFlushed/u,
  'frontend diagnostics should expose how many comments were flushed to display batches',
);

assert.match(
  appSource,
  /if\s*\(\s*existing\.item\.category\s*===\s*'comment'\s*\)\s*\{\s*return false;\s*\}/u,
  'comment display diagnostics should not depend on rawText/body duplicate suppression because repeated real comments must be shown',
);

console.log('web comment display diagnostics regression checks passed');
