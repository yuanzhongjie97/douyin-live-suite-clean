const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const packageJsonPath = path.join(desktopRoot, 'package.json');
const releaseRoot = path.join(desktopRoot, 'release');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const productName = packageJson?.build?.productName || packageJson?.name || 'app';
const VERSIONED_INSTALLER_KEEP_COUNT = 2;

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function createVersionedInstallerPattern(appProductName) {
  const escapedProductName = escapeRegExp(appProductName);
  return new RegExp(`^${escapedProductName}-V\\d+\\.\\d+\\.\\d+\\.\\d+-安装包\\.exe(?:\\.blockmap)?$`, 'u');
}

function parseVersionedInstallerName(entry, appProductName) {
  const escapedProductName = escapeRegExp(appProductName);
  const matched = entry.match(
    new RegExp(`^${escapedProductName}-(V\\d+\\.\\d+\\.\\d+\\.\\d+)-安装包\\.exe(\\.blockmap)?$`, 'u'),
  );
  if (!matched) {
    return undefined;
  }
  return {
    fileName: entry,
    versionTag: matched[1],
    isBlockmap: Boolean(matched[2]),
  };
}

function compareVersionTags(left, right) {
  const leftParts = String(left).replace(/^V/u, '').split('.').map((part) => Number(part));
  const rightParts = String(right).replace(/^V/u, '').split('.').map((part) => Number(part));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function renameIfExists(fromPath, toPath, label) {
  if (!fs.existsSync(fromPath)) {
    return false;
  }
  if (fs.existsSync(toPath)) {
    throw new Error(`${label} already exists: ${toPath}`);
  }
  fs.renameSync(fromPath, toPath);
  return true;
}

function cleanReleaseDirectory(keepPattern) {
  for (const entry of fs.readdirSync(releaseRoot)) {
    if (keepPattern.test(entry)) {
      continue;
    }
    removeIfExists(path.join(releaseRoot, entry));
  }
}

function pruneOldVersionedInstallers(appProductName) {
  const versionEntries = fs
    .readdirSync(releaseRoot)
    .map((entry) => parseVersionedInstallerName(entry, appProductName))
    .filter(Boolean);
  const versionsToRemove = Array.from(new Set(versionEntries.map((entry) => entry.versionTag)))
    .sort(compareVersionTags)
    .reverse()
    .slice(VERSIONED_INSTALLER_KEEP_COUNT);
  const removeSet = new Set(versionsToRemove);

  for (const entry of versionEntries) {
    if (removeSet.has(entry.versionTag)) {
      removeIfExists(path.join(releaseRoot, entry.fileName));
    }
  }
}

function main() {
  ensureExists(releaseRoot, 'release directory');

  const versionTag = getAppVersionTag();
  const originalInstallerPath = path.join(releaseRoot, `${productName}.exe`);
  const versionedInstallerName = `${productName}-${versionTag}-安装包.exe`;
  const versionedInstallerPath = path.join(releaseRoot, versionedInstallerName);

  ensureExists(originalInstallerPath, 'installer exe');
  renameIfExists(originalInstallerPath, versionedInstallerPath, 'versioned installer');
  renameIfExists(
    `${originalInstallerPath}.blockmap`,
    path.join(releaseRoot, `${versionedInstallerName}.blockmap`),
    'versioned installer blockmap',
  );

  cleanReleaseDirectory(createVersionedInstallerPattern(productName));
  pruneOldVersionedInstallers(productName);
}

main();
