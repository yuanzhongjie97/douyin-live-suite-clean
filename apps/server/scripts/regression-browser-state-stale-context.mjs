import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CaptureService } from '../src/capture-service.ts';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const captureServiceSource = readFileSync(resolve(scriptDir, '../src/capture-service.ts'), 'utf8');

assert.match(
  captureServiceSource,
  /private async resetLoginContext\(/u,
  'CaptureService should centralize cleanup for stale login browser contexts',
);

assert.match(
  captureServiceSource,
  /const existingContext = this\.loginContext;[\s\S]*await this\.resetLoginContext\(existingContext\);[\s\S]*const \{ chromium, ensureChromiumExecutablePath \} = await loadPlaywrightRuntime\(\);/u,
  'openLoginWindow should clear a stale existing context and then try a fresh browser launch',
);

const fakeDb = {
  markRunningSessionsInterrupted() {},
};

const service = new CaptureService(fakeDb);
let closeCount = 0;
const staleContext = {
  async cookies() {
    throw new Error('Target page, context or browser has been closed');
  },
  pages() {
    return [];
  },
  async close() {
    closeCount += 1;
  },
};

service.loginContext = staleContext;
service.loginPage = {
  isClosed() {
    return true;
  },
};
service.cachedLoginState = {
  loggedIn: true,
  profileDisplayName: '旧账号',
};

const state = await service.getBrowserState();

assert.equal(state.loginWindowOpen, false, 'stale browser context should be reported as closed');
assert.equal(state.loggedIn, false, 'stale browser context should clear cached login state');
assert.equal(state.profileDisplayName, undefined, 'stale browser context should not expose cached profile name');
assert.equal(state.chromiumInstall.status, 'idle', 'closed browser state should not force Playwright runtime loading');
assert.equal(closeCount, 1, 'stale context should be closed once during cleanup');

console.log('browser state stale context regression checks passed');
