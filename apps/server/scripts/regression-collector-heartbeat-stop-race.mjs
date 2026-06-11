import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const collectorSource = readFileSync(resolve(scriptDir, '../src/collector.ts'), 'utf8');

assert.match(
  collectorSource,
  /isClosedTargetError\(error\)/u,
  'collector must classify page/context/browser closed errors separately from real fatal errors',
);

assert.match(
  collectorSource,
  /async\s+heartbeat\(\)\s*\{[\s\S]*?if\s*\(\s*this\.stopping\s*\|\|\s*!this\.running\s*\)/u,
  'heartbeat must return early while stopping or not running',
);

assert.match(
  collectorSource,
  /async\s+heartbeat\(\)\s*\{[\s\S]*?try\s*\{[\s\S]*?await\s+this\.installObserver\(\);[\s\S]*?\}\s*catch\s*\(error\)\s*\{[\s\S]*?isClosedTargetError\(error\)/u,
  'heartbeat must catch installObserver closed-target races instead of letting the process crash',
);

assert.match(
  collectorSource,
  /async\s+installObserver\(\)\s*\{[\s\S]*?catch\s*\(error\)\s*\{[\s\S]*?isClosedTargetError\(error\)/u,
  'installObserver must tolerate the page/context closing after the initial isClosed check',
);

console.log('collector heartbeat stop race regression checks passed');
