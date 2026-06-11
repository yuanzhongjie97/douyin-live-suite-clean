import assert from 'node:assert/strict';
import { normalizeCollectorPayloadBatch, normalizeCollectorPayloadItem } from '../src/collector-payload.ts';

assert.equal(normalizeCollectorPayloadBatch(undefined).length, 0);
assert.equal(normalizeCollectorPayloadItem(null), undefined);
assert.equal(normalizeCollectorPayloadItem({ text: '' }), undefined);

assert.deepEqual(
  normalizeCollectorPayloadItem({
    category: 'gift',
    text: ' 用户A 送出 小心心 ',
    sourceId: ' source-1 ',
    userName: ' 用户A ',
    userId: ' uid-a ',
    userLink: ' https://www.douyin.com/user/uid-a ',
    giftName: ' 小心心 ',
    giftCount: 3,
  }),
  {
    category: 'gift',
    text: '用户A 送出 小心心',
    rawText: '用户A 送出 小心心',
    sourceId: 'source-1',
    userName: '用户A',
    userId: 'uid-a',
    userLink: 'https://www.douyin.com/user/uid-a',
    giftName: '小心心',
    giftCount: 3,
  },
);

assert.equal(
  normalizeCollectorPayloadItem({ category: 'unknown', rawText: 'hello' })?.category,
  'comment',
  'unknown categories should fall back to comment',
);

assert.equal(
  normalizeCollectorPayloadItem({ category: 'gift', text: 'gift', giftCount: '3' })?.giftCount,
  undefined,
  'string giftCount should not cross the collector boundary as a number',
);

assert.equal(
  normalizeCollectorPayloadItem({ category: 'comment', text: 'hello', collectorClientId: ' client-1 ' })
    ?.collectorClientId,
  'client-1',
  'collector client id should cross the collector boundary for retry idempotency',
);

assert.equal(normalizeCollectorPayloadBatch([{ text: 'ok' }, { text: '' }, null]).length, 1);

console.log('collector payload schema regression passed');
