import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readEventPayload(item) {
  if (!item.payloadJson) {
    return {};
  }
  try {
    const payload = JSON.parse(item.payloadJson);
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function normalizeHighlightComparable(value) {
  return String(value ?? '').trim().normalize('NFKC').toLowerCase();
}

function extractProfileUserId(value) {
  const normalized = String(value ?? '').trim();
  const pathMatched = normalized.match(/douyin\.com\/(?:user|follow)\/([^/?#]+)/iu);
  if (pathMatched?.[1]) {
    return decodeURIComponent(pathMatched[1]);
  }
  const queryMatched = normalized.match(/[?&](?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId)=([^&#"'&\s]+)/iu);
  return queryMatched?.[1] ? decodeURIComponent(queryMatched[1]) : '';
}

function normalizeHighlightIdentityToken(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return normalizeHighlightComparable(extractProfileUserId(normalized) || normalized);
}

function compileHighlightUsers(users) {
  return users
    .map((user) => ({ ...user, normalizedUserId: normalizeHighlightIdentityToken(user.userId) }))
    .filter((user) => user.normalizedUserId);
}

function highlightPatternMatches(candidate, user) {
  return Boolean(candidate && user.normalizedUserId && candidate === user.normalizedUserId);
}

function getHighlightUserMatch(item, category, users) {
  if ((category !== 'comment' && category !== 'gift') || users.length === 0) {
    return undefined;
  }

  const payload = readEventPayload(item);
  const linkUserId = extractProfileUserId(item.userLink);
  const payloadLinkUserId = extractProfileUserId(payload.userLink);
  const candidates = [
    item.userId,
    item.userLink,
    linkUserId,
    payload.userId,
    payload.userLink,
    payloadLinkUserId,
  ]
    .map((value) => normalizeHighlightIdentityToken(value))
    .filter(Boolean);
  return users.find((user) => candidates.some((candidate) => highlightPatternMatches(candidate, user)));
}

const users = compileHighlightUsers([
  { userId: 'sec_payload_target_123456789', remark: '备注名' },
]);

const commentPayloadOnly = {
  uniqueKey: 'comment-payload-only',
  sessionId: 'session-regression',
  category: 'comment',
  createdAt: '2026-06-10T00:00:00.000Z',
  userName: '原昵称',
  message: '@XX 欢迎 来到直播间',
  payloadJson: JSON.stringify({
    rawText: '原昵称：@XX 欢迎 来到直播间',
    userLink: 'https://www.douyin.com/user/sec_payload_target_123456789',
  }),
};

const giftPayloadOnly = {
  uniqueKey: 'gift-payload-only',
  sessionId: 'session-regression',
  category: 'gift',
  createdAt: '2026-06-10T00:00:01.000Z',
  userName: '原昵称',
  message: '原昵称 -> 送你花花 x1',
  giftName: '送你花花',
  giftCount: 1,
  payloadJson: JSON.stringify({
    rawText: '原昵称 送 送你花花 x1',
    userId: 'sec_payload_target_123456789',
  }),
};

assert.equal(
  getHighlightUserMatch(commentPayloadOnly, 'comment', users)?.remark,
  '备注名',
  'comment rows must match highlight users from payload userLink',
);
assert.equal(
  getHighlightUserMatch(giftPayloadOnly, 'gift', users)?.remark,
  '备注名',
  'gift rows must match highlight users from payload userId',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
assert.match(
  appSource,
  /const\s+candidates\s*=\s*\[[\s\S]*payload\.userLink[\s\S]*payloadLinkUserId[\s\S]*\]/u,
  'frontend highlight matching should include payload userLink and payload link id candidates',
);

console.log('highlight payload identity regression checks passed');
