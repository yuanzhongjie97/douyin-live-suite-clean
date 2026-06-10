import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_LIMITS = { gift: 120 };

function readEventPayload(item) {
  if (!item.payloadJson) {
    return {};
  }
  try {
    return JSON.parse(item.payloadJson);
  } catch {
    return {};
  }
}

function getEventOrderValue(item) {
  if (typeof item.id === 'number' && item.id > 0) {
    return item.id;
  }
  const ingestSeq = Number(readEventPayload(item).ingestSeq);
  return Number.isFinite(ingestSeq) && ingestSeq > 0 ? ingestSeq : 0;
}

function compareEventsLikeSource(a, b) {
  const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftKey = String(a.uniqueKey);
  const rightKey = String(b.uniqueKey);
  if (leftKey === rightKey) {
    return 0;
  }

  const leftId = typeof a.id === 'number' ? a.id : 0;
  const rightId = typeof b.id === 'number' ? b.id : 0;
  if (leftId > 0 && rightId > 0 && leftId !== rightId) {
    return leftId - rightId;
  }

  const orderDiff = getEventOrderValue(a) - getEventOrderValue(b);
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return leftKey.localeCompare(rightKey);
}

function normalizeDisplayItemsLikeCurrentSource(items, category) {
  const uniqueItems = new Map();
  const recentItems = items.length > EVENT_LIMITS[category] * 3 ? items.slice(-EVENT_LIMITS[category] * 3) : items;
  for (const item of [...recentItems].sort(compareEventsLikeSource)) {
    uniqueItems.set(item.uniqueKey, item);
  }

  return Array.from(uniqueItems.values())
    .sort(compareEventsLikeSource)
    .slice(-EVENT_LIMITS[category]);
}

const sameCreatedAt = '2026-06-09T12:00:00.000Z';
const rows = [
  {
    uniqueKey: 'gift-b',
    category: 'gift',
    createdAt: sameCreatedAt,
    message: 'second gift',
    payloadJson: JSON.stringify({ sourceId: 'source-b', ingestSeq: 2 }),
  },
  {
    uniqueKey: 'gift-a',
    category: 'gift',
    createdAt: sameCreatedAt,
    message: 'first gift with updated identity',
    payloadJson: JSON.stringify({ sourceId: 'source-a', ingestSeq: 1, userId: 'sec_user_a' }),
  },
];

assert.deepEqual(
  normalizeDisplayItemsLikeCurrentSource(rows, 'gift').map((item) => item.uniqueKey),
  ['gift-a', 'gift-b'],
  'gift rows with the same timestamp and no db id must keep collector ingest order instead of update arrival order',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(
  appSource,
  /function\s+getEventOrderValue\(\s*item:\s*LiveEvent\s*\):\s*number/u,
  'gift display ordering needs a stable fallback order helper for rows without sqlite ids',
);
assert.match(
  appSource,
  /payload\.ingestSeq/u,
  'frontend event ordering should read payload ingestSeq when sqlite id is not available',
);
assert.match(
  appSource,
  /mergeDisplayReplacement\(\s*existing,\s*row\s*\)/u,
  'gift identity updates should merge into the existing display row instead of replacing ordering fields',
);

console.log('web gift display order regression checks passed');
