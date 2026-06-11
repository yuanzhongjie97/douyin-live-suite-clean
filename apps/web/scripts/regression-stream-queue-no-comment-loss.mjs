import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(
  appSource,
  /SESSION_EVENT_RETAIN_LIMIT\s*=\s*50000/u,
  'stream loss guard must keep the current per-session event boundary at 50000',
);

assert.match(
  appSource,
  /STREAM_QUEUE_LIMITS:[\s\S]*?comment:\s*SESSION_EVENT_RETAIN_LIMIT/u,
  'comment stream queue must be tied to the full current per-session event boundary',
);

assert.doesNotMatch(
  appSource,
  /if\s*\(\s*row\.category\s*===\s*'comment'\s*\)[\s\S]{0,260}?queue\.splice\(0,\s*overflow\)/u,
  'comment stream enqueue path must not trim queued comments before they are flushed to display',
);

assert.match(
  appSource,
  /WINDOW_MOVE_DEFERRED_STREAM_LIMIT\s*=\s*SESSION_EVENT_RETAIN_LIMIT/u,
  'window-move deferred stream rows must preserve the full current per-session event boundary',
);

assert.match(
  appSource,
  /WINDOW_MOVE_DEFERRED_MESSAGE_LIMIT\s*=\s*SESSION_EVENT_RETAIN_LIMIT/u,
  'window-move deferred SSE messages must preserve the full current per-session event boundary',
);

console.log('stream queue no comment loss regression checks passed');
