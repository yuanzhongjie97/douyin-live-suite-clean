import crypto from 'node:crypto';
import type { EventCategory, LiveEvent, RawCollectorEvent } from './types.js';

export const GIFT_KEYWORDS = [
  '\u9001\u51FA',
  '\u8D60\u9001',
  '\u9001\u7ED9',
  '\u6253\u8D4F',
  '\u6295\u5582',
  '\u9001\u793C',
  '\u793C\u7269',
  '\u5609\u5E74\u534E',
  '\u5C0F\u5FC3\u5FC3',
  '\u6296\u97F31\u53F7',
  '\u8DD1\u8F66',
  '\u70ED\u6C14\u7403',
  '\u79C1\u4EBA\u98DE\u673A',
  '\u8C6A\u534E\u90AE\u8F6E',
  '\u7C89\u4E1D\u56E2\u706F\u724C',
  '\u70B9\u4EAE\u7C89\u4E1D\u56E2',
  '\u5165\u56E2\u5238',
  '\u4EBA\u6C14\u7968',
  '\u661F\u5149\u95EA\u8000',
  '\u9F13\u529B\u5168\u5F00',
  '\u9C9C\u82B1',
  '\u73AB\u7470',
  '\u7231\u5FC3',
  '\u706B\u7BAD',
  '\u68D2\u68D2\u7CD6',
  '\u7687\u51A0',
  '\u94BB\u77F3',
  '\u6C38\u751F\u82B1',
  '\u4EB2\u543B',
  '\u53E3\u7EA2',
  '\u5C0F\u9EC4\u9E2D',
  '\u9F99\u5377\u98CE',
  '\u5976\u8336',
  '\u51B0\u6DC7\u6DCB',
];

const GIFT_ACTION_KEYWORDS = [
  '\u9001\u51FA',
  '\u8D60\u9001',
  '\u9001\u7ED9',
  '\u6253\u8D4F',
  '\u6295\u5582',
  '\u9001\u793C',
];

const ENTRY_PATTERNS = [
  /\u8FDB\u5165\u76F4\u64AD\u95F4/,
  /\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4/,
  /\u6765\u4E86/,
  /\u52A0\u5165\u76F4\u64AD/,
];

const INTERACTION_PATTERNS = [
  /^.{1,24}?\s*\u70B9\u8D5E$/u,
  /^.{1,24}?\s*\u5173\u6CE8$/u,
  /^.{1,24}?\s*\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86$/u,
  /^.{1,24}?\s*\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4$/u,
  /^.{1,24}?\s*\u63A8\u8350\u4E86\u76F4\u64AD$/u,
  /^.{1,24}?\s*\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*$/u,
  /^.{1,24}?\s*\u70B9\u4EAE.*\u706F\u724C.*$/u,
  /^.{1,24}?\s*\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206$/u,
];

const COLON_INTERACTION_ACTION_PATTERNS = [
  /^\u70B9\u8D5E$/u,
  /^\u5173\u6CE8$/u,
  /^\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86$/u,
  /^\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4$/u,
  /^\u63A8\u8350\u4E86\u76F4\u64AD$/u,
  /^\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*$/u,
  /^\u70B9\u4EAE.*\u706F\u724C.*$/u,
  /^\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206$/u,
];

const FAN_CLUB_GIFT_PATTERNS = [/\u70B9\u4EAE.*\u7C89\u4E1D\u56E2/, /\u7C89\u4E1D\u56E2\u706F\u724C/, /\u5165\u56E2\u5238/, /\u4EBA\u6C14\u7968/];
const GIFT_ACTION_WITH_TARGET_PATTERN = String.raw`(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582)`;
const GIFT_ACTION_STANDALONE_SEND_PATTERN = String.raw`\u9001\s+`;
const GIFT_ACTION_PATTERN = String.raw`(?:${GIFT_ACTION_WITH_TARGET_PATTERN}|${GIFT_ACTION_STANDALONE_SEND_PATTERN})`;
export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeWhitespace(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlausibleCommentUserName(value: string | undefined | null): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return false;
  }

  return !/^\d{1,3}$/u.test(normalized);
}

export function stripImplausibleCommentPrefix(value: string | undefined | null): string {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(.+)$/u);
  if (!matched) {
    return normalized;
  }

  return isPlausibleCommentUserName(matched[1]) ? normalized : normalizeWhitespace(matched[2]);
}

export function normalizeLiveUrl(url: string): string {
  const value = normalizeWhitespace(url);
  if (!value) {
    return value;
  }

  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';

    const roomId = (parsed.pathname.match(/\/(\d{6,})(?:\/|$)/) || [])[1];
    if (parsed.hostname.includes('live.douyin.com') && roomId) {
      return `https://live.douyin.com/${roomId}`;
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return value.replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

export function extractRoomIdFromUrl(url: string): string {
  const match = normalizeLiveUrl(url).match(/\/(\d{6,})(?:[/?]|$)/);
  return match?.[1] ?? '';
}

export function parseGiftCount(text: string): number {
  const normalized = normalizeWhitespace(text);
  const patterns = [
    /[xX\u00D7*]\s*(\d{1,5})/gu,
    /(\d{1,5})\s*(?:\u8FDE\u51FB|\u9023\u64CA)/gu,
    /(\d{1,5})\s*(?:\u4E2A|\u500B|\u4EFD|\u5F20)/gu,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(normalized.matchAll(pattern));
    const matched = matches[matches.length - 1];
    const parsed = matched ? Number(matched[1]) : 0;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 1;
}

function containsGiftSignal(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  return (
    GIFT_ACTION_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
    FAN_CLUB_GIFT_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /(?:x|X|脳|\*)\s*\d{1,5}$/.test(normalized) ||
    /\d{1,5}\s*杩炲嚮$/.test(normalized) ||
    /\d{1,5}\s*(?:\u4E2A|\u4EFD|\u5F20)$/.test(normalized)
  );
}

export function classifyText(text: string): Exclude<EventCategory, 'log'> {
  const normalized = normalizeWhitespace(text);
  if (containsGiftSignal(normalized)) {
    return 'gift';
  }
  if (ENTRY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'entry';
  }
  const colonAction = normalized.match(/^[^:\uFF1A]{1,24}[:\uFF1A]\s*(.+)$/u)?.[1];
  if (colonAction && COLON_INTERACTION_ACTION_PATTERNS.some((pattern) => pattern.test(normalizeWhitespace(colonAction)))) {
    return 'interaction';
  }
  if (!colonAction && INTERACTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'interaction';
  }
  return 'comment';
}

function formatInteractionMessage(message: string, count?: number): string {
  const normalized = normalizeWhitespace(message);
  if (!normalized) {
    return normalized;
  }

  if (/点赞/u.test(normalized)) {
    const likeCount = count && count > 0 ? count : 1;
    return `点赞 x${likeCount}`;
  }

  if (/分享.*直播间/u.test(normalized)) {
    return '分享了直播间';
  }

  if (/推荐了直播/u.test(normalized)) {
    return '推荐了直播';
  }

  if (/关注/u.test(normalized)) {
    return '关注了主播';
  }

  if (/加入了粉丝团/u.test(normalized)) {
    return normalized;
  }

  if (/点亮.*灯牌/u.test(normalized)) {
    return normalized;
  }

  if (/为主播加了\s*\d+\s*分/u.test(normalized)) {
    return normalized.replace(/\s+/gu, ' ');
  }

  return normalized;
}

function normalizeGiftName(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/^(?:\u9001\u793C|\u793C\u7269)[:\uFF1A]?\s*/iu, '')
      .replace(
        new RegExp(`^.{1,24}?${GIFT_ACTION_PATTERN}\\s*`, 'u'),
        '',
      )
      .replace(/[xX\u00D7*]\s*\d{1,5}\s*$/u, '')
      .replace(/\d{1,5}\s*\u8FDE\u51FB$/u, '')
      .replace(/\d{1,5}\s*(?:\u4E2A|\u4EFD|\u5F20)$/u, '')
      .replace(/^\s*->\s*/u, '')
      .replace(/^[\uFF1A:>\-\s]+/u, '')
      .replace(/[\uFF1A:\-\s]+$/u, '')
      .trim(),
  );
}
function isUsableGiftName(text: string | undefined): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length < 2 || normalized.length > 48) {
    return false;
  }

  if (/combo animation/iu.test(normalized)) {
    return false;
  }

  if (
    /^(?:\u4E86|\u9001|\u9001\u51FA|\u9001\u51FA\u4E86|\u8D60\u9001|\u8D60\u9001\u4E86|\u9001\u7ED9|\u6253\u8D4F|\u6295\u5582|\u793C\u7269|\u8FDE\u51FB|x|X|\u00D7|\*)$/u.test(
      normalized,
    )
  ) {
    return false;
  }

  if (/^[xX\u00D7*]+$/u.test(normalized) || /^[\d\s]+$/u.test(normalized)) {
    return false;
  }

  if (/^[\[{【（(].*[\]】）)]$/u.test(normalized)) {
    return false;
  }

  if (/^[\uFF1A:>\-\s]+$/u.test(normalized)) {
    return false;
  }

  return true;
}
function parseGiftPayload(
  text: string,
  fallbackUser: string,
): {
  userName?: string;
  giftName?: string;
  giftCount?: number;
} {
  const normalized = normalizeWhitespace(text);
  const directColonMatch = normalized.match(
    new RegExp(`^(.{1,24})[\\uFF1A:]\\s*(${GIFT_ACTION_PATTERN})(.+)$`, 'u'),
  );
  const directWhitespaceMatch = normalized.match(
    new RegExp(`^(.{1,24})\\s+(${GIFT_ACTION_PATTERN})(.+)$`, 'u'),
  );
  const compactGiftNameMatch = normalized.match(
    new RegExp(`^(.{1,24})\\s+((?!${GIFT_ACTION_WITH_TARGET_PATTERN})(?:[^\\s]+(?:\\s+[^xX\\u00D7*\\d][^\\s]*)*))\\s*(?:[xX\\u00D7*]\\s*\\d{1,5}|\\d{1,5}\\s*(?:\\u8FDE\\u51FB|\\u9023\\u64CA|\\u4E2A|\\u500B|\\u4EFD|\\u5F20))$`, 'u'),
  );
  const directNameOnlyMatch = normalized.match(/^(.{1,24})[:\uFF1A]\s*(.+)$/u);
  const fanClubGiftMatch = normalized.match(/^(.{1,24})(?:[\uFF1A:]\s*|\s+)(\u70B9\u4EAE.*\u7C89\u4E1D\u56E2|\u7C89\u4E1D\u56E2\u706F\u724C|\u5165\u56E2\u5238|\u4EBA\u6C14\u7968.*)$/u);
  const fallbackName = normalizeWhitespace(fallbackUser);
  const shouldUseParsedGiftUser = (candidate: string): boolean => {
    const normalizedCandidate = normalizeWhitespace(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    if (!fallbackName) {
      return true;
    }
    if (fallbackName === '????') {
      return true;
    }
    if (/^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(fallbackName)) {
      return true;
    }
    return false;
  };
  let userName = fallbackName;
  let giftText = normalized;

  if (directColonMatch) {
    const parsedUserName = normalizeWhitespace(directColonMatch[1]);
    userName = shouldUseParsedGiftUser(parsedUserName) ? parsedUserName : userName;
    giftText = normalizeWhitespace(directColonMatch[3]);
  } else if (directWhitespaceMatch) {
    const parsedUserName = normalizeWhitespace(directWhitespaceMatch[1]);
    userName = shouldUseParsedGiftUser(parsedUserName) ? parsedUserName : userName;
    giftText = normalizeWhitespace(directWhitespaceMatch[3]);
  } else if (compactGiftNameMatch) {
    const candidateGiftText = normalizeWhitespace(compactGiftNameMatch[2]);
    const candidateGiftName = normalizeGiftName(candidateGiftText);
    if (isUsableGiftName(candidateGiftName)) {
      const parsedUserName = normalizeWhitespace(compactGiftNameMatch[1]);
      userName = shouldUseParsedGiftUser(parsedUserName) ? parsedUserName : userName;
      giftText = candidateGiftText;
    }
  } else if (directNameOnlyMatch) {
    const candidateGiftText = normalizeWhitespace(directNameOnlyMatch[2]);
    const candidateGiftName = normalizeGiftName(candidateGiftText);
    if (containsGiftSignal(candidateGiftText) || isUsableGiftName(candidateGiftName)) {
      const parsedUserName = normalizeWhitespace(directNameOnlyMatch[1]);
      userName = shouldUseParsedGiftUser(parsedUserName) ? parsedUserName : userName;
      giftText = candidateGiftText;
    }
  } else if (fanClubGiftMatch) {
    const parsedUserName = normalizeWhitespace(fanClubGiftMatch[1]);
    userName = shouldUseParsedGiftUser(parsedUserName) ? parsedUserName : userName;
    giftText = normalizeWhitespace(fanClubGiftMatch[2]);
  }

  const giftCount = parseGiftCount(giftText || normalized);
  let giftName = normalizeGiftName(giftText);

  if ((!giftName || !isUsableGiftName(giftName)) && containsGiftSignal(normalized)) {
    giftName = normalizeGiftName(normalized);
  }

  return {
    userName: userName || undefined,
    giftName: isUsableGiftName(giftName) ? giftName : undefined,
    giftCount,
  };
}
export function parseMessage(raw: RawCollectorEvent): {
  message: string;
  userName?: string;
  giftName?: string;
  giftCount?: number;
} {
  const text = normalizeWhitespace(raw.text || raw.rawText);
  let userName = normalizeWhitespace(raw.userName);
  let message = text;
  let giftName: string | undefined = normalizeGiftName(normalizeWhitespace(raw.giftName)) || undefined;
  let giftCount = raw.giftCount && raw.giftCount > 0 ? raw.giftCount : undefined;

  if (raw.category === 'comment') {
    const matched = text.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(.+)$/u);
    const matchedUserName = normalizeWhitespace(matched?.[1]);
    if (matched && isPlausibleCommentUserName(matchedUserName)) {
      if (!userName) {
        userName = matchedUserName;
      }
      message = normalizeWhitespace(matched[2]);
    } else if (matched) {
      message = normalizeWhitespace(matched[2]);
    }
    if (
      userName &&
      !normalizeWhitespace(raw.userId) &&
      !normalizeWhitespace(raw.userLink) &&
      !isPlausibleCommentUserName(userName)
    ) {
      userName = '';
      message = text;
    }
  }

  if (raw.category === 'entry' || raw.category === 'interaction') {
    const matched =
      text.match(
        /^([^:\uFF1A]{1,24})[:\uFF1A]\s*(\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u,
      ) ||
      text.match(
        /^(.{1,24}?)(\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u4E3A\u4E3B\u64AD\u70B9\u8D5E\u4E86|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u63A8\u8350\u4E86\u76F4\u64AD|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206)$/u,
      );
    if (matched) {
      const actionUserName = normalizeWhitespace(matched[1]);
      if (!userName || actionUserName.includes('\u795E\u79D8\u4EBA')) {
        userName = actionUserName;
      }
      message = normalizeWhitespace(matched[2]);
    }

    if (raw.category === 'interaction') {
      message = formatInteractionMessage(message, giftCount);
    }
  }
  if (raw.category === 'gift') {
    const parsedGift = parseGiftPayload(text, userName);
    if (parsedGift.userName) {
      userName = parsedGift.userName;
    }
    if ((!giftName || !isUsableGiftName(giftName)) && parsedGift.giftName) {
      giftName = parsedGift.giftName;
    }
    if (parsedGift.giftCount) {
      const mergedGiftCount = Math.max(giftCount || 0, parsedGift.giftCount);
      giftCount = mergedGiftCount > 0 ? mergedGiftCount : undefined;
    }

    if ((!giftName || !isUsableGiftName(giftName)) && containsGiftSignal(text)) {
      giftName = normalizeGiftName(text);
    }

    const parsedTextGiftCount = parseGiftCount(text);
    const mergedTextGiftCount = Math.max(giftCount || 0, parsedTextGiftCount || 0);
    giftCount = mergedTextGiftCount > 0 ? mergedTextGiftCount : undefined;

    if (!isUsableGiftName(giftName)) {
      giftName = undefined;
    }

    message = giftName ? `${userName || '鍖垮悕鐢ㄦ埛'} -> ${giftName} x${giftCount}` : text;
  }

  return {
    message,
    userName: userName || undefined,
    giftName: giftName || undefined,
    giftCount,
  };
}

export function buildUniqueKey(event: Omit<LiveEvent, 'uniqueKey'>): string {
  let commentDisambiguator = '';
  let commentStableSourceKey = '';
  if (event.category === 'comment' && event.payloadJson) {
    try {
      const payload = JSON.parse(event.payloadJson) as {
        sourceId?: unknown;
        rawText?: unknown;
        text?: unknown;
        collectorSeq?: unknown;
      };
      const sourceId = normalizeWhitespace(String(payload.sourceId ?? ''));
      if (sourceId) {
        commentStableSourceKey = [
          sourceId,
          normalizeWhitespace(String(payload.rawText ?? '')),
          normalizeWhitespace(String(payload.text ?? event.message ?? '')),
          normalizeWhitespace(String(event.userLink ?? event.userId ?? event.userName ?? '')),
        ].join('|');
      } else {
        commentDisambiguator = [
          payload.rawText ?? '',
          payload.text ?? '',
          payload.collectorSeq ?? '',
        ].join('|');
      }
    } catch {
      commentDisambiguator = event.payloadJson;
    }
  }
  const seed =
    event.category === 'comment' && commentStableSourceKey
      ? [
          event.sessionId,
          event.category,
          event.roomId ?? '',
          commentStableSourceKey,
        ].join('|')
      : [
          event.sessionId,
          event.category,
          event.userName ?? '',
          event.userId ?? '',
          event.userLink ?? '',
          event.message,
          event.giftName ?? '',
          String(event.giftCount ?? 0),
          event.createdAt,
          commentDisambiguator,
        ].join('|');

  return crypto.createHash('sha1').update(seed).digest('hex');
}

export function toLogMessage(message: string, level: 'info' | 'warn' | 'error' = 'info'): string {
  return `[${level.toUpperCase()}] ${normalizeWhitespace(message)}`;
}







