import assert from 'node:assert/strict';

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

function normalizeMysteryComparable(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\//iu, '');
}

function isMysteryIdentityForStats(value) {
  const normalized = normalizeMysteryComparable(value);
  return Boolean(normalized && (normalized.includes('神秘人') || normalized.includes('神秘王者')));
}

function normalizeDuplicateValue(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFKC').toLowerCase();
}

function getGiftIdentityScore(item) {
  const payload = readEventPayload(item);
  return (
    (normalizeDuplicateValue(item.userId) ? 4 : 0) +
    (normalizeDuplicateValue(item.userLink) ? 4 : 0) +
    (normalizeDuplicateValue(payload.userId) ? 2 : 0) +
    (normalizeDuplicateValue(payload.userLink) ? 2 : 0)
  );
}

function getMysteryIdentityCompleteness(item) {
  const payload = readEventPayload(item);
  return [
    item.userName,
    item.userId,
    item.userLink,
    payload.userName,
    payload.userId,
    payload.userLink,
  ].filter((value) => isMysteryIdentityForStats(value, item.category)).length;
}

function hasMysteryIdentityForStats(item) {
  return getMysteryIdentityCompleteness(item) > 0;
}

function shouldReplaceDisplayItem(existing, candidate) {
  if (existing.uniqueKey !== candidate.uniqueKey) {
    return false;
  }
  if (existing.category !== 'gift' || candidate.category !== 'gift') {
    return false;
  }
  const candidateIsMystery = hasMysteryIdentityForStats(candidate);
  const existingIsMystery = hasMysteryIdentityForStats(existing);
  if (candidateIsMystery && !existingIsMystery) {
    return true;
  }

  const candidateIdentityScore = getGiftIdentityScore(candidate);
  const existingIdentityScore = getGiftIdentityScore(existing);
  if (candidateIdentityScore > existingIdentityScore) {
    return true;
  }

  return (
    candidateIdentityScore === existingIdentityScore &&
    candidateIsMystery &&
    existingIsMystery &&
    getMysteryIdentityCompleteness(candidate) > getMysteryIdentityCompleteness(existing)
  );
}

const existing = {
  uniqueKey: 'same-key',
  sessionId: 'session-regression',
  category: 'gift',
  createdAt: '2026-05-28T13:00:00.000Z',
  userName: '普通用户',
  message: '普通用户 -> 小心心 x1',
  giftName: '小心心',
  giftCount: 1,
  payloadJson: JSON.stringify({
    category: 'gift',
    userName: '普通用户',
    giftName: '小心心',
    giftCount: 1,
  }),
};

const payloadMysteryCandidate = {
  ...existing,
  userName: undefined,
  payloadJson: JSON.stringify({
    category: 'gift',
    userName: '神秘人三阶',
    giftName: '小心心',
    giftCount: 1,
  }),
};

assert.equal(hasMysteryIdentityForStats(payloadMysteryCandidate), true, 'payload-only mystery identity should be detected');
assert.equal(shouldReplaceDisplayItem(existing, payloadMysteryCandidate), true, 'same-key gift should replace when candidate becomes mystery');

console.log('web mystery refresh regression checks passed');
