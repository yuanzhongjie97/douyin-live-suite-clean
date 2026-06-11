import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCommentDiagId, commentDiagnostics } from '../src/comment-diagnostics.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const indexSource = readFileSync(path.join(root, 'apps/server/src/index.ts'), 'utf8');
const dbSource = readFileSync(path.join(root, 'apps/server/src/db.ts'), 'utf8');
const captureServiceSource = readFileSync(path.join(root, 'apps/server/src/capture-service.ts'), 'utf8');
const collectorSource = readFileSync(path.join(root, 'apps/server/src/collector.ts'), 'utf8');

assert.match(indexSource, /\/api\/diagnostics\/comment-flow/, 'comment diagnostics snapshot route must exist');
assert.match(indexSource, /\/api\/diagnostics\/comment-flow\/reset/, 'comment diagnostics reset route must exist');
assert.doesNotMatch(indexSource, /sse\.queue_trimmed/, 'SSE must not trim queued events before sending them');
assert.match(indexSource, /sse\.write_false/, 'SSE write_false counter text must exist');
assert.match(indexSource, /sse\.comment_event_seen/, 'SSE diagnostics should expose comment-specific event count');
assert.match(indexSource, /sse\.comment_queue/, 'SSE diagnostics should expose comment-specific queue count');
assert.match(indexSource, /sse\.comment_flushed_events/, 'SSE diagnostics should expose comment-specific flush count');
assert.doesNotMatch(indexSource, /sse\.comment_queue_trimmed/, 'SSE must not trim queued comments before sending them');

const firstDiagId = buildCommentDiagId('session-a', {
  sourceId: 'source-1',
  rawText: 'Alice: hello',
  userName: 'Alice',
  userId: 'sec_alice',
});
const secondDiagId = buildCommentDiagId('session-a', {
  sourceId: 'source-1',
  rawText: 'Alice: hello',
  userName: 'Alice',
  userId: 'sec_alice',
});
assert.equal(firstDiagId, secondDiagId, 'diagId must be stable for identical comment input');
assert.equal(firstDiagId.length, 16, 'diagId should be a short 16 character id');

commentDiagnostics.reset();
commentDiagnostics.increment('diagnostics.test_counter');
commentDiagnostics.record({
  stage: 'service.onEvents',
  reason: 'test',
  diagId: firstDiagId,
  rawText: `${'x'.repeat(240)} end`,
});
const snapshot = commentDiagnostics.snapshot();
assert.equal(snapshot.counters['diagnostics.test_counter'], 1, 'counter increment should be visible in snapshot');
assert.equal(snapshot.recent.length, 1, 'decision ring buffer should expose recent decisions');
assert.ok(snapshot.recent[0].rawText?.endsWith('...'), 'long diagnostic text should be trimmed');
commentDiagnostics.reset();
assert.equal(commentDiagnostics.snapshot().recent.length, 0, 'reset should clear recent decisions');

assert.match(dbSource, /interface InsertEventsResult/, 'db insert result type must exist');
assert.match(dbSource, /attempted:\s*number/, 'db insert result should include attempted');
assert.match(dbSource, /inserted:\s*number/, 'db insert result should include inserted');
assert.match(dbSource, /ignored:\s*number/, 'db insert result should include ignored');
assert.match(dbSource, /insertedKeys:\s*Set<string>/, 'db insert result should include insertedKeys');
assert.match(dbSource, /result\.changes\s*>\s*0/, 'db insert should derive inserted count from sqlite changes');
assert.match(dbSource, /insertedKeys\.add\(row\.uniqueKey\)/, 'db insert should track inserted unique keys');

assert.match(captureServiceSource, /db\.comment_attempted/, 'service diagnostics should expose comment-specific DB attempted count');
assert.match(captureServiceSource, /db\.comment_inserted/, 'service diagnostics should expose comment-specific DB inserted count');
assert.match(captureServiceSource, /db\.comment_ignored_unique/, 'service diagnostics should expose comment-specific DB ignored count');

assert.match(collectorSource, /__douyinCollectorDiag/, 'collector page should expose diagnostic binding');
assert.match(collectorSource, /collector\.binding\.filtered_empty_text/, 'collector binding should count empty text filtering');
for (const reason of [
  'digest.empty_text',
  'digest.skip_text',
  'digest.classified_gift_return',
  'digest.comment_countdown_noise',
  'digest.too_many_colons_without_payload',
  'digest.outside_chat_no_colon',
  'digest.same_element_fingerprint',
  'push.exact_dedupe',
  'push.pending_coarse_replaced',
  'push.pending_coarse_dropped',
  'push.previous_coarse_dropped',
  'push.queued',
  'flush.batch_sent',
  'flush.batch_failed',
]) {
  assert.ok(collectorSource.includes(reason), `collector diagnostic reason ${reason} must exist`);
}

console.log('comment diagnostics regression checks passed');
