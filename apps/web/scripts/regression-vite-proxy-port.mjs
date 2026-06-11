import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const viteSource = readFileSync(resolve(scriptDir, '../vite.config.ts'), 'utf8');

assert.match(
  viteSource,
  /const\s+apiPort\s*=\s*process\.env\.PORT\s*\|\|\s*'3100'/u,
  'Vite dev proxy should follow the active backend PORT when 3100 is occupied by another project',
);

assert.match(
  viteSource,
  /target:\s*`http:\/\/localhost:\$\{apiPort\}`/u,
  'Vite dev proxy target should use the resolved backend apiPort',
);

assert.doesNotMatch(
  viteSource,
  /target:\s*['"]http:\/\/localhost:3100['"]/u,
  'Vite dev proxy must not be hardcoded to localhost:3100',
);

console.log('vite proxy port regression checks passed');
