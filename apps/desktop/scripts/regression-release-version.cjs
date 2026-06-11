const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const appSource = fs.readFileSync(path.join(workspaceRoot, 'apps', 'web', 'src', 'App.tsx'), 'utf8');
const mainSource = fs.readFileSync(path.join(workspaceRoot, 'apps', 'desktop', 'main.mjs'), 'utf8');
const finalizerSource = fs.readFileSync(path.join(workspaceRoot, 'apps', 'desktop', 'scripts', 'finalize-installer.cjs'), 'utf8');
const packagePaths = [
  'package.json',
  'apps/desktop/package.json',
  'apps/server/package.json',
  'apps/web/package.json',
];

const visibleVersion = appSource.match(/version:\s*'([^']+)'/u)?.[1];
const releaseTag = mainSource.match(/APP_RELEASE_TAG\s*=\s*'([^']+)'/u)?.[1];
const semverVersion = visibleVersion.replace(/^V/u, '').replace(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/u, '$1.$2.$3-$4');

assert.ok(visibleVersion, 'App.tsx must expose VERSION_LOGS[0].version');
assert.equal(releaseTag, visibleVersion, 'APP_RELEASE_TAG must match visible web version');
assert.match(visibleVersion, /^V\d{2}\.\d{1,2}\.\d{1,2}\.\d+$/u, 'version must follow VYY.M.D.N');
assert.equal(visibleVersion, 'V26.6.11.4', '2026-06-11 fourth package must be V26.6.11.4');
for (const packagePath of packagePaths) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(workspaceRoot, packagePath), 'utf8'));
  assert.equal(packageJson.version, semverVersion, `${packagePath} semver must match visible release version`);
}
assert.match(finalizerSource, /getAppVersionTag\(\)/u, 'installer finalizer must read visible version from App.tsx');
assert.match(finalizerSource, /\$\{productName\}-\$\{versionTag\}-安装包\.exe/u, 'installer filename must include visible version');

console.log('release version regression checks passed');
