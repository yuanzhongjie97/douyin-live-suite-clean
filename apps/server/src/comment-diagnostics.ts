import { createHash } from 'node:crypto';
import type { LiveEvent, RawCollectorEvent } from './types.js';

type CounterMap = Record<string, number>;

export type CommentDecisionStage =
  | 'collector.digest'
  | 'collector.push'
  | 'collector.flush'
  | 'collector.binding'
  | 'service.onEvents'
  | 'service.persist'
  | 'service.filter'
  | 'service.dedupe'
  | 'service.row'
  | 'db.insert'
  | 'bus.publish'
  | 'sse.queue'
  | 'sse.flush'
  | 'api.events';

export interface CommentDecision {
  at: string;
  stage: CommentDecisionStage;
  reason: string;
  diagId?: string;
  sessionId?: string;
  category?: string;
  sourceId?: string;
  uniqueKey?: string;
  message?: string;
  rawText?: string;
  userName?: string;
  userId?: string;
  userLink?: string;
  extra?: Record<string, unknown>;
}

const MAX_DECISIONS = 800;
const TEXT_LIMIT = 160;

function trimText(value: unknown): string | undefined {
  const normalized = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.length > TEXT_LIMIT ? `${normalized.slice(0, TEXT_LIMIT)}...` : normalized;
}

export function buildCommentDiagId(
  sessionId: string | undefined,
  row: Partial<RawCollectorEvent | LiveEvent>,
): string {
  const maybeRaw = row as Partial<RawCollectorEvent>;
  const maybeLive = row as Partial<LiveEvent>;
  const stable = [
    sessionId ?? '',
    maybeRaw.sourceId ?? '',
    maybeRaw.rawText ?? '',
    maybeRaw.text ?? '',
    maybeLive.message ?? '',
    row.userName ?? '',
    row.userId ?? '',
    row.userLink ?? '',
  ].join('|');
  return createHash('sha1').update(stable).digest('hex').slice(0, 16);
}

export class CommentDiagnostics {
  private counters: CounterMap = {};
  private decisions: CommentDecision[] = [];

  increment(name: string, by = 1): void {
    this.counters[name] = (this.counters[name] ?? 0) + by;
  }

  record(decision: Omit<CommentDecision, 'at'>): void {
    const row: CommentDecision = {
      ...decision,
      at: new Date().toISOString(),
      message: trimText(decision.message),
      rawText: trimText(decision.rawText),
      userName: trimText(decision.userName),
      userId: trimText(decision.userId),
      userLink: trimText(decision.userLink),
    };
    this.decisions.push(row);
    if (this.decisions.length > MAX_DECISIONS) {
      this.decisions.splice(0, this.decisions.length - MAX_DECISIONS);
    }
  }

  snapshot(): { counters: CounterMap; recent: CommentDecision[]; generatedAt: string } {
    return {
      counters: { ...this.counters },
      recent: [...this.decisions],
      generatedAt: new Date().toISOString(),
    };
  }

  reset(): void {
    this.counters = {};
    this.decisions = [];
  }
}

export const commentDiagnostics = new CommentDiagnostics();
