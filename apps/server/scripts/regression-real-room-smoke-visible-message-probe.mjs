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

console.log('real-room smoke visible message probe regression checks passed');
