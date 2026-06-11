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

assert.match(
  smokeSource,
  /__douyinSmokeVisibleProbe/u,
  'real-room smoke must install an in-page visible comment probe so short-lived rows are not missed by coarse Node polling',
);

assert.match(
  smokeSource,
  /new\s+MutationObserver/u,
  'in-page visible comment probe must use MutationObserver to record row changes as they happen',
);

assert.match(
  smokeSource,
  /characterData:\s*true/u,
  'in-page visible comment probe must observe text node updates from recycled live-room DOM rows',
);

assert.match(
  smokeSource,
  /setInterval\(scan,\s*250\)/u,
  'in-page visible comment probe must also scan at 250ms as a fallback for missed mutations',
);

assert.match(
  smokeSource,
  /pageProbe/u,
  'real-room smoke result must report pageProbe counters separately from Node polling counters',
);

console.log('real-room smoke visible observer regression checks passed');
