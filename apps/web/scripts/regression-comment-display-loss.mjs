import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeDuplicateValue(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFKC').toLowerCase();
}

function hasSetOverlap(left, right) {
  for (const item of left) {
    if (right.has(item)) {
      return true;
    }
  }
  return false;
}

function getCommentDuplicateIdentitySet(item) {
  const payload = item.payloadJson ? JSON.parse(item.payloadJson) : {};
  const identities = new Set();
  for (const value of [item.userLink, item.userId, item.userName, payload.userLink, payload.userId, payload.userName]) {
    const normalized = normalizeDuplicateValue(value);
    if (normalized) {
      identities.add(normalized);
    }
  }
  return identities;
}

function getCommentDuplicateTextCandidates(item) {
  const payload = item.payloadJson ? JSON.parse(item.payloadJson) : {};
  return Array.from(
    new Set([item.message, payload.text, payload.rawText].map(normalizeDuplicateValue).filter(Boolean)),
  );
}

function getCommentDuplicateMeta(item) {
  return {
    item,
    texts: new Set(getCommentDuplicateTextCandidates(item)),
    identities: getCommentDuplicateIdentitySet(item),
    rawText: '',
    at: new Date(item.createdAt).getTime(),
  };
}

function isDuplicateCommentMetaWithinWindow(existing, candidate) {
  return false;
}

const first = {
  uniqueKey: 'comment-1',
  category: 'comment',
  createdAt: '2026-05-29T12:00:00.000Z',
  userName: '用户甲',
  userId: 'sec_user_a',
  userLink: 'https://www.douyin.com/user/sec_user_a',
  message: '多少钱',
  payloadJson: JSON.stringify({ rawText: '用户甲：多少钱' }),
};
const second = {
  ...first,
  uniqueKey: 'comment-2',
  createdAt: '2026-05-29T12:00:00.200Z',
  userName: '用户乙',
  userId: 'sec_user_b',
  userLink: 'https://www.douyin.com/user/sec_user_b',
  payloadJson: JSON.stringify({ rawText: '用户乙：多少钱' }),
};

assert.equal(
  isDuplicateCommentMetaWithinWindow(getCommentDuplicateMeta(first), getCommentDuplicateMeta(second)),
  false,
  'frontend display dedupe must keep different users with the same real comment text',
);

const sameUserRepeat = {
  ...first,
  uniqueKey: 'comment-3',
  createdAt: '2026-05-29T12:00:00.400Z',
};

assert.equal(
  isDuplicateCommentMetaWithinWindow(getCommentDuplicateMeta(first), getCommentDuplicateMeta(sameUserRepeat)),
  false,
  'frontend display dedupe must keep same-user same-text repeat comments inside 1.5s',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
const commentDisplayLimit = Number(appSource.match(/const\s+EVENT_LIMITS[\s\S]*?comment:\s*(\d+)/u)?.[1] ?? 0);
const commentBodyDedupeFunction =
  appSource.match(/function\s+isDuplicateCommentMetaWithinWindow\([^)]*\):\s*boolean\s*\{([\s\S]*?)\n\}/u)?.[1] ?? '';

assert.equal(
  commentDisplayLimit,
  200,
  `frontend comment display limit should retain only the latest 200 visible comments; got ${commentDisplayLimit}`,
);

assert.match(
  appSource,
  /if\s*\(\s*existing\.item\.category\s*===\s*'comment'\s*\)\s*\{\s*return false;\s*\}/u,
  'frontend comment display dedupe must not suppress by comment body or identity; uniqueKey replacement is handled separately',
);
assert.match(
  commentBodyDedupeFunction,
  /^\s*return false;\s*$/u,
  'isDuplicateCommentMetaWithinWindow itself must stay inert so future call sites cannot re-hide repeated real comments',
);

assert.doesNotMatch(
  appSource,
  /useEffect\(\(\)\s*=>\s*\{[\s\S]*?new EventSource\('\/api\/events\/stream'\)[\s\S]*?\},\s*\[clearedAt\]\s*\);/u,
  'SSE stream effect must not be recreated just because clearedAt changed',
);
assert.match(
  appSource,
  /stream\.onerror\s*=\s*\(\)\s*=>\s*\{[\s\S]*?loadDashboard\(\{\s*includeEvents:\s*true\s*\}\)/u,
  'SSE error fallback should pull events, not only runtime and stats',
);

console.log('web comment display loss regression checks passed');
