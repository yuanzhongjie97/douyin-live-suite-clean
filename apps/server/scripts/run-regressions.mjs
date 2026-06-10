import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..', '..', '..');
const storageRoot = join(projectRoot, 'tmp', 'server-regression-storage');
const scripts = readdirSync(scriptDir)
  .filter((name) => /^regression-.+\.mjs$/u.test(name))
  .sort();

rmSync(storageRoot, { recursive: true, force: true });
mkdirSync(storageRoot, { recursive: true });

for (const script of scripts) {
  const scriptPath = join(scriptDir, script);
  const result = spawnSync(process.execPath, ['--import', 'tsx', scriptPath], {
    env: {
      ...process.env,
      DOUYIN_LIVE_SUITE_STORAGE_ROOT: storageRoot,
      DOUYIN_LIVE_SUITE_DB_PATH: join(storageRoot, `${script.replace(/[^a-z0-9.-]/giu, '_')}.db`),
    },
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`server regression suite passed (${scripts.length} scripts)`);
