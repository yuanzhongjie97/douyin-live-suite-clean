import assert from 'node:assert/strict';
import { buildUniqueKey } from '../src/utils.ts';

const baseComment = {
  sessionId: 'session-comment-key',
  category: 'comment',
  createdAt: '2026-06-03T10:00:00.000Z',
  roomId: 'room-1',
  roomTitle: 'test room',
  hostName: 'host',
  userName: 'repeat-user',
  userId: 'repeat-user-id',
  userLink: 'https://www.douyin.com/user/repeat-user-id',
  message: 'same message',
  giftName: undefined,
  giftCount: undefined,
};

const firstKey = buildUniqueKey({
  ...baseComment,
  payloadJson: JSON.stringify({
    category: 'comment',
    sourceId: 'source-a',
    rawText: 'repeat-user : same message',
    text: 'same message',
  }),
});
const secondKey = buildUniqueKey({
  ...baseComment,
  payloadJson: JSON.stringify({
    category: 'comment',
    sourceId: 'source-b',
    rawText: 'repeat-user : same message',
    text: 'same message',
  }),
});

assert.notEqual(
  firstKey,
  secondKey,
  'two same-user same-text comments with distinct source ids must not collide even when createdAt is the same millisecond',
);

const firstRescanKey = buildUniqueKey({
  ...baseComment,
  createdAt: '2026-06-03T10:00:00.000Z',
  payloadJson: JSON.stringify({
    category: 'comment',
    sourceId: 'source-a',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorSeq: 1,
  }),
});
const secondRescanKey = buildUniqueKey({
  ...baseComment,
  createdAt: '2026-06-03T10:00:03.000Z',
  payloadJson: JSON.stringify({
    category: 'comment',
    sourceId: 'source-a',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorSeq: 2,
  }),
});

assert.equal(
  firstRescanKey,
  secondRescanKey,
  'same source comment rescans must keep the same uniqueKey even when collector sequence and ingest time change',
);

const firstNoSourceKey = buildUniqueKey({
  ...baseComment,
  payloadJson: JSON.stringify({
    category: 'comment',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorSeq: 1,
  }),
});
const secondNoSourceKey = buildUniqueKey({
  ...baseComment,
  payloadJson: JSON.stringify({
    category: 'comment',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorSeq: 2,
  }),
});

assert.notEqual(
  firstNoSourceKey,
  secondNoSourceKey,
  'same-user same-text comments without source ids must be able to use payload sequence to avoid uniqueKey collisions',
);

const retryNoSourceKey = buildUniqueKey({
  ...baseComment,
  createdAt: '2026-06-03T10:00:04.000Z',
  payloadJson: JSON.stringify({
    category: 'comment',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorClientId: 'client-retry-1',
    collectorSeq: 99,
  }),
});
const retryNoSourceKeyAgain = buildUniqueKey({
  ...baseComment,
  createdAt: '2026-06-03T10:00:05.000Z',
  payloadJson: JSON.stringify({
    category: 'comment',
    rawText: 'repeat-user : same message',
    text: 'same message',
    collectorClientId: 'client-retry-1',
    collectorSeq: 100,
  }),
});

assert.equal(
  retryNoSourceKey,
  retryNoSourceKeyAgain,
  'collector retry id must make no-source comments idempotent across resend attempts',
);

console.log('comment unique key regression checks passed');
