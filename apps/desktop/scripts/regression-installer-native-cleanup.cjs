const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const installerScriptPath = resolve(__dirname, '..', 'build', 'installer.nsh');
const source = readFileSync(installerScriptPath, 'utf8');

assert.match(
  source,
  /!macro\s+cleanPackagedNativeResidue/u,
  'installer should declare a native residue cleanup macro',
);
assert.match(
  source,
  /RMDir\s+\/r\s+"\$INSTDIR\\resources\\app\.asar\.unpacked\\node_modules\\better-sqlite3"/u,
  'installer should remove stale packaged better-sqlite3 native modules before reinstalling',
);
assert.match(
  source,
  /!macro\s+customCheckAppRunning[\s\S]*!insertmacro\s+cleanPackagedNativeResidue[\s\S]*!macroend/u,
  'native residue cleanup should run before application files are installed',
);
assert.doesNotMatch(
  source,
  /!macro\s+customInstall[\s\S]*RMDir\s+\/r\s+"\$INSTDIR\\resources\\app\.asar\.unpacked\\node_modules\\better-sqlite3"[\s\S]*!macroend/u,
  'native residue cleanup must not run after installation, or it would delete the newly installed module',
);

console.log('installer native cleanup regression checks passed');
