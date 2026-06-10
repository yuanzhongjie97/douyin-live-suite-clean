import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const scripts = readdirSync(scriptDir)
  .filter((name) => /^regression-.+\.mjs$/u.test(name))
  .sort();

for (const script of scripts) {
  const scriptPath = join(scriptDir, script);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`web regression suite passed (${scripts.length} scripts)`);
