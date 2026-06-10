import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(
  appSource,
  /const\s+SESSION_EVENT_REFRESH_COOLDOWN_MS\s*=\s*\d+/u,
  'frontend should define a cooldown for full comment history backfill',
);
assert.match(
  appSource,
  /lastEventRefreshSessionIdRef/u,
  'frontend should remember which session was last event-backfilled',
);
assert.match(
  appSource,
  /lastEventRefreshAtRef/u,
  'frontend should throttle repeated full event backfills for the same session',
);
assert.match(
  appSource,
  /queueRefresh\(nextActiveSessionId\s*\?\s*nextActiveSessionId\s*!==\s*previousSessionId\s*:\s*false\)/u,
  'session heartbeat messages must not trigger full 1000-comment backfill unless the active session changed',
);
assert.match(
  appSource,
  /shouldFetchEvents/u,
  'loadDashboard should gate event fetching separately from runtime and stats refresh',
);

console.log('comment history backfill regression checks passed');
