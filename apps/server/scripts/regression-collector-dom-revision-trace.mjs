import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const collectorSource = readFileSync(resolve(scriptDir, '../src/collector.ts'), 'utf8');

assert.match(
  collectorSource,
  /domRevisionMap\s*=\s*new WeakMap/u,
  'collector must track per-DOM-row revisions so recycled live-room rows are not mistaken for unchanged duplicates',
);

assert.match(
  collectorSource,
  /collectorTraceId/u,
  'collector payloads must carry collectorTraceId for end-to-end comment loss diagnostics',
);

assert.match(
  collectorSource,
  /domRevision:\s*getDomRevision\(scopedElement\)/u,
  'collector payloads must include the current DOM revision for the scanned chat row',
);

assert.match(
  collectorSource,
  /markDomRevision\(mutation\.target/u,
  'mutation observer must mark changed chat rows before digesting them',
);

const elementFingerprintBody =
  collectorSource.match(/const\s+makeElementFingerprint\s*=\s*\(payload\)\s*=>\s*\[([\s\S]*?)\]\.join\('\|'\);/u)?.[1] ?? '';

assert.doesNotMatch(
  elementFingerprintBody,
  /collectorTraceId|collectorObservedAt|collectorSource|domRevision/u,
  'collector trace fields must not participate in business duplicate suppression',
);

console.log('collector DOM revision trace regression checks passed');
