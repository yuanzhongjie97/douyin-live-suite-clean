import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const collectorSource = readFileSync(resolve(scriptDir, '../src/collector.ts'), 'utf8');

assert.match(
  collectorSource,
  /const\s+REACT_DATA_CACHE_TTL_MS\s*=\s*120/u,
  'React payload cache TTL must stay short because live pages can recycle chat rows between messages',
);

assert.match(
  collectorSource,
  /const\s+buildReactDataCacheFingerprint\s*=\s*\(itemRoot\)\s*=>/u,
  'collector must fingerprint a chat row before reusing cached React payload data',
);

assert.match(
  collectorSource,
  /const\s+cached\s*=\s*reactDataCache\.get\(itemRoot\)/u,
  'React payload cache must be keyed by the scoped chat item root, not an arbitrary child node',
);

assert.match(
  collectorSource,
  /cached\s*&&\s*cached\.fingerprint\s*===\s*cacheFingerprint\s*&&\s*Date\.now\(\)\s*-\s*cached\.at\s*<=\s*reactDataCacheTtlMs/u,
  'React payload cache must be reused only while the visible row fingerprint is unchanged and fresh',
);

assert.doesNotMatch(
  collectorSource,
  /const\s+cached\s*=\s*reactDataCache\.get\(element\);\s*if\s*\(cached\)\s*\{\s*return\s+cached;\s*\}/u,
  'collector must not permanently reuse stale React payload data for a DOM element because live pages recycle rows',
);

assert.match(
  collectorSource,
  /reactDataCache\.set\(itemRoot,\s*\{\s*fingerprint:\s*cacheFingerprint,\s*at:\s*Date\.now\(\),\s*result\s*\}\)/u,
  'React payload cache entries must store the fingerprint with the parsed result',
);

assert.match(
  collectorSource,
  /reactDataCacheTtlMs:\s*REACT_DATA_CACHE_TTL_MS/u,
  'React payload cache TTL must be passed into the browser page context explicitly',
);

console.log('react data cache refresh regression checks passed');
