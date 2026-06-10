import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.doesNotMatch(
  appSource,
  /\buseEffectEvent\b/u,
  'App should not use React useEffectEvent because callbacks used by state updaters can trigger React error #440',
);

assert.match(
  appSource,
  /function useStableEvent<T extends \(\.\.\.args: any\[\]\) => any>\(callback: T\): T/u,
  'App should use a local stable callback helper that is safe for state updaters and timers',
);

assert.doesNotMatch(
  appSource,
  /\[[^\]]*runtime\.activeSession[^\]]*\]/u,
  'dashboard polling effect should not depend on runtime.activeSession object identity',
);

assert.match(
  appSource,
  /\}, \[browserState\.chromiumInstall\?\.status,\s*activeSessionId\]\);/u,
  'dashboard polling effect should depend on stable activeSessionId instead of the active session object',
);

console.log('renderer effect-event crash regression checks passed');
