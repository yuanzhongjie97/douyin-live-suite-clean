const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const desktopPackageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, 'package.json'), 'utf8'));
const markerPath = path.join(desktopRoot, '.cache', 'native-rebuild.json');
const nativeBinaryPath = path.join(workspaceRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const force = process.argv.includes('--force') || process.env.FORCE_NATIVE_REBUILD === '1';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function getExpectedMarker() {
  const betterSqlitePackage = readJson(path.join(workspaceRoot, 'node_modules', 'better-sqlite3', 'package.json'));
  return {
    electron: String(desktopPackageJson.devDependencies?.electron ?? ''),
    betterSqlite3: String(betterSqlitePackage?.version ?? desktopPackageJson.dependencies?.['better-sqlite3'] ?? ''),
    platform: process.platform,
    arch: process.arch,
  };
}

function markerMatches(left, right) {
  return Boolean(
    left &&
      right &&
      left.electron === right.electron &&
      left.betterSqlite3 === right.betterSqlite3 &&
      left.platform === right.platform &&
      left.arch === right.arch,
  );
}

function getElectronBinaryPath() {
  try {
    const electronModulePath = require.resolve('electron', { paths: [desktopRoot] });
    return require(electronModulePath);
  } catch {
    return 'electron';
  }
}

function nativeBinaryLoadsInElectron() {
  if (!fs.existsSync(nativeBinaryPath)) {
    return false;
  }

  const checkScriptPath = path.join(desktopRoot, '.cache', 'check-better-sqlite3.cjs');
  fs.mkdirSync(path.dirname(checkScriptPath), { recursive: true });
  fs.writeFileSync(
    checkScriptPath,
    [
      `process.chdir(${JSON.stringify(workspaceRoot)});`,
      `const nativeBinaryPath = ${JSON.stringify(nativeBinaryPath)};`,
      "try {",
      "  const nativeAddon = require(nativeBinaryPath);",
      "  const Database = require('better-sqlite3');",
      "  const db = new Database(':memory:');",
      "  db.exec('select 1;');",
      "  db.close();",
      "  console.log(`better-sqlite3 ok for modules ${process.versions.modules}`);",
      "  process.exit(0);",
      "} catch (error) {",
      "  console.error(error && error.stack ? error.stack : String(error));",
      "  process.exit(1);",
      "}",
      '',
    ].join('\n'),
    'utf8',
  );

  const result = spawnSync(getElectronBinaryPath(), [checkScriptPath], {
    cwd: workspaceRoot,
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
  return result.status === 0;
}

function main() {
  const expected = getExpectedMarker();
  const current = readJson(markerPath);
  if (!force && markerMatches(current, expected) && nativeBinaryLoadsInElectron()) {
    console.log('better-sqlite3 native rebuild skipped: cache is current');
    return;
  }

  const result = spawnSync(
    'npx',
    [
      'node-gyp',
      'rebuild',
      '--release',
      '--runtime=electron',
      `--target=${expected.electron.replace(/^[^\d]*/u, '')}`,
      '--dist-url',
      'https://electronjs.org/headers',
    ],
    {
      cwd: path.join(workspaceRoot, 'node_modules', 'better-sqlite3'),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    },
  );

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  if (!nativeBinaryLoadsInElectron()) {
    console.error('better-sqlite3 native rebuild finished, but Electron cannot load the rebuilt module.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ ...expected, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

main();
