import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const appSource = readFileSync(resolve(webRoot, 'src', 'App.tsx'), 'utf8');
const apiSource = readFileSync(resolve(webRoot, 'src', 'api.ts'), 'utf8');

assert.match(
  apiSource,
  /getCaptureIntegrityDiagnostics\(\)/u,
  'web API should expose getCaptureIntegrityDiagnostics()',
);

assert.match(
  appSource,
  /persistedGifts/u,
  'copy diagnostics should include persisted gift rows from the server',
);

assert.match(
  appSource,
  /recentGifts/u,
  'copy diagnostics should include recent visible gift summaries',
);

assert.match(
  appSource,
  /highlightMatches/u,
  'copy diagnostics should include highlight match details',
);

assert.match(
  appSource,
  /captureIntegrity/u,
  'copy diagnostics should include server capture integrity ledger',
);

assert.match(
  appSource,
  /getHighlightMatchDetails/u,
  'frontend should expose deterministic highlight match details for diagnostics',
);

assert.match(
  appSource,
  /matchedBy/u,
  'highlight diagnostics should state which stable identity candidate matched',
);

assert.match(
  appSource,
  /category:\s*'gift'/u,
  'highlight match diagnostics should include gift matches',
);

console.log('copy diagnostics gift remark regression checks passed');
