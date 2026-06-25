import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  EventHistoryQuery,
  EventHistoryResult,
  EventQuery,
  HighlightUserConfig,
  LiveEvent,
  SessionRecord,
  SessionStats,
  UserIdentityObservation,
} from './types.js';

export interface InsertEventsResult {
  attempted: number;
  inserted: number;
  ignored: number;
  insertedKeys: Set<string>;
  insertedIndexes: Set<number>;
}

export interface PendingGiftIdentityBackfillQuery {
  sessionId: string;
  roomId?: string;
  userName: string;
  limit?: number;
}

const MYSTERY_PERSON_LABEL = '\u795E\u79D8\u4EBA';
const MYSTERY_KING_LABEL = '\u795E\u79D8\u738B\u8005';
const MAX_EVENTS_PER_SESSION = 50000;
const EVENT_RETENTION_PRUNE_BATCH = 3000;
const IDENTITY_CACHE_CONFIDENCE = 90;
type KnownUserIdentity = { userId?: string; userLink?: string };
export type KnownUserIdentityLookupState = {
  status: 'clean' | 'conflict' | 'pending';
  userId?: string;
  userLink?: string;
  identityKeys: string[];
};
type EventPayloadIdentity = {
  userName?: string;
  userId?: string;
  userLink?: string;
  displayId?: string;
  shortId?: string;
  uniqueId?: string;
  text?: string;
  rawText?: string;
};
type MysteryAggregateState = {
  identityKey: string;
  name: string;
  total: number;
  entryCount: number;
  commentCount: number;
  giftCount: number;
  lastActiveAt: string;
  userId?: string;
  userLink?: string;
};

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function isDirectDouyinUserId(value: string | undefined): boolean {
  return /^(?:MS4w|sec_)[A-Za-z0-9._%-]{8,}$/u.test(String(value ?? '').trim());
}

function normalizeIdentityComparable(value: string | undefined): string {
  return normalizeOptionalText(value)?.normalize('NFKC').toLowerCase() ?? '';
}

function normalizeObservedName(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value)?.replace(/^@+/u, '');
  return normalized || undefined;
}

function buildIdentityKey(userId: string | undefined, userLink: string | undefined): string | undefined {
  const normalizedUserId = normalizeIdentityComparable(userId);
  if (normalizedUserId) {
    return `uid:${normalizedUserId}`;
  }

  const linkUserId = normalizeIdentityComparable(extractDouyinUserId(userLink));
  if (linkUserId) {
    return `link:${linkUserId}`;
  }

  const normalizedLink = normalizeIdentityComparable(userLink);
  return normalizedLink ? `url:${normalizedLink}` : undefined;
}

function normalizeHighlightComparable(value: string | undefined): string {
  return normalizeOptionalText(value)?.normalize('NFKC').toLowerCase() ?? '';
}

function normalizeHighlightIdentityToken(value: string | undefined): string {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return '';
  }
  return normalizeHighlightComparable(extractDouyinUserId(normalized) || normalized);
}

function getPayloadShortIdentityCandidates(payload: EventPayloadIdentity | undefined): string[] {
  return [payload?.displayId, payload?.shortId, payload?.uniqueId]
    .map((item) => normalizeHighlightIdentityToken(item))
    .filter(Boolean);
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
  return new RegExp(`^${pattern.split('*').map(escapeHighlightPattern).join('.*')}$`, 'iu').test(candidate);
}

function extractDouyinUserId(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
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
  return normalized;
}

function eventMatchesHighlightUser(event: LiveEvent, user: HighlightUserConfig): boolean {
  const targetId = normalizeHighlightIdentityToken(user.userId);
  if (!targetId) {
    return false;
  }
  let payloadUserId: string | undefined;
  let payloadLinkUserId: string | undefined;
  try {
    const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as EventPayloadIdentity) : undefined;
    payloadUserId = payload?.userId;
    payloadLinkUserId = extractDouyinUserId(payload?.userLink);
    const candidates = [event.userId, event.userLink, extractDouyinUserId(event.userLink), payloadUserId, payloadLinkUserId]
      .map((item) => normalizeHighlightIdentityToken(item))
      .filter(Boolean);
    candidates.push(...getPayloadShortIdentityCandidates(payload));
    return candidates.some((candidate) => highlightPatternMatches(candidate, targetId));
  } catch {
    payloadUserId = undefined;
    payloadLinkUserId = undefined;
  }
  const candidates = [event.userId, event.userLink, extractDouyinUserId(event.userLink), payloadUserId, payloadLinkUserId]
    .map((item) => normalizeHighlightIdentityToken(item))
    .filter(Boolean);
  return candidates.some((candidate) => highlightPatternMatches(candidate, targetId));
}

function readEventPayload(row: LiveEvent): EventPayloadIdentity | undefined {
  if (!row.payloadJson) {
    return undefined;
  }
  try {
    return JSON.parse(row.payloadJson) as EventPayloadIdentity;
  } catch {
    return undefined;
  }
}

function getPayloadIdentityValues(row: LiveEvent): string[] {
  const payload = readEventPayload(row);
  if (!payload) {
    return [];
  }
  return [payload.userName, payload.userId, payload.userLink]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value));
}

function normalizeMysteryComparable(value: string | undefined): string {
  return normalizeOptionalText(value)
    ?.toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?douyin\.com\/(?:user|follow)\//iu, '') ?? '';
}

function isMysteryIdentityForStats(value: string | undefined): boolean {
  const normalized = normalizeMysteryComparable(value);
  return Boolean(normalized) && (normalized.includes(MYSTERY_PERSON_LABEL) || normalized.includes(MYSTERY_KING_LABEL));
}

function extractMysteryLabelFromText(value: string | undefined): string | undefined {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return undefined;
  }
  for (const label of [MYSTERY_PERSON_LABEL, MYSTERY_KING_LABEL]) {
    const start = normalized.indexOf(label);
    if (start < 0) {
      continue;
    }
    const rest = normalized.slice(start);
    const end = rest.search(/[\s:\uFF1A\uFF0C,\u3002@]/u);
    return normalizeOptionalText(end >= 0 ? rest.slice(0, end) : rest);
  }
  return undefined;
}

function hasMysteryIdentityField(row: LiveEvent): boolean {
  return (
    isMysteryIdentityForStats(row.userName) ||
    isMysteryIdentityForStats(row.userId) ||
    isMysteryIdentityForStats(row.userLink) ||
    getPayloadIdentityValues(row).some((value) => isMysteryIdentityForStats(value))
  );
}

function isMysteryStatsEvent(row: LiveEvent): boolean {
  return row.category !== 'log' && hasMysteryIdentityField(row);
}

function getMysteryDisplayNameFromEvent(row: LiveEvent): string {
  const payload = readEventPayload(row);
  const identityCandidates = [row.userName, row.userId, row.userLink, payload?.userName, payload?.userId, payload?.userLink]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value));
  const identityMatch = identityCandidates.find((value) => isMysteryIdentityForStats(value));
  if (identityMatch) {
    return identityMatch;
  }
  const textMatch = [row.message, payload?.text, payload?.rawText]
    .map((value) => extractMysteryLabelFromText(value))
    .find(Boolean);
  return textMatch || identityCandidates[0] || '\u533F\u540D\u7528\u6237';
}

function getMysteryIdentityKey(row: LiveEvent): string {
  if (hasMysteryIdentityField(row)) {
    return normalizeOptionalText(row.userLink || row.userId || row.userName) || getMysteryDisplayNameFromEvent(row);
  }
  return getMysteryDisplayNameFromEvent(row);
}

function getEventUserIdentityKey(row: LiveEvent): string | undefined {
  if (row.category === 'log') {
    return undefined;
  }
  return normalizeOptionalText(row.userLink || row.userName || row.userId);
}

function getGiftAggregateName(row: LiveEvent): string {
  return normalizeOptionalText(row.giftName) || '未知礼物';
}

function getGiftUnitCount(row: LiveEvent): number {
  return row.giftCount ?? 1;
}

function getMysteryAggregateState(row: LiveEvent): MysteryAggregateState | undefined {
  if (!isMysteryStatsEvent(row)) {
    return undefined;
  }
  const identityKey = getMysteryIdentityKey(row);
  if (!identityKey) {
    return undefined;
  }
  return {
    identityKey,
    name: getMysteryDisplayNameFromEvent(row),
    total: 1,
    entryCount: row.category === 'entry' ? 1 : 0,
    commentCount: row.category === 'comment' ? 1 : 0,
    giftCount: row.category === 'gift' ? 1 : 0,
    lastActiveAt: row.createdAt,
    userId: row.userId,
    userLink: row.userLink,
  };
}

export class AppDatabase {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        room_id TEXT,
        room_title TEXT,
        host_name TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_heartbeat_at TEXT,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unique_key TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        category TEXT NOT NULL,
        created_at TEXT NOT NULL,
        room_id TEXT,
        room_title TEXT,
        host_name TEXT,
        user_name TEXT,
        user_id TEXT,
        user_link TEXT,
        message TEXT NOT NULL,
        gift_name TEXT,
        gift_count INTEGER,
        payload_json TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_events_session_created_at
      ON events(session_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_events_session_category
      ON events(session_id, category, created_at DESC);

      CREATE TABLE IF NOT EXISTS user_identity_cache (
        identity_key TEXT PRIMARY KEY,
        user_id TEXT,
        user_id_norm TEXT,
        link_user_id_norm TEXT,
        user_link TEXT,
        latest_user_name TEXT,
        source_confidence INTEGER NOT NULL DEFAULT 90,
        conflict_state TEXT NOT NULL DEFAULT 'clean',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_identity_name_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        display_name TEXT,
        identity_key TEXT NOT NULL,
        category TEXT,
        observed_at TEXT NOT NULL,
        UNIQUE(scope_type, scope_id, normalized_name, identity_key),
        FOREIGN KEY(identity_key) REFERENCES user_identity_cache(identity_key) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_identity_name_scope
      ON user_identity_name_observations(scope_type, scope_id, normalized_name, observed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_identity_cache_last_seen
      ON user_identity_cache(last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS session_event_totals (
        session_id TEXT NOT NULL,
        category TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        gift_units INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(session_id, category),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_unique_users (
        session_id TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY(session_id, identity_key),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_gift_totals (
        session_id TEXT NOT NULL,
        gift_name TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(session_id, gift_name),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS session_mystery_user_totals (
        session_id TEXT NOT NULL,
        identity_key TEXT NOT NULL,
        name TEXT NOT NULL,
        total INTEGER NOT NULL DEFAULT 0,
        entry_count INTEGER NOT NULL DEFAULT 0,
        comment_count INTEGER NOT NULL DEFAULT 0,
        gift_count INTEGER NOT NULL DEFAULT 0,
        last_active_at TEXT NOT NULL,
        user_id TEXT,
        user_link TEXT,
        PRIMARY KEY(session_id, identity_key),
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_mystery_user_totals_active
      ON session_mystery_user_totals(session_id, last_active_at DESC);
    `);
    this.ensureColumn('user_identity_cache', 'user_id', 'TEXT');
    this.backfillSessionAggregates();
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const rows = this.db.pragma(`table_info(${tableName})`) as Array<{ name?: string }>;
    if (rows.some((row) => row.name === columnName)) {
      return;
    }
    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private toSessionParams(session: SessionRecord) {
    return {
      id: session.id,
      url: session.url,
      status: session.status,
      roomId: session.roomId ?? null,
      roomTitle: session.roomTitle ?? null,
      hostName: session.hostName ?? null,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      lastHeartbeatAt: session.lastHeartbeatAt ?? null,
      errorMessage: session.errorMessage ?? null,
    };
  }

  private toEventParams(event: LiveEvent) {
    return {
      uniqueKey: event.uniqueKey,
      sessionId: event.sessionId,
      category: event.category,
      createdAt: event.createdAt,
      roomId: event.roomId ?? null,
      roomTitle: event.roomTitle ?? null,
      hostName: event.hostName ?? null,
      userName: event.userName ?? null,
      userId: event.userId ?? null,
      userLink: event.userLink ?? null,
      message: event.message,
      giftName: event.giftName ?? null,
      giftCount: event.giftCount ?? null,
      payloadJson: event.payloadJson ?? null,
    };
  }

  private backfillSessionAggregates(): void {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total FROM session_event_totals`)
      .get() as { total?: number } | undefined;
    if ((row?.total ?? 0) > 0) {
      return;
    }
    const events = this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        ORDER BY session_id ASC, created_at ASC, id ASC
      `)
      .all() as LiveEvent[];
    if (events.length) {
      this.aggregateInsertedEvents(events);
    }
  }

  private aggregateInsertedEvents(events: LiveEvent[]): void {
    if (!events.length) {
      return;
    }

    const totalStmt = this.db.prepare(`
      INSERT INTO session_event_totals (session_id, category, total, gift_units)
      VALUES (@sessionId, @category, @total, @giftUnits)
      ON CONFLICT(session_id, category) DO UPDATE SET
        total = total + excluded.total,
        gift_units = gift_units + excluded.gift_units
    `);
    const uniqueUserStmt = this.db.prepare(`
      INSERT INTO session_unique_users (session_id, identity_key, first_seen_at, last_seen_at)
      VALUES (@sessionId, @identityKey, @createdAt, @createdAt)
      ON CONFLICT(session_id, identity_key) DO UPDATE SET
        last_seen_at = excluded.last_seen_at
    `);
    const giftStmt = this.db.prepare(`
      INSERT INTO session_gift_totals (session_id, gift_name, total)
      VALUES (@sessionId, @giftName, @total)
      ON CONFLICT(session_id, gift_name) DO UPDATE SET
        total = total + excluded.total
    `);
    const mysteryStmt = this.db.prepare(`
      INSERT INTO session_mystery_user_totals (
        session_id, identity_key, name, total, entry_count, comment_count, gift_count,
        last_active_at, user_id, user_link
      ) VALUES (
        @sessionId, @identityKey, @name, @total, @entryCount, @commentCount, @giftCount,
        @lastActiveAt, @userId, @userLink
      )
      ON CONFLICT(session_id, identity_key) DO UPDATE SET
        name = COALESCE(NULLIF(excluded.name, ''), session_mystery_user_totals.name),
        total = total + excluded.total,
        entry_count = entry_count + excluded.entry_count,
        comment_count = comment_count + excluded.comment_count,
        gift_count = gift_count + excluded.gift_count,
        last_active_at = MAX(last_active_at, excluded.last_active_at),
        user_id = COALESCE(NULLIF(excluded.user_id, ''), session_mystery_user_totals.user_id),
        user_link = COALESCE(NULLIF(excluded.user_link, ''), session_mystery_user_totals.user_link)
    `);

    for (const row of events) {
      totalStmt.run({
        sessionId: row.sessionId,
        category: row.category,
        total: 1,
        giftUnits: row.category === 'gift' ? getGiftUnitCount(row) : 0,
      });

      const userIdentityKey = getEventUserIdentityKey(row);
      if (userIdentityKey) {
        uniqueUserStmt.run({
          sessionId: row.sessionId,
          identityKey: userIdentityKey,
          createdAt: row.createdAt,
        });
      }

      if (row.category === 'gift') {
        giftStmt.run({
          sessionId: row.sessionId,
          giftName: getGiftAggregateName(row),
          total: getGiftUnitCount(row),
        });
      }

      const mysteryState = getMysteryAggregateState(row);
      if (mysteryState) {
        mysteryStmt.run({
          sessionId: row.sessionId,
          identityKey: mysteryState.identityKey,
          name: mysteryState.name,
          total: mysteryState.total,
          entryCount: mysteryState.entryCount,
          commentCount: mysteryState.commentCount,
          giftCount: mysteryState.giftCount,
          lastActiveAt: mysteryState.lastActiveAt,
          userId: mysteryState.userId ?? null,
          userLink: mysteryState.userLink ?? null,
        });
      }
    }
  }

  createSession(session: SessionRecord): void {
    this.db
      .prepare(`
        INSERT INTO sessions (
          id, url, status, room_id, room_title, host_name,
          started_at, ended_at, last_heartbeat_at, error_message
        ) VALUES (
          @id, @url, @status, @roomId, @roomTitle, @hostName,
          @startedAt, @endedAt, @lastHeartbeatAt, @errorMessage
        )
      `)
      .run(this.toSessionParams(session));
  }

  updateSession(sessionId: string, patch: Partial<SessionRecord>): void {
    const current = this.getSessionById(sessionId);
    if (!current) {
      return;
    }
    const next = { ...current, ...patch };
    this.db
      .prepare(`
        UPDATE sessions SET
          url = @url,
          status = @status,
          room_id = @roomId,
          room_title = @roomTitle,
          host_name = @hostName,
          started_at = @startedAt,
          ended_at = @endedAt,
          last_heartbeat_at = @lastHeartbeatAt,
          error_message = @errorMessage
        WHERE id = @id
      `)
      .run(this.toSessionParams(next));
  }

  insertEvents(events: LiveEvent[]): InsertEventsResult {
    if (!events.length) {
      return { attempted: 0, inserted: 0, ignored: 0, insertedKeys: new Set(), insertedIndexes: new Set() };
    }
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO events (
        unique_key, session_id, category, created_at, room_id, room_title, host_name,
        user_name, user_id, user_link, message, gift_name, gift_count, payload_json
      ) VALUES (
        @uniqueKey, @sessionId, @category, @createdAt, @roomId, @roomTitle, @hostName,
        @userName, @userId, @userLink, @message, @giftName, @giftCount, @payloadJson
      )
    `);

    let inserted = 0;
    const insertedKeys = new Set<string>();
    const insertedIndexes = new Set<number>();
    const tx = this.db.transaction((rows: LiveEvent[]) => {
      const insertedRows: LiveEvent[] = [];
      for (const [index, row] of rows.entries()) {
        const result = stmt.run(this.toEventParams(row));
        if (result.changes > 0) {
          inserted += 1;
          insertedKeys.add(row.uniqueKey);
          insertedIndexes.add(index);
          insertedRows.push(row);
        }
      }
      this.aggregateInsertedEvents(insertedRows);
    });

    tx(events);
    this.pruneOldEventsForSessions(events.map((event) => event.sessionId));
    return {
      attempted: events.length,
      inserted,
      ignored: events.length - inserted,
      insertedKeys,
      insertedIndexes,
    };
  }

  updateEventIdentities(events: LiveEvent[]): void {
    if (!events.length) {
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE events SET
        user_name = COALESCE(NULLIF(@userName, ''), user_name),
        user_id = COALESCE(NULLIF(@userId, ''), user_id),
        user_link = COALESCE(NULLIF(@userLink, ''), user_link),
        gift_name = COALESCE(NULLIF(@giftName, ''), gift_name),
        gift_count = COALESCE(@giftCount, gift_count),
        payload_json = COALESCE(NULLIF(@payloadJson, ''), payload_json)
      WHERE unique_key = @uniqueKey
        AND session_id = @sessionId
        AND category = 'gift'
    `);

    const tx = this.db.transaction((rows: LiveEvent[]) => {
      for (const row of rows) {
        stmt.run(this.toEventParams(row));
      }
    });

    tx(events);
  }

  getPendingGiftIdentityBackfillCandidates(query: PendingGiftIdentityBackfillQuery): LiveEvent[] {
    const normalizedUserName = normalizeObservedName(query.userName);
    const sessionId = normalizeOptionalText(query.sessionId);
    if (!normalizedUserName || !sessionId) {
      return [];
    }

    const limit = Math.min(Math.max(query.limit ?? 120, 1), 500);
    const clauses = [
      'session_id = ?',
      "category = 'gift'",
      "NULLIF(COALESCE(user_id, ''), '') IS NULL",
      "NULLIF(COALESCE(user_link, ''), '') IS NULL",
      `(
        user_name = ?
        OR (json_valid(payload_json) AND json_extract(payload_json, '$.userName') = ?)
        OR message LIKE ?
        OR (json_valid(payload_json) AND json_extract(payload_json, '$.rawText') LIKE ?)
        OR (json_valid(payload_json) AND json_extract(payload_json, '$.text') LIKE ?)
      )`,
    ];
    const args: Array<string | number> = [
      sessionId,
      normalizedUserName,
      normalizedUserName,
      `%${normalizedUserName}%`,
      `%${normalizedUserName}%`,
      `%${normalizedUserName}%`,
    ];

    if (query.roomId) {
      clauses.push('(room_id = ? OR room_id IS NULL OR room_id = \'\')');
      args.push(query.roomId);
    }

    args.push(limit);
    return this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .all(...args) as LiveEvent[];
  }

  upsertUserIdentityObservation(observation: UserIdentityObservation): void {
    const userIdNorm = normalizeIdentityComparable(observation.userId);
    const userId = normalizeOptionalText(observation.userId);
    const linkUserIdNorm = normalizeIdentityComparable(extractDouyinUserId(observation.userLink));
    const userLink = normalizeOptionalText(observation.userLink);
    const identityKey = buildIdentityKey(observation.userId, observation.userLink);
    const normalizedName = normalizeObservedName(observation.userName);
    const sessionId = normalizeOptionalText(observation.sessionId);
    const roomId = normalizeOptionalText(observation.roomId);
    if (!identityKey || !normalizedName || !sessionId) {
      return;
    }

    const cacheStmt = this.db.prepare(`
      INSERT INTO user_identity_cache (
        identity_key, user_id, user_id_norm, link_user_id_norm, user_link, latest_user_name,
        source_confidence, conflict_state, first_seen_at, last_seen_at
      ) VALUES (
        @identityKey, @userId, @userIdNorm, @linkUserIdNorm, @userLink, @latestUserName,
        @sourceConfidence, 'clean', @observedAt, @observedAt
      )
      ON CONFLICT(identity_key) DO UPDATE SET
        user_id = COALESCE(NULLIF(excluded.user_id, ''), user_identity_cache.user_id),
        user_id_norm = COALESCE(NULLIF(excluded.user_id_norm, ''), user_identity_cache.user_id_norm),
        link_user_id_norm = COALESCE(NULLIF(excluded.link_user_id_norm, ''), user_identity_cache.link_user_id_norm),
        user_link = COALESCE(NULLIF(excluded.user_link, ''), user_identity_cache.user_link),
        latest_user_name = COALESCE(NULLIF(excluded.latest_user_name, ''), user_identity_cache.latest_user_name),
        source_confidence = MAX(user_identity_cache.source_confidence, excluded.source_confidence),
        last_seen_at = excluded.last_seen_at
    `);
    const observationStmt = this.db.prepare(`
      INSERT INTO user_identity_name_observations (
        scope_type, scope_id, normalized_name, display_name, identity_key, category, observed_at
      ) VALUES (
        @scopeType, @scopeId, @normalizedName, @displayName, @identityKey, @category, @observedAt
      )
      ON CONFLICT(scope_type, scope_id, normalized_name, identity_key) DO UPDATE SET
        display_name = excluded.display_name,
        category = excluded.category,
        observed_at = excluded.observed_at
    `);
    const writeObservation = (scopeType: 'session' | 'room', scopeId: string) => {
      observationStmt.run({
        scopeType,
        scopeId,
        normalizedName,
        displayName: normalizedName,
        identityKey,
        category: observation.category ?? null,
        observedAt: observation.observedAt,
      });
    };

    const tx = this.db.transaction(() => {
      cacheStmt.run({
        identityKey,
        userId: userId || null,
        userIdNorm: userIdNorm || null,
        linkUserIdNorm: linkUserIdNorm || null,
        userLink: userLink || null,
        latestUserName: normalizedName,
        sourceConfidence: IDENTITY_CACHE_CONFIDENCE,
        observedAt: observation.observedAt,
      });
      writeObservation('session', sessionId);
      if (roomId) {
        writeObservation('room', roomId);
      }
    });
    tx();
  }

  private pruneOldEventsForSessions(sessionIds: string[]): void {
    const uniqueSessionIds = Array.from(new Set(sessionIds)).filter(Boolean);
    if (!uniqueSessionIds.length) {
      return;
    }

    const countStmt = this.db.prepare(`SELECT COUNT(*) AS total FROM events WHERE session_id = ?`);
    const deleteStmt = this.db.prepare(`
      DELETE FROM events
      WHERE id IN (
        SELECT id
        FROM events
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
        LIMIT ?
      )
    `);

    const tx = this.db.transaction((ids: string[]) => {
      for (const sessionId of ids) {
        const row = countStmt.get(sessionId) as { total?: number } | undefined;
        const overflow = (row?.total ?? 0) - MAX_EVENTS_PER_SESSION;
        if (overflow > 0) {
          deleteStmt.run(sessionId, overflow + EVENT_RETENTION_PRUNE_BATCH);
        }
      }
    });
    tx(uniqueSessionIds);
  }

  getSessionById(sessionId: string): SessionRecord | undefined {
    return this.db
      .prepare(`
        SELECT
          id,
          url,
          status,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          started_at AS startedAt,
          ended_at AS endedAt,
          last_heartbeat_at AS lastHeartbeatAt,
          error_message AS errorMessage
        FROM sessions
        WHERE id = ?
      `)
      .get(sessionId) as SessionRecord | undefined;
  }

  getActiveSession(): SessionRecord | undefined {
    return this.db
      .prepare(`
        SELECT
          id,
          url,
          status,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          started_at AS startedAt,
          ended_at AS endedAt,
          last_heartbeat_at AS lastHeartbeatAt,
          error_message AS errorMessage
        FROM sessions
        WHERE status = 'running'
        ORDER BY started_at DESC
        LIMIT 1
      `)
      .get() as SessionRecord | undefined;
  }

  markRunningSessionsInterrupted(endedAt: string, errorMessage: string): number {
    const result = this.db
      .prepare(`
        UPDATE sessions
        SET
          status = 'error',
          ended_at = COALESCE(ended_at, ?),
          last_heartbeat_at = COALESCE(last_heartbeat_at, ?),
          error_message = COALESCE(error_message, ?)
        WHERE status = 'running'
      `)
      .run(endedAt, endedAt, errorMessage);

    return result.changes;
  }

  listSessions(limit = 20): SessionRecord[] {
    return this.db
      .prepare(`
        SELECT
          id,
          url,
          status,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          started_at AS startedAt,
          ended_at AS endedAt,
          last_heartbeat_at AS lastHeartbeatAt,
          error_message AS errorMessage
        FROM sessions
        ORDER BY started_at DESC
        LIMIT ?
      `)
      .all(limit) as SessionRecord[];
  }

  getLatestSessionId(): string | undefined {
    const row = this.db
      .prepare(`SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1`)
      .get() as { id?: string } | undefined;
    return row?.id;
  }

  getEvents(query: EventQuery): LiveEvent[] {
    const limit = Math.min(Math.max(query.limit ?? 80, 1), 1000);
    const clauses = ['1 = 1'];
    const args: Array<string | number> = [];

    if (query.sessionId) {
      clauses.push('session_id = ?');
      args.push(query.sessionId);
    }
    if (query.category) {
      clauses.push('category = ?');
      args.push(query.category);
    }

    args.push(limit);

    return this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .all(...args) as LiveEvent[];
  }

  getEventHistory(query: EventHistoryQuery): EventHistoryResult {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
    const clauses = ['session_id = ?', 'category = ?'];
    const args: Array<string | number> = [query.sessionId, query.category];
    const keyword = String(query.q ?? '').trim().toLowerCase();

    if (query.cursorCreatedAt && typeof query.cursorId === 'number') {
      clauses.push('(created_at < ? OR (created_at = ? AND id < ?))');
      args.push(query.cursorCreatedAt, query.cursorCreatedAt, query.cursorId);
    }

    if (keyword) {
      clauses.push(`(
        LOWER(COALESCE(user_name, '')) LIKE ?
        OR LOWER(COALESCE(message, '')) LIKE ?
        OR LOWER(COALESCE(gift_name, '')) LIKE ?
      )`);
      const likeKeyword = `%${keyword}%`;
      args.push(likeKeyword, likeKeyword, likeKeyword);
    }

    args.push(limit + 1);
    const rows = this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE ${clauses.join(' AND ')}
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .all(...args) as LiveEvent[];

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: rows.length > limit && typeof last?.id === 'number'
        ? { createdAt: last.createdAt, id: last.id }
        : undefined,
    };
  }


  getHighlightMatchedEvents(sessionId: string, users: HighlightUserConfig[], limit = 80): LiveEvent[] {
    if (!users.length) {
      return [];
    }

    const normalizedUsers = users
      .map((user) => ({ ...user, userId: normalizeHighlightIdentityToken(user.userId) }))
      .filter((user) => Boolean(user.userId));
    if (!normalizedUsers.length) {
      return [];
    }

    const exactIds = Array.from(new Set(normalizedUsers.filter((user) => !user.userId.includes('*')).map((user) => user.userId)));
    const wildcardUsers = normalizedUsers.filter((user) => user.userId.includes('*'));
    const args: Array<string | number> = [sessionId];
    const identityClauses: string[] = [];

    if (exactIds.length) {
      const placeholders = exactIds.map(() => '?').join(', ');
      const linkLikeClauses = exactIds.map(() => `LOWER(COALESCE(user_link, '')) LIKE '%' || ? || '%'`).join(' OR ');
      const payloadLinkLikeClauses = exactIds
        .map(() => `LOWER(COALESCE(json_extract(payload_json, '$.userLink'), '')) LIKE '%' || ? || '%'`)
        .join(' OR ');
      identityClauses.push(`LOWER(COALESCE(user_id, '')) IN (${placeholders})`);
      identityClauses.push(`LOWER(COALESCE(user_link, '')) IN (${placeholders})`);
      identityClauses.push(`(${linkLikeClauses})`);
      identityClauses.push(
        `json_valid(payload_json) AND LOWER(COALESCE(json_extract(payload_json, '$.userId'), '')) IN (${placeholders})`,
      );
      identityClauses.push(
        `json_valid(payload_json) AND (${payloadLinkLikeClauses})`,
      );
      identityClauses.push(
        `json_valid(payload_json) AND LOWER(COALESCE(json_extract(payload_json, '$.displayId'), '')) IN (${placeholders})`,
      );
      identityClauses.push(
        `json_valid(payload_json) AND LOWER(COALESCE(json_extract(payload_json, '$.shortId'), '')) IN (${placeholders})`,
      );
      identityClauses.push(
        `json_valid(payload_json) AND LOWER(COALESCE(json_extract(payload_json, '$.uniqueId'), '')) IN (${placeholders})`,
      );
      args.push(...exactIds, ...exactIds, ...exactIds, ...exactIds, ...exactIds, ...exactIds, ...exactIds, ...exactIds);
    }

    if (wildcardUsers.length) {
      identityClauses.push(`(NULLIF(user_id, '') IS NOT NULL OR NULLIF(user_link, '') IS NOT NULL OR NULLIF(payload_json, '') IS NOT NULL)`);
    }

    if (!identityClauses.length) {
      return [];
    }

    args.push(Math.max(limit * 8, 240));
    const candidates = this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE session_id = ?
          AND category IN ('comment', 'gift')
          AND (${identityClauses.join(' OR ')})
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .all(...args) as LiveEvent[];

    return candidates
      .filter((event) => normalizedUsers.some((user) => eventMatchesHighlightUser(event, user)))
      .slice(0, limit);
  }

  getAllEventsForSession(sessionId: string): LiveEvent[] {
    return this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(sessionId) as LiveEvent[];
  }


  getExportEventsForSession(sessionId: string): LiveEvent[] {
    return this.db
      .prepare(`
        SELECT
          id,
          unique_key AS uniqueKey,
          session_id AS sessionId,
          category,
          created_at AS createdAt,
          room_id AS roomId,
          room_title AS roomTitle,
          host_name AS hostName,
          user_name AS userName,
          user_id AS userId,
          user_link AS userLink,
          message,
          gift_name AS giftName,
          gift_count AS giftCount,
          payload_json AS payloadJson
        FROM events
        WHERE session_id = ?
        ORDER BY created_at ASC, id ASC
      `)
      .all(sessionId) as LiveEvent[];
  }

  getStats(sessionId: string): SessionStats {
    const rows = this.db
      .prepare(`
        SELECT
          category,
          total,
          gift_units AS giftUnits
        FROM session_event_totals
        WHERE session_id = ?
      `)
      .all(sessionId) as Array<{ category: string; total: number; giftUnits: number }>;

    const totals = {
      comment: 0,
      entry: 0,
      interaction: 0,
      gift: 0,
      log: 0,
      giftUnits: 0,
    };

    for (const row of rows) {
      if (row.category in totals) {
        totals[row.category as keyof typeof totals] = row.total;
      }
      if (row.category === 'gift') {
        totals.giftUnits = row.giftUnits;
      }
    }

    const uniqueUsers = this.db
      .prepare(`
        SELECT COUNT(*) AS total
        FROM session_unique_users
        WHERE session_id = ?
      `)
      .get(sessionId) as { total: number };

    const topGifts = this.db
      .prepare(`
        SELECT
          gift_name AS name,
          total
        FROM session_gift_totals
        WHERE session_id = ?
        ORDER BY total DESC, name ASC
        LIMIT 8
      `)
      .all(sessionId) as Array<{ name: string; total: number }>;

    const activeUsers = this.db
      .prepare(`
        SELECT
          name,
          total,
          entry_count AS entryCount,
          comment_count AS commentCount,
          gift_count AS giftCount,
          last_active_at AS lastActiveAt,
          user_id AS userId,
          user_link AS userLink
        FROM session_mystery_user_totals
        WHERE session_id = @sessionId
        ORDER BY lastActiveAt DESC, name ASC
        LIMIT 200
      `)
      .all({
        sessionId,
      }) as Array<{
        name: string;
        total: number;
        entryCount: number;
        commentCount: number;
        giftCount: number;
        lastActiveAt: string;
        userId?: string;
        userLink?: string;
      }>;
    const activitiesByIdentity = this.getMysteryUsersActivities(sessionId, activeUsers);
    const activeUsersWithActivities = activeUsers.map((user) => ({
      ...user,
      activities: activitiesByIdentity.get(this.getMysteryActivityLookupKey(user)) ?? [],
    }));

    return {
      sessionId,
      comments: totals.comment,
      entries: totals.entry,
      interactions: totals.interaction,
      gifts: totals.gift,
      giftUnits: totals.giftUnits,
      logs: totals.log,
      uniqueUsers: uniqueUsers.total ?? 0,
      topGifts,
      activeUsers: activeUsersWithActivities,
    };
  }

  getLatestKnownUserIdentity(
    sessionId: string,
    userName: string,
    roomId?: string,
  ): KnownUserIdentity | undefined {
    const state = this.getKnownUserIdentityState(sessionId, userName, roomId);
    if (state.status !== 'clean') {
      return undefined;
    }

    return {
      userId: state.userId,
      userLink: state.userLink,
    };
  }

  getKnownUserIdentityState(
    sessionId: string,
    userName: string,
    roomId?: string,
  ): KnownUserIdentityLookupState {
    const normalizedUserName = normalizeObservedName(userName);
    if (!normalizedUserName) {
      return { status: 'pending', identityKeys: [] };
    }

    const variants = Array.from(
      new Set(
        [normalizedUserName, `@${normalizedUserName}`]
          .map((value) => normalizeOptionalText(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    for (const variant of variants) {
      const bySession = this.findCachedKnownUserIdentityState('session', sessionId, variant);
      if (bySession.status === 'clean' || bySession.status === 'conflict') {
        return bySession;
      }
    }

    if (roomId) {
      for (const variant of variants) {
        const byRoom = this.findCachedKnownUserIdentityState('room', roomId, variant);
        if (byRoom.status === 'clean' || byRoom.status === 'conflict') {
          return byRoom;
        }
      }
    }

    return { status: 'pending', identityKeys: [] };
  }

  private findCachedKnownUserIdentityState(
    scopeType: 'session' | 'room',
    scopeId: string,
    userName: string,
  ): KnownUserIdentityLookupState {
    const normalizedName = normalizeObservedName(userName);
    if (!normalizedName || !scopeId) {
      return { status: 'pending', identityKeys: [] };
    }

    const rows = this.db
      .prepare(`
        SELECT
          COALESCE(NULLIF(cache.user_id, ''), NULLIF(cache.user_id_norm, '')) AS userId,
          cache.user_link AS userLink,
          cache.identity_key AS identityKey,
          cache.source_confidence AS sourceConfidence,
          cache.conflict_state AS conflictState,
          obs.observed_at AS observedAt
        FROM user_identity_name_observations AS obs
        JOIN user_identity_cache AS cache ON cache.identity_key = obs.identity_key
        WHERE obs.scope_type = ?
          AND obs.scope_id = ?
          AND obs.normalized_name = ?
          AND cache.source_confidence >= ?
        ORDER BY obs.observed_at DESC, cache.last_seen_at DESC
        LIMIT 3
      `)
      .all(scopeType, scopeId, normalizedName, IDENTITY_CACHE_CONFIDENCE) as Array<{
      userId?: string | null;
      userLink?: string | null;
      identityKey?: string | null;
    }>;

    const identityKeys = new Set(
      rows.map((row) => normalizeOptionalText(row.identityKey)).filter((value): value is string => Boolean(value)),
    );
    if (identityKeys.size !== 1) {
      return {
        status: identityKeys.size > 1 ? 'conflict' : 'pending',
        identityKeys: Array.from(identityKeys),
      };
    }

    const row = rows[0];
    const userId = normalizeOptionalText(row?.userId);
    const userLink = normalizeOptionalText(row?.userLink);
    if (!userId && !userLink) {
      return { status: 'pending', identityKeys: Array.from(identityKeys) };
    }

    return {
      status: 'clean',
      userId,
      userLink:
        userLink ||
        (userId && isDirectDouyinUserId(userId)
          ? `https://www.douyin.com/user/${encodeURIComponent(userId)}`
          : undefined),
      identityKeys: Array.from(identityKeys),
    };
  }

  private getMysteryActivityLookupKey(user: { name: string; userId?: string; userLink?: string }): string {
    return [user.name, user.userId, user.userLink]
      .map((value) => normalizeOptionalText(value))
      .filter((value): value is string => Boolean(value))
      .join('\u0001');
  }

  private getMysteryUsersActivities(
    sessionId: string,
    users: Array<{ name: string; userId?: string; userLink?: string }>,
  ): Map<string, SessionStats['activeUsers'][number]['activities']> {
    const result = new Map<string, SessionStats['activeUsers'][number]['activities']>();
    const identityToLookupKeys = new Map<string, Set<string>>();

    for (const user of users) {
      const lookupKey = this.getMysteryActivityLookupKey(user);
      result.set(lookupKey, []);
      for (const identity of [user.name, user.userId, user.userLink]) {
        const normalized = normalizeOptionalText(identity);
        if (!normalized) {
          continue;
        }
        const keys = identityToLookupKeys.get(normalized) ?? new Set<string>();
        keys.add(lookupKey);
        identityToLookupKeys.set(normalized, keys);
      }
    }

    const identityValues = Array.from(identityToLookupKeys.keys());
    if (!identityValues.length) {
      return result;
    }

    const placeholders = identityValues.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `
        SELECT
          COALESCE(NULLIF(user_link, ''), NULLIF(user_id, ''), NULLIF(user_name, '')) AS identityKey,
          category,
          created_at AS createdAt,
          message,
          gift_name AS giftName,
          gift_count AS giftCount
        FROM events
        WHERE session_id = ?
          AND category IN ('entry', 'interaction', 'comment', 'gift')
          AND COALESCE(NULLIF(user_link, ''), NULLIF(user_id, ''), NULLIF(user_name, '')) IN (${placeholders})
        ORDER BY created_at DESC, id DESC
      `,
      )
      .all(sessionId, ...identityValues) as Array<
      SessionStats['activeUsers'][number]['activities'][number] & { identityKey?: string }
    >;

    for (const row of rows) {
      const identityKey = normalizeOptionalText(row.identityKey);
      if (!identityKey) {
        continue;
      }
      for (const lookupKey of identityToLookupKeys.get(identityKey) ?? []) {
        const current = result.get(lookupKey) ?? [];
        if (current.length >= 30) {
          continue;
        }
        current.push({
          category: row.category,
          createdAt: row.createdAt,
          message: row.message,
          giftName: row.giftName,
          giftCount: row.giftCount,
        });
        result.set(lookupKey, current);
      }
    }

    return result;
  }

  close(): void {
    this.db.close();
  }
}
