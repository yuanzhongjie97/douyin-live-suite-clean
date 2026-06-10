const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const desktopRoot = path.resolve(__dirname, '..');
const appOutDir = path.join(desktopRoot, 'release', 'win-unpacked');
const resourcesDir = path.join(appOutDir, 'resources');
const betterSqliteRoot = path.join(
  resourcesDir,
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
);
const nativeBinaryPath = path.join(betterSqliteRoot, 'build', 'Release', 'better_sqlite3.node');
const electronVersion = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8')).devDependencies
  ?.electron;
const required = process.argv.includes('--required');

function findPackagedExecutable() {
  assert.ok(fs.existsSync(appOutDir), `packaged output should exist: ${appOutDir}`);
  const executables = fs.readdirSync(appOutDir).filter((entry) => entry.toLowerCase().endsWith('.exe'));
  const appExecutables = executables.filter((entry) => !/uninstall|elevate/u.test(entry));
  assert.equal(appExecutables.length, 1, `expected one packaged app executable, found: ${appExecutables.join(', ')}`);
  return path.join(appOutDir, appExecutables[0]);
}

function main() {
  if (!fs.existsSync(appOutDir) && !required) {
    console.log('packaged native ABI regression skipped: release/win-unpacked is not present after installer finalization');
    return;
  }

  assert.ok(fs.existsSync(nativeBinaryPath), `packaged better-sqlite3 native binary should exist: ${nativeBinaryPath}`);

  const checkScriptPath = path.join(desktopRoot, '.cache', 'check-packaged-native-abi.cjs');
  fs.mkdirSync(path.dirname(checkScriptPath), { recursive: true });
  fs.writeFileSync(
    checkScriptPath,
    [
      `const betterSqliteRoot = ${JSON.stringify(betterSqliteRoot)};`,
      `const nativeBinaryPath = ${JSON.stringify(nativeBinaryPath)};`,
      "try {",
      "  const nativeAddon = require(nativeBinaryPath);",
      "  const Database = require(betterSqliteRoot);",
      "  console.log(JSON.stringify({",
      "    ok: true,",
      "    electron: process.versions.electron,",
      "    modules: process.versions.modules,",
      "    nativeAddonType: typeof nativeAddon,",
      "    databaseType: typeof Database,",
      "  }));",
      "  process.exit(0);",
      "} catch (error) {",
      "  console.error(error && error.stack ? error.stack : String(error));",
      "  process.exit(1);",
      "}",
      '',
    ].join('\n'),
    'utf8',
  );

  const result = spawnSync(findPackagedExecutable(), [checkScriptPath], {
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    encoding: 'utf8',
    shell: false,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join('').trim();
  if (output) {
    console.log(output);
  }

  assert.equal(result.status, 0, 'packaged app executable should load packaged better-sqlite3 native module');
  const parsed = JSON.parse(String(result.stdout || '').trim());
  assert.equal(parsed.electron, String(electronVersion).replace(/^[^\d]*/u, ''), 'packaged Electron version should match package.json');
  assert.equal(parsed.modules, '143', 'Electron 40 packaged app should use NODE_MODULE_VERSION 143');
  assert.equal(parsed.nativeAddonType, 'object', 'packaged better-sqlite3 native addon should load directly');
  assert.equal(parsed.databaseType, 'function', 'better-sqlite3 export should be a constructor function');

  console.log('packaged native ABI regression checks passed');
}

main();
