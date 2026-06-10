const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const scriptPath = resolve(__dirname, 'finalize-installer.cjs');
const source = readFileSync(scriptPath, 'utf8');

assert.match(
  source,
  /const\s+VERSIONED_INSTALLER_KEEP_COUNT\s*=\s*2/u,
  'installer finalizer should declare that only the latest 2 versioned installers are retained',
);
assert.match(
  source,
  /compareVersionTags/u,
  'installer finalizer should sort versioned installers by parsed version, not by plain filename text',
);
assert.match(
  source,
  /pruneOldVersionedInstallers/u,
  'installer finalizer should prune old versioned installers after renaming the current package',
);
assert.match(
  source,
  /slice\(\s*VERSIONED_INSTALLER_KEEP_COUNT\s*\)/u,
  'installer finalizer should remove packages beyond the latest 2 retained versions',
);

console.log('installer retention regression checks passed');
