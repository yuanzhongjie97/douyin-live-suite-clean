import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
const appSourceWithoutWriteWrapper = appSource.replace(
  /function writeLocalStorageItem\(\s*key:\s*string,\s*value:\s*string\s*\):\s*void\s*\{[\s\S]*?\n\}/u,
  '',
);

assert.match(
  appSource,
  /function readLocalStorageItem\(\s*key:\s*string\s*\):\s*string\s*\|\s*null\s*\{[\s\S]*?try\s*\{[\s\S]*?window\.localStorage\.getItem\(key\)[\s\S]*?\}\s*catch/u,
  'renderer startup should guard localStorage.getItem so storage failures cannot blank the page',
);

assert.doesNotMatch(
  appSource,
  /function readTheme\(\): ThemeId \{[\s\S]*?window\.localStorage\.getItem\(STORAGE_KEYS\.theme\)[\s\S]*?\}/u,
  'readTheme should not call localStorage.getItem directly during initial render',
);

assert.doesNotMatch(
  appSource,
  /function readMessageFontSize\(\): MessageFontSize \{[\s\S]*?window\.localStorage\.getItem\(STORAGE_KEYS\.messageFontSize\)[\s\S]*?\}/u,
  'readMessageFontSize should not call localStorage.getItem directly during initial render',
);

assert.match(
  appSource,
  /function writeLocalStorageItem\(\s*key:\s*string,\s*value:\s*string\s*\):\s*void\s*\{[\s\S]*?try\s*\{[\s\S]*?window\.localStorage\.setItem\(key,\s*value\)[\s\S]*?\}\s*catch/u,
  'renderer startup should guard localStorage.setItem so storage write failures cannot blank the page',
);

assert.doesNotMatch(
  appSourceWithoutWriteWrapper,
  /window\.localStorage\.setItem\(/u,
  'renderer code should use writeLocalStorageItem instead of direct localStorage.setItem',
);

console.log('renderer startup guard regression checks passed');
