# V26.5.29.1 评论丢失诊断计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 `V26.5.29.2-diagnostic` 诊断版，先定位评论丢在采集端、后端入库/SSE、API 回填还是前端显示层，再决定业务修复。

**Architecture:** 不先继续放宽去重规则。给每条评论建立跨层 `diagId`，在采集端、服务端、DB、SSE、API、前端队列和显示层记录 counters + 最近样本 ring buffer，通过本地诊断接口和前端复制诊断按钮导出证据。

**Tech Stack:** TypeScript, Node/Electron, Fastify, better-sqlite3, React, Playwright 注入脚本。

---

## 当前判断

`V26.5.29.1` 已修复后端 `sourceId` 过重去重和前端 SSE error 补拉，但真实直播间仍丢评论。三位 subagent 的只读结论显示，现有回归没有覆盖真实页面注入脚本、采集端 `push()` 双层去重、DB 实际插入数、SSE 队列裁剪、API 默认 80 条回填窗口、前端队列溢出和显示层裁剪。

本轮目标不是直接发布普通修复版，而是先发布诊断版拿证据。诊断版只保留内存样本，不写持久文件，样本上限固定，避免无限日志和隐私扩散。

## 文件结构

- Create: `apps/server/src/comment-diagnostics.ts`
  - 负责生成 `diagId`、维护 counters、维护最近 comment 决策 ring buffer、导出快照。
- Modify: `apps/server/src/collector.ts`
  - 在页面注入脚本、`push()`、`flush()`、Node binding 归一化边界记录采集端原因码。
- Modify: `apps/server/src/capture-service.ts`
  - 在 `onEvents`、`persistCollectorEvents`、过滤、去重、row 构造、bus publish 边界记录原因码。
- Modify: `apps/server/src/db.ts`
  - 让 `insertEvents()` 返回 attempted/inserted/ignored unique 计数和 inserted keys，用于诊断 DB 静默忽略。
- Modify: `apps/server/src/index.ts`
  - 记录 SSE queue/flush/write/trim，并新增本地诊断接口。
- Modify: `apps/server/src/types.ts`
  - 如需要，为诊断字段补充窄类型，不改变业务事件结构。
- Modify: `apps/web/src/api.ts`
  - 支持诊断接口和可传入 `limit` 的回填调用。
- Modify: `apps/web/src/App.tsx`
  - 记录前端 SSE、incoming queue、flush、display dedupe、清屏过滤、DOM 行数诊断；增加“复制诊断”按钮。
- Create: `apps/server/scripts/regression-comment-diagnostics.mjs`
  - 覆盖后端诊断 counters、DB inserted count、SSE trim 计数和 API limit。
- Create: `apps/web/scripts/regression-comment-display-diagnostics.mjs`
  - 覆盖前端清屏边界、队列溢出、80+ 回填窗口、同 rawText 不同用户显示。
- Modify: `docs/subagent-progress.md`
  - 每次调查、代码改动、验证、打包结果都追加记录。

---

### Task 1: Server Diagnostics Core

**Files:**
- Create: `apps/server/src/comment-diagnostics.ts`

- [ ] **Step 1: Create the diagnostics module**

Add this file:

```ts
import { createHash } from 'node:crypto';
import type { RawCollectorEvent, LiveEvent } from './types.js';

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
  if (!normalized) return undefined;
  return normalized.length > TEXT_LIMIT ? `${normalized.slice(0, TEXT_LIMIT)}...` : normalized;
}

export function buildCommentDiagId(sessionId: string | undefined, row: Partial<RawCollectorEvent | LiveEvent>): string {
  const stable = [
    sessionId ?? '',
    row.sourceId ?? '',
    row.rawText ?? '',
    'text' in row ? row.text ?? '' : '',
    'message' in row ? row.message ?? '' : '',
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

  snapshot() {
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
```

- [ ] **Step 2: Type check**

Run:

```powershell
npm --workspace apps/server run build
```

Expected: TypeScript build passes. If import extensions fail, match existing local import style in nearby files.

---

### Task 2: Collector Boundary Diagnostics

**Files:**
- Modify: `apps/server/src/collector.ts`

- [ ] **Step 1: Record Node binding normalization counts**

In `batchHandlers.set(this.context, async (payload) => { ... })`, before and after `rows` normalization, record:

```ts
commentDiagnostics.increment('collector.binding.payload_batches');
commentDiagnostics.increment('collector.binding.payload_items', Array.isArray(payload) ? payload.length : 0);
```

For every normalized item where `category === 'comment'`, record `collector.binding.comment_received`. For every object filtered because final `text` is empty while `rawText` exists, record `collector.binding.filtered_empty_text` with `rawText`, `sourceId`, `userName`, `userId`, `userLink`.

- [ ] **Step 2: Expose a page-side diagnostic binding**

Add a second exposed binding beside `__douyinCollectorBatch`:

```ts
await boundContext.exposeBinding('__douyinCollectorDiag', async (_source, event) => {
  if (!event || typeof event !== 'object') return;
  const item = event as Record<string, unknown>;
  commentDiagnostics.increment(`collector.${String(item.reason ?? 'unknown')}`);
  commentDiagnostics.record({
    stage: String(item.stage ?? 'collector.digest') as CommentDecisionStage,
    reason: String(item.reason ?? 'unknown'),
    category: String(item.category ?? ''),
    sourceId: String(item.sourceId ?? '') || undefined,
    message: String(item.text ?? '') || undefined,
    rawText: String(item.rawText ?? '') || undefined,
    userName: String(item.userName ?? '') || undefined,
    userId: String(item.userId ?? '') || undefined,
    userLink: String(item.userLink ?? '') || undefined,
    extra: item,
  });
});
```

Use a single helper inside the injected script:

```js
const diag = (stage, reason, payload = {}) => {
  try {
    const fn = windowAny.__douyinCollectorDiag;
    if (typeof fn === 'function') {
      void fn({ stage, reason, ...payload });
    }
  } catch {
    // diagnostics must never affect collection
  }
};
```

- [ ] **Step 3: Add collector reason codes**

Use `diag(...)` before these comment-related exits and decisions:

- `digest.empty_text`
- `digest.skip_text`
- `digest.classified_gift_return`
- `digest.comment_countdown_noise`
- `digest.too_many_colons_without_payload`
- `digest.outside_chat_no_colon`
- `digest.same_element_fingerprint`
- `push.exact_dedupe`
- `push.pending_coarse_replaced`
- `push.pending_coarse_dropped`
- `push.previous_coarse_dropped`
- `push.queued`
- `flush.batch_sent`
- `flush.batch_failed`

Every call should include `category`, `rawText`, `text`, `sourceId`, `userName`, `userId`, `userLink`, and when relevant `signature`, `coarseSignature`, `quality`, `pendingLength`, `insideChatRoot`, `hasReactPayload`.

- [ ] **Step 4: Regression**

Run:

```powershell
node --check apps\server\src\collector.ts
npm --workspace apps/server run build
```

Expected: syntax and build pass. This task does not change collector decisions.

---

### Task 3: Server, DB, SSE, API Diagnostics

**Files:**
- Modify: `apps/server/src/capture-service.ts`
- Modify: `apps/server/src/db.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Return DB insert results without changing business behavior**

Change `insertEvents(events: LiveEvent[]): void` to:

```ts
insertEvents(events: LiveEvent[]): { attempted: number; inserted: number; ignored: number; insertedKeys: Set<string> } {
  if (!events.length) {
    return { attempted: 0, inserted: 0, ignored: 0, insertedKeys: new Set() };
  }
  let inserted = 0;
  const insertedKeys = new Set<string>();
  const tx = this.db.transaction((rows: LiveEvent[]) => {
    for (const row of rows) {
      const result = stmt.run(this.toEventParams(row));
      if (result.changes > 0) {
        inserted += 1;
        insertedKeys.add(row.uniqueKey);
      }
    }
  });
  tx(events);
  this.pruneOldEventsForSessions(events.map((event) => event.sessionId));
  return { attempted: events.length, inserted, ignored: events.length - inserted, insertedKeys };
}
```

Keep the existing SQL and pruning. In `CaptureService`, keep existing publish behavior for this diagnostic version, but record `db.ignored_unique` whenever `ignored > 0`.

- [ ] **Step 2: Record service pipeline reason codes**

In `persistCollectorEvents()` record:

- `service.raw_received`
- `service.raw_comment_received`
- `service.session_mismatch_dropped`
- `service.comment_parsed`
- `service.ignored.<reason>`
- `service.deduped.source`
- `service.deduped.exact`
- `service.deduped.coarse_name`
- `service.deduped.body`
- `service.row_built`
- `service.bus_published`

Refactor `shouldIgnoreCollectorEvent()` and `isRecentCollectorDuplicate()` only enough to return a reason string for diagnostics, while preserving the boolean behavior used by existing callers.

- [ ] **Step 3: Record SSE queue boundaries**

In `/api/events/stream`:

- Increment `sse.event_seen` for every bus event.
- Increment `sse.queue_trimmed` when `pendingEvents.length > 400`.
- Increment `sse.flushed_events` by payload length inside `flushEvents()`.
- Increment `sse.write_false` when `reply.raw.write(...)` returns false.
- Increment `sse.closed_before_queue` if a bus event arrives after stream close.

- [ ] **Step 4: Add diagnostics endpoints**

Add:

```ts
app.get('/api/diagnostics/comment-flow', async () => commentDiagnostics.snapshot());

app.post('/api/diagnostics/comment-flow/reset', async () => {
  commentDiagnostics.reset();
  return { ok: true };
});
```

Add a read-only event inspection endpoint:

```ts
app.get('/api/diagnostics/events', async (request) => {
  const query = z.object({
    sessionId: z.string(),
    category: z.enum(['comment', 'entry', 'interaction', 'gift', 'log']).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
  }).parse(request.query);
  return { items: service.getEvents(query) };
});
```

- [ ] **Step 5: Regression**

Run:

```powershell
node --import tsx apps\server\scripts\regression-comment-loss.mjs
node --import tsx apps\server\scripts\regression-gift-identity.mjs
npm --workspace apps/server run build
```

Expected: all pass.

---

### Task 4: Frontend Diagnostics And Safer Backfill

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/scripts/regression-comment-display-diagnostics.mjs`

- [ ] **Step 1: Allow larger comment backfill**

Keep `api.getEvents(category, sessionId, limit = 80)` default unchanged for normal calls, but call comments with explicit `limit = 1000` in `loadDashboard({ includeEvents: true })` when recovering from SSE error.

Expected code shape:

```ts
const commentLimit = shouldIncludeEvents ? 1000 : 80;
const [comments, entries, interactions, gifts] = await Promise.all([
  api.getEvents('comment', targetSessionId, commentLimit),
  api.getEvents('entry', targetSessionId),
  api.getEvents('interaction', targetSessionId),
  api.getEvents('gift', targetSessionId),
]);
```

- [ ] **Step 2: Add frontend counters**

Add a local ref:

```ts
const frontendDiagnosticsRef = useRef({
  sseMessages: 0,
  sseCommentRows: 0,
  skippedClearedAt: 0,
  skippedNoise: 0,
  queueOverflow: 0,
  displayDuplicate: 0,
  displayUniqueKeyDuplicate: 0,
  displayNoise: 0,
  displayCategoryMismatch: 0,
  lastCommentUniqueKey: '',
  lastCommentCreatedAt: '',
});
```

Update it in `stream.onmessage`, `enqueueStreamRows()`, `flushIncomingQueues()`, `appendDisplayItems()` call sites, and `loadDashboard()`.

- [ ] **Step 3: Add copy diagnostics action**

Add a toolbar button labeled `复制诊断` that writes this JSON to clipboard:

```ts
{
  runtime,
  stats,
  frontend: frontendDiagnosticsRef.current,
  commentItems: {
    count: events.comment.length,
    first: events.comment[0],
    last: events.comment[events.comment.length - 1],
  },
  dom: {
    rows: document.querySelectorAll('.event-panel-comment .event-row').length,
  },
}
```

The button must not change capture behavior.

- [ ] **Step 4: Add display diagnostic regression**

Create `apps/web/scripts/regression-comment-display-diagnostics.mjs` with assertions for:

- SSE recovery path calls `api.getEvents('comment', targetSessionId, 1000)`.
- Frontend diagnostics records queue overflow.
- The existing `rawText` equality branch is visible in the script so future changes can target it deliberately.

Run:

```powershell
node apps\web\scripts\regression-comment-display-loss.mjs
node apps\web\scripts\regression-comment-display-diagnostics.mjs
npm --workspace apps/web run build
```

Expected: all pass.

---

### Task 5: Integration, Documentation, Package

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `docs/subagent-progress.md`

- [ ] **Step 1: Add version log**

Add `V26.5.29.2-diagnostic` to `VERSION_LOGS` describing:

- 只新增评论链路诊断 counters/ring buffer。
- SSE error 评论回填扩大到 1000 条。
- 未改变特别关注命中规则。
- 未改变 Excel 自动/手动保存规则。

- [ ] **Step 2: Run full verification**

Run:

```powershell
node --import tsx apps\server\scripts\regression-comment-loss.mjs
node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs
node --import tsx apps\server\scripts\regression-gift-identity.mjs
node apps\web\scripts\regression-comment-display-loss.mjs
node apps\web\scripts\regression-comment-display-diagnostics.mjs
node apps\web\scripts\regression-stopped-session-and-remarks.mjs
node apps\web\scripts\regression-mystery-refresh.mjs
node --import tsx apps\server\scripts\regression-auto-save-session.mjs
npm --workspace apps/server run build
npm --workspace apps/web run build
node --check apps\desktop\main.mjs
node --check apps\desktop\scripts\finalize-installer.cjs
```

Expected: all pass.

- [ ] **Step 3: Package diagnostic installer**

Only after the above passes:

```powershell
npm run desktop:pack:fast
Get-FileHash -Algorithm SHA256 'apps\desktop\release\糖三角-V26.5.29.2-diagnostic-安装包.exe'
```

If the installer naming script only accepts four numeric segments, use `V26.5.29.2` as the package name and make the in-app version log say `V26.5.29.2 诊断版`.

- [ ] **Step 4: Update progress ledger**

Append to `docs/subagent-progress.md`:

- code changes
- verification commands and outputs
- installer path, size, SHA256
- rollback packages retained
- real-room diagnostic instructions

---

## Real-Room Diagnostic Procedure

1. Install `V26.5.29.2` diagnostic build.
2. Start capture in a real live room.
3. When a comment is seen in Douyin but not in the app, immediately press `复制诊断`.
4. Also open local server endpoint:

```text
http://127.0.0.1:3100/api/diagnostics/comment-flow
```

5. Compare:

- `collector.digest/push/flush`
- `service.raw_comment_received`
- `service.ignored.*`
- `service.deduped.*`
- `db.inserted/db.ignored_unique`
- `sse.queue/sse.flush/sse.write_false`
- frontend `sseCommentRows/skippedClearedAt/skippedNoise/queueOverflow/displayDuplicate`

Root-cause decision:

- No collector record: page observer/DOM parsing missed it.
- Collector pushed but no service raw: binding/flush issue.
- Service raw exists with ignored/deduped reason: server filter/dedupe issue.
- DB inserted but no SSE/front: SSE/backfill/frontend issue.
- Front received but DOM count/list missing: frontend queue/display/crop issue.

