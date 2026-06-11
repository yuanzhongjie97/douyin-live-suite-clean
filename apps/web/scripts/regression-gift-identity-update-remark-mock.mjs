import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_LIMITS = { gift: 120 };

function readEventPayload(item) {
  if (!item.payloadJson) {
    return {};
  }
  try {
    const payload = JSON.parse(item.payloadJson);
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

function normalizeDuplicateValue(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').normalize('NFKC').toLowerCase();
}

function getEventTimeMs(item) {
  const time = new Date(item.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getEventOrderValue(item) {
  if (typeof item.id === 'number' && item.id > 0) {
    return item.id;
  }
  const ingestSeq = Number(readEventPayload(item).ingestSeq);
  return Number.isFinite(ingestSeq) && ingestSeq > 0 ? ingestSeq : 0;
}

function compareEventsLikeSource(a, b) {
  const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }
  const leftKey = String(a.uniqueKey);
  const rightKey = String(b.uniqueKey);
  if (leftKey === rightKey) {
    return 0;
  }
  const leftId = typeof a.id === 'number' ? a.id : 0;
  const rightId = typeof b.id === 'number' ? b.id : 0;
  if (leftId > 0 && rightId > 0 && leftId !== rightId) {
    return leftId - rightId;
  }
  const orderDiff = getEventOrderValue(a) - getEventOrderValue(b);
  return orderDiff || leftKey.localeCompare(rightKey);
}

function getEventIdentityKey(item) {
  const payload = readEventPayload(item);
  return (
    normalizeDuplicateValue(item.userId) ||
    normalizeDuplicateValue(payload.userId) ||
    normalizeDuplicateValue(item.userLink) ||
    normalizeDuplicateValue(payload.userLink) ||
    normalizeDuplicateValue(item.userName) ||
    normalizeDuplicateValue(payload.userName)
  );
}

function getNonCommentDuplicateBody(item) {
  const payload = readEventPayload(item);
  return normalizeDuplicateValue(
    [
      item.giftName,
      payload.giftName,
      item.message,
      payload.text,
      payload.rawText,
      item.giftCount || payload.giftCount || 1,
    ]
      .filter(Boolean)
      .join('|'),
  );
}

function getGiftIdentityScore(item) {
  const payload = readEventPayload(item);
  return (
    (normalizeDuplicateValue(item.userId) ? 4 : 0) +
    (normalizeDuplicateValue(item.userLink) ? 4 : 0) +
    (normalizeDuplicateValue(payload.userId) ? 2 : 0) +
    (normalizeDuplicateValue(payload.userLink) ? 2 : 0)
  );
}

function isMysteryIdentityForStats(value) {
  const normalized = normalizeDuplicateValue(value);
  return normalized.includes('神秘人') || normalized.includes('神秘王者');
}

function getMysteryIdentityCompleteness(item) {
  const payload = readEventPayload(item);
  return [
    item.userName,
    item.userId,
    item.userLink,
    payload.userName,
    payload.userId,
    payload.userLink,
  ].filter(isMysteryIdentityForStats).length;
}

function hasMysteryIdentityForStats(item) {
  return getMysteryIdentityCompleteness(item) > 0;
}

function shouldReplaceDisplayItemLikeSource(existing, candidate) {
  if (existing.uniqueKey !== candidate.uniqueKey) {
    return false;
  }
  if (existing.category !== 'gift' || candidate.category !== 'gift') {
    return false;
  }
  const candidateIsMystery = hasMysteryIdentityForStats(candidate);
  const existingIsMystery = hasMysteryIdentityForStats(existing);
  if (candidateIsMystery && !existingIsMystery) {
    return true;
  }
  const candidateIdentityScore = getGiftIdentityScore(candidate);
  const existingIdentityScore = getGiftIdentityScore(existing);
  return candidateIdentityScore > existingIdentityScore;
}

function mergeDisplayPayloadLikeSource(existingPayloadJson, candidatePayloadJson) {
  if (!candidatePayloadJson) {
    return existingPayloadJson;
  }
  if (!existingPayloadJson) {
    return candidatePayloadJson;
  }
  const existingPayload = JSON.parse(existingPayloadJson);
  const candidatePayload = JSON.parse(candidatePayloadJson);
  const existingIngestSeq = Number(existingPayload?.ingestSeq);
  const candidateIngestSeq = Number(candidatePayload?.ingestSeq);
  const ingestSeq =
    Number.isFinite(existingIngestSeq) && existingIngestSeq > 0
      ? existingIngestSeq
      : Number.isFinite(candidateIngestSeq) && candidateIngestSeq > 0
        ? candidateIngestSeq
        : undefined;
  return JSON.stringify({
    ...existingPayload,
    ...candidatePayload,
    ...(ingestSeq ? { ingestSeq } : {}),
  });
}

function mergeDisplayReplacementLikeSource(existing, candidate) {
  return {
    ...existing,
    ...candidate,
    id: existing.id ?? candidate.id,
    createdAt: existing.createdAt || candidate.createdAt,
    payloadJson: mergeDisplayPayloadLikeSource(existing.payloadJson, candidate.payloadJson),
  };
}

function getEventDuplicateMeta(item) {
  return {
    item,
    key: [item.category, getEventIdentityKey(item), getNonCommentDuplicateBody(item)].join('|'),
    at: getEventTimeMs(item),
  };
}

function isDuplicateEventMetaWithinWindow(existing, candidate) {
  if (existing.item.category !== candidate.item.category) {
    return false;
  }
  if (existing.item.category === 'comment') {
    return false;
  }
  if (existing.at && candidate.at && Math.abs(candidate.at - existing.at) > 1500) {
    return false;
  }
  return Boolean(existing.key && candidate.key && existing.key === candidate.key);
}

function appendDisplayItemsWithDiagnosticsLikeSource(items, rows, category) {
  const diagnostics = {
    categoryMismatch: 0,
    noise: 0,
    uniqueKeyDuplicate: 0,
    duplicate: 0,
    skipped: [],
  };
  const uniqueItems = new Map(items.map((item) => [item.uniqueKey, item]));
  const recentMetas = items.slice(-200).map(getEventDuplicateMeta);
  let changed = false;
  for (const row of rows) {
    if (row.category !== category) {
      diagnostics.categoryMismatch += 1;
      continue;
    }
    if (uniqueItems.has(row.uniqueKey)) {
      diagnostics.uniqueKeyDuplicate += 1;
      const existing = uniqueItems.get(row.uniqueKey);
      if (existing && shouldReplaceDisplayItemLikeSource(existing, row)) {
        uniqueItems.set(row.uniqueKey, mergeDisplayReplacementLikeSource(existing, row));
        changed = true;
      }
      continue;
    }
    const rowMeta = getEventDuplicateMeta(row);
    if (recentMetas.find((item) => isDuplicateEventMetaWithinWindow(item, rowMeta))) {
      diagnostics.duplicate += 1;
      continue;
    }
    uniqueItems.set(row.uniqueKey, row);
    recentMetas.push(rowMeta);
    changed = true;
  }
  return {
    items: changed
      ? Array.from(uniqueItems.values()).sort(compareEventsLikeSource).slice(-EVENT_LIMITS[category])
      : items,
    diagnostics,
  };
}

function extractProfileUserId(value) {
  const normalized = String(value ?? '').trim();
  const pathMatched = normalized.match(/douyin\.com\/(?:user|follow)\/([^/?#]+)/iu);
  if (pathMatched?.[1]) {
    return decodeURIComponent(pathMatched[1]);
  }
  return '';
}

function normalizeHighlightIdentityToken(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }
  return (extractProfileUserId(normalized) || normalized).normalize('NFKC').toLowerCase();
}

function compileHighlightUsers(users) {
  return users
    .map((user) => ({ ...user, normalizedUserId: normalizeHighlightIdentityToken(user.userId) }))
    .filter((user) => user.normalizedUserId);
}

function getHighlightMatchDetailsLikeSource(item, category, users) {
  if ((category !== 'comment' && category !== 'gift') || users.length === 0) {
    return undefined;
  }
  const payload = readEventPayload(item);
  const candidates = [
    { matchedBy: 'event.userId', value: item.userId },
    { matchedBy: 'event.userLink', value: item.userLink },
    { matchedBy: 'event.userLink.sec_uid', value: extractProfileUserId(item.userLink) },
    { matchedBy: 'payload.userId', value: payload.userId },
    { matchedBy: 'payload.userLink', value: payload.userLink },
    { matchedBy: 'payload.userLink.sec_uid', value: extractProfileUserId(payload.userLink) },
  ];
  for (const user of users) {
    for (const candidate of candidates) {
      const normalized = normalizeHighlightIdentityToken(candidate.value);
      if (normalized && normalized === user.normalizedUserId) {
        return {
          category,
          highlightUser: user,
          remark: user.remark,
          matchedBy: candidate.matchedBy,
          matchedValue: normalized,
        };
      }
    }
  }
  return undefined;
}

const firstGiftRow = {
  uniqueKey: 'gift-identity-update-key',
  category: 'gift',
  createdAt: '2026-06-11T08:00:00.000Z',
  userName: 'original-name',
  message: 'original-name -> Heart x1',
  giftName: 'Heart',
  giftCount: 1,
  payloadJson: JSON.stringify({
    category: 'gift',
    sourceId: 'gift-dom-identity-late',
    text: 'original-name -> Heart x1',
    rawText: 'original-name sent Heart x1',
    userName: 'original-name',
    giftName: 'Heart',
    giftCount: 1,
    ingestSeq: 10,
  }),
};

const identityUpdateRow = {
  ...firstGiftRow,
  userId: 'sec_gift_target_001',
  userLink: 'https://www.douyin.com/user/sec_gift_target_001',
  payloadJson: JSON.stringify({
    category: 'gift',
    sourceId: 'gift-dom-identity-late',
    text: 'original-name -> Heart x1',
    rawText: 'original-name sent Heart x1',
    userName: 'original-name',
    userId: 'sec_gift_target_001',
    userLink: 'https://www.douyin.com/user/sec_gift_target_001',
    giftName: 'Heart',
    giftCount: 1,
    ingestSeq: 11,
  }),
};

let state = appendDisplayItemsWithDiagnosticsLikeSource([], [firstGiftRow], 'gift');
assert.equal(state.items.length, 1, 'initial gift row should be visible once');
assert.equal(
  getHighlightMatchDetailsLikeSource(
    state.items[0],
    'gift',
    compileHighlightUsers([{ userId: 'sec_gift_target_001', remark: 'gift-remark' }]),
  ),
  undefined,
  'initial gift without stable identity should not match highlight remarks',
);

state = appendDisplayItemsWithDiagnosticsLikeSource(state.items, [identityUpdateRow], 'gift');
assert.equal(state.items.length, 1, 'identity update with same uniqueKey must replace, not append a duplicate gift row');
assert.equal(state.diagnostics.uniqueKeyDuplicate, 1, 'identity update should be diagnosed as a uniqueKey replacement path');
assert.equal(state.items[0].uniqueKey, firstGiftRow.uniqueKey, 'display row must keep the same uniqueKey');
assert.equal(state.items[0].createdAt, firstGiftRow.createdAt, 'display replacement must keep the original event timestamp');
assert.equal(JSON.parse(state.items[0].payloadJson).ingestSeq, 10, 'display replacement must keep original ingestSeq ordering');
assert.equal(state.items[0].userId, 'sec_gift_target_001', 'display replacement must apply later stable userId');

const match = getHighlightMatchDetailsLikeSource(
  state.items[0],
  'gift',
  compileHighlightUsers([{ userId: 'sec_gift_target_001', remark: 'gift-remark' }]),
);
assert.equal(match?.remark, 'gift-remark', 'updated display row must recompute highlight remark from stable userId');
assert.equal(match?.matchedBy, 'event.userId', 'updated display row must expose the stable matched identity field');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
assert.match(
  appSource,
  /if\s*\(\s*uniqueItems\.has\(row\.uniqueKey\)\s*\)[\s\S]*shouldReplaceDisplayItem\(existing,\s*row\)[\s\S]*mergeDisplayReplacement\(existing,\s*row\)/u,
  'frontend stream append path must replace same-uniqueKey gift rows when later identity is stronger',
);
assert.match(
  appSource,
  /candidateIdentityScore\s*>\s*existingIdentityScore/u,
  'gift replacement must be driven by stronger stable identity data',
);
assert.match(
  appSource,
  /const\s+ingestSeq\s*=[\s\S]*existingIngestSeq[\s\S]*candidateIngestSeq/u,
  'gift replacement must preserve original ingestSeq so update arrivals do not reorder rows',
);

console.log('web gift identity update remark mock regression checks passed');
