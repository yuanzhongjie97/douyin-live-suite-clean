import assert from 'node:assert/strict';
import { parseMessage } from '../src/utils.ts';

function parseGiftText(text) {
  return parseMessage({
    category: 'gift',
    text,
    rawText: text,
    userName: '',
  });
}

const compactGift = parseGiftText('用户A 送你花花 x1');
assert.equal(compactGift.userName, '用户A');
assert.equal(compactGift.giftName, '送你花花', 'gift name must keep the leading 送 when it is part of the gift name');
assert.equal(compactGift.message, '用户A -> 送你花花 x1');

const explicitActionGift = parseGiftText('用户A 送 玫瑰 x1');
assert.equal(explicitActionGift.userName, '用户A');
assert.equal(explicitActionGift.giftName, '玫瑰', 'standalone 送 action should still be removed');
assert.equal(explicitActionGift.message, '用户A -> 玫瑰 x1');

const anchorGift = parseGiftText('用户A 送给主播 送你花花 x1');
assert.equal(anchorGift.userName, '用户A');
assert.equal(anchorGift.giftName, '送你花花', 'gift name after 送给主播 should keep its leading 送');
assert.equal(anchorGift.message, '用户A -> 送你花花 x1');

console.log('gift name prefix regression checks passed');
