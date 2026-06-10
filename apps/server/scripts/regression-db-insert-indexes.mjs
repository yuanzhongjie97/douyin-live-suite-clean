import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dbSource = readFileSync(path.join(root, 'apps/server/src/db.ts'), 'utf8');
const captureServiceSource = readFileSync(path.join(root, 'apps/server/src/capture-service.ts'), 'utf8');

assert.match(
  dbSource,
  /insertedIndexes:\s*Set<number>/u,
  'db insert result must track exactly which row indexes inserted, not only unique keys',
);
assert.match(
  dbSource,
  /insertedIndexes\.add\(index\)/u,
  'db insert must add the current row index when sqlite reports an insert',
);
assert.match(
  captureServiceSource,
  /rows\.filter\(\(_row,\s*index\)\s*=>\s*insertResult\.insertedIndexes\.has\(index\)\)/u,
  'service must publish and count only row indexes actually inserted',
);
assert.doesNotMatch(
  captureServiceSource,
  /this\.updateLiveStats\(rows\)/u,
  'service live stats must not count rows ignored by INSERT OR IGNORE',
);
assert.match(
  captureServiceSource,
  /this\.updateLiveStats\(persistedRows\)[\s\S]*?for\s*\(\s*const\s+row\s+of\s+persistedRows\s*\)[\s\S]*?this\.bus\.publish\(\{\s*type:\s*'event',\s*payload:\s*row\s*\}\)/u,
  'service must publish only rows that sqlite actually inserted',
);

console.log('db insert index regression checks passed');
