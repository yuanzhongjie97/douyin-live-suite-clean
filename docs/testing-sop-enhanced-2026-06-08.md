# 糖三角增强测试 SOP

生成日期：2026-06-08  
适用项目：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`

## 目标

在不依赖真实抖音直播间稳定性的前提下，用构建、回归脚本、mock 数据、接口安全检查、导出压力测试和人工验收共同保证产品质量。真实直播间仍作为发布前人工 smoke，不作为唯一质量依据。

## 2026-06-08 P0 同步状态

- 本地 API 已改为运行期 HttpOnly Cookie 鉴权，所有 `/api/*` 包括读取、导出和 SSE 都必须鉴权。
- 非法来源、`Origin: null`、远程网页 Origin 即使带正确 Cookie 也必须被 `/api/*` 前置钩子拒绝。
- Electron 已升级到 `40.10.2`，`npm run audit:security` 无 high；`exceljs -> uuid` 仍为 moderate。
- 10 万事件专项压测命令为 `node --import tsx apps\server\scripts\pressure-export-100k.mjs`，只输出是否建议调整边界，不自动改变当前 5 万事件原始明细保留上限。

## 发布前总准入

详细脚本覆盖关系见 `docs/test-coverage-matrix-2026-06-09.md`。

发布前必须完成：

```powershell
npm run test:regression
npm run audit:security
node --import tsx apps\server\scripts\pressure-export-100k.mjs
```

## 2026-06-10 P0 Capture Integrity Addendum

### TC-CAP-010 Gift name compact prefix

- Priority: P0
- Requirement: A leading `送` that belongs to the gift name must be preserved; standalone action `送` must still be stripped.
- Test data:
  - `用户A 送你花花 x1`
  - `用户A 送 玫瑰 x1`
  - `用户A 送给主播 送你花花 x1`
- Expected:
  - Gift name is `送你花花` for compact gift names.
  - Gift name is `玫瑰` when `送` is a standalone action.
- Verification: `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs`

### TC-CAP-011 Rich comment body completeness

- Priority: P0
- Requirement: Rich comments with mention nodes, short-tail nodes, emoji/aria labels, and full-body nodes must preserve the full visible comment body.
- Expected:
  - `@XX欢迎` plus following body remains complete.
  - Overlapped text such as `@XX欢迎 @XX欢迎 后续正文` is collapsed to one leading phrase plus the full following body.
- Verification: `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs`
- Residual risk: If the real room still reproduces truncation, capture the session ID, timestamp, visible live-room text, screenshot, and copied diagnostics to locate the exact DOM shape.

### TC-HL-010 Highlight payload identity

- Priority: P0
- Requirement: Highlight-user matching must consider stable identity fields from both top-level event fields and `payloadJson`.
- Expected:
  - Comment rows can match by `payloadJson.userLink`.
  - Gift rows can match by `payloadJson.userId` or `payloadJson.userLink`.
  - Nickname-only matching remains unsupported to avoid false positives.
- Verification: `node apps/web/scripts/regression-highlight-payload-identity.mjs`

### 2026-06-10 Verification

| Command | Result | Notes |
| --- | --- | --- |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS | Gift name `送你花花` keeps its prefix |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS | Rich mention body and overlapped-prefix body pass |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS | Payload-only identity can hit highlight users |
| `npm run test:regression` | PASS | Run with project-local test storage; server 20, web 10, desktop 6 |

## 2026-06-11 P0 Comment/Gift Remark Integrity Addendum

### TC-CAP-012 Comment integrity ledger

- Priority: P0
- Requirement: Comment collection must be traceable from raw collector input to DB insert and SSE publish.
- Test data:
  - Same DOM/sourceId rescan.
  - Different users with the same comment text.
  - Same user sending the same comment text consecutively.
- Expected:
  - Same sourceId rescan does not create duplicate DB rows.
  - Different real comments are not dropped by same text/user heuristics.
  - Ledger exposes `ledger.comment.raw_received`, `ledger.comment.deduped`, `ledger.comment.db_inserted`, `ledger.comment.db_ignored_unique`, `ledger.comment.bus_published`.
- Verification:
  - `node --import tsx apps/server/scripts/regression-capture-integrity-ledger.mjs`
  - `node --import tsx apps/server/scripts/regression-capture-integrity-runtime.mjs`
  - `node --import tsx apps/server/scripts/regression-comment-loss.mjs`
  - `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs`

### TC-HL-011 Gift remark stable identity closure

- Priority: P0
- Requirement: Gift rows must keep highlight remarks when the stable identity is available in top-level fields or payload, including later identity updates.
- Expected:
  - Gift with only payload `userId` or `userLink` can hit highlight users.
  - Later identity update updates DB identity fields and payload, then republishes the same gift row for frontend remark recomputation.
  - Highlight diagnostics include `category: gift`, `matchedBy`, `matchedValue`, `remark`, `uniqueKey`.
  - Visible format remains `特别关注 备注名` plus `[原昵称] 礼 礼物内容`.
- Verification:
  - `node apps/web/scripts/regression-copy-diagnostics-gift-remarks.mjs`
  - `node apps/web/scripts/regression-highlight-payload-identity.mjs`
  - `node apps/web/scripts/regression-gift-remark-display.mjs`
  - `node --import tsx apps/server/scripts/regression-capture-integrity-runtime.mjs`

### 2026-06-11 Verification

| Command | Result | Notes |
| --- | --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-ledger.mjs` | PASS | Static gate for ledger fields and diagnostics endpoint |
| `node --import tsx apps/server/scripts/regression-capture-integrity-runtime.mjs` | PASS | Runtime DB/SSE ledger and later gift identity update |
| `node apps/web/scripts/regression-copy-diagnostics-gift-remarks.mjs` | PASS | Copy diagnostics include persisted gifts, recent gifts, captureIntegrity and highlight matches |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS | Payload `userId/userLink` highlight candidates still covered |
| `npm run test:regression` | PASS | server 22, web 11, desktop 6 |
| `npm run audit:security` | PASS | high=0; remaining `exceljs -> uuid` 2 moderate |

## 2026-06-11 P0 Strong Mock Gate Addendum

### TC-CAP-013 End-to-end comment and gift remark mock closure

- Priority: P0
- Requirement: Comment duplicate prevention and gift remark recovery must be verifiable without depending on live-room timing.
- Test data:
  - Same comment `sourceId` scanned twice.
  - Same user sends the same comment body twice with different `sourceId`.
  - Different user sends the same comment body.
  - Gift first arrives without stable identity, then later arrives with `userId/userLink`.
  - Gift or comment only carries stable identity inside `payloadJson`.
- Expected:
  - DB keeps real repeated comments and drops only the true same-DOM rescan.
  - Export event source includes all persisted mock rows.
  - Ledger counts raw, deduped, DB inserted, SSE published, and gift identity update publish.
  - Highlight diagnostics record `remark`, `matchedBy`, and `matchedValue` for comment and gift rows.
- Verification: `node --import tsx apps/server/scripts/regression-capture-integrity-strong-mock.mjs`

### TC-HL-012 Frontend gift identity update remark recomputation

- Priority: P0
- Requirement: When the backend republishes the same gift row with stronger identity, the frontend must replace the existing row and recompute highlight remark.
- Test data:
  - Initial gift row without `userId/userLink`.
  - Same `uniqueKey` gift update with stable `userId/userLink`.
- Expected:
  - Visible gift list keeps one row, not duplicate rows.
  - Replacement keeps original `createdAt` and original `payload.ingestSeq`.
  - Updated row applies stable identity and can match highlight remark by `event.userId`.
- Verification: `node apps/web/scripts/regression-gift-identity-update-remark-mock.mjs`

### 2026-06-11 Strong Mock Verification

| Command | Result | Notes |
| --- | --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-strong-mock.mjs` | PASS | DB/export/ledger/SSE/highlight diagnostics strong mock |
| `node apps/web/scripts/regression-gift-identity-update-remark-mock.mjs` | PASS | Same-uniqueKey gift identity update replaces row and recomputes remark |
| `npm run test:server` | PASS | server 23 scripts |
| `npm run test:web` | PASS | web 12 scripts |
| `npm run test:regression` | PASS | server 23, web 12, desktop 6 |
| `npm run audit:security` | PASS | high=0; remaining `exceljs -> uuid` 2 moderate |

## 2026-06-09 全量历史统计与发布门禁补充

- 统计口径改为“尽量代表全量直播历史”：评论、进场、互动、礼物、日志、唯一用户、礼物排行和神秘人汇总应来自会话级累计汇总。
- 原始事件明细仍按保留策略裁剪，用于 UI 最近列表和 Excel 明细 sheet。
- Excel 必须包含“全量统计汇总”和“当前保留明细说明”sheet，避免把保留窗口明细误认为全量历史。
- 历史版本已裁剪掉的旧事件无法恢复；新版本之后接收的新事件应先进入累计汇总，再执行原始明细裁剪。
- 发布前必须运行：
  - `node --import tsx apps\server\scripts\regression-full-history-stats.mjs`
  - `node --import tsx apps\server\scripts\regression-export-full-history-summary.mjs`
  - `node --import tsx apps\server\scripts\regression-config-validation.mjs`
  - `node --import tsx apps\server\scripts\regression-collector-payload-schema.mjs`
  - `node apps\desktop\scripts\regression-release-version.cjs`
  - `node apps\desktop\scripts\regression-chinese-readability.cjs`
- 2026-06-09 首包版本应为 `V26.6.9.1`；同日再次打包递增最后一段。
- 2026-06-09 用户确认边界：特别关注恢复旧版展示口径；每会话原始明细继续固定 5 万；Excel 导出架构、代码签名、CI/覆盖率、外部 API 支持本轮不做；真实直播间 smoke 不升级为发版硬门禁。

打包交付前追加：

```powershell
npm run desktop:pack:fast
node apps\desktop\scripts\run-regressions.cjs
```

准入规则：

| 门禁 | 通过标准 |
| --- | --- |
| 构建 | server TypeScript、web TypeScript、Vite build 全部通过 |
| 回归 | server/web/desktop regression 全部退出码 0 |
| 安全审计 | `npm run audit:security` 无 high；如仍有 high，必须有风险接受记录和影响范围说明 |
| 压测结论 | 10 万事件压测要记录耗时、内存、文件大小和是否建议调整保留边界 |
| 安装包 | 安装包能启动，主界面不白屏，嵌入服务监听 `127.0.0.1` |
| 真实 smoke | 至少一次合法抖音直播间采集、停止、导出、登录窗口打开/关闭通过 |

## 模块测试矩阵

| 模块 | 优先级 | 自动化/验证方式 | Mock 数据要求 | 必须验证 |
| --- | --- | --- | --- | --- |
| API 安全边界 | P0 | `apps/server/scripts/regression-api-security.mjs`、API inject | 合法本机 Origin、恶意 Origin、`Origin: null`、无 token、错 token、正确 token、cross-site POST | 非法来源不进入业务 handler；合法桌面请求不被误拦 |
| URL allowlist | P0 | 单元/回归脚本 | 合法 `https://live.douyin.com/{roomId}`、HTTP、非抖音域名、域名后缀混淆、非直播抖音页 | 采集只允许直播间；登录只允许受控抖音入口 |
| 采集主链路 | P0 | server regression + 真实 smoke | 评论、进场、互动、礼物、重复事件、空文本、DOM 变更字段缺失 | 评论不丢、不重；礼物身份和数量正确；异常 payload 不导致采集崩溃 |
| 会话状态 | P0 | API + UI | 未开始、运行中、手动停止、异常中断、重启后恢复 | 状态转移正确；停止后数据保留；异常中断有日志 |
| SSE 实时展示 | P0 | web regression | 高频批量事件、队列超过上限、断线重连、只含评论/礼物/日志 | UI 不白屏；批量刷新稳定；评论窗口不丢关键事件 |
| 数据库入库 | P0 | server db regression | 重复 unique key、同用户重复评论、不同用户同正文、礼物 identity 更新 | 使用唯一键去重；统计只计算实际插入事件 |
| Excel 导出 | P0 | server export regression + 人工打开文件 | 全分类事件、空会话、大会话、特殊字符、中文、超长文本 | 导出包含评论/进场/互动/礼物/日志/概览；文件可打开 |
| 登录窗口 | P1 | desktop + manual | 默认登录入口、用户主页入口、非法 URL、关闭窗口 | 只打开抖音 HTTPS；关闭后状态正确；不污染主窗口 |
| 用户主页解析 | P1 | server regression | `userName`、`userId`、`userLink`、rawText、多字段缺失 | 生成 URL 稳定；非法链接拒绝 |
| 特别关注 | P0 | web/server regression + 真实 smoke | `highlight_users.txt`、通配 ID、备注、命中/未命中、评论命中、礼物命中 | 命中高亮；展示格式符合用户最终边界；普通身份不覆盖神秘人 |
| 神秘人 | P1 | web regression + manual | 进场、评论、送礼、重复身份、展开详情 | 神秘人列表刷新正确；身份来源清晰 |
| 静态资源和白屏诊断 | P1 | server/desktop regression | 缺失旧 hash asset、index no-cache、renderer 请求日志 | 缺失 asset 返回 404；index 不缓存；诊断能定位白屏 |
| 桌面打包 | P1 | desktop regression + 安装 smoke | release 目录、runtime bundle、Chromium 路径、安装包保留 | 安装包保留正确；runtime 资源完整；启动无白屏 |
| 配置启动 | P1 | 单元/启动测试 | 非法 PORT、非法 HOST、不可写 storage、缺失 web dist | 错误配置给明确诊断；桌面模式只监听本机 |
| 编码/文案 | P2 | 人工检查 + 快照 | 窗口标题、安装包名、Excel 表头、日志、文档 | 中文不乱码；版本号一致 |

## P0 安全用例

### TC-SEC-001_非法远程 Origin 不能读取本地 API

- Priority: P0
- Requirement: 本地 API 不允许远程网页读取响应。
- Preconditions: Fastify 测试实例启动。
- Test Data: `Origin: https://evil.example`
- Steps:
  1. 向 `/api/events` 或 mock `/api/read` 发送 GET。
  2. 检查响应头。
- Expected Results:
  1. 远程 Origin 读取 `/api/*` 返回 403。
  2. 不返回 `Access-Control-Allow-Origin: https://evil.example`。
  3. 不影响无 Origin 的本机 CLI 健康检查。
- Verification Method: API

### TC-SEC-002_跨站 POST 必须在业务 handler 前被拒绝

- Priority: P0
- Requirement: 状态变更请求不能被恶意网页触发。
- Test Data: `Origin: https://evil.example`、`Sec-Fetch-Site: cross-site`
- Steps:
  1. 向 mock `/api/state-change` 发送 POST。
  2. 记录 handler 是否执行。
- Expected Results:
  1. 返回 403。
  2. 业务 handler 未执行。
- Verification Method: API、log

### TC-SEC-003_Origin null 必须拒绝

- Priority: P0
- Requirement: `Origin: null` 不应被当成同源。
- Test Data: `Origin: null`
- Steps:
  1. 调用 `isAllowedLocalApiOrigin('null')`。
  2. 向状态变更接口发送 `Origin: null` 请求。
- Expected Results:
  1. 来源校验返回 false。
  2. 状态变更请求返回 403。
  3. 数据读取请求返回 403。
- Verification Method: API、unit
- Notes / Risks: 已由 `regression-api-security.mjs` 和 `regression-api-production-security.mjs` 覆盖。

### TC-SEC-004_本地 API token 鉴权

- Priority: P0
- Requirement: 所有 `/api/*` 读写接口必须带运行期 token。
- Test Data: 无 token、错误 token、正确 token。
- Steps:
  1. 无 token 请求 `/api/sessions/active`。
  2. 错 token 请求 `/api/sessions/start`。
  3. 正确 token 请求 `/api/sessions/active`。
- Expected Results:
  1. 无 token 返回 401。
  2. 错 token 返回 401，handler 不执行。
  3. 正确 token 返回业务结果。
- Verification Method: API
- Notes / Risks: 已实现为 HttpOnly Cookie 鉴权；外部脚本不作为官方支持入口。

### TC-SEC-005_所有数据面 API 必须鉴权

- Priority: P0
- Requirement: `/api/sessions/active`、`/api/events`、`/api/export.xlsx`、`/api/events/stream` 等数据面接口不能裸读。
- Test Data: 无 Cookie、正确 Cookie、非法 Origin + 正确 Cookie。
- Steps:
  1. 无 Cookie 请求上述接口。
  2. 正确 Cookie 请求上述接口。
  3. 使用 `Origin: https://evil.example` 和正确 Cookie 请求 `/api/sessions/active`。
- Expected Results:
  1. 无 Cookie 返回 401。
  2. 正确 Cookie 且本机来源返回 200。
  3. 非法 Origin 即使带 Cookie 也返回 403。
- Verification Method: production API inject

## P0 采集与数据用例

### TC-CAP-001_评论事件不丢不重

- Priority: P0
- Requirement: 高频直播评论要准确入库和展示。
- Test Data: 同用户重复评论、不同用户相同正文、空文本、互动文本。
- Steps:
  1. 注入 mock RawCollectorEvent 批次。
  2. 查询数据库事件数。
  3. 查询前端展示数据或 SSE payload。
- Expected Results:
  1. 真实评论入库。
  2. 重复唯一事件不重复入库。
  3. 互动文本不误判为评论。
- Verification Method: database、API、UI

### TC-CAP-002_礼物身份和数量不被覆盖

- Priority: P0
- Requirement: 礼物事件要保留正确用户身份和礼物数量。
- Test Data: 礼物名、数量延迟出现、用户 ID/link 分阶段出现。
- Steps:
  1. 注入礼物 DOM mock 或 collector payload。
  2. 等待礼物暂存 flush。
  3. 查询事件与统计。
- Expected Results:
  1. 礼物名称正确。
  2. 数量取最高可信值。
  3. 用户身份不被普通匿名信息覆盖。
- Verification Method: database、API

### TC-EXP-001_全分类 Excel 导出

- Priority: P0
- Requirement: 导出文件必须包含完整会话数据。
- Test Data: 评论、进场、互动、礼物、日志、统计。
- Steps:
  1. 构造临时 SQLite 会话和事件。
  2. 调用 `/api/export.xlsx` 或 `exportSessionWorkbook()`。
  3. 使用 ExcelJS 读取导出文件。
- Expected Results:
  1. 概览 sheet 统计正确。
  2. 各分类 sheet 存在。
  3. 中文、特殊字符、长文本不损坏。
- Verification Method: API、file、database

### TC-EXP-002_大数据导出压力

- Priority: P1
- Requirement: 大直播间导出不应卡死或耗尽内存。
- Test Data: 1 万、5 万、10 万事件。
- Steps:
  1. 构造指定规模事件。
  2. 执行导出。
  3. 记录耗时、文件大小、进程内存峰值。
- Expected Results:
  1. 1 万事件必须稳定通过。
  2. 5 万事件需有明确耗时和内存上限。
  3. 超过上限时应给出可理解错误，不应静默失败。
- Verification Method: file、log、manual observation
- 2026-06-09 压测记录：10 万总事件可完成，累计统计覆盖全量接收事件；当前保留明细约 48000 行，`totalMs=8746`、`xlsxMb=1.2`、`rssDeltaMb=349.8`。结论：统计口径已尽量代表全量直播历史，但暂不建议直接把正式原始明细保留上限从 5 万改为 10 万，除非先明确接受更高本地存储/导出成本或改造流式导出。

### TC-HL-001_特别关注命中展示格式

- Priority: P0
- Requirement: 特别关注命中后的标记区、用户名区和消息正文必须符合用户确认的最终展示边界：标记区显示备注，正文用户名区只显示原昵称。
- Test Data: `highlight_users.txt` 配置 `用户ID 备注名`；构造同一用户评论和礼物事件，事件包含稳定 `userId/userLink`、原昵称、礼物内容。
- Steps:
  1. 启动采集或注入 mock 命中事件。
  2. 查看评论区、礼物区和“特别关注命中消息”弹窗。
  3. 停止采集后刷新历史会话，再查看命中历史。
- Expected Results:
  1. 命中行必须有 `特别关注 备注名` 标记。
  2. 礼物行必须显示 `[原昵称] 礼 礼物内容`，不能显示 `[备注名 / 原昵称]`。
  3. 主页打开仍使用原始稳定 ID/link，不使用备注文本。
  4. 停止后历史命中展示口径与实时展示一致。
- Final Boundary:
  1. 2026-06-09 用户确认恢复历史正常展示：`特别关注 备注名` + `[原昵称] 礼 礼物内容`。
  2. 只改展示口径，不改采集、匹配、入库、统计和导出逻辑。
- Notes / Risks: 该 P0 由 `apps/web/scripts/regression-gift-remark-display.mjs` 和 `apps/web/scripts/regression-stopped-session-and-remarks.mjs` 覆盖；若再次改回 `[备注名 / 原昵称]`，必须先重新确认产品边界。

## Mock 数据原则

1. 每个 mock 只验证一个明确行为，不把安全、采集、展示混在一个用例里。
2. 采集 mock 必须覆盖 `category`、`text/message`、`userName`、`userId`、`userLink`、`payloadJson`。
3. 评论 mock 必须包含同用户重复评论、不同用户相同正文、空文本、互动文本。
4. 礼物 mock 必须包含数量延迟、身份延迟、礼物名缺失、重复 flush。
5. 安全 mock 必须包含合法本机来源、远程来源、`Origin: null`、无 token、错 token、正确 token。
6. 导出 mock 必须包含超过 UI 显示窗口的数据量，防止只验证前端当前可见列表。
7. 配置 mock 必须覆盖非法端口、非法 host、不可写目录、缺失 runtime 资源。

## 人工验收清单

| 场景 | 步骤 | 通过标准 |
| --- | --- | --- |
| 首次启动 | 启动桌面客户端 | 主界面正常渲染，无白屏；日志记录 releaseTag、serverUrl、资源状态 |
| 登录 | 点击登录抖音并关闭窗口 | 只打开抖音 HTTPS；关闭后主界面仍可操作 |
| 开始采集 | 输入合法 `https://live.douyin.com/{roomId}` | 创建 running session；评论/进场/互动/礼物开始展示 |
| 非法 URL | 输入非抖音、HTTP、域名混淆 URL | UI 显示拒绝，不启动采集 |
| 停止采集 | 运行中点击停止 | session 变为 stopped，数据保留，统计不清零 |
| 导出 Excel | 采集后导出 | 文件可打开，分类 sheet 和统计正确 |
| 特别关注 | 配置 `highlight_users.txt` 后采集命中用户 | 命中高亮；标记区显示备注，正文用户名显示原昵称 |
| 神秘人 | 采集神秘人进场、评论、送礼 | 列表刷新、展开详情和来源正确 |
| 升级安装 | 覆盖安装新版本 | 不加载旧 hash 资源，不白屏，历史数据不丢 |
| 中文可读性 | 检查窗口、安装包、Excel、日志 | 中文不乱码，版本号与发布记录一致 |

## 2026-06-09 V26.6.9.2 真实 smoke 记录

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 覆盖安装 | PASS | `糖三角-V26.6.9.2-安装包.exe /S` 退出码 0；注册表显示 `糖三角 26.6.9-2` |
| 安装后启动 | PASS | 安装路径 `D:\糖三角\@douyin-live-suitedesktop\糖三角.exe`；启动日志包含 `releaseTag=V26.6.9.2`、`appVersion=26.6.9-2`、`serverUrl=http://127.0.0.1:3100` |
| 白屏检查 | PASS | 启动日志 renderer inspect 显示主界面 `rootChildCount=1`，页面正文包含 `V26.6.9.2` |
| 登录状态 | PASS | `/api/browser/state` 返回 `loggedIn=true`，`profileDisplayName=天晴了` |
| 真实采集 | PASS | 直播间 `https://live.douyin.com/962565925628`，会话 `8O4oe_OrQC`，停止后统计评论 42、进场 18、互动 12、礼物 161、唯一用户 220 |
| 手动停止自动保存 | PASS | 桌面生成 `糖三角-20260609-153806-冻腰冻拐（三角洲行动）-8O4oe_OrQC.xlsx` |
| Excel 可打开 | PASS | ExcelJS 成功读取，包含全量统计、礼物排行、保留明细说明、评论、进场、互动、礼物、日志 sheet |
| 导出接口 | PASS | `/api/export.xlsx?sessionId=8O4oe_OrQC` 可生成 `tmp\smoke-export-8O4oe_OrQC.xlsx` |
| 特别关注真实命中 | 未覆盖 | 用户无法提供真实特别关注用户 ID；本轮只用隔离 mock 回归验证展示口径，不向真实会话注入假事件 |

## 版本号规则

发布前必须先确认可见版本号、桌面 `APP_RELEASE_TAG`、软件内版本日志首项和安装包文件名一致。

- 版本号按打包日期约定，格式为 `VYY.M.D.N`。
- `YY.M.D` 是打包日期，`N` 是当天第几个可发布包，从 `1` 开始。
- 例：`V26.5.29.13` 表示 2026-05-29 的第 13 个版本。
- 若 2026-06-09 打包，当天首包应为 `V26.6.9.1`；同一天再次改代码并重打包则递增为 `V26.6.9.2`。
- 打包前不得沿用历史日期发布线；也不得让脚本自行猜测版本。

## 失败处理

1. 自动化失败：先定位失败脚本对应模块，不允许跳过脚本继续发布。
2. 安全失败：P0 安全用例失败必须修复；不能用人工检查替代。
3. `audit:security` 失败：若存在 high，必须阻断发布或提供风险接受记录。
4. 导出失败：记录事件规模、耗时、内存、会话 ID、日志路径，再修复。
5. 真实直播 smoke 失败：记录直播间 URL、时间点、账号状态、截图、启动日志。
6. 修复后必须重跑完整 `npm run test:regression`，不能只跑单个脚本。

## 安装包 native ABI 门禁

背景：`V26.5.29.18` 出现过安装后启动失败，报 `better_sqlite3.node` 的 `NODE_MODULE_VERSION 127` 与 Electron 40 需要的 `NODE_MODULE_VERSION 143` 不匹配。

发布前必须执行：

1. `npm run test:regression`
2. `npm run audit:security`
3. `npm run desktop:pack:fast`

验收点：

- `desktop:pack:fast` 必须在 `electron-builder` 后运行 `regression-packaged-native-abi.cjs --required`。
- 日志必须包含 `electron=40.10.2`、`modules=143`、`nativeAddonType=object`、`packaged native ABI regression checks passed`。
- native ABI 验证必须直接 require `build\Release\better_sqlite3.node`，并创建 `:memory:` 数据库；只 require `better-sqlite3` 包入口不能作为通过依据。
- `apps/desktop/build/installer.nsh` 必须保留安装前清理旧 `resources\app.asar.unpacked\node_modules\better-sqlite3` 的逻辑。
- 覆盖安装后启动不得出现 `NODE_MODULE_VERSION`、`better_sqlite3.node`、`was compiled against a different Node.js version`。
- 打包结束后必须恢复 Node ABI，并确认服务端 Node 回归仍可创建 SQLite 内存库。
- 启动日志应包含当前 releaseTag，例如本轮 `V26.6.9.2` 包应输出 `releaseTag=V26.6.9.2`。

## V26.6.9.3 追加测试 SOP：评论重复与礼物顺序

### TC-CAP-003_同源评论重复扫描不重复展示

- Priority: P0
- Requirement: 抖音同一条评论被 DOM 多次扫描时，不得因采集时间或批次序号变化而在评论区重复展示。
- Test Data: `category=comment`，相同 `sourceId/rawText/text/userId/userLink`，不同 `createdAt/collectorSeq`。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs`。
  2. 查询真实会话评论：`/api/events?category=comment&sessionId={sessionId}&limit=1000`。
  3. 按 `uniqueKey` 和 `sourceId/userId/message` 分组检查重复。
- Expected Results:
  1. 同源评论生成同一 `uniqueKey`。
  2. 数据库/API 不出现同源同正文重复组。
  3. 无 `sourceId` 的真实重复评论仍允许通过采集序号区分，避免误删用户连续发送的相同内容。
- Verification Method: server regression、API、真实直播间 smoke。

### TC-CAP-004_礼物区消息顺序稳定

- Priority: P0
- Requirement: 礼物区必须按真实接收顺序稳定显示，身份补齐或同时间戳不得打乱原始行顺序。
- Test Data: 多条 `gift` 事件使用相同 `createdAt`，缺少 DB id 或随后发生身份补齐，payload 带 `ingestSeq`。
- Steps:
  1. 执行 `node apps/web/scripts/regression-gift-display-order.mjs`。
  2. 真实采集时查询 `/api/events?category=gift&sessionId={sessionId}&limit=1000`。
  3. 检查礼物行的 `id/createdAt/payload.ingestSeq` 是否保持“最新在前”的一致排序。
- Expected Results:
  1. 前端排序以 `createdAt` 为主，`id` 和 `ingestSeq` 为稳定兜底。
  2. 身份补齐更新不得覆盖原始 `id/createdAt/ingestSeq`。
  3. 真实礼物流中不出现新旧消息交错倒挂。
- Verification Method: web regression、API、真实直播间 smoke。

### V26.6.9.3 执行记录

| 项 | 结果 |
| --- | --- |
| `npm run test:regression` | PASS：server 18、web 9、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs` | PASS |
| `node apps/web/scripts/regression-gift-display-order.mjs` | PASS |
| 真实直播间 | `https://live.douyin.com/127874409138`，会话 `ehGrIJDv6x` |
| 真实采集摘要 | 评论 13、进场 111、互动 6、礼物 5、日志 2 |
| 评论重复检查 | `DUP_UNIQUE_KEY=0`，`sourceId/userId/message` 重复组为 0 |
| 礼物顺序检查 | 5 条真实礼物 `id/createdAt/ingestSeq` 顺序一致 |
| 导出接口 | 生成 25,770 bytes Excel，SHA256 `F237C55ECE23AAAFFDC6C1350F1466DB253A410EAC1EA075591C986C19C9974C` |

## V26.6.10.1 追加测试 SOP：采集完整性 P0

### TC-CAP-005_礼物名紧凑前缀保留
- Priority: P0
- Requirement: 当礼物本名以 `送` 开头时，不能把它当成送礼动作词清掉；只有独立动作词 `送 ` 才能剥离。
- Test Data:
  - `用户A 送你花花 x1`
  - `用户A 送 玫瑰 x1`
  - `用户A 送给主播 送你花花 x1`
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs`。
  2. 检查礼物名和展示 message。
- Expected Results:
  1. `送你花花` 保留完整礼物名。
  2. `送 玫瑰` 仍解析为礼物名 `玫瑰`。

### TC-CAP-006_富文本评论完整正文优先
- Priority: P0
- Requirement: 评论 DOM 同时出现短 mention 节点和完整正文节点时，展示应尽量保留完整可见正文，不只显示 `@XX欢迎`。
- Test Data: mock 富文本 DOM，包含 mention、短尾文本、完整正文、`aria-label` 正文。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs`。
  2. 若真实直播间复现，使用主界面“复制诊断”并记录会话 ID、时间点、截图和真实可见文本。
- Expected Results:
  1. 重叠前缀被折叠。
  2. 完整正文被保留。
  3. 真实复现时不得仅凭截图改规则，必须结合诊断定位 DOM 结构。

### TC-HL-002_payloadUserLink特别关注命中
- Priority: P0
- Requirement: 评论区/礼物区事件只有 `payloadJson.userLink` 时，也必须能按稳定身份命中特别关注；仍不允许昵称兜底。
- Test Data: 顶层 `userId/userLink` 缺失、payload 内含 `userLink` 的评论和礼物事件。
- Steps:
  1. 执行 `node apps/web/scripts/regression-highlight-payload-identity.mjs`。
  2. 检查命中用户和礼物展示口径。
- Expected Results:
  1. 评论和礼物均能命中特别关注。
  2. 标记区显示 `特别关注 备注名`。
  3. 正文用户名只显示原昵称，不显示 `备注名 / 原昵称`。

### V26.6.10.1 执行记录

| 项 | 结果 |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS：server 20、web 10、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.10.1-安装包.exe`，packaged native ABI 门禁通过 |
| 安装包 SHA256 | `77CBA10028BFAD590ABEF3EA93769BC65983EF3BE60BAA622F1B17C98515EE84` |
| 测试隔离 | 服务端回归使用项目内 `tmp/server-regression-storage`，不读写真实运行数据库 |

人工验收重点：
- 使用真实直播间重点观察 `送你花花 x1` 这类以 `送` 开头的礼物名。
- 观察带 @、表情、徽章或富文本结构的评论是否只显示短前缀。
- 若有真实特别关注用户，确认评论区和礼物区均高亮，且展示口径仍为“标记区备注、正文原昵称”。

### V26.6.10.2 追加执行记录

新增边界：
- 富文本评论完整正文可能挂在整条消息行或内容容器的 `aria-label/title` 上，内部子节点只显示短前缀 `@XX欢迎`。
- 该场景必须保留完整正文，不得只展示短前缀。

新增/更新验证：

| 项 | 结果 |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS：覆盖子节点完整正文、内容容器 aria-label、整行 aria-label |
| `node --import tsx apps/server/scripts/regression-comment-action-and-rich-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-body-noise.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-loss.mjs` | PASS |
| `npm run test:regression` | PASS：server 20、web 10、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.10.2-安装包.exe` |
| 安装包 SHA256 | `50AE8AF70AF1CDED74AA530DD5E67C1F7BEC8B7D2FBD9E389F353FD4B585660A` |

## V26.6.11.2 追加测试 SOP：真实直播间消息链路不丢

### TC-CAP-007_采集Batch失败重试不丢
- Priority: P0
- Requirement: 页面采集脚本调用 `__douyinCollectorBatch` 失败时，未发送 batch 必须回到 pending 队列，不能直接清空。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-collector-loss-resilience.mjs`。
  2. 检查源码门禁是否覆盖 requeue、文本节点监听、兜底扫描窗口和 SSE 不裁剪。
- Expected Results:
  1. batch failure path 使用 `pending.unshift(...batch)`。
  2. 不再出现失败后 `batch.splice(0, batch.length)` 的静默丢弃。

### TC-CAP-008_无SourceId评论重试幂等
- Priority: P0
- Requirement: 无稳定 `sourceId` 的评论在同一次 payload 重试时必须保持同一 `uniqueKey`，真实连续相同评论仍必须保留为不同事件。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs`。
  2. 检查 `collectorClientId` 相关断言。
- Expected Results:
  1. 同一个 `collectorClientId` 重试生成同一 `uniqueKey`。
  2. 不同采集 payload 的连续相同评论仍生成不同 `uniqueKey`。

### TC-CAP-009_SSE与前端队列不提前裁剪评论
- Priority: P0
- Requirement: 服务端 SSE 不得发送前裁剪事件；前端评论入队和窗口移动暂存必须保留到当前 50000 事件边界，UI 近期展示窗口仍保持不变。
- Steps:
  1. 执行 `node apps/web/scripts/regression-stream-queue-no-comment-loss.mjs`。
  2. 执行 `node --import tsx apps/server/scripts/regression-collector-loss-resilience.mjs`。
- Expected Results:
  1. 服务端不包含 `sse.queue_trimmed` 发送前裁剪逻辑。
  2. 前端 comment queue、window-move deferred rows/messages 均引用 `SESSION_EVENT_RETAIN_LIMIT = 50000`。

### TC-DEV-001_本地预览代理不误连其他项目
- Priority: P1
- Requirement: 当 3100 被其他本地项目占用时，Vite proxy 必须跟随当前后端 `PORT`。
- Steps:
  1. 执行 `node apps/web/scripts/regression-vite-proxy-port.mjs`。
  2. 如需手工预览，使用同一个 `PORT` 启动 server/web。
- Expected Results:
  1. `apps/web/vite.config.ts` 使用 `process.env.PORT || '3100'`。
  2. 不再硬编码 `target: 'http://localhost:3100'`。

### V26.6.11.2 执行记录

| 项 | 结果 |
| --- | --- |
| `npm run test:regression` | PASS：server 24、web 14、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS：90 秒真实 smoke，raw comments 3、persisted comments 1、deduped 2，三条 raw 评论为同一 `sourceId` DOM 重扫 |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.11.2-安装包.exe`，packaged native ABI 门禁通过 |
| 安装包 SHA256 | `1369BD4C4A56C7E12B001C9CEDC94C5BFD9ACF26CC8615B7158C34F39E06B2A4` |

## V26.6.11.3 追加测试 SOP：React payload 缓存失效

### TC-CAP-010_ReactPayload旧身份不得污染新消息
- Priority: P0
- Requirement: 抖音直播页复用同一个 DOM 行时，采集器不得跨可见内容变化复用旧 `sourceId/userId/userLink`。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-react-data-cache-refresh.mjs`。
  2. 检查采集器 React payload 缓存是否按当前行 fingerprint 和短 TTL 复用。
- Expected Results:
  1. 不存在永久 `reactDataCache.get(element)` 后直接返回旧 payload 的路径。
  2. `reactDataCacheTtlMs` 必须显式注入浏览器页面上下文。

### TC-CAP-011_同SourceId不同正文不得误去重
- Priority: P0
- Requirement: 同一 `sourceId` 若用户或正文不同，必须作为不同真实评论入库。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-comment-sourceid-row-reuse.mjs`。
  2. 检查 DB 行数、消息正文和采集完整性账本。
- Expected Results:
  1. 两条同 `sourceId`、不同用户/正文的评论均入库。
  2. `ledger.comment.deduped` 不增加。

### TC-CAP-012_真实直播间SourceId变体检查
- Priority: P0
- Requirement: 真实直播间 smoke 必须输出同 `sourceId` 重复组，并标识是否存在不同用户/正文变体。
- Steps:
  1. 执行 `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138`。
  2. 查看 `rawCommentDuplicateGroups` 与 `suspiciousRawCommentGroups`。
- Expected Results:
  1. `suspiciousRawCommentGroups.length` 为 0。
  2. DB 插入评论数、SSE 发布评论数、ledger `db_inserted/bus_published` 一致。

### V26.6.11.3 执行记录

| 项 | 结果 |
| --- | --- |
| `npm run test:regression` | PASS：server 26、web 14、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS：180 秒真实 smoke，raw comments 27、persisted comments 9、deduped 18；所有同 `sourceId` 重复组 `variantCount=1` |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.11.3-安装包.exe`，packaged native ABI 门禁通过 |
| 安装包 SHA256 | `D76B5A9D02C5F38BE3FDB6720CAC20D686AE246809FCBBFC748E33B31B5AB56B` |

## 测试报告模板

```markdown
# 测试报告

测试日期：
版本号：
安装包：
测试人员：

## 命令结果
| 命令 | 结果 | 备注 |
| --- | --- | --- |
| npm run test:regression | 通过/失败 |  |
| npm run audit:security | 通过/失败 |  |
| npm run desktop:pack:fast | 通过/失败 |  |

## 模块结果
| 模块 | 优先级 | 结果 | 问题编号 |
| --- | --- | --- | --- |
| API 安全 | P0 |  |  |
| 采集主链路 | P0 |  |  |
| 会话状态 | P0 |  |  |
| 数据库入库 | P0 |  |  |
| Excel 导出 | P0 |  |  |
| 桌面启动 | P1 |  |  |

## 未解决风险
| 风险 | 优先级 | 是否阻断 | 处理意见 |
| --- | --- | --- | --- |

## 结论
是否允许发布：
风险接受人：
```
## V26.6.11.4 追加测试 SOP：真实 Smoke 可见行对照与停止竞态

### TC-CAP-013_真实Smoke只对照叶子级可见评论
- Priority: P0
- Requirement: 真实直播间 smoke 的外部 DOM 对照不得把包含多条消息的聊天容器误判为一条未匹配评论。
- Steps:
  1. 执行 `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138`。
  2. 检查 `visibleCommentObserver`、`rawCommentDuplicateGroups` 和 `suspiciousRawCommentGroups`。
- Expected Results:
  1. 外部观察器只读取叶子级可见消息行。
  2. 多条 `：` 拼接的容器文本不进入未匹配评论集合。
  3. `visibleCommentObserver.unmatchedCount` 为 0 或能给出明确的真实可见未匹配样本。

### TC-CAP-014_停止采集Heartbeat关闭竞态不崩溃
- Priority: P0
- Requirement: 停止采集时 heartbeat 与页面关闭并发发生，closed-target 错误不得导致进程崩溃或误报 fatal。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-collector-heartbeat-stop-race.mjs`。
  2. 在真实 smoke 完成后观察停止阶段日志。
- Expected Results:
  1. `page.evaluate: Target page, context or browser has been closed` 在正常停止期间被容忍。
  2. 停止后不再继续安装 observer。
  3. smoke 进程正常退出。

### V26.6.11.4 执行记录

| 项 | 结果 |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-collector-heartbeat-stop-race.mjs` | PASS |
| `npm run build:server` | PASS |
| `npm run test:regression` | PASS：server 28、web 14、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS：180 秒真实 smoke，raw comments 39、persisted comments 13、deduped 26，`suspiciousRawCommentGroups=[]`，`visibleCommentObserver.unmatchedCount=0` |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.11.4-安装包.exe`，packaged native ABI 门禁通过 |
| 安装包 SHA256 | `9AD1EFEB9C8ACC9B616268860382A273232E791D6C71500619F5DDA9C80B89C6` |

## V26.6.11.5 追加测试 SOP：历史回填倒序窗口与页内可见探针

### TC-WEB-015_DESC历史回填不得裁掉最新评论
- Priority: P0
- Requirement: 后端 `/api/events` 按 `created_at DESC, id DESC` 返回最近 1000 条评论时，前端必须显示最新 200 条，而不是倒序数组尾部的旧评论。
- Steps:
  1. 执行 `node apps/web/scripts/regression-comment-history-desc-order.mjs`。
  2. 检查 `normalizeDisplayItems()` 是否先 `sort(compareEvents)`，再应用显示窗口。
- Expected Results:
  1. 1000 条倒序评论回填后保留 ID 801-1000。
  2. 不允许使用 `items.slice(-EVENT_LIMITS[category] * 3)` 直接截倒序 API 结果。

### TC-CAP-015_真实Smoke页内可见评论探针
- Priority: P0
- Requirement: 真实 smoke 应能记录短暂出现的可见评论，降低 Node 侧 1 秒轮询漏掉短生命周期 DOM 行的风险。
- Steps:
  1. 执行 `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs`。
  2. 执行 `REAL_ROOM_SMOKE_MS=300000 node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138`。
- Expected Results:
  1. smoke 脚本包含 `__douyinSmokeVisibleProbe`、`MutationObserver`、`characterData: true` 和 `setInterval(scan, 250)`。
  2. 真实 smoke 输出 `pageProbe.scans/mutations/candidates/uniqueComments/unmatchedCount`。
  3. `pageProbe.unmatchedCount` 为 0，或输出明确 unmatched 样本进入下一轮定位。

### V26.6.11.5 执行记录

| 项 | 结果 |
| --- | --- |
| `node apps/web/scripts/regression-comment-history-desc-order.mjs` | PASS |
| `node apps/web/scripts/regression-comment-display-loss.mjs` | PASS |
| `node apps/web/scripts/regression-comment-history-backfill.mjs` | PASS |
| `node apps/web/scripts/regression-stream-queue-no-comment-loss.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-collector-heartbeat-stop-race.mjs` | PASS |
| 90 秒真实 smoke | PASS：raw comments 30、persisted comments 10、`pageProbe.unmatchedCount=0` |
| 5 分钟增强真实 smoke | PASS：raw comments 126、persisted comments 42、deduped 84、`suspiciousRawCommentGroups=[]`、`visibleCommentObserver.unmatchedCount=0`、`pageProbe.unmatchedCount=0` |
| `npm run test:regression` | PASS：server 28、web 15、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | PASS：生成 `糖三角-V26.6.11.5-安装包.exe`，packaged native ABI 门禁通过 |
| 安装包 SHA256 | `A8746750CCE8FF323EDE15A4DD8C0801BD84091E3925AAE87C9943F04C1B3118` |
