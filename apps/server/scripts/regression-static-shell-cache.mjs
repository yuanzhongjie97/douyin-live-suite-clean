import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

const { registerWebStaticShell } = await import('../src/index.ts');

assert.equal(
  typeof registerWebStaticShell,
  'function',
  'server should expose the web static shell registration for behavior regression coverage',
);

const distDir = mkdtempSync(path.join(os.tmpdir(), 'douyin-static-shell-'));
const assetDir = path.join(distDir, 'assets');

try {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(assetDir, { recursive: true }));
  writeFileSync(
    path.join(distDir, 'index.html'),
    '<!doctype html><html><head><script type="module" src="/assets/index-test.js"></script></head><body><div id="root"></div></body></html>',
    'utf8',
  );
  writeFileSync(path.join(assetDir, 'index-test.js'), 'console.log("ok");\n', 'utf8');

  const app = Fastify({ logger: false });
  await registerWebStaticShell(app, distDir);
  app.get('/api/health', async () => ({ ok: true }));
  await app.ready();

  const rootResponse = await app.inject({ method: 'GET', url: '/' });
  assert.equal(rootResponse.statusCode, 200, 'root should serve index.html');
  assert.match(rootResponse.headers['content-type'] ?? '', /text\/html/u, 'root should be html');
  assert.match(
    rootResponse.headers['cache-control'] ?? '',
    /no-store/u,
    'index.html should be explicitly no-store to avoid stale Electron upgrade shells',
  );

  const spaResponse = await app.inject({ method: 'GET', url: '/rooms/current' });
  assert.equal(spaResponse.statusCode, 200, 'SPA route should fall back to index.html');
  assert.match(spaResponse.headers['content-type'] ?? '', /text\/html/u, 'SPA fallback should be html');
  assert.match(
    spaResponse.headers['cache-control'] ?? '',
    /no-store/u,
    'SPA fallback index.html should be explicitly no-store',
  );

  const apiResponse = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(apiResponse.statusCode, 200, 'API routes should not be swallowed by SPA fallback');
  assert.deepEqual(apiResponse.json(), { ok: true }, 'API route should return its JSON payload');

  const assetResponse = await app.inject({ method: 'GET', url: '/assets/index-test.js' });
  assert.equal(assetResponse.statusCode, 200, 'existing hashed asset should be served');
  assert.match(
    assetResponse.headers['content-type'] ?? '',
    /(?:application|text)\/javascript/u,
    'existing JS asset should be served as JavaScript',
  );
  assert.doesNotMatch(assetResponse.body, /<html/iu, 'existing JS asset must not be html');

  const missingAssetResponse = await app.inject({ method: 'GET', url: '/assets/missing-old-hash.js' });
  assert.equal(
    missingAssetResponse.statusCode,
    404,
    'missing hashed assets should 404 instead of returning index.html with text/html',
  );
  assert.doesNotMatch(
    missingAssetResponse.headers['content-type'] ?? '',
    /text\/html/u,
    'missing hashed asset should not be served as html',
  );

  await app.close();
} finally {
  rmSync(distDir, { recursive: true, force: true });
}

console.log('static shell cache regression checks passed');
