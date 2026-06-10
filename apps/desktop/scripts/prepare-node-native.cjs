const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
const desktopRoot = path.resolve(__dirname, '..');
const markerPath = path.join(desktopRoot, '.cache', 'node-native-rebuild.json');
const nativeBinaryPath = path.join(workspaceRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const force = process.argv.includes('--force') || process.env.FORCE_NODE_NATIVE_REBUILD === '1';

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
    node: process.version,
    modules: process.versions.modules,
    betterSqlite3: String(betterSqlitePackage?.version ?? ''),
    platform: process.platform,
    arch: process.arch,
  };
}

function markerMatches(left, right) {
  return Boolean(
    left &&
      right &&
      left.node === right.node &&
      left.modules === right.modules &&
      left.betterSqlite3 === right.betterSqlite3 &&
      left.platform === right.platform &&
      left.arch === right.arch,
  );
}

function nativeBinaryLoadsInNode() {
  if (!fs.existsSync(nativeBinaryPath)) {
    return false;
  }

  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('select 1;');
    db.close();
    console.log(`better-sqlite3 ok for Node modules ${process.versions.modules}`);
    return true;
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    return false;
  }
}

function main() {
  const expected = getExpectedMarker();
  const current = readJson(markerPath);
  if (!force && markerMatches(current, expected) && nativeBinaryLoadsInNode()) {
    console.log('better-sqlite3 node native rebuild skipped: cache is current');
    return;
  }

  const result = spawnSync('npm', ['rebuild', 'better-sqlite3', '--build-from-source'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  if (!nativeBinaryLoadsInNode()) {
    console.error('better-sqlite3 node native rebuild finished, but Node cannot load the rebuilt module.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ ...expected, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

main();
