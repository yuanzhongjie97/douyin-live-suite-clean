import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_LIMITS = { comment: 200 };

function compareEvents(a, b) {
  const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return Number(a.id ?? 0) - Number(b.id ?? 0);
}

function normalizeDisplayItemsCurrent(items, category) {
  const uniqueItems = new Map();
  const recentItems = items.length > EVENT_LIMITS[category] * 3 ? items.slice(-EVENT_LIMITS[category] * 3) : items;
  for (const item of [...recentItems].sort(compareEvents)) {
    uniqueItems.set(item.uniqueKey, item);
  }

  return Array.from(uniqueItems.values())
    .sort(compareEvents)
    .slice(-EVENT_LIMITS[category]);
}

const baseTime = Date.parse('2026-06-11T12:00:00.000Z');
const newestFirstFromApi = Array.from({ length: 1000 }, (_, index) => {
  const id = 1000 - index;
  return {
    id,
    uniqueKey: `comment-${id}`,
    category: 'comment',
    createdAt: new Date(baseTime + id * 1000).toISOString(),
    message: `comment ${id}`,
  };
});

const currentResult = normalizeDisplayItemsCurrent(newestFirstFromApi, 'comment').map((item) => item.id);
assert.notDeepEqual(
  currentResult,
  Array.from({ length: 200 }, (_, index) => 801 + index),
  'test fixture must reproduce the old bug: slicing DESC API rows from the tail keeps older comments',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(
  appSource,
  /const\s+orderedItems\s*=\s*\[\.\.\.items\]\.sort\(compareEvents\)/u,
  'normalizeDisplayItems must sort all API/SSE rows before applying the display window',
);

assert.doesNotMatch(
  appSource,
  /const\s+recentItems\s*=\s*items\.length\s*>\s*EVENT_LIMITS\[category\]\s*\*\s*3\s*\?\s*items\.slice\(-EVENT_LIMITS\[category\]\s*\*\s*3\)\s*:\s*items/u,
  'normalizeDisplayItems must not slice the tail of DESC API rows before sorting; that drops the newest comments',
);

console.log('comment history DESC order regression checks passed');
