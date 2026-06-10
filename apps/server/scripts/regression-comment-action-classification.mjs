import assert from 'node:assert/strict';
import { classifyText, parseMessage } from '../src/utils.ts';

assert.equal(
  classifyText('用户34525803：点赞很累 还伤腰'),
  'comment',
  'comment body containing 点赞 after a colon must stay comment',
);

assert.equal(
  classifyText('用户34525803 点赞很累 还伤腰'),
  'comment',
  'ordinary comment text beginning with 点赞 must stay comment',
);

assert.equal(classifyText('用户甲点赞'), 'interaction', 'compact like action should still be interaction');
assert.equal(classifyText('用户乙关注'), 'interaction', 'compact follow action should still be interaction');
assert.equal(classifyText('用户丙分享了直播间'), 'interaction', 'share live-room action should still be interaction');
assert.equal(classifyText('用户丁点亮了灯牌'), 'interaction', 'fan light action should still be interaction');

const parsed = parseMessage({
  category: 'comment',
  text: '用户34525803：点赞很累 还伤腰',
  rawText: '用户34525803：点赞很累 还伤腰',
});

assert.deepEqual(
  parsed,
  {
    userName: '用户34525803',
    message: '点赞很累 还伤腰',
    giftName: undefined,
    giftCount: undefined,
  },
  'comment parsing should preserve 点赞 as body text after username',
);

assert.equal(classifyText('\u7528\u6237\u620A\uFF1A\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86'), 'interaction', 'colon-style host like action should still be interaction');
assert.equal(classifyText('\u7528\u6237\u5DF1\uFF1A\u5173\u6CE8'), 'interaction', 'colon-style follow action should still be interaction');
assert.equal(classifyText('\u7528\u6237\u5E9A\u63A8\u8350\u4E86\u76F4\u64AD'), 'interaction', 'compact recommend-live action should be interaction');
assert.equal(classifyText('\u7528\u6237\u8F9B\uFF1A\u63A8\u8350\u4E86\u76F4\u64AD'), 'interaction', 'colon-style recommend-live action should be interaction');
assert.equal(classifyText('\u7528\u6237\u58EC\uFF1A\u8FD9\u4E2A\u63A8\u8350\u633A\u597D'), 'comment', 'ordinary comment containing recommend should stay comment');
assert.equal(classifyText('\u7528\u6237\u7678 \u63A8\u8350\u4E00\u4E0B\u76F4\u64AD\u5185\u5BB9'), 'comment', 'non-action recommend sentence should stay comment');
assert.equal(classifyText('\u606D\u559C \u89C2\u96E8\u0FD0 \u521A\u521A\u5347\u7EA7\u81F3Lv. 40'), 'comment', 'level-up congratulations should stay comment');
assert.equal(classifyText('\u606D\u559C \u7528\u62376277374797133 \u6210\u4E3ANo. 29 \u672C\u573A1000\u8D21\u732E\u7528\u6237'), 'comment', 'contribution congratulations should stay comment');

const parsedLikeAction = parseMessage({
  category: 'interaction',
  text: '\u7528\u6237\u620A\uFF1A\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86',
  rawText: '\u7528\u6237\u620A\uFF1A\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86',
  giftCount: 9,
});

assert.deepEqual(
  parsedLikeAction,
  {
    userName: '\u7528\u6237\u620A',
    message: '\u70B9\u8D5E x9',
    giftName: undefined,
    giftCount: 9,
  },
  'colon-style host like action should parse as interaction with like count',
);

const parsedRecommendAction = parseMessage({
  category: 'interaction',
  text: '\u7528\u6237\u8F9B\uFF1A\u63A8\u8350\u4E86\u76F4\u64AD',
  rawText: '\u7528\u6237\u8F9B\uFF1A\u63A8\u8350\u4E86\u76F4\u64AD',
});

assert.deepEqual(
  parsedRecommendAction,
  {
    userName: '\u7528\u6237\u8F9B',
    message: '\u63A8\u8350\u4E86\u76F4\u64AD',
    giftName: undefined,
    giftCount: undefined,
  },
  'recommend-live action should parse as interaction without losing action text',
);

console.log('comment action classification regression checks passed');
