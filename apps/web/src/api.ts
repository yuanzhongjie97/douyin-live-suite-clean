import type {
  BrowserState,
  EventCategory,
  HighlightUsersSnapshot,
  LiveEvent,
  RuntimeSnapshot,
  SessionRecord,
  SessionStats,
} from './types';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(payload.message || '请求失败');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    return request('/api/sessions/active');
  },
  getSessions(limit = 12): Promise<{ items: SessionRecord[] }> {
    return request(`/api/sessions?limit=${limit}`);
  },
  getStats(sessionId?: string): Promise<SessionStats> {
    const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
    return request(`/api/stats${query}`);
  },
  getEvents(category: EventCategory, sessionId?: string, limit = 80): Promise<{ items: LiveEvent[] }> {
    const params = new URLSearchParams({
      category,
      limit: String(limit),
    });
    if (sessionId) {
      params.set('sessionId', sessionId);
    }
    return request(`/api/events?${params.toString()}`);
  },
  getCommentDiagnostics(): Promise<{
    counters: Record<string, number>;
    recent: unknown[];
    generatedAt: string;
  }> {
    return request('/api/diagnostics/comment-flow');
  },
  getEventDiagnostics(
    sessionId: string,
    category: EventCategory,
    limit = 1000,
  ): Promise<{ items: LiveEvent[] }> {
    const params = new URLSearchParams({
      sessionId,
      category,
      limit: String(limit),
    });
    return request(`/api/diagnostics/events?${params.toString()}`);
  },
  getHighlightUsers(
    sessionId?: string,
    options?: { includeMatched?: boolean },
  ): Promise<HighlightUsersSnapshot> {
    const params = new URLSearchParams();
    if (sessionId) {
      params.set('sessionId', sessionId);
    }
    if (options?.includeMatched === false) {
      params.set('includeMatched', 'false');
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/highlight-users${query}`);
  },
  startSession(url: string): Promise<{ session: SessionRecord }> {
    return request('/api/sessions/start', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },
  stopSession(): Promise<{ ok: boolean }> {
    return request('/api/sessions/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  getBrowserState(): Promise<BrowserState> {
    return request('/api/browser/state');
  },
  openLoginWindow(url: string): Promise<{ ok: boolean }> {
    return request('/api/browser/login', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },
  closeLoginWindow(): Promise<{ ok: boolean }> {
    return request('/api/browser/login/close', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  resolveUserProfile(payload: {
    userName?: string;
    userId?: string;
    userLink?: string;
    rawText?: string;
    message?: string;
  }): Promise<{ url?: string }> {
    return request('/api/users/resolve-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  openUserProfile(payload: {
    userName?: string;
    userId?: string;
    userLink?: string;
    rawText?: string;
    message?: string;
  }): Promise<{ ok: boolean; url?: string }> {
    return request('/api/users/open-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getExportUrl(sessionId?: string): string {
    if (!sessionId) {
      return '/api/export.xlsx';
    }
    return `/api/export.xlsx?sessionId=${encodeURIComponent(sessionId)}`;
  },
};

