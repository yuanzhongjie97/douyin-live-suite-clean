const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const packageJsonPath = path.join(desktopRoot, 'package.json');
const releaseRoot = path.join(desktopRoot, 'release');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const productName = packageJson?.build?.productName || packageJson?.name || 'app';

function getAppVersionTag() {
  const appSourcePath = path.join(workspaceRoot, 'apps', 'web', 'src', 'App.tsx');
  const appSource = fs.readFileSync(appSourcePath, 'utf8');
  const matched = appSource.match(/version:\s*'([^']+)'/u);
  return matched?.[1] || 'V0.0.0.0';
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} does not exist: ${targetPath}`);
  }
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function main() {
  ensureExists(releaseRoot, 'release directory');
  const originalExePath = path.join(releaseRoot, `${productName}.exe`);
  ensureExists(originalExePath, 'portable exe');

  const versionedExeName = `${productName}-${getAppVersionTag()}.exe`;
  const versionedExePath = path.join(releaseRoot, versionedExeName);
  removeIfExists(versionedExePath);
  fs.renameSync(originalExePath, versionedExePath);

  for (const entry of fs.readdirSync(releaseRoot)) {
    if (entry === versionedExeName) {
      continue;
    }
    removeIfExists(path.join(releaseRoot, entry));
  }
}

main();
