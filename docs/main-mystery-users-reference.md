# 主分支神秘人列表逻辑参考

本文档从 `main` 分支整理“神秘人”列表的完整实现链路，供其他分支迁移或对照实现。整理时没有切换当前工作区分支，参考来源为 `git show main:<file>`。

## 1. 功能入口

主界面工具栏有一个 `神秘人` 按钮，点击后打开独立弹窗页面：

- 前端入口：`apps/web/src/App.tsx`
- 桌面端弹窗拦截：`apps/desktop/main.mjs`
- 数据来源接口：`GET /api/stats`

前端通过 URL 参数区分普通主界面和神秘人弹窗：

```ts
const popupMode =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('popup') === 'mystery';

const openMysteryWindow = () => {
  const popupUrl = `${window.location.origin}/?popup=mystery`;
  window.open(popupUrl, 'douyin-mystery-window', 'width=760,height=920,resizable=yes,scrollbars=yes');
};

if (popupMode) {
  return <MysteryWindow runtime={runtime} stats={stats} highlightUsers={compiledHighlightUsers} />;
}
```

桌面端会把该 URL 转成应用内子窗口，而不是交给外部浏览器：

```js
window.webContents.setWindowOpenHandler(({ url }) => {
  if (serverUrl && url.startsWith(serverUrl) && url.includes('popup=mystery')) {
    createChildWindow(url);
    return { action: 'deny' };
  }

  shell.openExternal(url).catch((error) => {
    writeLog(`openExternal error: ${formatError(error)}`);
  });
  return { action: 'deny' };
});
```

## 2. 数据结构

`SessionStats` 同时在服务端和前端类型中声明，`activeUsers` 就是神秘人列表的数据源。

```ts
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
  }>;
}
```

涉及文件：

- 服务端类型：`apps/server/src/types.ts`
- 前端类型：`apps/web/src/types.ts`

## 3. 后端接口链路

前端通过 `api.getStats(sessionId)` 请求：

```ts
getStats(sessionId?: string): Promise<SessionStats> {
  const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
  return request(`/api/stats${query}`);
}
```

服务端路由：

```ts
app.get('/api/stats', async (request) => {
  const query = z
    .object({
      sessionId: z.string().optional(),
    })
    .parse(request.query);

  return service.getStats(query.sessionId);
});
```

`CaptureService.getStats()` 会优先使用传入的 `sessionId`，没有传入时使用当前活跃会话。若没有可用会话，返回空统计：

```ts
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

  return this.db.getStats(targetSessionId);
}
```

## 4. 核心 SQL 规则

神秘人列表在 `Database.getStats(sessionId)` 内通过 `activeUsers` 查询生成。

### 4.1 候选事件范围

只统计当前会话的非日志事件：

```sql
FROM events
WHERE session_id = ?
  AND category != 'log'
```

### 4.2 身份字段

查询先构造 `mystery_events` CTE：

```sql
SELECT
  COALESCE(NULLIF(user_name, ''), NULLIF(user_id, ''), NULLIF(user_link, ''), '匿名用户') AS name,
  COALESCE(NULLIF(user_link, ''), NULLIF(user_id, ''), NULLIF(user_name, '')) AS identityKey,
  COALESCE(NULLIF(user_name, ''), '') AS actorName,
  COALESCE(NULLIF(user_id, ''), '') AS actorId,
  COALESCE(NULLIF(user_link, ''), '') AS actorLink,
  category,
  NULLIF(user_id, '') AS userId,
  NULLIF(user_link, '') AS userLink,
  created_at,
  id
FROM events
```

字段含义：

- `name`：展示名称，优先 `user_name`，再 `user_id`，再 `user_link`，最后兜底 `匿名用户`。
- `identityKey`：聚合身份，优先 `user_link`，再 `user_id`，再 `user_name`。
- `userId` / `userLink`：保留最近可用值，用于点击打开主页。

### 4.3 神秘人命中条件

任一身份字段包含以下关键词即命中：

- `神秘人`
- `神秘王者`
- `dou`，但 `dou` 规则只作用于非评论事件。

主分支 SQL 条件：

```sql
AND (
  INSTR(COALESCE(NULLIF(user_name, ''), ''), '神秘人') > 0
  OR INSTR(COALESCE(NULLIF(user_name, ''), ''), '神秘王者') > 0
  OR INSTR(COALESCE(NULLIF(user_id, ''), ''), '神秘人') > 0
  OR INSTR(COALESCE(NULLIF(user_id, ''), ''), '神秘王者') > 0
  OR INSTR(COALESCE(NULLIF(user_link, ''), ''), '神秘人') > 0
  OR INSTR(COALESCE(NULLIF(user_link, ''), ''), '神秘王者') > 0
  OR (
    category != 'comment'
    AND (
      INSTR(LOWER(COALESCE(NULLIF(user_name, ''), '')), 'dou') > 0
      OR INSTR(LOWER(COALESCE(NULLIF(user_id, ''), '')), 'dou') > 0
      OR INSTR(LOWER(COALESCE(NULLIF(user_link, ''), '')), 'dou') > 0
    )
  )
)
```

### 4.4 排除“被 @ 提及”的评论误判

如果评论内容包含 `@` 且消息里出现 `神秘人` / `神秘王者`，但评论发送者本身的 `user_name`、`user_id`、`user_link` 都不包含这些关键词，则排除。

目的：避免普通用户评论 `@神秘人...` 时被误认为神秘人本人。

```sql
AND NOT (
  category = 'comment'
  AND INSTR(COALESCE(message, ''), '@') > 0
  AND (
    INSTR(COALESCE(message, ''), '神秘人') > 0
    OR INSTR(COALESCE(message, ''), '神秘王者') > 0
  )
  AND INSTR(COALESCE(NULLIF(user_name, ''), ''), '神秘人') = 0
  AND INSTR(COALESCE(NULLIF(user_name, ''), ''), '神秘王者') = 0
  AND INSTR(COALESCE(NULLIF(user_id, ''), ''), '神秘人') = 0
  AND INSTR(COALESCE(NULLIF(user_id, ''), ''), '神秘王者') = 0
  AND INSTR(COALESCE(NULLIF(user_link, ''), ''), '神秘人') = 0
  AND INSTR(COALESCE(NULLIF(user_link, ''), ''), '神秘王者') = 0
)
```

### 4.5 聚合和排序

按 `identityKey` + `name` 聚合，统计出现总数和来源次数：

```sql
SELECT
  name,
  COUNT(*) AS total,
  SUM(CASE WHEN category = 'entry' THEN 1 ELSE 0 END) AS entryCount,
  SUM(CASE WHEN category = 'comment' THEN 1 ELSE 0 END) AS commentCount,
  SUM(CASE WHEN category = 'gift' THEN 1 ELSE 0 END) AS giftCount,
  MAX(created_at) AS lastActiveAt,
  (
    SELECT userId
    FROM mystery_events AS latest
    WHERE latest.identityKey = grouped.identityKey
      AND latest.userId IS NOT NULL
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) AS userId,
  (
    SELECT userLink
    FROM mystery_events AS latest
    WHERE latest.identityKey = grouped.identityKey
      AND latest.userLink IS NOT NULL
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) AS userLink
FROM mystery_events AS grouped
GROUP BY identityKey, name
ORDER BY lastActiveAt DESC, name ASC
```

排序规则：

1. 最近活跃时间倒序。
2. 同一时间按名称升序。

## 5. 前端识别规则

前端有一套轻量识别函数，用于列表高亮、收到实时事件后触发统计刷新。

```ts
function isMysteryName(value: string | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized.includes('\u795E\u79D8\u4EBA') || normalized.includes('\u795E\u79D8\u738B\u8005') || normalized.includes('dou');
}

function isDefaultMysteryAlias(value: string | undefined): boolean {
  const normalized = String(value ?? '').trim();
  return normalized.includes('\u795E\u79D8\u4EBA') || normalized.includes('\u795E\u79D8\u738B\u8005');
}

function isMysteryActorEvent(item: LiveEvent, category: EventCategory): boolean {
  if (category !== 'comment' && category !== 'gift') {
    return false;
  }

  return isMysteryName(getEffectiveUserName(item));
}
```

注意：前端 `isMysteryName()` 对 `dou` 没有限制事件类型，但后端 SQL 中 `dou` 只统计非评论事件。迁移时如果想保持严格一致，应以后端 SQL 为准，或同步调整前端判断。

## 6. 实时刷新逻辑

主分支通过 SSE 接收实时事件。收到普通事件后：

1. 忽略 `log`。
2. 忽略早于清屏时间的事件。
3. 放入对应分类展示队列。
4. 如果事件身份字段或进场消息命中神秘人规则，则延迟刷新统计。

```ts
stream.onmessage = (event) => {
  const data = JSON.parse(event.data) as StreamMessage;
  if (data.type === 'session') {
    startTransition(() => {
      setRuntime(data.payload as RuntimeSnapshot);
    });
    queueRefresh(Boolean((data.payload as RuntimeSnapshot).activeSession?.id));
    return;
  }

  const row = data.payload as LiveEvent;
  if (row.category === 'log') {
    return;
  }
  if (clearedAt && new Date(row.createdAt).getTime() < clearedAt) {
    return;
  }
  incomingQueuesRef.current[row.category].push(row);
  void drainIncomingQueue(row.category);
  if (
    isMysteryName(row.userName) ||
    isMysteryName(row.userId) ||
    isMysteryName(row.userLink) ||
    (row.category === 'entry' && isMysteryName(row.message)) ||
    (row.category === 'entry' && isMysteryName(row.payloadJson))
  ) {
    queueRefresh(false);
  }
};
```

`queueRefresh(false)` 默认延迟 180ms 调用 `loadDashboard({ includeEvents: false })`，用于更新 `stats.activeUsers`，但不重新拉全量事件列表。

另外，主界面还有兜底轮询：

```ts
const refreshInterval = browserState.chromiumInstall?.status === 'installing' ? 700 : 5000;
const timer = window.setInterval(() => {
  void loadDashboard({ includeEvents: false }).catch(() => undefined);
}, refreshInterval);
```

## 7. 神秘人弹窗 UI

`MysteryWindow` 展示两块内容：

1. `活跃用户`：来自 `stats.activeUsers`。
2. `热门礼物`：来自 `stats.topGifts`。

核心结构：

```tsx
function MysteryWindow({ runtime, stats }: { runtime: RuntimeSnapshot; stats: SessionStats }) {
  return (
    <main className="mystery-shell">
      <section className="mystery-card">
        <div className="mystery-head">
          <h1>神秘人</h1>
          <div className="mystery-status">{buildStatusText(runtime)}</div>
        </div>

        <div className="mystery-grid">
          <div className="mystery-box">
            <div className="mystery-box-title">活跃用户</div>
            <div className="mystery-list">
              {stats.activeUsers.length === 0 ? <div className="event-empty">暂无可展示用户</div> : null}
              {stats.activeUsers.map((item, index) => (
                <div className="mystery-row" key={`${item.name}|${item.userId ?? ''}|${item.userLink ?? ''}`}>
                  <span className="mystery-index">{index + 1}</span>
                  <a
                    className="mystery-name event-user-link"
                    href={getMysteryUserProfileUrl(item) || '#'}
                    target="_blank"
                    rel="noreferrer"
                    title="打开用户主页"
                    onClick={async (event) => {
                      event.preventDefault();
                      await openMysteryUserProfile(item);
                    }}
                  >
                    {getMysteryUserDisplayName(item)}
                  </a>
                  <span className="mystery-total">{getMysteryUserSourceText(item)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mystery-box">
            <div className="mystery-box-title">热门礼物</div>
            <div className="mystery-list">
              {stats.topGifts.length === 0 ? <div className="event-empty">暂无礼物排行</div> : null}
              {stats.topGifts.map((item, index) => (
                <div className="mystery-row" key={item.name}>
                  <span className="mystery-index">{index + 1}</span>
                  <span className="mystery-name">{item.name}</span>
                  <strong className="mystery-total">{item.total}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
```

## 8. 展示名称与来源文案

展示名称会尽量避免只显示默认神秘人别名。逻辑是：

1. 从送礼解析名称、`item.userName`、`payload.userName` 中取候选。
2. 优先选择不包含 `神秘人` / `神秘王者` 的真实名称。
3. 没有真实名称时使用第一个候选。
4. 再没有则使用 `userId`，最后兜底 `匿名用户`。

来源文案由 `entryCount`、`commentCount`、`giftCount` 组成：

```ts
function getMysteryUserSourceText(item: SessionStats['activeUsers'][number]): string {
  const parts = [
    item.entryCount > 0 ? `进场 ${item.entryCount}` : '',
    item.commentCount > 0 ? `评论 ${item.commentCount}` : '',
    item.giftCount > 0 ? `送礼 ${item.giftCount}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : '已出现';
}
```

## 9. 点击打开用户主页

神秘人列表点击昵称后，先尝试服务端解析真实主页，再尝试通过桌面端打开；失败时使用前端 fallback URL。

```ts
async function openMysteryUserProfile(item: SessionStats['activeUsers'][number]): Promise<void> {
  const payload = {
    userName: item.name,
    userId: String(item.userId ?? '').trim() || undefined,
    userLink: String(item.userLink ?? '').trim() || undefined,
    message: item.name,
  };
  const resolvedUrl = await api
    .resolveUserProfile(payload)
    .then((result) => result.url)
    .catch(() => undefined);
  if (resolvedUrl) {
    const opened = await api.openUserProfile({ ...payload, userLink: resolvedUrl }).catch(() => ({ ok: false as const }));
    if (!opened.ok) {
      openUserProfileWindow(resolvedUrl);
    }
    return;
  }

  const fallbackUrl = getMysteryUserProfileUrl(item);
  if (fallbackUrl) {
    openUserProfileWindow(fallbackUrl);
  }
}
```

## 10. 迁移到其他分支的最小清单

迁移时建议按以下顺序对照：

1. 类型层：确认 `SessionStats.activeUsers` 字段完整存在。
2. 数据层：把 `Database.getStats()` 中 `activeUsers` SQL 和返回字段补齐。
3. 服务层：确认 `CaptureService.getStats()` 无会话时返回 `activeUsers: []`。
4. 接口层：确认 `GET /api/stats` 返回 `activeUsers`。
5. API 层：确认前端 `api.getStats()` 可拿到完整 `SessionStats`。
6. 识别层：迁移 `isMysteryName()`、`isDefaultMysteryAlias()`、`isMysteryActorEvent()` 或等价逻辑。
7. 刷新层：SSE 收到命中事件后调用统计刷新，但不要重拉全量事件。
8. UI 层：实现 `MysteryWindow`、工具栏按钮、`popup=mystery` 分支渲染。
9. 桌面端：拦截 `popup=mystery` 窗口，创建应用内子窗口。
10. 样式层：迁移 `.mystery-*`、`.event-user-link` 等相关 CSS。

## 11. 注意事项

- 主分支 SQL 中 `dou` 不统计评论事件，但前端实时判断中 `dou` 不区分事件类型；如需完全一致，迁移时应统一规则。
- `@神秘人` 评论排除逻辑非常关键，否则普通用户提及神秘人会污染列表。
- `identityKey` 的优先级是 `user_link > user_id > user_name`，不同分支如果改过事件采集字段，聚合结果可能不同。
- `activeUsers` 没有 `LIMIT`，如果数据量很大，目标分支可考虑加上合理上限或分页。
- 神秘人弹窗复用主应用状态和 `/api/stats`，不是独立接口；若目标分支使用批量 SSE，需要适配 `StreamMessage` 的数据格式。

