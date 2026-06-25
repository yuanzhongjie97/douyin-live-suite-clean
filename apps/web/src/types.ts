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


export interface HighlightUserConfig {
  userId: string;
  remark?: string;
  line: number;
  identityKind?: 'short_id' | 'direct_profile_id' | 'profile_url' | 'wildcard' | 'unknown';
  status?: 'resolvable' | 'partially_resolvable' | 'unresolved';
  warning?: string;
}

export interface HighlightUsersSnapshot {
  filePath: string;
  exists: boolean;
  users: HighlightUserConfig[];
  matchedEvents: LiveEvent[];
  updatedAt: string;
  error?: string;
}
export interface RuntimeSnapshot {
  activeSession: SessionRecord | null;
  room: RoomSnapshot | null;
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

export interface EventHistoryCursor {
  createdAt: string;
  id: number;
}

export interface EventHistoryResult {
  items: LiveEvent[];
  nextCursor?: EventHistoryCursor;
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

export interface StreamMessage {
  type: 'event' | 'events' | 'session';
  payload: LiveEvent | LiveEvent[] | RuntimeSnapshot;
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

export interface BrowserState {
  loginWindowOpen: boolean;
  loggedIn: boolean;
  profileDisplayName?: string;
  chromiumInstall?: BrowserInstallState;
}


