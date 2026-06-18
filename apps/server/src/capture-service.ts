import { nanoid } from 'nanoid';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import { AppDatabase } from './db.js';
import { EventBus } from './event-bus.js';
import { buildCommentDiagId, commentDiagnostics, type CommentDecisionStage } from './comment-diagnostics.js';
import type { DouyinCollector } from './collector.js';
import type { BrowserContext, Page } from 'playwright';
import {
  normalizeAllowedDouyinEntryUrl,
  normalizeAllowedDouyinLiveUrl,
} from './security.js';
import type {
  EventCategory,
  EventHistoryQuery,
  EventHistoryResult,
  EventQuery,
  HighlightUserConfig,
  HighlightUsersQuery,
  HighlightUsersSnapshot,
  LiveEvent,
  RawCollectorEvent,
  RoomSnapshot,
  RuntimeSnapshot,
  SessionRecord,
  SessionStats,
} from './types.js';
import {
  buildUniqueKey,
  classifyText,
  extractRoomIdFromUrl,
  isPlausibleCommentUserName,
  normalizeLiveUrl,
  normalizeWhitespace,
  nowIso,
  parseMessage,
  stripImplausibleCommentPrefix,
  toLogMessage,
} from './utils.js';

type LoginState = {
  loggedIn: boolean;
  profileDisplayName?: string;
};

export type AutoSaveTarget = 'manual' | 'offline';

export const AUTO_EXPORT_DOCUMENTS_SUBDIR = path.join('糖三角', '自动导出');

export function sanitizeAutoExportFileNamePart(value: string | undefined): string {
  const sanitized = normalizeWhitespace(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/[. ]+$/gu, '')
    .trim();
  return sanitized || '未命名';
}

function formatAutoExportTimestamp(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (part: number) => String(part).padStart(2, '0');
  return [
    safeDate.getFullYear(),
    pad(safeDate.getMonth() + 1),
    pad(safeDate.getDate()),
    '-',
    pad(safeDate.getHours()),
    pad(safeDate.getMinutes()),
    pad(safeDate.getSeconds()),
  ].join('');
}

export function buildAutoExportFileName(session: Pick<SessionRecord, 'id' | 'roomTitle' | 'hostName' | 'startedAt'>): string {
  const timestamp = formatAutoExportTimestamp(session.startedAt);
  const hostName = sanitizeAutoExportFileNamePart(session.hostName || session.roomTitle);
  const sessionId = sanitizeAutoExportFileNamePart(session.id);
  const baseName = `糖三角-${timestamp}-${hostName}-${sessionId}`;
  return `${baseName.slice(0, 180)}.xlsx`;
}

export function resolveAutoExportOutputPath(
  session: Pick<SessionRecord, 'id' | 'roomTitle' | 'hostName' | 'startedAt'>,
  target: AutoSaveTarget,
  roots: Pick<typeof config, 'documentsDir' | 'desktopDir'> = config,
): string {
  const outputDir =
    target === 'offline'
      ? path.join(roots.documentsDir, AUTO_EXPORT_DOCUMENTS_SUBDIR)
      : roots.desktopDir;
  return path.join(outputDir, buildAutoExportFileName(session));
}

function isUsableProfileDisplayName(value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length < 2 || normalized.length > 40) {
    return false;
  }

  if (
    /^(?:我|我的|首页|关注|粉丝|朋友|推荐|个人中心|登录|消息|搜索|发布|抖音|退出登录|当前抖音账号|当前账号|未登录)$/u.test(
      normalized,
    )
  ) {
    return false;
  }

  return true;
}

type RecentGiftFingerprint = {
  at: number;
  quality: number;
  event?: LiveEvent;
};

type RecentGiftComboState = {
  at: number;
  count: number;
};

type MysteryStatsState = {
  name: string;
  total: number;
  entryCount: number;
  commentCount: number;
  giftCount: number;
  lastActiveAt: string;
  userId?: string;
  userLink?: string;
  activities: Array<{
    category: EventCategory;
    createdAt: string;
    message: string;
    giftName?: string;
    giftCount?: number;
  }>;
};

type LiveStatsState = Omit<SessionStats, 'topGifts' | 'activeUsers'> & {
  giftMap: Map<string, number>;
  activeUserMap: Map<string, MysteryStatsState>;
};

const RECENT_COLLECTOR_FINGERPRINT_LIMIT = 24000;
const RECENT_GIFT_FINGERPRINT_LIMIT = 1600;
const RECENT_GIFT_COMBO_LIMIT = 1200;
const RECENT_COMMENT_DUPLICATE_TTL_MS = 1500;
const RECENT_SOURCE_ID_DUPLICATE_TTL_MS = 300000;
const RECENT_GIFT_SOURCE_ID_DUPLICATE_TTL_MS = 15000;
const RECENT_NON_COMMENT_DUPLICATE_TTL_MS = 300000;
const LIVE_STATS_ACTIVE_USER_LIMIT = 200;
const MYSTERY_PERSON_LABEL = '\u795E\u79D8\u4EBA';
const MYSTERY_KING_LABEL = '\u795E\u79D8\u738B\u8005';

type CaptureIntegrityLedgerKey =
  | 'ledger.comment.raw_received'
  | 'ledger.comment.filtered'
  | 'ledger.comment.deduped'
  | 'ledger.comment.db_inserted'
  | 'ledger.comment.db_ignored_unique'
  | 'ledger.comment.bus_published'
  | 'ledger.gift.raw_received'
  | 'ledger.gift.filtered'
  | 'ledger.gift.deduped'
  | 'ledger.gift.db_inserted'
  | 'ledger.gift.db_ignored_unique'
  | 'ledger.gift.bus_published'
  | 'ledger.gift.identity_update_published'
  | 'ledger.highlight.comment_matched'
  | 'ledger.highlight.gift_matched';

function incrementCaptureLedger(key: CaptureIntegrityLedgerKey, by = 1): void {
  const parts = key.split('.');
  const category = parts[1] as 'comment' | 'gift' | 'highlight';
  const name = parts.slice(2).join('.');
  commentDiagnostics.incrementLedger(category, name, by);
}

function trimMapByAge<TKey, TValue extends { at?: number } | number>(map: Map<TKey, TValue>, limit: number): void {
  if (map.size <= limit) {
    return;
  }
  const rows = Array.from(map.entries()).sort((a, b) => {
    const left = typeof a[1] === 'number' ? a[1] : a[1]?.at ?? 0;
    const right = typeof b[1] === 'number' ? b[1] : b[1]?.at ?? 0;
    return left - right;
  });
  for (const [key] of rows.slice(0, map.size - limit)) {
    map.delete(key);
  }
}

function createEmptyLiveStats(sessionId?: string): LiveStatsState {
  return {
    sessionId,
    comments: 0,
    entries: 0,
    interactions: 0,
    gifts: 0,
    giftUnits: 0,
    logs: 0,
    uniqueUsers: 0,
    giftMap: new Map(),
    activeUserMap: new Map(),
  };
}

function normalizeMysteryComparable(value: string | undefined): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\//iu, '');
}

function isMysteryIdentityForStats(value: string | undefined, category: LiveEvent['category']): boolean {
  const normalized = normalizeMysteryComparable(value);
  if (!normalized) {
    return false;
  }
  return normalized.includes(MYSTERY_PERSON_LABEL) || normalized.includes(MYSTERY_KING_LABEL);
}

function readMysteryPayload(row: LiveEvent): RawCollectorEvent | undefined {
  if (!row.payloadJson) {
    return undefined;
  }
  try {
    return JSON.parse(row.payloadJson) as RawCollectorEvent;
  } catch {
    return undefined;
  }
}

function getMysteryPayloadIdentityValues(row: LiveEvent): string[] {
  const payload = readMysteryPayload(row);
  if (!payload) {
    return [];
  }
  return [payload.userName, payload.userId, payload.userLink]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
}

function getMysteryPayloadTextValues(row: LiveEvent): string[] {
  const payload = readMysteryPayload(row);
  if (!payload) {
    return [];
  }
  return [payload.text, payload.rawText]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
}

function hasMysteryIdentityField(row: LiveEvent): boolean {
  return (
    isMysteryIdentityForStats(row.userName, row.category) ||
    isMysteryIdentityForStats(row.userId, row.category) ||
    isMysteryIdentityForStats(row.userLink, row.category) ||
    getMysteryPayloadIdentityValues(row).some((value) => isMysteryIdentityForStats(value, row.category))
  );
}

function isMentionOnlyMysteryComment(row: LiveEvent): boolean {
  if (row.category !== 'comment' || hasMysteryIdentityField(row)) {
    return false;
  }
  const texts = [row.message, ...getMysteryPayloadTextValues(row)]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  return texts.some(
    (text) =>
      text.includes('@') &&
      (text.includes(MYSTERY_PERSON_LABEL) || text.includes(MYSTERY_KING_LABEL)),
  );
}

function isMysteryStatsEvent(row: LiveEvent): boolean {
  if (row.category === 'log') {
    return false;
  }
  return hasMysteryIdentityField(row);
}

function readEventPayload(row: LiveEvent): RawCollectorEvent | undefined {
  if (!row.payloadJson) {
    return undefined;
  }
  try {
    return JSON.parse(row.payloadJson) as RawCollectorEvent;
  } catch {
    return undefined;
  }
}

function getGiftIdentityScore(row: LiveEvent): number {
  const payload = readEventPayload(row);
  return (
    (normalizeWhitespace(row.userId) ? 4 : 0) +
    (normalizeWhitespace(row.userLink) ? 4 : 0) +
    (normalizeWhitespace(payload?.userId) ? 2 : 0) +
    (normalizeWhitespace(payload?.userLink) ? 2 : 0) +
    (hasMysteryIdentityField(row) ? 3 : 0)
  );
}

function getGiftStableIdentityToken(row: LiveEvent): string {
  const payload = readEventPayload(row);
  return normalizeHighlightIdentityToken(
    row.userId ||
      row.userLink ||
      payload?.userId ||
      payload?.userLink,
  );
}

function hasConflictingGiftStableIdentity(target: LiveEvent, candidate: LiveEvent): boolean {
  const targetToken = getGiftStableIdentityToken(target);
  const candidateToken = getGiftStableIdentityToken(candidate);
  return Boolean(targetToken && candidateToken && targetToken !== candidateToken);
}

function mergeGiftIdentityIntoEvent(target: LiveEvent, candidate: LiveEvent): LiveEvent {
  const targetPayload = readEventPayload(target) ?? ({} as RawCollectorEvent);
  const candidatePayload = readEventPayload(candidate) ?? ({} as RawCollectorEvent);
  const targetIsMystery = hasMysteryIdentityField(target);
  const candidateIsMystery = hasMysteryIdentityField(candidate);
  const protectTargetMystery = targetIsMystery && !candidateIsMystery;
  const allowCandidateStableIdentity = !protectTargetMystery && !hasConflictingGiftStableIdentity(target, candidate);
  const mergedUserName = protectTargetMystery
    ? target.userName || targetPayload.userName
    : candidateIsMystery && !targetIsMystery
      ? candidate.userName || candidatePayload.userName || target.userName || targetPayload.userName
      : target.userName || targetPayload.userName || candidate.userName || candidatePayload.userName;
  const mergedUserId =
    target.userId ||
    targetPayload.userId ||
    (allowCandidateStableIdentity ? candidate.userId || candidatePayload.userId : undefined);
  const mergedUserLink =
    target.userLink ||
    targetPayload.userLink ||
    (allowCandidateStableIdentity ? candidate.userLink || candidatePayload.userLink : undefined);
  const mergedPayload: RawCollectorEvent = {
    ...targetPayload,
    ...candidatePayload,
    category: 'gift',
    text: targetPayload.text || candidatePayload.text || target.message || candidate.message,
    rawText: targetPayload.rawText || candidatePayload.rawText,
    sourceId: candidatePayload.sourceId || targetPayload.sourceId,
    userName: mergedUserName,
    userId: mergedUserId,
    userLink: mergedUserLink,
    giftName: candidate.giftName || candidatePayload.giftName || target.giftName || targetPayload.giftName,
    giftCount: candidate.giftCount || candidatePayload.giftCount || target.giftCount || targetPayload.giftCount,
  };
  Object.assign(target, {
    userName: mergedUserName,
    userId: mergedUserId,
    userLink: mergedUserLink,
    giftName: target.giftName || candidate.giftName,
    giftCount: target.giftCount || candidate.giftCount,
    payloadJson: JSON.stringify(mergedPayload),
  });
  return target;
}

function extractMysteryLabelFromText(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value);
  for (const label of [MYSTERY_PERSON_LABEL, MYSTERY_KING_LABEL]) {
    const start = normalized.indexOf(label);
    if (start < 0) {
      continue;
    }
    const rest = normalized.slice(start);
    const end = rest.search(/[\s:\uFF1A\uFF0C,\u3002@]/u);
    return normalizeWhitespace(end >= 0 ? rest.slice(0, end) : rest);
  }
  return undefined;
}

function getMysteryDisplayNameFromEvent(row: LiveEvent): string {
  const identityCandidates = [row.userName, row.userId, row.userLink, ...getMysteryPayloadIdentityValues(row)]
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
  const identityMatch = identityCandidates.find((value) => isMysteryIdentityForStats(value, row.category));
  if (identityMatch) {
    return identityMatch;
  }
  const textMatch = [row.message, ...getMysteryPayloadTextValues(row)]
    .map((value) => extractMysteryLabelFromText(value))
    .find(Boolean);
  return textMatch || identityCandidates[0] || '\u533F\u540D\u7528\u6237';
}

function getMysteryIdentityKey(row: LiveEvent): string {
  if (hasMysteryIdentityField(row)) {
    return normalizeWhitespace(row.userLink || row.userId || row.userName) || getMysteryDisplayNameFromEvent(row);
  }
  return getMysteryDisplayNameFromEvent(row);
}

function toSessionStatsSnapshot(stats: LiveStatsState): SessionStats {
  return {
    sessionId: stats.sessionId,
    comments: stats.comments,
    entries: stats.entries,
    interactions: stats.interactions,
    gifts: stats.gifts,
    giftUnits: stats.giftUnits,
    logs: stats.logs,
    uniqueUsers: stats.uniqueUsers,
    topGifts: Array.from(stats.giftMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, 8),
    activeUsers: Array.from(stats.activeUserMap.values())
      .sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)) || a.name.localeCompare(b.name))
      .slice(0, LIVE_STATS_ACTIVE_USER_LIMIT)
      .map((item) => ({
        ...item,
        activities: item.activities.slice(0, 30),
      })),
  };
}

const IDLE_CHROMIUM_INSTALL_STATE = { status: 'idle' as const };
const PAGE_GOTO_TIMEOUT_MS = 60000;
const PAGE_READY_TIMEOUT_MS = 12000;

async function loadCollectorModule() {
  return import('./collector.js');
}

async function loadPlaywrightRuntime() {
  return import('./playwright-runtime.js');
}

const HIGHLIGHT_USERS_FILE_NAME = 'highlight_users.txt';
const HIGHLIGHT_USERS_TEMPLATE = `\uFEFF# 特别关注用户配置
# 每行一个抖音用户 ID 或主页链接，可在后面加备注。
# 示例：
# MS4wLjABAAAAxxxxxxxxxxxxxxxx 备注名
# https://www.douyin.com/user/MS4wLjABAAAAxxxxxxxxxxxxxxxx 备注名
`;

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((item) => {
    const normalized = path.normalize(item).toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function getDesktopHighlightUsersFileCandidates(): string[] {
  const home = os.homedir();
  const oneDriveRoots = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    path.join(home, 'OneDrive'),
  ].filter((item): item is string => Boolean(item));
  return uniquePaths([
    path.join(home, 'Desktop', HIGHLIGHT_USERS_FILE_NAME),
    ...oneDriveRoots.flatMap((root) => [
      path.join(root, 'Desktop', HIGHLIGHT_USERS_FILE_NAME),
      path.join(root, '桌面', HIGHLIGHT_USERS_FILE_NAME),
    ]),
  ]);
}

function getDesktopHighlightUsersFilePath(): string {
  const candidates = getDesktopHighlightUsersFileCandidates();
  const oneDriveCandidates = candidates.filter((candidate) => /[\\/]OneDrive(?:[\\/]|$)/iu.test(candidate));
  const creationCandidates = uniquePaths([...oneDriveCandidates, ...candidates]);
  return (
    candidates.find((candidate) => existsSync(candidate)) ??
    creationCandidates.find((candidate) => existsSync(path.dirname(candidate))) ??
    candidates[0]
  );
}

async function ensureHighlightUsersFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, HIGHLIGHT_USERS_TEMPLATE, { encoding: 'utf8', flag: 'wx' });
  } catch (writeError) {
    const nodeError = writeError as NodeJS.ErrnoException;
    if (nodeError.code !== 'EEXIST') {
      throw writeError;
    }
  }
}

function countReplacementCharacters(value: string): number {
  return (value.match(/\uFFFD/gu) ?? []).length;
}

function decodeHighlightUsersFile(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }

  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  const gb18030Text = new TextDecoder('gb18030').decode(buffer);
  return countReplacementCharacters(gb18030Text) < countReplacementCharacters(utf8Text)
    ? gb18030Text
    : utf8Text;
}
function normalizeHighlightUserIdToken(value: string): string {
  const normalized = normalizeWhitespace(value).replace(/\uFF1A/gu, ':');
  const labeled = normalized.match(/^(?:user\s*id|userid|\u7528\u6237\s*id|\u7528\u6237id|\u6296\u97F3\u53F7|uid)\s*:\s*(.+)$/iu);
  const source = normalizeWhitespace(labeled?.[1] ?? normalized);
  return extractDouyinUserId(source) || source;
}

function normalizeHighlightIdentityToken(value: string | undefined): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }
  return normalizeHighlightComparable(extractDouyinUserId(normalized) || normalized);
}

function parseHighlightUsersFile(content: string): HighlightUserConfig[] {
  const seen = new Set<string>();
  return content
    .split(/\r?\n/u)
    .map((line, index) => {
      const normalized = line.trim();
      if (!normalized || normalized.startsWith('#')) {
        return undefined;
      }
      const labeledLine = normalized
        .replace(/\uFF1A/gu, ':')
        .match(/^(?:user\s*id|userid|\u7528\u6237\s*id|\u7528\u6237id|\u6296\u97F3\u53F7|uid)\s*:\s*(\S+)(?:\s+(.*))?$/iu);
      const [rawUserId, ...remarkParts] = normalized.split(/\s+/u);
      const trimmedUserId = normalizeHighlightUserIdToken(labeledLine?.[1] ?? rawUserId);
      if (!trimmedUserId || seen.has(trimmedUserId)) {
        return undefined;
      }
      seen.add(trimmedUserId);
      const remark = normalizeWhitespace(labeledLine?.[2] ?? remarkParts.join(' '));
      const item: HighlightUserConfig = {
        userId: trimmedUserId,
        line: index + 1,
      };
      if (remark) {
        item.remark = remark;
      }
      return item;
    })
    .filter((item): item is HighlightUserConfig => Boolean(item));
}

function normalizeHighlightComparable(value: string | undefined): string {
  return normalizeWhitespace(value).normalize('NFKC').toLowerCase();
}

function escapeHighlightPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function highlightPatternMatches(candidate: string, pattern: string): boolean {
  if (!candidate || !pattern) {
    return false;
  }
  if (!pattern.includes('*')) {
    return candidate === pattern;
  }

  const regexSource = pattern.split('*').map(escapeHighlightPattern).join('.*');
  return new RegExp(`^${regexSource}$`, 'iu').test(candidate);
}

type HighlightEventMatch = {
  user: HighlightUserConfig;
  matchedBy: string;
  matchedValue: string;
  source: 'event' | 'payload' | 'identity_cache_backfill';
};

function getHighlightEventMatch(event: LiveEvent, user: HighlightUserConfig): HighlightEventMatch | undefined {
  const targetId = normalizeHighlightIdentityToken(user.userId);
  if (!targetId) {
    return undefined;
  }

  let payloadUserId: string | undefined;
  let payloadUserLink: string | undefined;
  let payloadLinkUserId: string | undefined;
  let identityBackfilled = false;
  try {
    const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as RawCollectorEvent) : undefined;
    payloadUserId = normalizeWhitespace(payload?.userId);
    payloadUserLink = normalizeWhitespace(payload?.userLink);
    payloadLinkUserId = extractDouyinUserId(payload?.userLink);
    identityBackfilled = payload?.identityBackfillSource === 'identity_cache';
  } catch {
    payloadUserId = undefined;
    payloadUserLink = undefined;
    payloadLinkUserId = undefined;
    identityBackfilled = false;
  }
  const candidates: Array<{ matchedBy: string; value?: string }> = [
    { matchedBy: 'event.userId', value: event.userId },
    { matchedBy: 'event.userLink', value: event.userLink },
    { matchedBy: 'event.userLink.sec_uid', value: extractDouyinUserId(event.userLink) },
    { matchedBy: 'payload.userId', value: payloadUserId },
    { matchedBy: 'payload.userLink', value: payloadUserLink },
    { matchedBy: 'payload.userLink.sec_uid', value: payloadLinkUserId },
  ];
  for (const candidate of candidates) {
    const normalized = normalizeHighlightIdentityToken(candidate.value);
    if (normalized && highlightPatternMatches(normalized, targetId)) {
      return {
        user,
        matchedBy: candidate.matchedBy,
        matchedValue: normalized,
        source: identityBackfilled && candidate.matchedBy.startsWith('event.')
          ? 'identity_cache_backfill'
          : candidate.matchedBy.startsWith('payload.')
            ? 'payload'
            : 'event',
      };
    }
  }
  return undefined;
}

function isHighlightUserEvent(event: LiveEvent, user: HighlightUserConfig): boolean {
  return Boolean(getHighlightEventMatch(event, user));
}
async function clearBrowserProfileLocks(profileDir: string): Promise<void> {
  await Promise.all(
    ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'].map((name) =>
      rm(path.join(profileDir, name), { force: true, recursive: true }).catch(() => undefined),
    ),
  );
}
async function navigatePageReliably(page: Page, targetUrl: string): Promise<void> {
  const attempts: Array<{ waitUntil: 'domcontentloaded' | 'commit'; timeout: number }> = [
    { waitUntil: 'domcontentloaded', timeout: PAGE_GOTO_TIMEOUT_MS },
    { waitUntil: 'commit', timeout: PAGE_GOTO_TIMEOUT_MS },
  ];

  let lastError: unknown;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    try {
      await page.goto(targetUrl, attempt);
      await page.waitForLoadState('domcontentloaded', {
        timeout: PAGE_READY_TIMEOUT_MS,
      }).catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(900 * (index + 1)).catch(() => undefined);
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(`failed to open ${targetUrl}`));
}

async function minimizePageWindow(page: Page): Promise<void> {
  const context = page.context();
  const cdpSession = await context.newCDPSession(page);
  try {
    const { windowId } = await cdpSession.send('Browser.getWindowForTarget');
    if (typeof windowId === 'number') {
      await cdpSession.send('Browser.setWindowBounds', {
        windowId,
        bounds: { windowState: 'minimized' },
      });
    }
  } finally {
    await cdpSession.detach().catch(() => undefined);
  }
}

function isDirectDouyinProfileUrl(value: string | undefined): boolean {
  return /^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\/[^/?#]+/iu.test(String(value ?? '').trim());
}

function isDirectDouyinUserId(value: string | undefined): boolean {
  return /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(String(value ?? '').trim());
}

function extractDouyinUserId(value: string | undefined): string | undefined {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return undefined;
  }

  const pathMatched = normalized.match(/douyin\.com\/(?:user|follow)\/([^/?#]+)/iu);
  if (pathMatched?.[1]) {
    return decodeURIComponent(pathMatched[1]);
  }

  const queryMatched = normalized.match(/[?&](?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId)=([^&#"'&\s]+)/iu);
  if (queryMatched?.[1]) {
    return decodeURIComponent(queryMatched[1]);
  }

  const attributeMatched = normalized.match(/(?:^|[\s"'=:{,])(?:sec_uid|secUid|modal_id|modalId|user_id|userId|user_unique_id|userUniqueId|open_id|openId|webcast_uid|webcastUid|from_user_id|fromUserId|to_user_id|toUserId|anchor_id|anchorId|data-user-id|data-userid|data-sec-user-id|data-sec-uid|data-user-unique-id|data-user-uniqueid|data-open-id|data-openid|data-webcast-uid|uid)["']?\s*[:=]\s*["']?([^"',\s}<>]+)/iu);
  if (attributeMatched?.[1]) {
    return decodeURIComponent(attributeMatched[1]);
  }

  if (/^\d{5,}$/u.test(normalized)) {
    return normalized;
  }

  return isDirectDouyinUserId(normalized) ? normalized : undefined;
}

function normalizeDouyinProfileUrl(value: string | undefined, fallbackUserId?: string): string | undefined {
  const normalized = normalizeWhitespace(value);
  if (normalized) {
    if (isDirectDouyinProfileUrl(normalized)) {
      return normalized;
    }
    if (normalized.startsWith('//')) {
      const absoluteUrl = `https:${normalized}`;
      if (isDirectDouyinProfileUrl(absoluteUrl)) {
        return absoluteUrl;
      }
    }
    if (normalized.startsWith('/')) {
      const absoluteUrl = `https://www.douyin.com${normalized}`;
      if (isDirectDouyinProfileUrl(absoluteUrl)) {
        return absoluteUrl;
      }
    }
  }

  if (isDirectDouyinUserId(fallbackUserId)) {
    return `https://www.douyin.com/user/${encodeURIComponent(String(fallbackUserId).trim())}`;
  }

  return undefined;
}

function normalizeUserLookupName(value: string | undefined): string {
  return normalizeWhitespace(value).replace(/^@+/u, '');
}

function extractLookupNamesFromText(value: string | undefined): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }

  const results: string[] = [];
  const push = (candidate: string | undefined) => {
    const normalizedCandidate = normalizeUserLookupName(candidate);
    if (!normalizedCandidate || results.includes(normalizedCandidate)) {
      return;
    }
    results.push(normalizedCandidate);
  };

  const actionMatched = normalized.match(
    /^(.{1,24}?)(?:\u8FDB\u5165\u76F4\u64AD\u95F4|\u6765\u4E86|\u8FDB\u5165\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u76F4\u64AD|\u70B9\u8D5E|\u5173\u6CE8|\u5206\u4EAB\u4E86\u76F4\u64AD\u95F4|\u52A0\u5165\u4E86\u7C89\u4E1D\u56E2.*|\u70B9\u4EAE\u4E86\u706F\u724C.*|\u4E3A\u4E3B\u64AD\u52A0\u4E86\s*\d+\s*\u5206|\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001)/u,
  );
  if (actionMatched?.[1]) {
    push(actionMatched[1]);
  }

  const arrowMatched = normalized.match(/^(.{1,24})\s*->\s*.+$/u);
  if (arrowMatched?.[1]) {
    push(arrowMatched[1]);
  }

  const colonMatched = normalized.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*.+$/u);
  if (colonMatched?.[1]) {
    push(colonMatched[1]);
  }

  return results;
}

function collectUserLookupNames(input: {
  userName?: string;
  rawText?: string;
  message?: string;
}): string[] {
  const results: string[] = [];
  const push = (candidate: string | undefined) => {
    const normalizedCandidate = normalizeUserLookupName(candidate);
    if (!normalizedCandidate || results.includes(normalizedCandidate)) {
      return;
    }
    results.push(normalizedCandidate);
  };

  push(input.userName);
  for (const candidate of extractLookupNamesFromText(input.rawText)) {
    push(candidate);
  }
  for (const candidate of extractLookupNamesFromText(input.message)) {
    push(candidate);
  }

  return results;
}

function buildDouyinUserSearchUrl(userName: string | undefined): string | undefined {
  const normalized = normalizeUserLookupName(userName);
  if (!normalized) {
    return undefined;
  }

  return `https://www.douyin.com/search/${encodeURIComponent(normalized)}?type=user`;
}

function extractCommentUserNameFromText(value: string | undefined): string {
  const normalized = normalizeWhitespace(value);
  const matched = normalized.match(/^([^:\uFF1A]{1,24})[:\uFF1A]\s*(.+)$/u);
  if (!matched || !isPlausibleCommentUserName(matched[1])) {
    return '';
  }
  return normalizeWhitespace(matched[1]);
}

function isUnsafeGiftIdentityFallbackName(value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return true;
  }

  return /^(?:神秘人(?:一阶|二阶|三阶|四阶|\d+)?|神秘王者(?:一阶|二阶|三阶|四阶|\d+)?|用户\d{5,}|匿名用户)$/u.test(normalized) ||
    /(?:贡献用户|贡献排名|在线观众\s*top\s*\d+)/iu.test(normalized);
}

function isSafeIdentityCacheName(value: string | undefined): boolean {
  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length > 40 || /^\d+$/u.test(normalized)) {
    return false;
  }
  return !isUnsafeGiftIdentityFallbackName(normalized);
}

function getKnownIdentityLookupNames(input: {
  userName?: string;
  rawText?: string;
  message?: string;
}): string[] {
  return collectUserLookupNames(input).filter((name) => !isUnsafeGiftIdentityFallbackName(name));
}

function buildIdentityObservationKey(input: {
  sessionId: string;
  roomId?: string;
  userName?: string;
  userId?: string;
  userLink?: string;
}): string {
  return [
    input.sessionId,
    normalizeWhitespace(input.roomId),
    normalizeWhitespace(input.userName),
    normalizeWhitespace(input.userId),
    normalizeWhitespace(input.userLink),
  ].join('|');
}

function isSelfDouyinProfileUrl(value: string | undefined): boolean {
  return /\/user\/self(?:[/?#]|$)/iu.test(String(value ?? '').trim());
}

function isResolvableDouyinProfileUrl(value: string | undefined): boolean {
  const normalized = normalizeDouyinProfileUrl(value);
  return Boolean(normalized) && !isSelfDouyinProfileUrl(normalized);
}

export class CaptureService {
  private collector: DouyinCollector | null = null;
  private loginContext: BrowserContext | null = null;
  private loginPage: Page | null = null;
  private activeSession: SessionRecord | null = null;
  private room: RoomSnapshot | null = null;
  private cachedLoginState: LoginState = { loggedIn: false };
  private lastLoginIdentityRefreshAt = 0;
  private autoStoppingForRoomEnd = false;
  private recentCollectorFingerprints = new Map<string, number>();
  private recentGiftFingerprints = new Map<string, RecentGiftFingerprint>();
  private recentGiftCombos = new Map<string, RecentGiftComboState>();
  private liveStats: LiveStatsState | null = null;
  private liveStatsUserKeys = new Set<string>();
  private eventPersistQueue: Promise<void> = Promise.resolve();
  private identityObservationKeys = new Set<string>();
  private highlightMatchDiagnosticKeys = new Set<string>();
  private lastCollectorDuplicateReason: string | undefined;
  private collectorEventSequence = 0;
  private collectorIngestSequence = 0;

  readonly bus = new EventBus();

  constructor(private readonly db: AppDatabase) {
    this.db.markRunningSessionsInterrupted(nowIso(), '应用重启后已自动结束，请重新登录后开始采集。');
    this.activeSession = null;
    this.room = null;
  }

  async start(url: string): Promise<SessionRecord> {
    if (this.collector || this.activeSession?.status === 'running') {
      throw new Error('已有采集会话正在运行，请先停止当前会话。');
    }

    const targetUrl = normalizeAllowedDouyinLiveUrl(url);
    if (!targetUrl) {
      throw new Error('只允许采集抖音直播间 HTTPS 地址。');
    }
    const loginState = await this.ensureAuthenticated(targetUrl);
    if (!loginState.loggedIn) {
      throw new Error('请先点击“登录抖音”完成登录，再开始采集。');
    }

    const startedAt = nowIso();
    const session: SessionRecord = {
      id: nanoid(10),
      url: targetUrl,
      status: 'running',
      roomId: extractRoomIdFromUrl(targetUrl),
      roomTitle: '',
      hostName: '',
      startedAt,
      lastHeartbeatAt: startedAt,
    };

    this.db.createSession(session);
    this.activeSession = session;
    this.autoStoppingForRoomEnd = false;
    this.recentCollectorFingerprints.clear();
    this.recentGiftFingerprints.clear();
    this.recentGiftCombos.clear();
    this.collectorEventSequence = 0;
    this.collectorIngestSequence = 0;
    this.liveStats = createEmptyLiveStats(session.id);
    this.liveStatsUserKeys.clear();
    this.identityObservationKeys.clear();
    this.room = {
      url: targetUrl,
      roomId: session.roomId,
      roomTitle: '',
      hostName: loginState.profileDisplayName ?? '',
      isLive: true,
      lastHeartbeatAt: startedAt,
    };

    const reuseLoginWindow = Boolean(this.loginContext && this.loginPage && !this.loginPage.isClosed());

    const { DouyinCollector } = await loadCollectorModule();
    this.collector = new DouyinCollector(
      targetUrl,
      config.browserProfileDir,
      {
        onEvents: async (events: RawCollectorEvent[]) => {
          const sessionId = this.activeSession?.id;
          if (!sessionId) {
            return;
          }
          commentDiagnostics.increment('service.onEvents.batches');
          commentDiagnostics.increment('service.raw_received', events.length);
          commentDiagnostics.increment(
            'service.raw_comment_received',
            events.filter((event) => (event.category ?? classifyText(event.text)) === 'comment').length,
          );
          const nextPersist = this.eventPersistQueue.then(() => this.persistCollectorEvents(events, sessionId));
          this.eventPersistQueue = nextPersist.catch(() => undefined);
          await nextPersist;
        },
        onStatus: async (message: string, level: 'info' | 'warn' | 'error' = 'info') => {
          await this.persistLog(message, level);
        },
        onRoomUpdate: async (snapshot: Partial<RoomSnapshot>) => {
          this.room = {
            url: snapshot.url ?? this.room?.url ?? targetUrl,
            roomId: snapshot.roomId ?? this.room?.roomId,
            roomTitle: snapshot.roomTitle ?? this.room?.roomTitle,
            hostName: snapshot.hostName ?? this.room?.hostName,
            isLive: snapshot.isLive ?? this.room?.isLive ?? true,
            lastHeartbeatAt: snapshot.lastHeartbeatAt ?? nowIso(),
          };

          if (this.activeSession) {
            this.activeSession = {
              ...this.activeSession,
              roomId: this.room.roomId,
              roomTitle: this.room.roomTitle,
              hostName: this.room.hostName,
              lastHeartbeatAt: this.room.lastHeartbeatAt,
            };
            this.db.updateSession(this.activeSession.id, this.activeSession);
            this.bus.publish({ type: 'session', payload: this.getRuntimeSnapshot() });
          }

          if (
            this.activeSession?.status === 'running' &&
            this.room?.isLive === false &&
            !this.autoStoppingForRoomEnd
          ) {
            this.autoStoppingForRoomEnd = true;
            try {
              await this.persistLog('主播已关播，自动停止采集', 'warn');
              await this.finalizeAndMaybeSave({ status: 'stopped', autoSave: 'offline' });
            } finally {
              this.autoStoppingForRoomEnd = false;
            }
          }
        },
        onPageRestart: async (page: Page) => {
          if (reuseLoginWindow) {
            this.loginPage = page;
          }
        },
        onFatal: async (error: Error) => {
          await this.finalizeSession('error', error.message);
        },
      },
      reuseLoginWindow
        ? {
            context: this.loginContext ?? undefined,
            page: this.loginPage ?? undefined,
            ownsContext: false,
          }
        : undefined,
    );

    try {
      await this.collector.start();
      if (reuseLoginWindow && this.loginPage && !this.loginPage.isClosed()) {
        await minimizePageWindow(this.loginPage).catch(() => undefined);
      }
      this.bus.publish({ type: 'session', payload: this.getRuntimeSnapshot() });
      return this.activeSession;
    } catch (error) {
      await this.finalizeSession('error', error instanceof Error ? error.message : '采集启动失败');
      throw error;
    }
  }

  async stop(options: { autoSave?: AutoSaveTarget } = {}): Promise<void> {
    await this.finalizeAndMaybeSave({ status: 'stopped', autoSave: options.autoSave });
  }

  private async finalizeAndMaybeSave(options: {
    status: 'stopped' | 'error';
    errorMessage?: string;
    autoSave?: AutoSaveTarget;
  }): Promise<void> {
    if (!this.collector && !this.activeSession) {
      return;
    }

    const collector = this.collector;
    const session = this.activeSession;
    this.collector = null;
    await collector?.stop();
    await this.eventPersistQueue.catch(() => undefined);
    await this.finalizeSession(options.status, options.errorMessage);

    if (session && options.autoSave) {
      await this.autoSaveSessionWorkbook(session, options.autoSave);
    }
  }

  getRuntimeSnapshot(): RuntimeSnapshot {
    return {
      activeSession: this.activeSession,
      room: this.room,
    };
  }

  async getBrowserState(): Promise<{
    loginWindowOpen: boolean;
    loggedIn: boolean;
    profileDisplayName?: string;
    chromiumInstall: { status: 'idle' | 'installing' | 'ready' | 'error' };
  }> {
    const context = this.loginContext;
    if (context) {
      try {
        const previousState = this.cachedLoginState;
        const lightweightState = await this.readLightweightLoginState(context);
        this.cachedLoginState = lightweightState;

        const shouldRefreshIdentity =
          lightweightState.loggedIn &&
          (!previousState.loggedIn || !isUsableProfileDisplayName(lightweightState.profileDisplayName)) &&
          Date.now() - this.lastLoginIdentityRefreshAt >= 3000;

        if (shouldRefreshIdentity && this.loginContext === context) {
          this.lastLoginIdentityRefreshAt = Date.now();
          const page =
            this.loginPage && !this.loginPage.isClosed()
              ? this.loginPage
              : context.pages()[0] ?? (await context.newPage());
          this.cachedLoginState = await this.inspectLoginState({
            context,
            page,
          });
        }
      } catch (error) {
        await this.resetLoginContext(context);
      }
    }

    return {
      loginWindowOpen: Boolean(this.loginContext),
      loggedIn: this.cachedLoginState.loggedIn,
      profileDisplayName: isUsableProfileDisplayName(this.cachedLoginState.profileDisplayName) ? this.cachedLoginState.profileDisplayName : undefined,
      chromiumInstall: this.loginContext
        ? (await loadPlaywrightRuntime()).getChromiumInstallState()
        : IDLE_CHROMIUM_INSTALL_STATE,
    };
  }

  async resolveUserProfile(input: {
    userName?: string;
    userId?: string;
    userLink?: string;
    rawText?: string;
    message?: string;
  }): Promise<{ url?: string }> {
    const directUserId = normalizeWhitespace(input.userId) || extractDouyinUserId(input.userLink);
    const directUserLink = normalizeDouyinProfileUrl(input.userLink, directUserId);
    if (isResolvableDouyinProfileUrl(directUserLink)) {
      return { url: directUserLink };
    }

    const lookupNames = collectUserLookupNames(input);
    if (!lookupNames.length) {
      return {};
    }

    for (const userName of lookupNames) {
      const knownIdentity = this.db.getLatestKnownUserIdentity(
        this.activeSession?.id ?? '__global__',
        userName,
        this.room?.roomId,
      );
      const knownUserId =
        normalizeWhitespace(knownIdentity?.userId) ||
        extractDouyinUserId(knownIdentity?.userLink);
      const knownUserLink = normalizeDouyinProfileUrl(knownIdentity?.userLink, knownUserId);
      if (isResolvableDouyinProfileUrl(knownUserLink)) {
        return { url: knownUserLink };
      }
    }

    const context = this.collector?.context ?? this.loginContext;
    if (!context) {
      return {};
    }

    for (const userName of lookupNames) {
      const resolvedUrl = await this.resolveUserProfileViaSearch(context, userName);
      if (resolvedUrl) {
        return { url: resolvedUrl };
      }
    }

    return {};
  }

  async openUserProfile(input: {
    userName?: string;
    userId?: string;
    userLink?: string;
    rawText?: string;
    message?: string;
  }): Promise<{ ok: boolean; url?: string }> {
    const resolved = await this.resolveUserProfile(input);
    const targetUrl = normalizeDouyinProfileUrl(resolved.url);
    const context = this.collector?.context ?? this.loginContext;
    if (!isResolvableDouyinProfileUrl(targetUrl)) {
      const fallbackSearchUrl = buildDouyinUserSearchUrl(collectUserLookupNames(input)[0]);
      if (!fallbackSearchUrl) {
        return { ok: false };
      }
      if (!context) {
        return { ok: false, url: fallbackSearchUrl };
      }

      try {
        const searchPage = await context.newPage();
        await navigatePageReliably(searchPage, fallbackSearchUrl);
        await searchPage.bringToFront().catch(() => undefined);
        return { ok: true, url: fallbackSearchUrl };
      } catch {
        return { ok: false, url: fallbackSearchUrl };
      }
    }

    if (!context) {
      return { ok: false, url: targetUrl };
    }

    const resolvedTargetUrl = targetUrl!;
    let openedPage: Page | null = null;
    try {
      const targetPage = await context.newPage();
      openedPage = targetPage;
      await navigatePageReliably(targetPage, resolvedTargetUrl);
      await targetPage.bringToFront().catch(() => undefined);
      return { ok: true, url: resolvedTargetUrl };
    } catch {
      await openedPage?.close().catch(() => undefined);
      return { ok: false, url: resolvedTargetUrl };
    }
  }

  async openLoginWindow(url?: string): Promise<void> {
    if (this.collector || this.activeSession?.status === 'running') {
      throw new Error('采集中无法打开登录窗口，请先停止当前采集。');
    }

    const targetUrl = normalizeAllowedDouyinEntryUrl(url || 'https://www.douyin.com/');
    if (!targetUrl) {
      throw new Error('只允许打开抖音 HTTPS 页面。');
    }

    if (this.loginContext) {
      const existingContext = this.loginContext;
      try {
        const page = this.loginPage && !this.loginPage.isClosed()
          ? this.loginPage
          : existingContext.pages()[0] ?? (await existingContext.newPage());
        this.loginPage = page;
        await navigatePageReliably(page, targetUrl);
        await page.bringToFront().catch(() => undefined);
        this.cachedLoginState = await this.inspectLoginState({
          context: existingContext,
          page,
          targetUrl,
        });
        return;
      } catch {
        await this.resetLoginContext(existingContext);
      }
    }

    const { chromium, ensureChromiumExecutablePath } = await loadPlaywrightRuntime();
    const executablePath = await ensureChromiumExecutablePath();
    const launchOptions = {
      executablePath,
      headless: false,
      serviceWorkers: 'block' as const,
      viewport: { width: 1440, height: 960 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling',
      ],
    };
    await clearBrowserProfileLocks(config.browserProfileDir);
    try {
      this.loginContext = await chromium.launchPersistentContext(config.browserProfileDir, launchOptions);
    } catch (error) {
      const fallbackProfileDir = path.join(config.storageRoot, 'browser-profile-fallback');
      await clearBrowserProfileLocks(fallbackProfileDir);
      this.loginContext = await chromium.launchPersistentContext(fallbackProfileDir, launchOptions).catch(() => {
        throw error;
      });
      this.cachedLoginState = { loggedIn: false };
    }

    this.loginContext.on('close', () => {
      this.loginContext = null;
      this.loginPage = null;
    });

    this.loginPage = this.loginContext.pages()[0] ?? (await this.loginContext.newPage());
    this.loginPage.on('close', () => {
      this.loginPage = null;
    });

    await navigatePageReliably(this.loginPage, targetUrl);
    await this.loginPage.bringToFront().catch(() => undefined);

    this.cachedLoginState = await this.inspectLoginState({
      context: this.loginContext,
      page: this.loginPage,
      targetUrl,
    });
  }

  async closeLoginWindow(): Promise<void> {
    if (this.collector || this.activeSession?.status === 'running') {
      throw new Error('采集中无法关闭登录窗口，请先停止当前采集。');
    }

    const context = this.loginContext;
    await this.resetLoginContext(context);
  }

  private async resetLoginContext(context?: BrowserContext | null): Promise<void> {
    if (!context || this.loginContext === context) {
      this.loginContext = null;
      this.loginPage = null;
      this.cachedLoginState = { loggedIn: false };
    }
    await context?.close().catch(() => undefined);
  }

  getSessions(limit = 20): SessionRecord[] {
    return this.db.listSessions(limit);
  }

  getEvents(query: EventQuery): LiveEvent[] {
    return this.db.getEvents(query);
  }

  getEventHistory(query: EventHistoryQuery): EventHistoryResult {
    return this.db.getEventHistory(query);
  }

  getStats(sessionId?: string): SessionStats {
    const targetSessionId = sessionId ?? this.activeSession?.id;
    if (!targetSessionId) {
      return {
        comments: 0,
        entries: 0,
        interactions: 0,
        gifts: 0,
        giftUnits: 0,
        logs: 0,
        uniqueUsers: 0,
        topGifts: [],
        activeUsers: [],
      };
    }

    if (this.activeSession?.id === targetSessionId && this.liveStats?.sessionId === targetSessionId) {
      return toSessionStatsSnapshot(this.liveStats);
    }
    return this.db.getStats(targetSessionId);
  }

  async getHighlightUsers(query: HighlightUsersQuery = {}): Promise<HighlightUsersSnapshot> {
    const filePath = getDesktopHighlightUsersFilePath();
    const updatedAt = new Date().toISOString();
    let users: HighlightUserConfig[] = [];
    let exists = existsSync(filePath);
    let error: string | undefined;

    try {
      await ensureHighlightUsersFile(filePath);
      exists = true;
      const fileContent = decodeHighlightUsersFile(await readFile(filePath));
      users = parseHighlightUsersFile(fileContent);
    } catch (readError) {
      const nodeError = readError as NodeJS.ErrnoException;
      exists = existsSync(filePath);
      if (nodeError.code === 'ENOENT') {
        exists = false;
      } else {
        error = nodeError.message || '读取特别关注文件失败';
      }
    }

    const includeMatched = query.includeMatched ?? true;
    const targetSessionId = query.sessionId ?? this.activeSession?.id;
    const matchedEvents =
      includeMatched && targetSessionId && users.length
        ? this.db.getHighlightMatchedEvents(targetSessionId, users, 80)
        : [];
    if (targetSessionId && users.length && matchedEvents.length) {
      this.recordHighlightMatchDiagnostics(targetSessionId, matchedEvents, users);
    }

    return {
      filePath,
      exists,
      users,
      matchedEvents,
      updatedAt,
      error,
    };
  }

  async exportSessionWorkbook(sessionId?: string): Promise<{ fileName: string; buffer: Buffer }> {
    const targetSessionId = sessionId ?? this.activeSession?.id ?? this.db.getLatestSessionId();
    if (!targetSessionId) {
      throw new Error('没有可导出的会话。');
    }

    const session = this.db.getSessionById(targetSessionId);
    if (!session) {
      throw new Error('会话不存在。');
    }

    const stats = this.db.getStats(targetSessionId);
    const events = this.db.getExportEventsForSession(targetSessionId);
    const { buildWorkbookBuffer } = await import('./exporter.js');
    const buffer = await buildWorkbookBuffer(session, stats, events);
    const fileName = `douyin-live-${targetSessionId}.xlsx`;

    return { fileName, buffer };
  }

  private async autoSaveSessionWorkbook(session: SessionRecord, target: AutoSaveTarget): Promise<void> {
    const outputPath = resolveAutoExportOutputPath(session, target);
    try {
      const { buffer } = await this.exportSessionWorkbook(session.id);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, buffer);
      await this.persistSessionLog(session.id, `Excel 自动保存成功：${outputPath}`, 'info').catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.persistSessionLog(session.id, `Excel 自动保存失败：${message}`, 'error').catch(() => undefined);
    }
  }

  async shutdown(): Promise<void> {
    await this.stop();
    await this.closeLoginWindow();
    this.db.close();
  }

  private async resolveUserProfileViaSearch(
    context: BrowserContext,
    userName: string,
  ): Promise<string | undefined> {
    const normalizedUserName = normalizeUserLookupName(userName);
    if (!normalizedUserName) {
      return undefined;
    }

    let page: Page | null = null;
    try {
      page = await context.newPage();
      await page.goto(`https://www.douyin.com/search/${encodeURIComponent(normalizedUserName)}?type=user`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(1600);
      await page
        .waitForFunction(
          () =>
            Boolean(document.querySelector('a[href*="/user/"],a[href*="sec_uid="],a[href*="/follow/"]')),
          { timeout: 4000 },
        )
        .catch(() => undefined);

      const resolvedUrl = await page.evaluate((targetUserName) => {
        const normalize = (value: unknown) =>
          String(value ?? '')
            .replace(/\s+/g, '')
            .replace(/^@+/u, '')
            .trim();
        const toAbsoluteProfileUrl = (value: unknown) => {
          const normalizedValue = String(value ?? '').trim();
          if (!normalizedValue) {
            return '';
          }
          if (/^https?:\/\//iu.test(normalizedValue)) {
            return normalizedValue;
          }
          if (normalizedValue.startsWith('//')) {
            return `https:${normalizedValue}`;
          }
          if (normalizedValue.startsWith('/')) {
            return `https://www.douyin.com${normalizedValue}`;
          }
          return '';
        };
        const isDirectProfileUrl = (value: string) =>
          /^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\/[^/?#]+/iu.test(value);
        const isSelfProfileUrl = (value: string) => /\/user\/self(?:[/?#]|$)/iu.test(value);
        const target = normalize(targetUserName);
        const anchors = Array.from(
          document.querySelectorAll('a[href*="/user/"],a[href*="sec_uid="],a[href*="/follow/"]'),
        ).slice(0, 80);
        const candidates = anchors
          .map((anchor) => {
            if (!(anchor instanceof HTMLElement)) {
              return null;
            }
            const href =
              anchor instanceof HTMLAnchorElement ? anchor.href : anchor.getAttribute('href') || '';
            const absoluteHref = toAbsoluteProfileUrl(href);
            if (!isDirectProfileUrl(absoluteHref) || isSelfProfileUrl(absoluteHref)) {
              return null;
            }
            const container =
              anchor.closest('[data-e2e],[class*="user"],[class*="card"],[class*="search"],li,article,div') ||
              anchor.parentElement ||
              anchor;
            const rawName = [
              anchor.textContent,
              anchor.getAttribute('title'),
              anchor.getAttribute('aria-label'),
              container instanceof HTMLElement ? container.innerText : '',
            ]
              .map((value) => String(value ?? '').trim())
              .find((value) => value) || '';
            if (!rawName || /^(?:我|我的|个人中心|首页|关注)$/u.test(rawName)) {
              return null;
            }
            return {
              url: absoluteHref,
              normalizedName: normalize(rawName),
            };
          })
          .filter((candidate): candidate is { url: string; normalizedName: string } => Boolean(candidate));

        const exactMatched = candidates.find((candidate) => {
          if (!candidate.normalizedName || !target) {
            return false;
          }
          return (
            candidate.normalizedName === target ||
            candidate.normalizedName.startsWith(target) ||
            target.startsWith(candidate.normalizedName)
          );
        });
        return exactMatched?.url || undefined;
      }, normalizedUserName);

      return normalizeDouyinProfileUrl(resolvedUrl);
    } catch {
      return undefined;
    } finally {
      await page?.close().catch(() => undefined);
    }
  }

  private async ensureAuthenticated(targetUrl: string): Promise<LoginState> {
    if (!this.loginContext) {
      this.cachedLoginState = { loggedIn: false };
      return this.cachedLoginState;
    }

    this.cachedLoginState = await this.readLightweightLoginState(this.loginContext);
    if (this.cachedLoginState.loggedIn && !isUsableProfileDisplayName(this.cachedLoginState.profileDisplayName)) {
      this.lastLoginIdentityRefreshAt = Date.now();
      this.cachedLoginState = await this.inspectLoginState({
        context: this.loginContext,
        page: this.loginPage && !this.loginPage.isClosed() ? this.loginPage : this.loginContext.pages()[0],
        targetUrl,
      });
    }
    return this.cachedLoginState;
  }

  private async readLightweightLoginState(context: BrowserContext): Promise<LoginState> {
    const cookies = await context.cookies(['https://www.douyin.com', 'https://live.douyin.com']);
    const loggedIn = cookies.some(
      (cookie) =>
        ['sessionid', 'sessionid_ss', 'passport_auth_status', 'passport_auth_status_ss'].includes(
          cookie.name,
        ) && Boolean(cookie.value),
    );

    return {
      loggedIn,
      profileDisplayName: loggedIn && isUsableProfileDisplayName(this.cachedLoginState.profileDisplayName)
        ? this.cachedLoginState.profileDisplayName
        : undefined,
    };
  }

  private async inspectLoginState({
    context,
    page,
    targetUrl,
  }: {
    context: BrowserContext;
    page?: Page | null;
    targetUrl?: string;
  }): Promise<LoginState> {
    const target = page && !page.isClosed() ? page : context.pages()[0] ?? (await context.newPage());
    const urlToCheck = normalizeLiveUrl(targetUrl || target.url() || 'https://www.douyin.com/');

    if (!target.url() || !target.url().startsWith(urlToCheck)) {
      await navigatePageReliably(target, urlToCheck);
    }

    await target.waitForTimeout(800);

    const cookies = await context.cookies(['https://www.douyin.com', 'https://live.douyin.com']);
    const hasSessionCookie = cookies.some(
      (cookie) =>
        ['sessionid', 'sessionid_ss', 'passport_auth_status', 'passport_auth_status_ss'].includes(
          cookie.name,
        ) && Boolean(cookie.value),
    );

    const readLoginIdentity = async (probePage: Page) =>
      probePage.evaluate(() => {
      const normalize = (value: unknown) =>
        String(value ?? '')
          .replace(/\s+/g, ' ')
          .trim();

      const selfAnchor = document.querySelector('a[href*="/user/self"]');
      const bannedNames = new Set([
        '',
        '我的',
        '登录',
        '消息',
        '搜索',
        '发布',
        '发视频',
        '关注',
        '粉丝',
        '朋友',
        '推荐',
        '抖音',
      ]);
      const candidates: string[] = [];
      const isUsableCandidate = (candidate: string) =>
        !/^(?:我|我的|首页|关注|粉丝|朋友|推荐|个人中心|登录|消息|搜索|发布|发视频|抖音|退出登录|当前抖音账号|当前账号|未登录|精选)$/u.test(candidate);
      const pushCandidate = (value: unknown) => {
        const normalized = normalize(value);
        if (!normalized || normalized.length < 2 || normalized.length > 40) {
          return;
        }
        if (/(?:精选推荐|搜索关注朋友|直播放映厅|短剧|小游戏)/u.test(normalized)) {
          return;
        }
        if (['我的', '登录', '消息', '搜索', '发布', '发视频', '关注', '粉丝', '朋友', '推荐', '抖音'].includes(normalized)) {
          return;
        }
        if (/^(?:我的首页|个人中心|退出登录|关注|粉丝|朋友|推荐)$/u.test(normalized)) {
          return;
        }
        if (bannedNames.has(normalized)) {
          return;
        }
        if (/^(?:我的首页|个人中心|退出登录|关注|粉丝|朋友|推荐)$/u.test(normalized)) {
          return;
        }
        if (!candidates.includes(normalized)) {
          candidates.push(normalized);
        }
      };
      const scanValue = (value: unknown, depth = 0) => {
        if (depth > 3 || value == null) {
          return;
        }
        if (typeof value === 'string') {
          pushCandidate(value);
          return;
        }
        if (Array.isArray(value)) {
          for (const item of value.slice(0, 8)) {
            scanValue(item, depth + 1);
          }
          return;
        }
        if (typeof value === 'object') {
          const record = value as Record<string, unknown>;
          for (const key of [
            'nickname',
            'nick_name',
            'display_name',
            'displayName',
            'screen_name',
            'screenName',
            'name',
            'user_name',
            'userName',
          ]) {
            if (key in record) {
              scanValue(record[key], depth + 1);
            }
          }
        }
      };
      pushCandidate(normalize(document.title).replace(/(?:的抖音| - 抖音|_抖音).*$/u, ''));
      pushCandidate(selfAnchor?.textContent);
      const selfContainer =
        selfAnchor?.closest('header,nav,[role="navigation"],[class*="header"],[class*="nav"],[class*="top"]') ??
        selfAnchor?.parentElement ??
        null;
      if (selfContainer) {
        const nearbyNodes = Array.from(
          selfContainer.querySelectorAll('[title],[aria-label],img[alt],span,div,strong,b'),
        ).slice(0, 60);
        for (const node of nearbyNodes) {
          if (node instanceof HTMLImageElement) {
            pushCandidate(node.alt);
            continue;
          }
          if (node instanceof HTMLElement) {
            pushCandidate(node.getAttribute('title'));
            pushCandidate(node.getAttribute('aria-label'));
            pushCandidate(node.textContent);
          }
        }
      }
      for (const selector of [
        '[data-e2e*="user-name"]',
        '[data-e2e*="nickname"]',
        '[class*="user-name"]',
        '[class*="nickname"]',
      ]) {
        const node = document.querySelector(selector);
        if (node instanceof HTMLElement) {
          pushCandidate(node.textContent);
          pushCandidate(node.getAttribute('title'));
          pushCandidate(node.getAttribute('aria-label'));
        }
      }
      try {
        const storageKeys = Object.keys(window.localStorage).slice(0, 80);
        for (const key of storageKeys) {
          const raw = window.localStorage.getItem(key);
          if (!raw || !/(nickname|display.?name|screen.?name|user.?name|name)/iu.test(raw)) {
            continue;
          }
          try {
            scanValue(JSON.parse(raw));
          } catch {
            const matched = raw.match(
              /"(?:nickname|nick_name|display_name|displayName|screen_name|screenName|user_name|userName|name)"\s*:\s*"([^"]{2,40})"/iu,
            );
            if (matched) {
              pushCandidate(matched[1]);
            }
          }
        }
      } catch {
        // Ignore storage access failures on locked-down pages.
      }
      const preferredCandidate = candidates.find((candidate) => isUsableCandidate(candidate));
      const displayName = preferredCandidate || '';
      const bodyText = normalize(document.body?.innerText?.slice(0, 2000) || '');

      return {
        hasSelfAnchor: Boolean(selfAnchor),
        displayName,
        bodyText,
      };
      });

    let homepageState: { hasSelfAnchor: boolean; displayName: string; bodyText: string } = {
      hasSelfAnchor: false,
      displayName: '',
      bodyText: '',
    };
    let probePage: Page | null = null;
    try {
      probePage = await context.newPage();
      await navigatePageReliably(probePage, 'https://www.douyin.com/user/self');
      await probePage.waitForTimeout(800);
      homepageState = await readLoginIdentity(probePage);
    } catch {
      homepageState = {
        hasSelfAnchor: false,
        displayName: '',
        bodyText: '',
      };
    } finally {
      await probePage?.close().catch(() => undefined);
    }

    const currentPageState = await readLoginIdentity(target);
    const resolvedState = isUsableProfileDisplayName(homepageState.displayName) ? homepageState : currentPageState;
    const loggedIn = hasSessionCookie || homepageState.hasSelfAnchor || currentPageState.hasSelfAnchor;
    const profileDisplayName =
      (isUsableProfileDisplayName(homepageState.displayName) ? homepageState.displayName : undefined) ||
      (isUsableProfileDisplayName(currentPageState.displayName) ? currentPageState.displayName : undefined) ||
      (isUsableProfileDisplayName(this.cachedLoginState.profileDisplayName)
        ? this.cachedLoginState.profileDisplayName
        : undefined);

    return {
      loggedIn,
      profileDisplayName: loggedIn ? profileDisplayName : undefined,
    };
  }

  private async persistCollectorEvents(rawEvents: RawCollectorEvent[], expectedSessionId: string): Promise<void> {
    if (!this.activeSession || this.activeSession.id !== expectedSessionId) {
      commentDiagnostics.increment('service.session_mismatch_dropped', rawEvents.length);
      for (const raw of rawEvents) {
        if ((raw.category ?? classifyText(raw.text)) === 'comment') {
          this.recordCommentDiagnostic('service.persist', 'session_mismatch_dropped', expectedSessionId, raw);
        }
      }
      return;
    }

    commentDiagnostics.increment('service.persist.batches');
    commentDiagnostics.increment('service.persist.raw_items', rawEvents.length);
    const baseTime = Date.now();
    const sessionId = this.activeSession.id;
    const room = this.room;
    const rows: LiveEvent[] = [];
    const giftIdentityUpdates: LiveEvent[] = [];
    let rowOffset = 0;
    let commentSequence = 0;

    const expandedRawEvents = rawEvents.flatMap((raw) => this.expandCollectorEvent(raw));

    for (const raw of expandedRawEvents) {
      const category = raw.category ?? classifyText(raw.text);
      if (category === 'comment') {
        incrementCaptureLedger('ledger.comment.raw_received');
      } else if (category === 'gift') {
        incrementCaptureLedger('ledger.gift.raw_received');
      }
      if (category === 'comment') {
        this.recordCommentDiagnostic('service.persist', 'raw_comment_received', sessionId, raw);
      }
      const parsed = parseMessage({ ...raw, category });
      const parsedMessage =
        category === 'comment' ? stripImplausibleCommentPrefix(parsed.message) : parsed.message;
      const ignoreReason = this.getCollectorIgnoreReason(raw, parsedMessage, category);
      if (ignoreReason) {
        commentDiagnostics.increment(`service.ignored.${ignoreReason}`);
        if (category === 'comment') {
          incrementCaptureLedger('ledger.comment.filtered');
        } else if (category === 'gift') {
          incrementCaptureLedger('ledger.gift.filtered');
        }
        if (category === 'comment') {
          this.recordCommentDiagnostic('service.filter', `ignored.${ignoreReason}`, sessionId, raw, {
            category,
            message: parsedMessage,
          });
        }
        continue;
      }
      if (category === 'gift' && this.isMergedGiftNoise(raw, parsed)) {
        commentDiagnostics.increment('service.ignored.merged_gift_noise');
        incrementCaptureLedger('ledger.gift.filtered');
        continue;
      }
      const normalizedGift =
        category === 'gift'
          ? this.normalizeGiftComboDelta(raw, parsed, (value) => this.findKnownGiftIdentity(sessionId, room?.roomId, value))
          : { message: parsed.message, giftCount: parsed.giftCount };
      if (
        category !== 'gift' &&
        this.isRecentCollectorDuplicate(
          raw,
          category === 'comment' ? parsedMessage : normalizedGift.message,
          parsed.giftName,
          normalizedGift.giftCount,
          category,
        )
      ) {
        commentDiagnostics.increment(`service.deduped.${this.lastCollectorDuplicateReason ?? 'unknown'}`);
        if (category === 'comment') {
          incrementCaptureLedger('ledger.comment.deduped');
        }
        if (category === 'comment') {
          this.recordCommentDiagnostic('service.dedupe', `deduped.${this.lastCollectorDuplicateReason ?? 'unknown'}`, sessionId, raw, {
            category,
            message: parsedMessage,
          });
        }
        continue;
      }

      const createdAt = new Date(baseTime + rowOffset).toISOString();
      rowOffset += 1;
      const parsedUserName = normalizeWhitespace(parsed.userName);
      const rawUserName = normalizeWhitespace(raw.userName);
      const resolvedUserName =
        category === 'comment'
          ? parsedUserName || (isPlausibleCommentUserName(rawUserName) ? rawUserName : '') || undefined
          : parsedUserName || rawUserName || undefined;
      const rawUserLink = normalizeDouyinProfileUrl(raw.userLink, raw.userId);
      const rawUserId = normalizeWhitespace(raw.userId) || extractDouyinUserId(rawUserLink);
      if (
        (rawUserId || rawUserLink) &&
        isSafeIdentityCacheName(resolvedUserName)
      ) {
        const identityObservation = {
          sessionId,
          roomId: room?.roomId,
          userName: resolvedUserName,
          userId: rawUserId,
          userLink: rawUserLink,
          category,
          source: 'collector',
          observedAt: createdAt,
        };
        const identityObservationKey = buildIdentityObservationKey(identityObservation);
        if (!this.identityObservationKeys.has(identityObservationKey)) {
          this.identityObservationKeys.add(identityObservationKey);
          this.db.upsertUserIdentityObservation(identityObservation);
        }
      }
      let knownIdentity: { userId?: string; userLink?: string } | undefined;
      if (category === 'gift' && (!rawUserId || !rawUserLink)) {
        knownIdentity = this.findKnownGiftIdentity(sessionId, room?.roomId, {
          userName: resolvedUserName,
          rawText: raw.rawText,
          message: normalizedGift.message || parsed.message || raw.text,
        });
      }
      const knownUserId = normalizeWhitespace(knownIdentity?.userId);
      const knownLinkUserId = extractDouyinUserId(knownIdentity?.userLink);
      const resolvedUserId =
        rawUserId ||
        knownUserId ||
        knownLinkUserId ||
        undefined;
      const resolvedUserLink = normalizeDouyinProfileUrl(
        rawUserLink || knownIdentity?.userLink,
        resolvedUserId,
      );
      const payloadForStorage: RawCollectorEvent = {
        ...raw,
        ingestSeq: ++this.collectorIngestSequence,
        userName: resolvedUserName ?? raw.userName,
        userId: resolvedUserId ?? raw.userId,
        userLink: resolvedUserLink ?? raw.userLink,
        giftName: parsed.giftName ?? raw.giftName,
        giftCount: normalizedGift.giftCount ?? raw.giftCount,
      };
      if (category === 'gift' && knownIdentity && (!rawUserId || !rawUserLink) && (knownUserId || knownLinkUserId || knownIdentity.userLink)) {
        payloadForStorage.identityBackfillSource = 'identity_cache';
        payloadForStorage.identityBackfillMatchedName = resolvedUserName;
      }
      const payloadJson =
        category === 'comment'
          ? JSON.stringify({
              ...payloadForStorage,
              collectorSeq: ++this.collectorEventSequence,
              batchSeq: `${baseTime}-${commentSequence++}`,
            })
          : JSON.stringify(payloadForStorage);
      const giftDedupeRaw: RawCollectorEvent = {
        ...payloadForStorage,
        giftCount: Math.max(raw.giftCount || 0, parsed.giftCount || 0) || normalizedGift.giftCount,
      };
      const baseEvent: Omit<LiveEvent, 'uniqueKey'> = {
        sessionId,
        category,
        createdAt,
        roomId: room?.roomId,
        roomTitle: room?.roomTitle,
        hostName: room?.hostName,
        userName: resolvedUserName,
        userId: resolvedUserId,
        userLink: resolvedUserLink,
        message: (category === 'comment' ? parsedMessage : normalizedGift.message) || raw.text,
        giftName: parsed.giftName,
        giftCount: normalizedGift.giftCount,
        payloadJson,
      };

      const row = {
        ...baseEvent,
        uniqueKey: buildUniqueKey(baseEvent),
      };

      if (
        category === 'gift' &&
        this.isRecentCollectorDuplicate(
          giftDedupeRaw,
          normalizedGift.message || parsed.message || raw.text,
          parsed.giftName,
          normalizedGift.giftCount,
          category,
          row,
          giftIdentityUpdates,
        )
      ) {
        commentDiagnostics.increment(`service.deduped.${this.lastCollectorDuplicateReason ?? 'unknown'}`);
        incrementCaptureLedger('ledger.gift.deduped');
        continue;
      }

      rows.push(row);
      if (category === 'comment') {
        commentDiagnostics.increment('service.comment_parsed');
        commentDiagnostics.increment('service.row_built');
        commentDiagnostics.record({
          stage: 'service.row',
          reason: 'row_built',
          diagId: buildCommentDiagId(sessionId, row),
          sessionId,
          category,
          sourceId: raw.sourceId,
          uniqueKey: row.uniqueKey,
          message: row.message,
          rawText: raw.rawText,
          userName: row.userName,
          userId: row.userId,
          userLink: row.userLink,
        });
      }
    }

    const insertResult = this.db.insertEvents(rows);
    commentDiagnostics.increment('db.attempted', insertResult.attempted);
    commentDiagnostics.increment('db.inserted', insertResult.inserted);
    commentDiagnostics.increment('db.ignored_unique', insertResult.ignored);
    const commentRows = rows.filter((row) => row.category === 'comment');
    const persistedRows = rows.filter((_row, index) => insertResult.insertedIndexes.has(index));
    const insertedCommentCount = rows.filter(
      (row, index) => row.category === 'comment' && insertResult.insertedIndexes.has(index),
    ).length;
    const giftRows = rows.filter((row) => row.category === 'gift');
    const insertedGiftCount = rows.filter(
      (row, index) => row.category === 'gift' && insertResult.insertedIndexes.has(index),
    ).length;
    incrementCaptureLedger('ledger.comment.db_inserted', insertedCommentCount);
    incrementCaptureLedger('ledger.comment.db_ignored_unique', commentRows.length - insertedCommentCount);
    incrementCaptureLedger('ledger.gift.db_inserted', insertedGiftCount);
    incrementCaptureLedger('ledger.gift.db_ignored_unique', giftRows.length - insertedGiftCount);
    commentDiagnostics.increment('db.comment_attempted', commentRows.length);
    commentDiagnostics.increment('db.comment_inserted', insertedCommentCount);
    commentDiagnostics.increment('db.comment_ignored_unique', commentRows.length - insertedCommentCount);
    for (const [index, row] of rows.entries()) {
      if (row.category === 'comment') {
        commentDiagnostics.record({
          stage: 'db.insert',
          reason: insertResult.insertedIndexes.has(index) ? 'inserted' : 'ignored_unique',
          diagId: buildCommentDiagId(sessionId, row),
          sessionId,
          category: row.category,
          uniqueKey: row.uniqueKey,
          message: row.message,
          userName: row.userName,
          userId: row.userId,
          userLink: row.userLink,
        });
      }
    }
    const attemptedRowKeys = new Set(rows.map((row) => row.uniqueKey));
    const persistedGiftUpdates = Array.from(
      new Map(giftIdentityUpdates.filter((row) => !attemptedRowKeys.has(row.uniqueKey)).map((row) => [row.uniqueKey, row])).values(),
    );
    this.db.updateEventIdentities(persistedGiftUpdates);
    this.updateLiveStats(persistedRows);
    for (const row of persistedRows) {
      if (row.category === 'comment') {
        commentDiagnostics.increment('service.bus_published');
        incrementCaptureLedger('ledger.comment.bus_published');
        commentDiagnostics.record({
          stage: 'bus.publish',
          reason: 'service.bus_published',
          diagId: buildCommentDiagId(sessionId, row),
          sessionId,
          category: row.category,
          uniqueKey: row.uniqueKey,
          message: row.message,
          userName: row.userName,
          userId: row.userId,
          userLink: row.userLink,
        });
      } else if (row.category === 'gift') {
        incrementCaptureLedger('ledger.gift.bus_published');
      }
      this.bus.publish({ type: 'event', payload: row });
    }
    for (const row of persistedGiftUpdates) {
      incrementCaptureLedger('ledger.gift.identity_update_published');
      this.bus.publish({ type: 'event', payload: row });
    }
  }

  private updateLiveStats(rows: LiveEvent[]): void {
    if (!this.liveStats || !this.activeSession || this.liveStats.sessionId !== this.activeSession.id) {
      return;
    }
    for (const row of rows) {
      if (row.category === 'comment') {
        this.liveStats.comments += 1;
      } else if (row.category === 'entry') {
        this.liveStats.entries += 1;
      } else if (row.category === 'interaction') {
        this.liveStats.interactions += 1;
      } else if (row.category === 'gift') {
        this.liveStats.gifts += 1;
        this.liveStats.giftUnits += row.giftCount ?? 1;
        const giftName = normalizeWhitespace(row.giftName) || '未知礼物';
        this.liveStats.giftMap.set(giftName, (this.liveStats.giftMap.get(giftName) ?? 0) + (row.giftCount ?? 1));
      } else if (row.category === 'log') {
        this.liveStats.logs += 1;
      }

      if (row.category !== 'log') {
        const userKey = normalizeWhitespace(row.userLink || row.userName || row.userId);
        if (userKey && !this.liveStatsUserKeys.has(userKey)) {
          this.liveStatsUserKeys.add(userKey);
          this.liveStats.uniqueUsers += 1;
        }
      }

      if (!isMysteryStatsEvent(row)) {
        continue;
      }
      const identityKey = getMysteryIdentityKey(row);
      if (!identityKey) {
        continue;
      }
      const name = getMysteryDisplayNameFromEvent(row);
      const current = this.liveStats.activeUserMap.get(identityKey) ?? {
        name,
        total: 0,
        entryCount: 0,
        commentCount: 0,
        giftCount: 0,
        lastActiveAt: row.createdAt,
        userId: row.userId,
        userLink: row.userLink,
        activities: [],
      };
      current.name = current.name || name;
      current.total += 1;
      current.lastActiveAt = row.createdAt;
      current.userId = row.userId || current.userId;
      current.userLink = row.userLink || current.userLink;
      if (row.category === 'entry') {
        current.entryCount += 1;
      } else if (row.category === 'comment') {
        current.commentCount += 1;
      } else if (row.category === 'gift') {
        current.giftCount += 1;
      }
      if (row.category === 'entry' || row.category === 'interaction' || row.category === 'comment' || row.category === 'gift') {
        current.activities = [
          {
            category: row.category,
            createdAt: row.createdAt,
            message: row.message,
            giftName: row.giftName,
            giftCount: row.giftCount,
          },
          ...current.activities.filter((activity) => activity.createdAt !== row.createdAt || activity.message !== row.message),
        ].slice(0, 30);
      }
      this.liveStats.activeUserMap.set(identityKey, current);
      if (this.liveStats.activeUserMap.size > LIVE_STATS_ACTIVE_USER_LIMIT * 2) {
        const keepKeys = Array.from(this.liveStats.activeUserMap.entries())
          .sort((a, b) => String(b[1].lastActiveAt).localeCompare(String(a[1].lastActiveAt)))
          .slice(0, LIVE_STATS_ACTIVE_USER_LIMIT)
          .map(([key]) => key);
        const keepSet = new Set(keepKeys);
        for (const key of this.liveStats.activeUserMap.keys()) {
          if (!keepSet.has(key)) {
            this.liveStats.activeUserMap.delete(key);
          }
        }
      }
    }
  }

  private async persistLog(message: string, level: 'info' | 'warn' | 'error'): Promise<void> {
    if (!this.activeSession) {
      return;
    }

    await this.persistSessionLog(this.activeSession.id, message, level);
  }

  private async persistSessionLog(sessionId: string, message: string, level: 'info' | 'warn' | 'error'): Promise<void> {
    const session = this.activeSession?.id === sessionId ? this.activeSession : this.db.getSessionById(sessionId);
    if (!session) {
      return;
    }

    const baseEvent: Omit<LiveEvent, 'uniqueKey'> = {
      sessionId,
      category: 'log',
      createdAt: nowIso(),
      roomId: this.room?.roomId ?? session.roomId,
      roomTitle: this.room?.roomTitle ?? session.roomTitle,
      hostName: this.room?.hostName ?? session.hostName,
      message: toLogMessage(message, level),
      payloadJson: JSON.stringify({ level, message }),
    };

    const row: LiveEvent = {
      ...baseEvent,
      uniqueKey: buildUniqueKey(baseEvent),
    };

    this.db.insertEvents([row]);
    this.updateLiveStats([row]);
    this.bus.publish({ type: 'event', payload: row });
  }

  private async finalizeSession(status: 'stopped' | 'error', errorMessage?: string): Promise<void> {
    if (!this.activeSession) {
      return;
    }

    const endedAt = nowIso();
    const finished: SessionRecord = {
      ...this.activeSession,
      status,
      endedAt,
      lastHeartbeatAt: this.room?.lastHeartbeatAt ?? endedAt,
      errorMessage,
    };

    this.db.updateSession(finished.id, finished);
    this.activeSession = null;
    this.collector = null;
    this.liveStats = null;
    this.liveStatsUserKeys.clear();
    this.identityObservationKeys.clear();
    this.room = null;
    this.autoStoppingForRoomEnd = false;
    this.recentCollectorFingerprints.clear();
    this.recentGiftFingerprints.clear();
    this.recentGiftCombos.clear();
    this.bus.publish({ type: 'session', payload: this.getRuntimeSnapshot() });
  }

  private recordHighlightMatchDiagnostics(
    sessionId: string,
    events: LiveEvent[],
    users: HighlightUserConfig[],
  ): void {
    for (const row of events) {
      if (row.category !== 'comment' && row.category !== 'gift') {
        continue;
      }
      const match = users.map((user) => getHighlightEventMatch(row, user)).find(Boolean);
      if (!match) {
        continue;
      }
      const diagnosticKey = [
        sessionId,
        row.uniqueKey,
        row.category,
        match.user.userId,
        match.matchedBy,
        match.matchedValue,
      ].join('|');
      if (this.highlightMatchDiagnosticKeys.has(diagnosticKey)) {
        continue;
      }
      this.highlightMatchDiagnosticKeys.add(diagnosticKey);
      if (row.category === 'gift') {
        incrementCaptureLedger('ledger.highlight.gift_matched');
        commentDiagnostics.recordHighlightMatch({
          sessionId,
          category: 'gift',
          uniqueKey: row.uniqueKey,
          userId: row.userId,
          userLink: row.userLink,
          remark: match.user.remark || match.user.userId,
          matchedBy: match.matchedBy,
          matchedValue: match.matchedValue,
          source: match.source,
          message: row.message,
        });
      } else {
        incrementCaptureLedger('ledger.highlight.comment_matched');
        commentDiagnostics.recordHighlightMatch({
          sessionId,
          category: 'comment',
          uniqueKey: row.uniqueKey,
          userId: row.userId,
          userLink: row.userLink,
          remark: match.user.remark || match.user.userId,
          matchedBy: match.matchedBy,
          matchedValue: match.matchedValue,
          source: match.source,
          message: row.message,
        });
      }
    }
    if (this.highlightMatchDiagnosticKeys.size > 1200) {
      const keep = Array.from(this.highlightMatchDiagnosticKeys).slice(-800);
      this.highlightMatchDiagnosticKeys = new Set(keep);
    }
  }

  private recordCommentDiagnostic(
    stage: CommentDecisionStage,
    reason: string,
    sessionId: string | undefined,
    raw: RawCollectorEvent,
    extra?: Record<string, unknown>,
  ): void {
    commentDiagnostics.record({
      stage,
      reason,
      diagId: buildCommentDiagId(sessionId, raw),
      sessionId,
      category: raw.category,
      sourceId: raw.sourceId,
      message: raw.text,
      rawText: raw.rawText,
      userName: raw.userName,
      userId: raw.userId,
      userLink: raw.userLink,
      extra,
    });
  }

  private getCollectorIgnoreReason(
    raw: RawCollectorEvent,
    parsedMessage: string,
    category: Exclude<LiveEvent['category'], 'log'>,
  ): string | undefined {
    const rawText = normalizeWhitespace(raw.rawText || raw.text);
    const message = normalizeWhitespace(parsedMessage || raw.text);
    const normalizedUserName = normalizeWhitespace(raw.userName);
    const normalizedHostName = normalizeWhitespace(this.room?.hostName);
    const isPlainNumericCountdown = /^(?:[6-9]|[1-5]\d|60)$/u.test(message);
    const isPureCountdownComment = /^(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\(?\s*\d{1,4}\s*(?:s|S|\u79D2|\u79D2\u949F)\s*\)?)$/iu.test(message);
    const isHostNumericCountdown =
      Boolean(normalizedHostName) &&
      normalizedUserName === normalizedHostName &&
      isPlainNumericCountdown;
    const compactRawText = rawText.replace(/\s+/gu, '');
    const isProfileIdCountdownText = /^(?:.*?(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}.*?[\uFF1A:])\(?\s*(?:(?:\d{1,2}:)?[0-5]?\d:[0-5]\d|\d{1,4}(?:s|S|\u79D2|\u79D2\u949F))\s*\)?$/iu.test(compactRawText);

    if (
      category === 'comment' &&
      (isPureCountdownComment || isHostNumericCountdown || isProfileIdCountdownText)
    ) {
      return 'countdown';
    }

    const combined = normalizeWhitespace(`${rawText} ${message}`);
    const compact = combined.replace(/\s+/gu, '');
    const statLabels = ['评论数', '评论', '进场数', '进场', '互动数', '互动', '送礼数', '送礼', '礼物件数', '唯一用户', '在线人数'];
    const statTokenPattern =
      /(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)\s*[:：]?\s*\d+/gu;
    const statTokenCount = combined.match(statTokenPattern)?.length ?? 0;
    const statLabelHits = statLabels.filter((label) => compact.includes(label)).length;
    const compactResidue = compact
      .replace(/(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)/gu, '')
      .replace(/[0-9０-９:+：|｜/、，,。..\-_=~·•●◆【】\[\]()（）<>《》]/gu, '');

    if (statTokenCount >= 2) {
      return 'stats_panel';
    }

    if (statLabelHits >= 2 && compact.length <= 64 && compactResidue.length <= 8) {
      return 'stats_panel';
    }

    if (
      category !== 'gift' &&
      /^(?:(?:评论数|评论|进场数|进场|互动数|互动|送礼数|送礼|礼物件数|唯一用户|在线人数)\s*[:：]?\s*\d+\s*)+$/u.test(message)
    ) {
      return 'stats_panel';
    }

    return undefined;
  }

  private shouldIgnoreCollectorEvent(
    raw: RawCollectorEvent,
    parsedMessage: string,
    category: Exclude<LiveEvent['category'], 'log'>,
  ): boolean {
    return Boolean(this.getCollectorIgnoreReason(raw, parsedMessage, category));
  }

  private isMergedGiftNoise(raw: RawCollectorEvent, parsed: {
    message: string;
    userName?: string;
    giftName?: string;
    giftCount?: number;
  }): boolean {
    const rawText = normalizeWhitespace(raw.rawText || raw.text);
    const rawUserName = normalizeWhitespace(raw.userName);
    const parsedUserName = normalizeWhitespace(parsed.userName);
    const hasIdentity = Boolean(normalizeWhitespace(raw.userId) || normalizeWhitespace(raw.userLink));
    if (hasIdentity) {
      return false;
    }

    const giftActionCount =
      rawText.match(/(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|(?:^|\s)\u9001(?=\s))/gu)
        ?.length ?? 0;

    if (giftActionCount < 2) {
      return false;
    }

    return (
      /(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|(?:^|\s)\u9001(?=\s))/u.test(rawUserName) ||
      /(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|(?:^|\s)\u9001(?=\s))/u.test(parsedUserName) ||
      rawText.length > 32
    );
  }

  private expandCollectorEvent(raw: RawCollectorEvent): RawCollectorEvent[] {
    const category = raw.category ?? classifyText(raw.text);
    if (category !== 'gift') {
      return [raw];
    }

    const rawText = normalizeWhitespace(raw.rawText || raw.text);
    const giftActionCount =
      rawText.match(/(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|(?:^|\s)\u9001(?=\s))/gu)
        ?.length ?? 0;
    if (giftActionCount < 2) {
      return [raw];
    }

    const actionSource = '(?:\\u9001\\u51FA\\u4E86?|\\u8D60\\u9001\\u4E86?|\\u9001\\u7ED9(?:\\u4E3B\\u64AD)?|\\u6253\\u8D4F|\\u6295\\u5582|\\u9001)';
    const segmentPattern = new RegExp(
      `(.{1,24}?)(?:[\\uFF1A:]\\s*|\\s+)(${actionSource})\\s+(.+?)(?=(?:.{1,24}?)(?:[\\uFF1A:]\\s*|\\s+)${actionSource}\\s+|$)`,
      'gu',
    );
    const matches = Array.from(rawText.matchAll(segmentPattern));
    if (matches.length < 2) {
      return [raw];
    }

    const expanded = matches
      .map((matched) => {
        const userName = normalizeWhitespace(matched[1]);
        const action = normalizeWhitespace(matched[2]);
        const giftText = normalizeWhitespace(matched[3]);
        if (!userName || !action || !giftText) {
          return null;
        }

        const text = `${userName} ${action} ${giftText}`;
        return {
          ...raw,
          category,
          text,
          rawText: text,
          userName,
          userId: undefined,
          userLink: undefined,
          giftName: undefined,
          giftCount: undefined,
        } satisfies RawCollectorEvent;
      })
      .filter(Boolean) as RawCollectorEvent[];

    return expanded.length >= 2 ? expanded : [raw];
  }

  private findKnownGiftIdentity(
    sessionId: string,
    roomId: string | undefined,
    input: {
      userName?: string;
      rawText?: string;
      message?: string;
    },
  ): { userId?: string; userLink?: string } | undefined {
    const lookupNames = getKnownIdentityLookupNames(input);
    for (const lookupName of lookupNames) {
      const identityState = this.db.getKnownUserIdentityState(sessionId, lookupName, roomId);
      if (identityState.status === 'clean') {
        commentDiagnostics.record({
          stage: 'service.row',
          reason: 'gift.identity_cache_backfill',
          sessionId,
          category: 'gift',
          message: input.message,
          rawText: input.rawText,
          userName: lookupName,
          userId: identityState.userId,
          userLink: identityState.userLink,
          extra: {
            roomId,
            matchedName: lookupName,
            identityKeys: identityState.identityKeys,
          },
        });
        return {
          userId: identityState.userId,
          userLink: identityState.userLink,
        };
      }
      if (identityState.status === 'conflict') {
        commentDiagnostics.record({
          stage: 'service.row',
          reason: 'gift.identity_conflict',
          sessionId,
          category: 'gift',
          message: input.message,
          rawText: input.rawText,
          userName: lookupName,
          extra: {
            roomId,
            matchedName: lookupName,
            identityKeys: identityState.identityKeys,
          },
        });
        return undefined;
      }
    }
    if (lookupNames.length) {
      commentDiagnostics.record({
        stage: 'service.row',
        reason: 'gift.pending_identity',
        sessionId,
        category: 'gift',
        message: input.message,
        rawText: input.rawText,
        userName: lookupNames[0],
        extra: {
          roomId,
          lookupNames,
        },
      });
    }
    return undefined;
  }

  private normalizeGiftComboDelta(raw: RawCollectorEvent, parsed: {
    message: string;
    userName?: string;
    giftName?: string;
    giftCount?: number;
  }, resolveKnownIdentity?: (input: {
    userName?: string;
    rawText?: string;
    message?: string;
  }) => { userId?: string; userLink?: string } | undefined): {
    message: string;
    giftCount?: number;
  } {
    const giftName = normalizeWhitespace(parsed.giftName || raw.giftName);
    const mergedGiftCount = Math.max(parsed.giftCount || 0, raw.giftCount || 0);
    const giftCount = mergedGiftCount > 0 ? mergedGiftCount : undefined;
    if (!giftName || !giftCount || giftCount <= 0) {
      return {
        message: parsed.message,
        giftCount: mergedGiftCount > 0 ? mergedGiftCount : parsed.giftCount,
      };
    }

    const rawUserLink = normalizeDouyinProfileUrl(raw.userLink, raw.userId);
    const rawUserId = normalizeWhitespace(raw.userId) || extractDouyinUserId(rawUserLink);
    const knownIdentity =
      rawUserId && rawUserLink
        ? undefined
        : resolveKnownIdentity?.({
            userName: parsed.userName || raw.userName,
            rawText: raw.rawText,
            message: parsed.message || raw.text,
          });
    const knownUserId = normalizeWhitespace(knownIdentity?.userId);
    const knownLinkUserId = extractDouyinUserId(knownIdentity?.userLink);
    const resolvedUserId = rawUserId || knownUserId || knownLinkUserId;
    const resolvedUserLink = normalizeDouyinProfileUrl(rawUserLink || knownIdentity?.userLink, resolvedUserId);
    const userKey = normalizeWhitespace(resolvedUserLink || resolvedUserId || rawUserLink || rawUserId || parsed.userName || raw.userName);
    if (!userKey) {
      return {
        message: parsed.message,
        giftCount,
      };
    }

    const now = Date.now();
    for (const [key, state] of this.recentGiftCombos.entries()) {
      if (!state || now - state.at > 15000) {
        this.recentGiftCombos.delete(key);
      }
    }
    trimMapByAge(this.recentGiftCombos, RECENT_GIFT_COMBO_LIMIT);

    const comboKey = [this.room?.roomId ?? '', userKey, giftName].join('|');
    const previous = this.recentGiftCombos.get(comboKey);
    this.recentGiftCombos.set(comboKey, {
      at: now,
      count: giftCount,
    });

    if (previous && now - previous.at < 15000 && giftCount > previous.count) {
      const delta = giftCount - previous.count;
      if (delta > 0 && delta < giftCount) {
        return {
          message: `${normalizeWhitespace(parsed.userName || raw.userName) || '匿名用户'} -> ${giftName} x${delta}`,
          giftCount: delta,
        };
      }
    }

    return {
      message: parsed.message,
      giftCount,
    };
  }

  private hasExplicitGiftCountText(value: string | undefined): boolean {
    return /(?:[xX\u00D7*]\s*\d{1,5}|\d{1,5}\s*(?:\u8FDE\u51FB|\u9023\u64CA|\u4E2A|\u500B|\u4EFD|\u5F20))/u.test(
      normalizeWhitespace(value),
    );
  }

  private isRecentCollectorDuplicate(
    raw: RawCollectorEvent,
    parsedMessage: string,
    parsedGiftName: string | undefined,
    parsedGiftCount: number | undefined,
    category: Exclude<LiveEvent['category'], 'log'>,
    candidateEvent?: LiveEvent,
    giftIdentityUpdates?: LiveEvent[],
  ): boolean {
    this.lastCollectorDuplicateReason = undefined;
    const now = Date.now();
    for (const [key, at] of this.recentCollectorFingerprints.entries()) {
      const keyString = String(key);
      const ttl = keyString.startsWith('giftSource|')
        ? RECENT_GIFT_SOURCE_ID_DUPLICATE_TTL_MS
        : keyString.startsWith('source|')
        ? RECENT_SOURCE_ID_DUPLICATE_TTL_MS
        : keyString.startsWith('comment|')
          ? RECENT_COMMENT_DUPLICATE_TTL_MS
          : RECENT_NON_COMMENT_DUPLICATE_TTL_MS;
      if (now - at > ttl) {
        this.recentCollectorFingerprints.delete(key);
      }
    }
    for (const [key, meta] of this.recentGiftFingerprints.entries()) {
      if (!meta || now - meta.at > 15000) {
        this.recentGiftFingerprints.delete(key);
      }
    }
    trimMapByAge(this.recentCollectorFingerprints, RECENT_COLLECTOR_FINGERPRINT_LIMIT);
    trimMapByAge(this.recentGiftFingerprints, RECENT_GIFT_FINGERPRINT_LIMIT);

    const normalizedUserName = normalizeWhitespace(raw.userName);
    const sourceId = category === 'comment' || category === 'gift' ? normalizeWhitespace(raw.sourceId) : '';
    const parsedCommentUserName =
      category === 'comment'
        ? extractCommentUserNameFromText(raw.rawText) || extractCommentUserNameFromText(raw.text) || normalizedUserName
        : normalizedUserName;
    const userKey = normalizeWhitespace(raw.userLink || raw.userId || parsedCommentUserName || raw.userName);
    const messageKey = normalizeWhitespace(parsedMessage || raw.text || raw.rawText);
    const rawTextKey = normalizeWhitespace(raw.rawText || raw.text);
    const giftNameKey = normalizeWhitespace(parsedGiftName || raw.giftName);
    const mergedGiftCount = Math.max(parsedGiftCount || 0, raw.giftCount || 0);
    const giftCountKey = String(mergedGiftCount || 0);
    const hasExplicitGiftCount =
      category === 'gift' && this.hasExplicitGiftCountText(raw.rawText || raw.text || parsedMessage);
    const hasGiftIdentity =
      category === 'gift' &&
      Boolean(normalizeWhitespace(raw.userId) || normalizeWhitespace(raw.userLink));
    const giftQuality =
      category === 'gift'
        ? (normalizedUserName ? 2 : 0) +
          (hasGiftIdentity ? 6 : 0) +
          (giftNameKey ? 2 : 0) +
          (hasExplicitGiftCount ? 4 : 0) +
          (/->\s*.+\s*x\d+$/u.test(messageKey) ? 1 : 0)
        : 0;
    const mergeDuplicateGiftIdentity = (previousGift: RecentGiftFingerprint | undefined): void => {
      if (category !== 'gift' || !previousGift?.event || !candidateEvent) {
        return;
      }
      if (getGiftIdentityScore(candidateEvent) <= getGiftIdentityScore(previousGift.event)) {
        return;
      }
      mergeGiftIdentityIntoEvent(previousGift.event, candidateEvent);
      previousGift.at = now;
      previousGift.quality = Math.max(previousGift.quality, giftQuality);
      giftIdentityUpdates?.push(previousGift.event);
    };
    const sourceFingerprint = sourceId
      ? category === 'gift'
        ? ['giftSource', sourceId, giftCountKey].join('|')
        : category === 'comment'
          ? ['source', category, sourceId, userKey, messageKey].join('|')
          : ['source', category, sourceId].join('|')
      : '';
    const giftSourceFingerprintKey = sourceFingerprint ? `source:${sourceFingerprint}` : '';
    const sourceDedupeWindowMs =
      category === 'gift' ? RECENT_GIFT_SOURCE_ID_DUPLICATE_TTL_MS : RECENT_SOURCE_ID_DUPLICATE_TTL_MS;
    if (sourceFingerprint) {
      const previousSourceAt = this.recentCollectorFingerprints.get(sourceFingerprint) ?? 0;
      if (now - previousSourceAt < sourceDedupeWindowMs) {
        if (category === 'gift') {
          mergeDuplicateGiftIdentity(this.recentGiftFingerprints.get(giftSourceFingerprintKey));
        }
        this.lastCollectorDuplicateReason = 'source';
        return true;
      }
    }
    if (category === 'comment') {
      if (sourceFingerprint) {
        this.recentCollectorFingerprints.set(sourceFingerprint, now);
      }
      return false;
    }
    const fingerprint =
      category === 'gift'
        ? [category, userKey, giftNameKey || messageKey, giftCountKey, hasExplicitGiftCount ? 'explicit' : 'implicit'].join('|')
        : [category, userKey, messageKey].join('|');
    const isFallbackGiftText =
      category === 'gift' &&
      !hasGiftIdentity &&
      /^(?:@?.{1,40}?)(?:[\uFF1A:]\s*|\s+)(?:\u9001\u51FA\u4E86?|\u8D60\u9001\u4E86?|\u9001\u7ED9(?:\u4E3B\u64AD)?|\u6253\u8D4F|\u6295\u5582|\u9001)\s+.+$/u.test(
        rawTextKey,
      );
    const dedupeWindowMs =
      category === 'entry'
        ? 900000
        : category === 'interaction'
          ? 60000
          : category === 'gift'
            ? hasGiftIdentity
              ? 15000
              : isFallbackGiftText
                ? 45000
                : 15000
            : RECENT_COMMENT_DUPLICATE_TTL_MS;
    const previousAt = this.recentCollectorFingerprints.get(fingerprint) ?? 0;

    if (now - previousAt < dedupeWindowMs) {
      this.lastCollectorDuplicateReason = 'exact';
      return true;
    }

    if (category === 'gift') {
      const coarseGiftFingerprint = [
        category,
        normalizedUserName || userKey,
        giftNameKey || messageKey,
        giftCountKey,
      ].join('|');
      const previousGift = this.recentGiftFingerprints.get(coarseGiftFingerprint);
      const coarseWindowMs = hasGiftIdentity ? 15000 : isFallbackGiftText ? 45000 : 15000;

      if (previousGift && now - previousGift.at < coarseWindowMs) {
        mergeDuplicateGiftIdentity(previousGift);
        if (previousGift.quality < giftQuality) {
          this.recentGiftFingerprints.set(coarseGiftFingerprint, {
            at: now,
            quality: giftQuality,
            event: previousGift.event,
          });
          if (giftSourceFingerprintKey) {
            this.recentGiftFingerprints.set(giftSourceFingerprintKey, {
              at: now,
              quality: giftQuality,
              event: previousGift.event,
            });
          }
        }
        this.lastCollectorDuplicateReason = 'coarse_gift';
        return true;
      }

      this.recentCollectorFingerprints.set(fingerprint, now);
      if (sourceFingerprint) {
        this.recentCollectorFingerprints.set(sourceFingerprint, now);
      }
      this.recentGiftFingerprints.set(coarseGiftFingerprint, {
        at: now,
        quality: giftQuality,
        event: candidateEvent,
      });
      if (giftSourceFingerprintKey) {
        this.recentGiftFingerprints.set(giftSourceFingerprintKey, {
          at: now,
          quality: giftQuality,
          event: candidateEvent,
        });
      }
      return false;
    }

    this.recentCollectorFingerprints.set(fingerprint, now);
    if (sourceFingerprint) {
      this.recentCollectorFingerprints.set(sourceFingerprint, now);
    }
    return false;
  }
}






