import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const smokeSource = readFileSync(resolve(scriptDir, 'smoke-real-room-message-integrity.mjs'), 'utf8');

assert.match(
  smokeSource,
  /visibleMessageProbe/u,
  'real-room smoke must report all visible leaf message rows, not only colon-style comments',
);

assert.match(
  smokeSource,
  /unmatchedVisibleMessages/u,
  'real-room smoke must compare visible leaf messages against raw collector events and persisted rows',
);

assert.match(
  smokeSource,
  /parseVisibleMessageText/u,
  'real-room smoke must classify visible leaf rows as comment, gift, entry, interaction, or unknown',
);

assert.match(
  smokeSource,
  /recentUnknownVisibleMessages/u,
  'real-room smoke must retain unknown visible rows for manual triage when user reports message loss',
);

assert.match(
  smokeSource,
  /进入直播间\|来了[\s\S]*category = 'entry'[\s\S]*送出/u,
  'real-room smoke must classify entry messages before gift text so usernames like dy98y8xx5j are not treated as gifts',
);

assert.match(
  smokeSource,
  /\(\?:\^\|\\s\)\[x×\]\\s\*\\d\{1,5\}\(\?:\\s\|\$\)/u,
  'gift multiplier detection must require an isolated xN token instead of matching x5 inside a username',
);

console.log('real-room smoke visible message probe regression checks passed');
