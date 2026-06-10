import assert from 'node:assert/strict';
import { CaptureService } from '../src/capture-service.ts';

function hasMysteryIdentity(row) {
  const payload = row.payloadJson ? JSON.parse(row.payloadJson) : {};
  return [row.userName, row.userId, row.userLink, payload.userName, payload.userId, payload.userLink]
    .some((value) => String(value ?? '').includes('神秘人') || String(value ?? '').includes('神秘王者'));
}

function giftEvent(overrides) {
  return {
    uniqueKey: overrides.uniqueKey ?? 'gift-key',
    sessionId: 'session-regression',
    category: 'gift',
    createdAt: overrides.createdAt ?? '2026-05-28T13:00:00.000Z',
    userName: overrides.userName,
    userId: overrides.userId,
    userLink: overrides.userLink,
    message: overrides.message ?? `${overrides.userName ?? '匿名用户'} -> 小心心 x1`,
    giftName: '小心心',
    giftCount: 1,
    payloadJson: JSON.stringify({
      category: 'gift',
      text: overrides.message ?? `${overrides.userName ?? '匿名用户'} -> 小心心 x1`,
      rawText: overrides.rawText ?? overrides.message ?? `${overrides.userName ?? '匿名用户'} 送出 小心心`,
      userName: overrides.payloadUserName ?? overrides.userName,
      userId: overrides.payloadUserId ?? overrides.userId,
      userLink: overrides.payloadUserLink ?? overrides.userLink,
      giftName: '小心心',
      giftCount: 1,
      sourceId: 'same-source',
    }),
  };
}

const mysteryPayloadOnlyTarget = giftEvent({
  userName: undefined,
  payloadUserName: '神秘人三阶',
  message: '神秘人三阶 -> 小心心 x1',
});
const ordinaryCandidate = giftEvent({
  userName: '普通用户',
  userId: 'sec_regular_user_123456',
  userLink: 'https://www.douyin.com/user/sec_regular_user_123456',
  payloadUserName: '普通用户',
  payloadUserId: 'sec_regular_user_123456',
  payloadUserLink: 'https://www.douyin.com/user/sec_regular_user_123456',
});

const service = new CaptureService({
  markRunningSessionsInterrupted: () => undefined,
});
const now = Date.now();
const updatedRows = [];
service.recentCollectorFingerprints.set('giftSource|same-source|1', now);
service.recentGiftFingerprints.set('source:giftSource|same-source|1', {
  at: now,
  quality: 2,
  event: mysteryPayloadOnlyTarget,
});

assert.equal(hasMysteryIdentity(mysteryPayloadOnlyTarget), true, 'fixture should start as mystery');
assert.equal(
  service.isRecentCollectorDuplicate(
    {
      category: 'gift',
      text: ordinaryCandidate.message,
      rawText: ordinaryCandidate.message,
      sourceId: 'same-source',
      userName: ordinaryCandidate.userName,
      userId: ordinaryCandidate.userId,
      userLink: ordinaryCandidate.userLink,
      giftName: ordinaryCandidate.giftName,
      giftCount: ordinaryCandidate.giftCount,
    },
    ordinaryCandidate.message,
    ordinaryCandidate.giftName,
    ordinaryCandidate.giftCount,
    'gift',
    ordinaryCandidate,
    updatedRows,
  ),
  true,
  'same gift source should be treated as duplicate and merged',
);
assert.equal(updatedRows.length, 1, 'duplicate merge should republish one updated row');
assert.equal(hasMysteryIdentity(mysteryPayloadOnlyTarget), true, 'ordinary later identity must not erase mystery identity');
assert.equal(JSON.parse(mysteryPayloadOnlyTarget.payloadJson).userName, '神秘人三阶', 'payload mystery userName should be preserved');

console.log('gift identity regression checks passed');
