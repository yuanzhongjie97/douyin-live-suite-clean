const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptDir = __dirname;
const scripts = readdirSync(scriptDir)
  .filter((name) => /^regression-.+\.cjs$/u.test(name))
  .filter((name) => name !== 'regression-packaged-native-abi.cjs')
  .sort();

for (const script of scripts) {
  const scriptPath = join(scriptDir, script);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`desktop regression suite passed (${scripts.length} scripts)`);
