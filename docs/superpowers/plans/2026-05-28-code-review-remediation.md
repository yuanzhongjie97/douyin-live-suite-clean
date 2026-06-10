# Code Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the concrete security, correctness, dependency, and coverage risks found in the May 28, 2026 code review of `douyin-live-suite-clean`.

**Architecture:** Keep the current Electron + local Fastify architecture, but tighten trust boundaries around the local API. Add small validation modules and tests rather than restructuring the large app files during the security fix.

**Tech Stack:** TypeScript, Fastify, Zod, React/Vite, Electron, Playwright, SQLite, npm audit.

---

## Issue Summary

1. Local API can be driven by arbitrary websites because CORS allows every origin and state-changing endpoints have no request secret.
2. User-provided URLs are accepted as any URL, including non-Douyin hosts and unsafe protocols, before Playwright navigation.
3. Production dependencies have npm audit findings, including high-severity transitive vulnerabilities and a direct `@fastify/static` advisory.
4. `includeMatched=false` is parsed as `true` because `z.coerce.boolean()` treats every non-empty string as truthy.
5. `collector.ts` is core logic but disables TypeScript checking and accepts page-origin payloads without a schema gate.
6. There are no test scripts covering the risky boundary logic.

## File Structure

- Modify `apps/server/src/security.ts`: new local API request secret and Douyin URL allowlist helpers.
- Modify `apps/server/src/index.ts`: restrict CORS, require the API secret for mutating/browser-driving endpoints, and replace unsafe boolean parsing.
- Modify `apps/server/src/utils.ts`: make `normalizeLiveUrl()` reject unsupported protocols and hosts or add a separate strict helper in `security.ts`.
- Modify `apps/server/src/collector.ts`: validate `__douyinCollectorBatch` payload rows before callbacks.
- Create `apps/server/src/security.test.ts`: tests for origin checks, API secret checks, Douyin URL allowlist, and boolean parsing.
- Create `apps/server/src/collector-payload.test.ts`: tests for collector payload schema behavior.
- Modify `apps/server/package.json`: add `test` script and test dependency.
- Modify root `package.json`: add workspace test script.
- Modify `package-lock.json`: update after dependency upgrades.

---

### Task 1: Lock Down Local API Access

**Files:**
- Create: `apps/server/src/security.ts`
- Modify: `apps/server/src/index.ts`
- Test: `apps/server/src/security.test.ts`

- [ ] **Step 1: Add a security helper module**

Create `apps/server/src/security.ts`:

```ts
import type { FastifyRequest } from 'fastify';

const ALLOWED_BROWSER_ORIGINS = new Set([
  'http://127.0.0.1',
  'http://localhost',
]);

export function isAllowedLocalOrigin(origin: string | undefined, serverPort: number): boolean {
  if (!origin) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    if (!ALLOWED_BROWSER_ORIGINS.has(`${parsed.protocol}//${parsed.hostname}`)) {
      return false;
    }
    return parsed.port === String(serverPort) || parsed.port === '';
  } catch {
    return false;
  }
}

export function getApiSecret(): string {
  return process.env.DOUYIN_LIVE_SUITE_API_SECRET || '';
}

export function requestHasApiSecret(request: FastifyRequest): boolean {
  const expected = getApiSecret();
  if (!expected) {
    return process.env.NODE_ENV !== 'production';
  }

  const provided = request.headers['x-douyin-live-suite-token'];
  return typeof provided === 'string' && provided === expected;
}

export function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === true || value === 'true' || value === '1') {
    return true;
  }
  if (value === false || value === 'false' || value === '0') {
    return false;
  }
  return undefined;
}
```

- [ ] **Step 2: Write tests for the helpers**

Create `apps/server/src/security.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedLocalOrigin, parseOptionalBoolean } from './security.js';

test('allows same local origins only', () => {
  assert.equal(isAllowedLocalOrigin(undefined, 3100), true);
  assert.equal(isAllowedLocalOrigin('http://127.0.0.1:3100', 3100), true);
  assert.equal(isAllowedLocalOrigin('http://localhost:3100', 3100), true);
  assert.equal(isAllowedLocalOrigin('https://evil.example', 3100), false);
  assert.equal(isAllowedLocalOrigin('http://127.0.0.1:9999', 3100), false);
});

test('parses optional booleans without truthy string coercion', () => {
  assert.equal(parseOptionalBoolean(undefined), undefined);
  assert.equal(parseOptionalBoolean('true'), true);
  assert.equal(parseOptionalBoolean('1'), true);
  assert.equal(parseOptionalBoolean('false'), false);
  assert.equal(parseOptionalBoolean('0'), false);
  assert.equal(parseOptionalBoolean('nope'), undefined);
});
```

- [ ] **Step 3: Wire CORS and mutating endpoint protection**

In `apps/server/src/index.ts`, import helpers:

```ts
import { isAllowedLocalOrigin, parseOptionalBoolean, requestHasApiSecret } from './security.js';
```

Replace CORS registration:

```ts
await app.register(cors, {
  origin: (origin, callback) => {
    callback(null, isAllowedLocalOrigin(origin, config.port));
  },
});
```

Add helper inside `buildApp()`:

```ts
const requireApiSecret = async (request: Parameters<FastifyInstance['post']>[1] extends never ? never : FastifyRequest, reply: FastifyReply) => {
  if (!requestHasApiSecret(request)) {
    return reply.status(403).send({ message: 'Forbidden' });
  }
  return undefined;
};
```

If the Fastify type expression is awkward, use explicit imports:

```ts
import type { FastifyReply, FastifyRequest } from 'fastify';

const requireApiSecret = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!requestHasApiSecret(request)) {
    return reply.status(403).send({ message: 'Forbidden' });
  }
  return undefined;
};
```

Call this guard at the top of these handlers and return early when it sends:

```ts
const denied = await requireApiSecret(request, reply);
if (denied) {
  return denied;
}
```

Apply it to:

- `POST /api/sessions/start`
- `POST /api/sessions/stop`
- `POST /api/browser/login`
- `POST /api/browser/login/close`
- `POST /api/users/resolve-profile`
- `POST /api/users/open-profile`

- [ ] **Step 4: Replace unsafe boolean parsing**

In `apps/server/src/index.ts`, change `/api/highlight-users` query parsing from `z.coerce.boolean()` to:

```ts
includeMatched: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm --workspace apps/server test
```

Expected: helper tests pass after the test script is added in Task 5.

---

### Task 2: Restrict Browser Navigation to Douyin

**Files:**
- Modify: `apps/server/src/security.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/capture-service.ts`
- Test: `apps/server/src/security.test.ts`

- [ ] **Step 1: Add strict Douyin URL normalization**

Append to `apps/server/src/security.ts`:

```ts
const ALLOWED_DOUYIN_HOSTS = new Set(['www.douyin.com', 'live.douyin.com']);

export function normalizeAllowedDouyinUrl(input: string, mode: 'live' | 'any' = 'any'): string {
  const parsed = new URL(input);
  if (parsed.protocol !== 'https:') {
    throw new Error('只支持 https 抖音链接。');
  }
  if (!ALLOWED_DOUYIN_HOSTS.has(parsed.hostname)) {
    throw new Error('只支持 douyin.com 官方链接。');
  }

  parsed.hash = '';
  parsed.search = mode === 'live' ? '' : parsed.search;

  const roomId = (parsed.pathname.match(/^\/(\d{6,})(?:\/|$)/u) || [])[1];
  if (mode === 'live') {
    if (parsed.hostname !== 'live.douyin.com' || !roomId) {
      throw new Error('请输入抖音直播间链接。');
    }
    return `https://live.douyin.com/${roomId}`;
  }

  return parsed.toString().replace(/\/$/u, '');
}
```

- [ ] **Step 2: Add URL tests**

Append to `apps/server/src/security.test.ts`:

```ts
import { normalizeAllowedDouyinUrl } from './security.js';

test('normalizes allowed Douyin live URLs', () => {
  assert.equal(
    normalizeAllowedDouyinUrl('https://live.douyin.com/127874409138?foo=bar#x', 'live'),
    'https://live.douyin.com/127874409138',
  );
});

test('rejects unsafe or non-Douyin URLs', () => {
  assert.throws(() => normalizeAllowedDouyinUrl('http://live.douyin.com/127874409138', 'live'));
  assert.throws(() => normalizeAllowedDouyinUrl('https://evil.example/127874409138', 'live'));
  assert.throws(() => normalizeAllowedDouyinUrl('file:///C:/Windows/win.ini', 'live'));
  assert.throws(() => normalizeAllowedDouyinUrl('javascript:alert(1)', 'live'));
});
```

- [ ] **Step 3: Use strict normalization at API boundary**

In `apps/server/src/index.ts`, import:

```ts
import { normalizeAllowedDouyinUrl } from './security.js';
```

For `/api/sessions/start`, after Zod parse:

```ts
const targetUrl = normalizeAllowedDouyinUrl(body.url, 'live');
const session = await service.start(targetUrl);
```

For `/api/browser/login`, after Zod parse:

```ts
const targetUrl = body.url ? normalizeAllowedDouyinUrl(body.url, 'any') : undefined;
await service.openLoginWindow(targetUrl);
```

- [ ] **Step 4: Remove duplicate permissive behavior from service entrypoints**

In `apps/server/src/capture-service.ts`, keep internal normalization only for already validated values:

```ts
const targetUrl = normalizeLiveUrl(url);
```

This can remain as a canonicalizer, but do not rely on it as validation.

- [ ] **Step 5: Run focused tests and build**

Run:

```bash
npm --workspace apps/server test
npm run build
```

Expected: tests pass and build succeeds.

---

### Task 3: Fix Dependency Vulnerabilities

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/desktop/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Upgrade direct vulnerable dependency**

Run:

```bash
npm install @fastify/static@^9.1.3 --workspace apps/server --workspace apps/desktop
```

Expected: `apps/server/package.json`, `apps/desktop/package.json`, and `package-lock.json` update.

- [ ] **Step 2: Run production audit**

Run:

```bash
npm audit --omit=dev
```

Expected: no high vulnerabilities. If moderate vulnerabilities remain through `exceljs`/`uuid`, document them with package path and check whether a safe `exceljs` version exists.

- [ ] **Step 3: Build after dependency change**

Run:

```bash
npm run build
```

Expected: server and web build pass.

- [ ] **Step 4: Smoke test static serving**

Run server after build:

```bash
npm --workspace apps/server start
```

Open or request:

```bash
curl http://127.0.0.1:3100/api/health
curl http://127.0.0.1:3100/
```

Expected: health returns `{"ok":true}` and `/` returns the built web HTML.

---

### Task 4: Add Collector Payload Runtime Validation

**Files:**
- Modify: `apps/server/src/collector.ts`
- Create: `apps/server/src/collector-payload.ts`
- Test: `apps/server/src/collector-payload.test.ts`

- [ ] **Step 1: Extract payload schema**

Create `apps/server/src/collector-payload.ts`:

```ts
import { z } from 'zod';
import type { RawCollectorEvent } from './types.js';
import { normalizeWhitespace } from './utils.js';

const rawCollectorEventSchema = z.object({
  category: z.enum(['comment', 'entry', 'interaction', 'gift']).default('comment'),
  text: z.unknown().optional(),
  rawText: z.unknown().optional(),
  sourceId: z.unknown().optional(),
  userName: z.unknown().optional(),
  userId: z.unknown().optional(),
  userLink: z.unknown().optional(),
  giftName: z.unknown().optional(),
  giftCount: z.number().int().positive().max(100000).optional(),
});

export function parseCollectorBatchPayload(payload: unknown): RawCollectorEvent[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((item) => rawCollectorEventSchema.safeParse(item))
    .filter((result): result is z.SafeParseSuccess<z.infer<typeof rawCollectorEventSchema>> => result.success)
    .map(({ data }) => ({
      category: data.category,
      text: normalizeWhitespace(String(data.text ?? data.rawText ?? '')),
      rawText: normalizeWhitespace(String(data.rawText ?? data.text ?? '')),
      sourceId: normalizeWhitespace(String(data.sourceId ?? '')) || undefined,
      userName: normalizeWhitespace(String(data.userName ?? '')) || undefined,
      userId: normalizeWhitespace(String(data.userId ?? '')) || undefined,
      userLink: normalizeWhitespace(String(data.userLink ?? '')) || undefined,
      giftName: normalizeWhitespace(String(data.giftName ?? '')) || undefined,
      giftCount: data.giftCount,
    }))
    .filter((item) => item.text);
}
```

- [ ] **Step 2: Add tests**

Create `apps/server/src/collector-payload.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCollectorBatchPayload } from './collector-payload.js';

test('parses valid collector rows and normalizes text fields', () => {
  const rows = parseCollectorBatchPayload([
    { category: 'comment', text: '  hello   world ', userName: ' Alice ' },
  ]);

  assert.deepEqual(rows, [
    {
      category: 'comment',
      text: 'hello world',
      rawText: 'hello world',
      userName: 'Alice',
      sourceId: undefined,
      userId: undefined,
      userLink: undefined,
      giftName: undefined,
      giftCount: undefined,
    },
  ]);
});

test('drops invalid collector rows', () => {
  assert.deepEqual(parseCollectorBatchPayload(null), []);
  assert.deepEqual(parseCollectorBatchPayload([{ category: 'admin', text: 'bad' }]), []);
  assert.deepEqual(parseCollectorBatchPayload([{ category: 'gift', text: 'gift', giftCount: -1 }]), []);
});
```

- [ ] **Step 3: Use parser in collector binding**

In `apps/server/src/collector.ts`, import:

```ts
import { parseCollectorBatchPayload } from './collector-payload.js';
```

Replace the mapping in the `batchHandlers.set(...)` callback with:

```ts
const rows = parseCollectorBatchPayload(payload);
if (rows.length) {
  await this.callbacks.onEvents(rows);
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm --workspace apps/server test
npm run build
```

Expected: parser tests pass and build succeeds.

---

### Task 5: Add Test Scripts and Minimum Regression Coverage

**Files:**
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add server test script**

In `apps/server/package.json`, update scripts:

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node dist/index.js",
  "test": "tsx --test \"src/**/*.test.ts\"",
  "install:playwright": "playwright install chromium"
}
```

- [ ] **Step 2: Add root test script**

In root `package.json`, update scripts:

```json
"test": "npm --workspace apps/server test"
```

Keep existing scripts unchanged.

- [ ] **Step 3: Run test suite**

Run:

```bash
npm test
```

Expected: all `node:test` tests pass.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: full build passes.

---

## Final Verification Checklist

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit --omit=dev` has no high vulnerabilities.
- [ ] `POST /api/sessions/start` rejects missing/incorrect `x-douyin-live-suite-token` in production mode.
- [ ] `POST /api/sessions/start` rejects `file://`, `http://`, `javascript:`, and non-Douyin URLs.
- [ ] `GET /api/highlight-users?includeMatched=false` returns no matched events.
- [ ] Existing desktop startup still loads local `serverUrl`.

## Execution Order

1. Task 5 first if test scripts do not exist.
2. Task 1 and Task 2 next because they close the highest-risk local API attack surface.
3. Task 3 after security behavior is tested, because dependency upgrades can have package-level side effects.
4. Task 4 after the API boundary is safe, because it improves long-term collector safety without changing user-visible flow.

