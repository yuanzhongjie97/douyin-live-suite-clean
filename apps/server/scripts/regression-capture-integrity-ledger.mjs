import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, '..');

const diagnosticsSource = readFileSync(resolve(serverRoot, 'src', 'comment-diagnostics.ts'), 'utf8');
const captureSource = readFileSync(resolve(serverRoot, 'src', 'capture-service.ts'), 'utf8');
const indexSource = readFileSync(resolve(serverRoot, 'src', 'index.ts'), 'utf8');

for (const counter of [
  'ledger.comment.raw_received',
  'ledger.comment.filtered',
  'ledger.comment.deduped',
  'ledger.comment.db_inserted',
  'ledger.comment.db_ignored_unique',
  'ledger.comment.bus_published',
  'ledger.gift.raw_received',
  'ledger.gift.db_inserted',
  'ledger.gift.identity_update_published',
  'ledger.highlight.gift_matched',
]) {
  assert.match(
    captureSource,
    new RegExp(counter.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
    `capture integrity ledger must increment ${counter}`,
  );
}

assert.match(
  diagnosticsSource,
  /type\s+IntegrityLedgerCategory\s*=\s*'comment'\s*\|\s*'gift'\s*\|\s*'highlight'/u,
  'diagnostics should expose typed ledger categories for comment/gift/highlight',
);

assert.match(
  diagnosticsSource,
  /ledger:\s*Record<string,\s*number>/u,
  'diagnostics snapshot should include a ledger counter map separate from legacy counters',
);

assert.match(
  diagnosticsSource,
  /recordHighlightMatch/u,
  'diagnostics should record which stable identity field matched a highlight user',
);

assert.match(
  captureSource,
  /recordHighlightMatch\([^)]*category:\s*'gift'/su,
  'gift highlight matches must be recorded with category=gift',
);

assert.match(
  captureSource,
  /giftIdentityUpdates[\s\S]*this\.bus\.publish\(\{\s*type:\s*'event'/u,
  'gift identity updates must be republished so frontend can recompute highlight remarks',
);

assert.match(
  indexSource,
  /\/api\/diagnostics\/capture-integrity/u,
  'server should expose a capture integrity diagnostics endpoint',
);

console.log('capture integrity ledger regression checks passed');
