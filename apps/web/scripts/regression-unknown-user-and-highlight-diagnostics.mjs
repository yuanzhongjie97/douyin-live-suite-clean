import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
const typesSource = readFileSync(resolve(scriptDir, '../src/types.ts'), 'utf8');

assert.match(
  appSource,
  /function\s+isDirectProfileId/u,
  'frontend should have a direct profile-id detector before choosing display names',
);
assert.match(
  appSource,
  /return\s+'未知用户'/u,
  'comments without a real userName must display a neutral unknown-user label instead of raw profile IDs',
);
assert.doesNotMatch(
  appSource,
  /realName\s*\|\|\s*names\[0\]\s*\|\|\s*String\(item\.userId\s*\?\?\s*payload\.userId/u,
  'display-name fallback must not show MS4w/sec_uid as the username',
);
assert.match(
  appSource,
  /highlightConfig/u,
  'copy diagnostics must include highlight configuration diagnostics',
);
assert.match(
  appSource,
  /highlightMisses/u,
  'copy diagnostics must include highlight miss diagnostics for short-id mismatch analysis',
);
assert.match(
  typesSource,
  /identityKind\?:/u,
  'highlight user snapshot should expose identity kind to frontend diagnostics',
);

console.log('unknown user and highlight diagnostics regression checks passed');
