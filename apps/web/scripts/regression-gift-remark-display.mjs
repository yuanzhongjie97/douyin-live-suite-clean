import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REMARK = '\u5907\u6ce8\u540d';
const ORIGINAL_NAME = '\u539f\u6635\u79f0';
const PARSED_GIFT_NAME = '\u793c\u7269\u6587\u672c\u6635\u79f0';

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

function normalizeHighlightComparable(value) {
  return String(value ?? '').trim().normalize('NFKC').toLowerCase();
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
  return normalizeHighlightComparable(extractProfileUserId(normalized) || normalized);
}

function compileHighlightUsers(users) {
  return users
    .map((user) => ({ ...user, normalizedUserId: normalizeHighlightIdentityToken(user.userId) }))
    .filter((user) => user.normalizedUserId);
}

function highlightPatternMatches(candidate, user) {
  return Boolean(candidate && user.normalizedUserId && candidate === user.normalizedUserId);
}

function getHighlightUserMatch(item, category, users) {
  if ((category !== 'comment' && category !== 'gift') || users.length === 0) {
    return undefined;
  }

  const payload = readEventPayload(item);
  const linkUserId = extractProfileUserId(item.userLink);
  const payloadLinkUserId = extractProfileUserId(payload.userLink);
  const candidates = [item.userId, item.userLink, linkUserId, payload.userId, payloadLinkUserId]
    .map((value) => normalizeHighlightIdentityToken(value))
    .filter(Boolean);
  return users.find((user) => candidates.some((candidate) => highlightPatternMatches(candidate, user)));
}

function normalizeGiftBodyText(value, giftCount) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }
  const stripped = normalized
    .replace(/[xX\u00d7*]\s*\d{1,5}\s*$/u, '')
    .replace(/\d{1,5}\s*\u8fde\u51fb$/u, '')
    .replace(/\d{1,5}\s*(?:\u4e2a|\u4efd|\u5f20)$/u, '')
    .trim();
  return `${stripped} x${giftCount > 0 ? giftCount : 1}`.trim();
}

function parseGiftEventDetails(item) {
  if (item.category !== 'gift') {
    return {};
  }

  const payload = readEventPayload(item);
  const giftCount = item.giftCount || payload.giftCount || 1;
  const sources = [
    String(payload.giftName ?? '').trim(),
    String(payload.rawText ?? '').trim(),
    String(payload.text ?? '').trim(),
    String(item.message ?? '').trim(),
  ].filter(Boolean);

  for (const source of sources) {
    const arrowMatched = source.match(/^(.{1,24})\s*->\s*(.+)$/u);
    if (arrowMatched?.[1] && arrowMatched?.[2]) {
      return {
        userName: arrowMatched[1].trim(),
        giftText: normalizeGiftBodyText(arrowMatched[2], giftCount),
      };
    }
  }

  return {};
}

function isDefaultMysteryAlias(value) {
  const normalized = String(value ?? '').trim();
  return normalized.includes('\u795e\u79d8\u4eba') || normalized.includes('\u795e\u79d8\u738b\u8005');
}

function getPreferredUserDisplayName(item, highlightUser, sourceShape) {
  const payload = readEventPayload(item);
  const parsedGiftUserName = parseGiftEventDetails(item).userName?.trim() ?? '';
  const sourceNames = sourceShape.displayPrefersParsedGiftUser
    ? [parsedGiftUserName, item.userName, payload.userName]
    : [item.userName, payload.userName, parsedGiftUserName];
  const names = sourceNames.map((value) => String(value ?? '').trim()).filter(Boolean);
  const realName = names.find((name) => !isDefaultMysteryAlias(name));
  const originalName = realName || names[0] || String(item.userId ?? payload.userId ?? '').trim() || '\u533f\u540d\u7528\u6237';
  const remark = String(highlightUser?.remark ?? '').trim();
  if (remark && sourceShape.displayAddsHighlightRemark) {
    return `${remark} / ${originalName}`;
  }
  return originalName;
}

function renderGiftLabelTextLikeSource(item, highlightUser, sourceShape) {
  const parsedGift = parseGiftEventDetails(item);
  const labelItem =
    sourceShape.giftLabelUsesParsedUser && parsedGift.userName ? { ...item, userName: parsedGift.userName } : item;
  return `[${getPreferredUserDisplayName(labelItem, highlightUser, sourceShape)}]`;
}

const giftWithStableUserId = {
  uniqueKey: 'gift-id-regression',
  sessionId: 'session-regression',
  category: 'gift',
  createdAt: '2026-06-03T10:00:00.000Z',
  userName: ORIGINAL_NAME,
  userId: 'stable-target-user',
  message: `${PARSED_GIFT_NAME} -> Magic Wand x1`,
  payloadJson: JSON.stringify({
    rawText: `${PARSED_GIFT_NAME} -> Magic Wand x1`,
    userId: 'stable-target-user',
  }),
};

const giftWithStableUserLink = {
  ...giftWithStableUserId,
  uniqueKey: 'gift-link-regression',
  userId: undefined,
  userLink: 'https://www.douyin.com/user/sec_stable_link_target',
  payloadJson: JSON.stringify({
    rawText: `${PARSED_GIFT_NAME} -> Magic Wand x1`,
    userLink: 'https://www.douyin.com/user/sec_stable_link_target',
  }),
};

assert.equal(parseGiftEventDetails(giftWithStableUserId).userName, PARSED_GIFT_NAME, 'fixture must parse a different gift text userName');

assert.equal(
  getHighlightUserMatch(giftWithStableUserId, 'gift', compileHighlightUsers([{ userId: 'stable-target-user', remark: REMARK }]))?.remark,
  REMARK,
  'gift highlight should match by stable userId',
);
assert.equal(
  getHighlightUserMatch(giftWithStableUserLink, 'gift', compileHighlightUsers([{ userId: 'sec_stable_link_target', remark: REMARK }]))?.remark,
  REMARK,
  'gift highlight should match by stable userLink',
);
assert.equal(
  getHighlightUserMatch(giftWithStableUserId, 'gift', compileHighlightUsers([{ userId: PARSED_GIFT_NAME, remark: 'wrong' }])),
  undefined,
  'gift highlight must not match by parsed gift text userName',
);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(resolve(scriptDir, '../src/App.tsx'), 'utf8');
const sourceShape = {
  giftLabelUsesParsedUser:
    /const\s+giftItem\s*=\s*parsedGift\.userName\s*\?\s*\{\s*\.\.\.item,\s*userName:\s*parsedGift\.userName\s*\}\s*:\s*item\s*;/u.test(appSource) &&
    /renderUserLabel\(\s*giftItem\s*,\s*''\s*,\s*highlightUser\s*\)/u.test(appSource),
  displayPrefersParsedGiftUser:
    /const\s+names\s*=\s*\[\s*parsedGiftUserName\s*,\s*item\.userName\s*,\s*payload\.userName\s*\]/u.test(appSource),
  displayAddsHighlightRemark: /return\s+`\$\{remark\}\s*\/\s*\$\{originalName\}`/u.test(appSource),
};

assert.equal(
  renderGiftLabelTextLikeSource(giftWithStableUserId, { userId: 'stable-target-user', remark: REMARK }, sourceShape),
  `[${ORIGINAL_NAME}]`,
  'stable userId matched gift should display original nickname only even when parsed gift text has another userName',
);
assert.equal(
  renderGiftLabelTextLikeSource(giftWithStableUserLink, { userId: 'sec_stable_link_target', remark: REMARK }, sourceShape),
  `[${ORIGINAL_NAME}]`,
  'stable userLink matched gift should display original nickname only even when parsed gift text has another userName',
);
assert.equal(sourceShape.giftLabelUsesParsedUser, false, 'gift renderer must not pass parsed gift userName into renderUserLabel');
assert.equal(sourceShape.displayPrefersParsedGiftUser, false, 'preferred display name must keep original item/payload nickname before parsed gift text');
assert.equal(sourceShape.displayAddsHighlightRemark, false, 'highlight remark marker must not be merged into the gift row user label');

console.log('web gift remark display regression checks passed');
