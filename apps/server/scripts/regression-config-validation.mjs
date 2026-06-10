import assert from 'node:assert/strict';
import { parseServerConfig } from '../src/config.ts';

const baseEnv = {
  HOST: '127.0.0.1',
  PORT: '3100',
};

assert.equal(parseServerConfig(baseEnv).host, '127.0.0.1');
assert.equal(parseServerConfig(baseEnv).port, 3100);

assert.throws(
  () => parseServerConfig({ ...baseEnv, PORT: 'abc' }),
  /Invalid server configuration.*PORT/u,
  'non-numeric PORT must fail before listen',
);

assert.throws(
  () => parseServerConfig({ ...baseEnv, PORT: '70000' }),
  /Invalid server configuration.*PORT/u,
  'out-of-range PORT must fail before listen',
);

assert.throws(
  () => parseServerConfig({ ...baseEnv, HOST: '0.0.0.0' }),
  /Invalid server configuration.*HOST/u,
  'production config must not allow non-local HOST',
);

console.log('config validation regression passed');
