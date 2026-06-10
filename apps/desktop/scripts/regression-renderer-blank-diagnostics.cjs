const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const workspaceRoot = resolve(__dirname, '..', '..', '..');
const mainSource = readFileSync(resolve(__dirname, '../main.mjs'), 'utf8');
const appSource = readFileSync(resolve(workspaceRoot, 'apps', 'web', 'src', 'App.tsx'), 'utf8');
const currentVersion = appSource.match(/version:\s*'([^']+)'/u)?.[1];

assert.match(currentVersion || '', /^V\d+\.\d+\.\d+\.\d+$/u, 'web source should expose a current visible version');

assert.match(
  mainSource,
  /webContents\.on\('console-message'[\s\S]*?writeLog\([\s\S]*?`\$\{label\} console-message/u,
  'main window should log renderer console messages for blank-page diagnosis',
);

assert.match(
  mainSource,
  /webContents\.on\('preload-error'[\s\S]*?writeLog\(`\$\{label\} preload-error/u,
  'main window should log preload errors for blank-page diagnosis',
);

assert.match(
  mainSource,
  /webContents\.on\('dom-ready'[\s\S]*?inspectRendererState\(window,\s*label,\s*'dom-ready'\)[\s\S]*?scheduleRendererInspections\(window,\s*label,\s*'dom-ready'\)/u,
  'main window should inspect DOM/root state when the renderer becomes ready',
);

assert.match(
  mainSource,
  /webContents\.on\('did-finish-load'[\s\S]*?scheduleRendererInspections\(window,\s*label,\s*'did-finish-load'\)/u,
  'main window should schedule delayed renderer inspections after load finishes',
);

assert.match(
  mainSource,
  /attachRendererDiagnostics\(mainWindow,\s*'main'\)/u,
  'main window should attach renderer diagnostics with the main label',
);

assert.match(
  mainSource,
  /import\s+\{[^}]*\bsession\b[^}]*\}\s+from\s+'electron'/u,
  'desktop startup should import Electron session so stale HTTP cache can be cleared',
);

assert.match(
  mainSource,
  /async function clearRendererHttpCache\(\)[\s\S]*session\.defaultSession\.clearCache\(\)/u,
  'desktop startup should clear Electron HTTP cache before loading the renderer',
);

assert.match(
  mainSource,
  /function withDesktopCacheBuster\(rawUrl\)[\s\S]*desktopBoot/u,
  'desktop startup should add a cache-busting query to the renderer shell URL',
);

assert.match(
  mainSource,
  /mainWindow\.loadURL\(withDesktopCacheBuster\(url\)\)/u,
  'main window should load the renderer through the cache-busting URL helper',
);

assert.match(
  mainSource,
  new RegExp(`const APP_RELEASE_TAG = '${currentVersion.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}'`, 'u'),
  'desktop startup should log the visible release tag for cross-machine install diagnosis',
);

assert.match(
  mainSource,
  /function writeStartupIdentity\(\)[\s\S]*app\.getVersion\(\)[\s\S]*process\.execPath[\s\S]*app\.getAppPath\(\)/u,
  'desktop startup should log app version, executable path, and app path',
);

assert.match(
  mainSource,
  /function attachRendererRequestDiagnostics\(\)[\s\S]*webRequest\.onCompleted[\s\S]*webRequest\.onErrorOccurred/u,
  'desktop startup should log renderer subresource request success and failure',
);

assert.match(
  mainSource,
  /function runRendererAssetSelfCheck\(baseUrl\)[\s\S]*fetch\([\s\S]*\/assets\//u,
  'desktop startup should self-check the local index and referenced assets before renderer load',
);

assert.match(
  mainSource,
  /function scheduleRendererInspections\(window,\s*label,\s*reason\)[\s\S]*500[\s\S]*2000[\s\S]*5000/u,
  'desktop startup should inspect the renderer after JS has had time to mount React',
);

console.log('desktop renderer blank diagnostics regression checks passed');
