const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const bundleRoot = path.join(desktopRoot, '.bundle');
const serverDistSource = path.join(workspaceRoot, 'apps', 'server', 'dist');
const webDistSource = path.join(workspaceRoot, 'apps', 'web', 'dist');
const markerPath = path.join(desktopRoot, '.cache', 'runtime-bundle.json');
const force = process.argv.includes('--force') || process.env.FORCE_RUNTIME_BUNDLE === '1';

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} does not exist: ${targetPath}`);
  }
}

function copyDirectoryContents(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    fs.cpSync(path.join(source, entry), path.join(destination, entry), {
      recursive: true,
      force: true,
    });
  }
}

function hashPath(targetPath, hash) {
  const stats = fs.statSync(targetPath);
  if (stats.isDirectory()) {
    const entries = fs.readdirSync(targetPath).sort();
    hash.update(`dir:${path.relative(workspaceRoot, targetPath)}\n`);
    for (const entry of entries) {
      hashPath(path.join(targetPath, entry), hash);
    }
    return;
  }

  hash.update(`file:${path.relative(workspaceRoot, targetPath)}:${stats.size}:${Math.trunc(stats.mtimeMs)}\n`);
  hash.update(fs.readFileSync(targetPath));
}

function getBundleFingerprint() {
  const hash = crypto.createHash('sha256');
  hashPath(serverDistSource, hash);
  hashPath(webDistSource, hash);
  return hash.digest('hex');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

function main() {
  ensureExists(serverDistSource, 'server dist');
  ensureExists(webDistSource, 'web dist');

  const fingerprint = getBundleFingerprint();
  const marker = readJson(markerPath);
  if (!force && marker?.fingerprint === fingerprint && fs.existsSync(path.join(bundleRoot, 'server', 'dist')) && fs.existsSync(path.join(bundleRoot, 'web', 'dist'))) {
    console.log('runtime bundle skipped: cache is current');
    return;
  }

  fs.rmSync(bundleRoot, { recursive: true, force: true });

  copyDirectoryContents(serverDistSource, path.join(bundleRoot, 'server', 'dist'));
  copyDirectoryContents(webDistSource, path.join(bundleRoot, 'web', 'dist'));

  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, JSON.stringify({ fingerprint, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
}

main();
