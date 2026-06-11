import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const smokeSource = readFileSync(resolve(scriptDir, 'smoke-real-room-message-integrity.mjs'), 'utf8');

assert.match(
  smokeSource,
  /const\s+visibleLeafSelectors\s*=\s*\[/u,
  'real-room smoke must define leaf-level visible comment selectors instead of scanning broad chat containers',
);

assert.match(
  smokeSource,
  /const\s+hasNestedVisibleLeaf\s*=/u,
  'real-room smoke must reject parent containers that contain nested visible message leaves',
);

assert.match(
  smokeSource,
  /const\s+colonCount\s*=\s*\(text\.match\([^)]*\[:：\][\s\S]*\)\s*\?\?\s*\[\]\)\.length/u,
  'real-room smoke must count colon-like separators to reject concatenated multi-comment container text',
);

assert.match(
  smokeSource,
  /colonCount\s*!==\s*1/u,
  'visible comment parser must require exactly one username/body separator',
);

assert.doesNotMatch(
  smokeSource,
  /'\[class\*="chat"\]'[\s\S]*?'\[class\*="Chat"\]'[\s\S]*?'\[class\*="message"\]'[\s\S]*?'li'/u,
  'visible observer must not scan broad chat/message containers because they create concatenated pseudo-comments',
);

console.log('real-room smoke visible observer regression checks passed');
