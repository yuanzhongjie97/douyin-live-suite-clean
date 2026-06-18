export type EventCategory = 'comment' | 'entry' | 'interaction' | 'gift' | 'log';
export type SessionStatus = 'running' | 'stopped' | 'error';

export interface SessionRecord {
  id: string;
  url: string;
  status: SessionStatus;
  roomId?: string;
  roomTitle?: string;
  hostName?: string;
  startedAt: string;
  endedAt?: string;
  lastHeartbeatAt?: string;
  errorMessage?: string;
}

export interface RoomSnapshot {
  url: string;
  roomId?: string;
  roomTitle?: string;
  hostName?: string;
  isLive: boolean;
  lastHeartbeatAt: string;
}

export interface LiveEvent {
  id?: number;
  uniqueKey: string;
  sessionId: string;
  category: EventCategory;
  createdAt: string;
  roomId?: string;
  roomTitle?: string;
  hostName?: string;
  userName?: string;
  userId?: string;
  userLink?: string;
  message: string;
  giftName?: string;
  giftCount?: number;
  payloadJson?: string;
}

export interface UserIdentityObservation {
  sessionId: string;
  roomId?: string;
  userName?: string;
  userId?: string;
  userLink?: string;
  category?: EventCategory;
  source?: string;
  observedAt: string;
}

export interface RawCollectorEvent {
  category: Exclude<EventCategory, 'log'>;
  text: string;
  rawText?: string;
  sourceId?: string;
  collectorClientId?: string;
  ingestSeq?: number;
  userName?: string;
  userId?: string;
  userLink?: string;
  giftName?: string;
  giftCount?: number;
  identityBackfillSource?: 'identity_cache';
  identityBackfillMatchedName?: string;
}

export interface SessionStats {
  sessionId?: string;
  comments: number;
  entries: number;
  interactions: number;
  gifts: number;
  giftUnits: number;
  logs: number;
  uniqueUsers: number;
  topGifts: Array<{ name: string; total: number }>;
  activeUsers: Array<{
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
  }>;
}


export interface HighlightUserConfig {
  userId: string;
  remark?: string;
  line: number;
}

export interface HighlightUsersSnapshot {
  filePath: string;
  exists: boolean;
  users: HighlightUserConfig[];
  matchedEvents: LiveEvent[];
  updatedAt: string;
  error?: string;
}

export interface HighlightUsersQuery {
  sessionId?: string;
  includeMatched?: boolean;
}
export interface RuntimeSnapshot {
  activeSession: SessionRecord | null;
  room: RoomSnapshot | null;
}

export interface BrowserInstallState {
  status: 'idle' | 'installing' | 'ready' | 'error';
  phase?: string;
  progressPercent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  totalLabel?: string;
  message?: string;
  error?: string;
}

export interface EventQuery {
  sessionId?: string;
  category?: EventCategory;
  limit?: number;
}

export interface EventHistoryCursor {
  createdAt: string;
  id: number;
}

export interface EventHistoryQuery {
  sessionId: string;
  category: Extract<EventCategory, 'comment' | 'gift'>;
  limit?: number;
  cursorCreatedAt?: string;
  cursorId?: number;
  q?: string;
}

export interface EventHistoryResult {
  items: LiveEvent[];
  nextCursor?: EventHistoryCursor;
}

export interface CollectorCallbacks {
  onEvents(events: RawCollectorEvent[]): Promise<void> | void;
  onStatus(message: string, level?: 'info' | 'warn' | 'error'): Promise<void> | void;
  onRoomUpdate(snapshot: Partial<RoomSnapshot>): Promise<void> | void;
  onPageRestart?(page: unknown): Promise<void> | void;
  onFatal(error: Error): Promise<void> | void;
}

