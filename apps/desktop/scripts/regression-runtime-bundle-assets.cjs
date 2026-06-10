const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const scriptDir = __dirname;
const desktopRoot = resolve(scriptDir, '..');
const workspaceRoot = resolve(desktopRoot, '..', '..');
const bundleWebDist = resolve(desktopRoot, '.bundle', 'web', 'dist');
const bundleServerEntry = resolve(desktopRoot, '.bundle', 'server', 'dist', 'index.js');
const bundleIndexPath = resolve(bundleWebDist, 'index.html');
const appSourcePath = resolve(workspaceRoot, 'apps', 'web', 'src', 'App.tsx');

assert.ok(existsSync(bundleServerEntry), 'runtime bundle should include server dist entry');
assert.ok(existsSync(bundleIndexPath), 'runtime bundle should include web dist index.html');

const html = readFileSync(bundleIndexPath, 'utf8');
const appSource = readFileSync(appSourcePath, 'utf8');
const version = appSource.match(/version:\s*'([^']+)'/u)?.[1];

assert.match(version || '', /^V\d+\.\d+\.\d+\.\d+$/u, 'runtime bundle smoke should read the current release version');
assert.match(html, /<script[^>]+type="module"[^>]+src="\/assets\/[^"]+\.js"/u, 'index.html should reference a module JS asset');
assert.match(html, /<link[^>]+rel="stylesheet"[^>]+href="\/assets\/[^"]+\.css"/u, 'index.html should reference a CSS asset');

for (const assetPath of [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/gu)].map((match) => match[1])) {
  const fullPath = resolve(bundleWebDist, 'assets', assetPath);
  assert.ok(
    existsSync(fullPath),
    `runtime bundle index.html should only reference existing asset files: ${assetPath}`,
  );
}

const jsAsset = html.match(/src="\/assets\/([^"]+\.js)"/u)?.[1];
assert.ok(jsAsset, 'index.html should include a JS asset');

const jsSource = readFileSync(resolve(bundleWebDist, 'assets', jsAsset), 'utf8');
assert.ok(jsSource.includes(version), `runtime bundle JS asset should contain current version ${version}`);

console.log('desktop runtime bundle asset regression checks passed');
