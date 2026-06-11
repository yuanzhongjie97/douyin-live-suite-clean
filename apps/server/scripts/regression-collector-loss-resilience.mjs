import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const collectorSource = readFileSync(resolve(scriptDir, '../src/collector.ts'), 'utf8');
const indexSource = readFileSync(resolve(scriptDir, '../src/index.ts'), 'utf8');

assert.match(
  collectorSource,
  /catch\s*\{[\s\S]*?pending\.unshift\(\.\.\.batch\)/u,
  'collector flush failures must requeue the unsent batch instead of discarding live messages',
);

assert.doesNotMatch(
  collectorSource,
  /catch\s*\{[\s\S]*?batch\.splice\(0,\s*batch\.length\)/u,
  'collector flush failure path must not empty the failed batch without retrying it',
);

assert.match(
  collectorSource,
  /characterData:\s*isChatSource/u,
  'chat MutationObserver must listen to text-node updates because live pages can reuse DOM rows',
);

assert.match(
  collectorSource,
  /mutation\.target\s+instanceof\s+Text[\s\S]*?walkNode\(mutation\.target\.parentElement,\s*source\)/u,
  'text-node mutations must be routed back through the digest pipeline',
);

const fastScanWindows = Array.from(
  collectorSource.matchAll(/const\s+recentRows\s*=\s*Array\.from\(root\.querySelectorAll\(chatItemSelector\)\)\.slice\(-(\d+)\)/gu),
).map((match) => Number(match[1] ?? 0));
const fastScanWindow = Math.max(0, ...fastScanWindows);
assert.ok(
  fastScanWindow >= 80,
  `fast chat rescan must inspect at least 80 visible rows for high-traffic rooms; got ${fastScanWindow}`,
);

const fastScanInterval = Number(
  collectorSource.match(/window\.setInterval\(\(\)\s*=>\s*\{[\s\S]*?chat-fast[\s\S]*?\},\s*(\d+)\)/u)?.[1] ?? 0,
);
assert.ok(
  fastScanInterval > 0 && fastScanInterval <= 300,
  `fast chat rescan interval must be <= 300ms for high-traffic rooms; got ${fastScanInterval}`,
);

assert.doesNotMatch(
  indexSource,
  /pendingEvents\.length\s*>\s*400[\s\S]*?pendingEvents\.splice\(0,\s*pendingEvents\.length\s*-\s*400\)/u,
  'server SSE stream must not trim queued live events before writing them to the client',
);

console.log('collector loss resilience regression checks passed');
