import assert from 'node:assert/strict';
import { CaptureService } from '../src/capture-service.ts';

const service = new CaptureService({
  markRunningSessionsInterrupted: () => undefined,
});

const baseRaw = {
  category: 'comment',
  giftName: undefined,
  giftCount: undefined,
};

function isDuplicate(raw, message = raw.text) {
  return service.isRecentCollectorDuplicate(
    raw,
    message,
    undefined,
    undefined,
    'comment',
  );
}

const firstSharedSource = {
  ...baseRaw,
  sourceId: 'shared-dom-node-or-batch',
  userName: '用户甲',
  userId: 'sec_user_a',
  userLink: 'https://www.douyin.com/user/sec_user_a',
  text: '第一条真实评论',
  rawText: '用户甲：第一条真实评论',
};
const secondSharedSource = {
  ...baseRaw,
  sourceId: 'shared-dom-node-or-batch',
  userName: '用户乙',
  userId: 'sec_user_b',
  userLink: 'https://www.douyin.com/user/sec_user_b',
  text: '第二条真实评论',
  rawText: '用户乙：第二条真实评论',
};

assert.equal(isDuplicate(firstSharedSource), false, 'first comment should enter');
assert.equal(
  isDuplicate(secondSharedSource),
  false,
  'same sourceId must not hide a different real comment',
);

const firstSameBody = {
  ...baseRaw,
  sourceId: undefined,
  userName: '用户丙',
  userId: 'sec_user_c',
  userLink: 'https://www.douyin.com/user/sec_user_c',
  text: '多少钱',
  rawText: '用户丙：多少钱',
};
const secondSameBody = {
  ...baseRaw,
  sourceId: undefined,
  userName: '用户丁',
  userId: 'sec_user_d',
  userLink: 'https://www.douyin.com/user/sec_user_d',
  text: '多少钱',
  rawText: '用户丁：多少钱',
};

assert.equal(isDuplicate(firstSameBody), false, 'first same-body comment should enter');
assert.equal(
  isDuplicate(secondSameBody),
  false,
  'different users saying the same comment text must not be dropped',
);

const immediateSameUserDuplicate = {
  ...baseRaw,
  sourceId: undefined,
  userName: '用户戊',
  userId: 'sec_user_e',
  userLink: 'https://www.douyin.com/user/sec_user_e',
  text: '重复噪音',
  rawText: '用户戊：重复噪音',
};

assert.equal(isDuplicate(immediateSameUserDuplicate), false, 'first duplicate-noise fixture should enter');
assert.equal(
  isDuplicate(immediateSameUserDuplicate),
  false,
  'same user and same text inside the short window must still be kept as a real repeated comment',
);

console.log('comment loss regression checks passed');
