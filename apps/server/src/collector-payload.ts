import type { RawCollectorEvent } from './types.js';
import { normalizeWhitespace } from './utils.js';

const allowedCategories = new Set(['comment', 'entry', 'interaction', 'gift']);

export type CollectorPayloadInput = Record<string, unknown>;

export function normalizeCollectorPayloadItem(item: unknown): RawCollectorEvent | undefined {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  const source = item as CollectorPayloadInput;
  const categoryValue = normalizeWhitespace(String(source.category ?? 'comment'));
  const category = allowedCategories.has(categoryValue) ? (categoryValue as RawCollectorEvent['category']) : 'comment';
  const text = normalizeWhitespace(String(source.text ?? source.rawText ?? ''));
  const rawText = normalizeWhitespace(String(source.rawText ?? source.text ?? ''));
  if (!text) {
    return undefined;
  }
  const collectorClientId = normalizeWhitespace(String(source.collectorClientId ?? '')) || undefined;
  return {
    category,
    text,
    rawText,
    sourceId: normalizeWhitespace(String(source.sourceId ?? '')) || undefined,
    ...(collectorClientId ? { collectorClientId } : {}),
    userName: normalizeWhitespace(String(source.userName ?? '')) || undefined,
    userId: normalizeWhitespace(String(source.userId ?? '')) || undefined,
    userLink: normalizeWhitespace(String(source.userLink ?? '')) || undefined,
    giftName: normalizeWhitespace(String(source.giftName ?? '')) || undefined,
    giftCount: typeof source.giftCount === 'number' && Number.isFinite(source.giftCount) ? source.giftCount : undefined,
  };
}

export function normalizeCollectorPayloadBatch(payload: unknown): RawCollectorEvent[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((item) => normalizeCollectorPayloadItem(item))
    .filter((item): item is RawCollectorEvent => Boolean(item));
}
