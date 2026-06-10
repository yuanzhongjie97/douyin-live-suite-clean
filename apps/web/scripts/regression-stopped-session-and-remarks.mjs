import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function selectDashboardSessionId({ activeSessionId, lastSessionId, statsSessionId }) {
  return activeSessionId ?? lastSessionId ?? statsSessionId;
}

function getPreferredUserDisplayName(item, highlightUser) {
  const originalName = String(item.userName ?? '').trim() || '匿名用户';
  return originalName;
}

function buildSearchText(item, highlightUser) {
  return [item.userName, item.message, item.giftName, highlightUser?.remark]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesKeywords(item, keywords, mode, highlightUser) {
  const searchText = buildSearchText(item, highlightUser);
  if (mode === 'all') {
    return keywords.every((keyword) => searchText.includes(keyword));
  }
  return keywords.some((keyword) => searchText.includes(keyword));
}

assert.equal(
  selectDashboardSessionId({
    activeSessionId: 'session-live',
    lastSessionId: 'session-stopped',
    statsSessionId: 'session-stats',
  }),
  'session-live',
  'active session should win over retained and stats sessions',
);

assert.equal(
  selectDashboardSessionId({
    activeSessionId: undefined,
    lastSessionId: 'session-stopped',
    statsSessionId: undefined,
  }),
  'session-stopped',
  'retained stopped session should remain selected when active session clears',
);

const matchedGift = {
  category: 'gift',
  userName: '原昵称',
  message: '原昵称 -> 小心心 x1',
  giftName: '小心心',
};
const highlightUser = {
  userId: 'sec_target',
  remark: '备注名',
};

assert.equal(
  getPreferredUserDisplayName(matchedGift, highlightUser),
  '原昵称',
  'matched display name should keep original nickname and leave remark in the highlight marker',
);

assert.equal(
  getPreferredUserDisplayName(matchedGift),
  '原昵称',
  'display name without remark should stay original nickname',
);

assert.equal(
  matchesKeywords(matchedGift, ['备注名'], 'any', highlightUser),
  true,
  'matched highlight remark should participate in frontend keyword search',
);

assert.equal(
  matchesKeywords(matchedGift, ['备注名'], 'any', undefined),
  false,
  'unmatched rows should not be found by unrelated remark text',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');

assert.match(appSource, /version:\s*'V26\.5\.29\.14'/u, 'V26.5.29.14 version log should be the top App.tsx version');
assert.match(appSource, /date:\s*'2026-06-03'/u, 'V26.5.29.14 version log should use the package date');
assert.match(
  appSource,
  /const\s+sessionId\s*=\s*activeSessionId\s*\?\?\s*lastSessionId\s*\?\?\s*stats\.sessionId/u,
  'dashboard session selection should retain stopped session before falling back to stats session',
);
assert.match(
  appSource,
  /api\.getHighlightUsers\(\s*sessionId\s*,\s*\{\s*includeMatched:\s*Boolean\(sessionId\)/su,
  'highlight history should load for the retained dashboard session',
);
assert.doesNotMatch(
  appSource,
  /api\.getHighlightUsers\(\s*activeSessionId\s*,\s*\{\s*includeMatched:\s*Boolean\(activeSessionId\)/u,
  'highlight history must not be tied only to activeSessionId',
);
assert.match(
  appSource,
  /function\s+buildSearchText\(\s*item:\s*LiveEvent,\s*highlightUser\?:\s*HighlightUserConfig\s*\)/u,
  'search text should accept the matched highlight user',
);
assert.match(
  appSource,
  /matchesKeywords\(\s*item,\s*keywords,\s*matchMode,\s*highlightUser\s*\)/u,
  'event rows should search with matched highlight remark only',
);
assert.doesNotMatch(
  appSource,
  /return\s+`\$\{remark\}\s*\/\s*\$\{originalName\}`/u,
  'matched highlight remark must not be merged into the displayed user label',
);

console.log('web stopped session and remarks regression checks passed');
