import assert from 'node:assert/strict';

const { buildApp } = await import('../src/index.ts');
const security = await import('../src/security.ts');

assert.equal(typeof buildApp, 'function', 'server index should export buildApp for production API security regression');

const runtimeToken = 'production-security-token';
const { app, service } = await buildApp({ localApiToken: runtimeToken });

try {
  await app.ready();

  const blockedInvalidOrigin = await app.inject({
    method: 'GET',
    url: '/api/sessions/active',
    headers: {
      origin: 'https://evil.example',
      cookie: security.serializeLocalApiCookie(runtimeToken),
    },
  });
  assert.equal(blockedInvalidOrigin.statusCode, 403, 'production /api/* GET should reject invalid Origin even with a valid cookie');

  const blockedNullOrigin = await app.inject({
    method: 'GET',
    url: '/api/sessions/active',
    headers: {
      origin: 'null',
      cookie: security.serializeLocalApiCookie(runtimeToken),
    },
  });
  assert.equal(blockedNullOrigin.statusCode, 403, 'production /api/* GET should reject Origin null even with a valid cookie');

  const authorizedLocalOrigin = await app.inject({
    method: 'GET',
    url: '/api/sessions/active',
    headers: {
      origin: 'http://127.0.0.1:3100',
      cookie: security.serializeLocalApiCookie(runtimeToken),
    },
  });
  assert.equal(authorizedLocalOrigin.statusCode, 200, 'production /api/* GET should allow valid local Origin with cookie');
} finally {
  await service.shutdown().catch(() => undefined);
  await app.close();
}

console.log('production api security regression checks passed');
