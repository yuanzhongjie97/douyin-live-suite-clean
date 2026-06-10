import { randomBytes, timingSafeEqual } from 'node:crypto';

const LOCAL_API_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const ALLOWED_DOUYIN_HOSTS = new Set(['www.douyin.com', 'live.douyin.com']);
export const LOCAL_API_COOKIE_NAME = 'douyin_live_suite_token';

function parseHttpUrl(value: string | undefined): URL | undefined {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  try {
    return new URL(normalized);
  } catch {
    return undefined;
  }
}

export function isAllowedLocalApiOrigin(origin: string | undefined): boolean {
  const normalized = String(origin ?? '').trim();
  if (!normalized) {
    return true;
  }

  const parsed = parseHttpUrl(origin);
  if (!parsed) {
    return false;
  }

  return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && LOCAL_API_HOSTS.has(parsed.hostname);
}

export function isCrossSiteStateChangingRequest(input: {
  method: string;
  origin?: string;
  secFetchSite?: string;
}): boolean {
  const method = input.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return false;
  }

  const fetchSite = String(input.secFetchSite ?? '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return true;
  }

  return !isAllowedLocalApiOrigin(input.origin);
}

export function createLocalApiToken(): string {
  return randomBytes(32).toString('base64url');
}

function parseCookieHeader(value: string | string[] | undefined): Map<string, string> {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const cookies = new Map<string, string>();

  for (const header of values) {
    for (const part of String(header).split(';')) {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      if (!name) {
        continue;
      }
      cookies.set(name, decodeURIComponent(rawValue));
    }
  }

  return cookies;
}

function safeTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hasValidLocalApiToken(
  headers: { cookie?: string | string[] | undefined },
  expectedToken: string,
): boolean {
  const providedToken = parseCookieHeader(headers.cookie).get(LOCAL_API_COOKIE_NAME) ?? '';
  return Boolean(providedToken) && safeTokenEquals(providedToken, expectedToken);
}

export function serializeLocalApiCookie(token: string): string {
  return [
    `${LOCAL_API_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/api',
    'HttpOnly',
    'SameSite=Strict',
  ].join('; ');
}

function normalizeDouyinUrl(value: string | undefined): URL | undefined {
  const parsed = parseHttpUrl(value);
  if (!parsed || parsed.protocol !== 'https:' || !ALLOWED_DOUYIN_HOSTS.has(parsed.hostname)) {
    return undefined;
  }

  parsed.hash = '';
  return parsed;
}

export function normalizeAllowedDouyinLiveUrl(value: string | undefined): string | undefined {
  const parsed = normalizeDouyinUrl(value);
  if (!parsed || parsed.hostname !== 'live.douyin.com') {
    return undefined;
  }

  const roomId = parsed.pathname.match(/^\/(\d{6,})(?:\/)?$/u)?.[1];
  if (!roomId) {
    return undefined;
  }

  return `https://live.douyin.com/${roomId}`;
}

export function normalizeAllowedDouyinEntryUrl(value: string | undefined): string | undefined {
  const parsed = normalizeDouyinUrl(value);
  if (!parsed) {
    return undefined;
  }

  if (parsed.hostname === 'live.douyin.com') {
    return normalizeAllowedDouyinLiveUrl(parsed.toString());
  }

  if (parsed.pathname === '/' || parsed.pathname === '') {
    return 'https://www.douyin.com';
  }

  if (/^\/(?:user|follow)\/[^/?#]+$/u.test(parsed.pathname)) {
    parsed.search = '';
    return parsed.toString().replace(/\/$/u, '');
  }

  if (/^\/search\/[^/?#]+$/u.test(parsed.pathname) && parsed.searchParams.get('type') === 'user') {
    parsed.search = '?type=user';
    return parsed.toString().replace(/\/$/u, '');
  }

  return undefined;
}
