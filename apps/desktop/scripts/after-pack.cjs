const fs = require('node:fs');
const path = require('node:path');

function removeIfExists(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, { recursive: true, force: true });
}

exports.default = async function afterPack(context) {
  const unpackedBetterSqliteRoot = path.join(
    context.appOutDir,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
  );

  if (!fs.existsSync(unpackedBetterSqliteRoot)) {
    return;
  }

  const keepFiles = new Set([
    path.join(unpackedBetterSqliteRoot, 'package.json'),
    path.join(unpackedBetterSqliteRoot, 'build', 'Release', 'better_sqlite3.node'),
  ]);
  const keepDirectories = new Set([
    path.join(unpackedBetterSqliteRoot, 'lib'),
    path.join(unpackedBetterSqliteRoot, 'build'),
  ]);

  for (const entry of fs.readdirSync(unpackedBetterSqliteRoot)) {
    const absoluteEntryPath = path.join(unpackedBetterSqliteRoot, entry);
    if (entry === 'build') {
      const releaseDir = path.join(absoluteEntryPath, 'Release');
      if (!fs.existsSync(releaseDir)) {
        removeIfExists(absoluteEntryPath);
        continue;
      }

      for (const releaseEntry of fs.readdirSync(releaseDir)) {
        const absoluteReleaseEntryPath = path.join(releaseDir, releaseEntry);
        if (!keepFiles.has(absoluteReleaseEntryPath)) {
          removeIfExists(absoluteReleaseEntryPath);
        }
      }

      for (const buildEntry of fs.readdirSync(absoluteEntryPath)) {
        if (buildEntry !== 'Release') {
          removeIfExists(path.join(absoluteEntryPath, buildEntry));
        }
      }
      continue;
    }

    if (keepFiles.has(absoluteEntryPath) || keepDirectories.has(absoluteEntryPath)) {
      continue;
    }

    removeIfExists(absoluteEntryPath);
  }
};
