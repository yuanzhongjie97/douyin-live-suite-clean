import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dbSource = readFileSync(resolve(scriptDir, '../src/db.ts'), 'utf8');
const exportMethod = dbSource.match(/getExportEventsForSession\(sessionId: string\): LiveEvent\[\] \{([\s\S]*?)\n  \}/u)?.[1] ?? '';

assert.ok(exportMethod, 'getExportEventsForSession should exist');
assert.doesNotMatch(
  dbSource,
  /const\s+EXPORT_EVENT_LIMIT\s*=/u,
  'Excel export must not use a fixed EXPORT_EVENT_LIMIT that can omit old comments',
);
assert.doesNotMatch(
  exportMethod,
  /\bLIMIT\b/u,
  'Excel export query must return all persisted session events instead of truncating with LIMIT',
);
assert.match(
  exportMethod,
  /ORDER BY created_at ASC, id ASC/u,
  'Excel export query should keep stable ascending event order',
);

console.log('export all comments regression checks passed');
