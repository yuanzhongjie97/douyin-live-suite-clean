# 项目测试对齐与改进分析报告

生成日期：2026-06-05  
分析依据：

- `docs/project-prd-2026-06-05.md`
- `docs/project-tech-stack-2026-06-05.md`
- `docs/project-code-audit-2026-06-05.md`
- `docs/project-test-report-2026-06-05.md`

## Requirement Understanding

- Purpose: 糖三角是 Windows 桌面端抖音直播采集工具，目标是在用户登录抖音后采集直播间公开可见互动数据，并实时展示、持久化、导出和辅助识别重点用户。
- In Scope: Electron 桌面端、本地 Fastify 服务、Playwright 采集、SQLite 存储、React 监控台、REST API、SSE、Excel 导出、特别关注、神秘人识别、诊断日志、窗口状态保存、多主题。
- Out of Scope: 云端服务、多人协作、抖音官方 API、移动端、远程部署、自动登录、权限外数据采集。
- Roles: 直播运营、场控、私域/客户运营、数据复盘人员、技术支持。
- Platforms: Windows 桌面端、Electron renderer、Fastify API、本地 SQLite、Playwright Chromium、打包安装包。
- Key States: 未登录、已登录、采集中、手动停止、主播关播自动停止、采集异常、导出中/导出失败、静态资源缓存异常、升级后首次启动。
- Entry Points: 桌面启动、登录按钮、直播 URL 输入、开始采集、停止采集、导出 Excel、神秘人窗口、特别关注文件、SSE 事件流、诊断 API、安装包升级。
- Exceptions: 未登录开始采集、非抖音 URL、恶意跨源访问、本地 API 无 token、浏览器 profile 锁、采集页关闭、评论重复/丢失、静态资源 404、依赖漏洞、导出无会话、localStorage 不可用。
- Tracking/Data: SQLite 会话和事件、评论诊断 counters/recent、Electron startup log、SSE flush counters、Excel 文件、highlight_users.txt、npm audit 结果、构建和回归脚本结果。

## Open Questions

### Blocking

- 生产环境是否允许非抖音 URL 进入登录窗口、采集窗口或用户搜索页？如果不允许，必须立即补 URL allowlist，测试也应以“非抖音 URL 被拒绝”为 P0。
- 本地 API 是只服务 Electron 页面，还是允许浏览器开发模式访问？这决定 CORS/token 的严格程度。
- 依赖漏洞中的 high 项是否允许风险接受？如果不允许，安全审计必须成为发布阻断项。

### Non-blocking / Assumptions

- 默认按桌面客户端单机使用场景分析，不按公网服务分析。
- 当前 50000 条/会话事件保留上限视为产品约束，但需要在 UI 或文档中显式说明。
- 真实抖音直播间端到端测试暂按人工/半自动验收处理，因为稳定测试账号、直播间和网络条件未定义。
- ExcelJS 依赖链漏洞修复可能需要技术评估，短期可先记录风险接受依据。

## Test Scope

- Must test: 启动、登录、开始采集、停止采集、事件持久化、SSE 实时展示、评论/礼物识别、特别关注、神秘人、导出、API 安全、URL allowlist、依赖审计、升级后白屏。
- Regression: 评论丢失、评论重复、礼物身份、礼物备注、静态资源缓存、localStorage 异常、安装包文件保留、浏览器上下文失效、自动保存。
- Not needed / low value: 移动端兼容、云端多租户、抖音官方 API 行为、跨平台安装包、复杂营销页面 UI。

## Current Coverage Summary

| Area | Current coverage | Gap | Risk |
| --- | --- | --- | --- |
| Build | server/web/root build 通过 | 缺少 CI 固化 | 中 |
| Regression scripts | 23 个脚本通过 | 无统一 test 入口 | 中 |
| API security | 未覆盖 | CORS/token/URL allowlist 缺失 | 高 |
| Dependency security | npm audit 已执行 | 9 个漏洞未修复 | 高 |
| Real E2E | 未执行 | 无真实直播间稳定验收 | 高 |
| Electron smoke | 静态脚本覆盖部分 | 未验证打包后真实启动/升级 | 中高 |
| Frontend UI | 字符串/纯逻辑回归为主 | 无组件测试/视觉回归 | 中 |
| Performance | 有批量/虚拟列表设计 | 无高频压测指标 | 中 |
| Maintainability | 审计已识别 | 大文件和 @ts-nocheck 未改 | 高 |

## Test Matrices

### Role Matrix

| Role | Can see | Can act | Notification | Notes |
| --- | --- | --- | --- | --- |
| 直播运营 | 评论、进场、互动、礼物、统计、神秘人 | 登录、开始/停止采集、导出、打开用户主页 | 采集状态、关播自动停止、导出结果 | P0 主路径用户 |
| 场控 | 实时评论、送礼、特别关注命中 | 暂停滚动、筛选、查看用户主页 | 特别关注弹窗、采集异常 | 强调低延迟和可读性 |
| 私域/客户运营 | 特别关注命中、备注/原昵称 | 维护 highlight_users.txt、打开主页 | 命中高亮、弹窗 | 需验证身份字段匹配，不误命中公共链接 |
| 数据复盘 | 历史会话、统计、Excel | 停止后导出、查看最近会话 | 导出成功/失败日志 | 需验证停止后数据不清空 |
| 技术支持 | startup log、comment diagnostics、资源请求状态 | 重置诊断、收集日志 | 白屏/丢评论诊断信息 | 诊断接口也需要访问保护 |

### State Transition Matrix

| From | Trigger | To | Side effects | Priority |
| --- | --- | --- | --- | --- |
| 桌面未启动 | 打开应用 | 服务启动/前端加载 | 生成 startup log，加载静态资源 | P0 |
| 未登录 | 点击登录 | 登录窗口打开 | 创建/复用 Chromium profile | P0 |
| 未登录 | 开始采集 | 仍未采集 | UI/API 返回明确错误 | P0 |
| 已登录 | 开始采集合法抖音直播 URL | 采集中 | 创建 session，注入采集器，写 SQLite，SSE 推送 | P0 |
| 已登录 | 开始采集非抖音 URL | 拒绝 | 不打开 Playwright 目标页，记录拒绝原因 | P0 |
| 采集中 | 停止采集 | stopped | 等待持久化队列，保留数据，手动保存 | P0 |
| 采集中 | 主播关播 | stopped | 自动保存到文档目录 | P1 |
| 采集中 | 采集页关闭/崩溃 | error | 记录日志，结束会话 | P1 |
| stopped | 导出 | stopped | 返回 Excel，包含全量会话事件 | P0 |
| 升级后首次启动 | 加载主页面 | 前端正常渲染 | 清 Electron HTTP cache，加 cache buster | P1 |

### Platform / Entry Matrix

| Platform/Entry | Expected behavior | Priority | Verification |
| --- | --- | --- | --- |
| Electron 主窗口 | 主窗口不白屏，服务 URL 加 cache buster | P0 | UI、log、manual observation |
| Fastify REST API | 参数校验、鉴权、错误码清晰 | P0 | API |
| SSE `/api/events/stream` | 批量推送、心跳、断开清理 | P0 | API、log |
| Playwright Chromium | 仅访问允许的抖音 URL，采集器稳定注入 | P0 | UI、log、backend console |
| SQLite | 会话/事件/身份缓存正确写入，索引有效 | P0 | database |
| Excel 导出 | 停止后可导出全量历史事件 | P0 | manual observation、database |
| highlight_users.txt | 自动读取、中文备注不乱码、通配符可控 | P1 | UI、database |
| 安装包升级 | 不加载旧 hash 资源，不白屏 | P1 | log、cache/index |

### Exception Matrix

| Failure type | Expected user feedback | System side effect | Priority | Verification |
| --- | --- | --- | --- | --- |
| 缺少 API token | 请求被拒绝 | 不改变会话/浏览器状态 | P0 | API |
| 非法 Origin | 请求被拒绝或不返回敏感响应 | 无状态变化 | P0 | API |
| 非抖音 URL | 明确错误 | 不导航 Playwright | P0 | API、log |
| 未登录开始采集 | 提示先登录 | 不创建 session | P0 | UI、database |
| Chromium 缺失/安装失败 | 显示安装/错误状态 | 记录 install state | P1 | UI、log |
| 采集页关闭 | 显示错误/停止 | session 标记 error | P1 | log、database |
| 导出无会话 | 返回错误 | 不创建空文件 | P1 | API |
| localStorage 不可用 | UI 仍渲染 | 偏好不持久化 | P2 | UI |
| 静态资源缺失 | 资源 404，不回退 index.html | startup log 可定位 | P1 | cache/index、log |

## Prioritized Test Points

| ID | Priority | Scenario | Expected result | Verification |
| --- | --- | --- | --- | --- |
| TA-001 | P0 | 无 token 调用开始/停止/登录/打开主页 API | 请求被拒绝，浏览器和 session 状态不变 | API、database |
| TA-002 | P0 | 非允许 Origin 调用本地 API | CORS 不允许读取敏感响应，状态不变 | API |
| TA-003 | P0 | 输入非抖音 URL 开始采集 | API 返回拒绝，不启动 Playwright 导航 | API、log |
| TA-004 | P0 | 未登录点击开始采集 | 显示明确错误，不创建 running session | UI、database |
| TA-005 | P0 | 已登录输入合法直播 URL 开始采集 | 创建 running session，事件进入 SQLite，SSE 推送到 UI | UI、API、database、log |
| TA-006 | P0 | 高频评论进入采集链路 | 不丢、不重复，诊断 counters 可解释 | database、log |
| TA-007 | P0 | 停止采集后导出 | 数据保留，Excel 包含评论/进场/互动/礼物/统计 | UI、database、manual observation |
| TA-008 | P0 | npm audit 发布前执行 | high 漏洞为 0 或有风险接受记录 | backend console |
| TA-009 | P1 | 主播关播自动停止 | session stopped，自动导出到文档目录，日志记录成功/失败 | log、database、manual observation |
| TA-010 | P1 | 特别关注用户命中评论和送礼 | UI 高亮并显示 `备注 / 原昵称`，不误用备注打开主页 | UI、database |
| TA-011 | P1 | `*dou*` 通配符遇到 `douyin.com` 链接 | 不误命中普通用户 | UI、database |
| TA-012 | P1 | 神秘人本人进场/评论/送礼 | 神秘人列表出现，最近活动可展开 | UI、database |
| TA-013 | P1 | 普通用户 @ 神秘人 | 普通用户不进入神秘人列表 | UI、database |
| TA-014 | P1 | 升级安装后首次启动 | 不白屏，资源请求状态和 React root 诊断正常 | log、cache/index |
| TA-015 | P1 | 采集页关闭或浏览器上下文失效 | session 标记 error，UI/日志可定位 | log、database |
| TA-016 | P1 | `collector.ts` payload 边界异常 | schema 拒绝异常 payload，不影响正常批次 | API、log |
| TA-017 | P2 | 主题、字号、窗口状态恢复 | 重启后恢复；localStorage 不可用时 UI 不崩 | UI、manual observation |
| TA-018 | P2 | 端口/路径环境变量异常 | 启动失败信息明确，不产生 NaN port 或隐式异常 | log、backend console |

## Tracking / Data Checks

| Trigger | Event/log/data | Required fields/state | Verification |
| --- | --- | --- | --- |
| 开始采集 | `sessions` row | `status=running`、url、started_at、room_id | database |
| 采集事件 | `events` row | unique_key、session_id、category、message、payload_json | database |
| 评论链路 | commentDiagnostics | raw_received、row_built、db.inserted、sse.flush | log/API |
| SSE 推送 | SSE message | `type=events`，payload 分类正确 | API |
| 停止采集 | `sessions` update | `status=stopped`、ended_at | database |
| 自动保存 | session log | Excel 自动保存成功/失败和 outputPath | log |
| 导出 | Excel workbook | sheet 覆盖事件分类和统计 | manual observation |
| 白屏诊断 | desktop-startup.log | releaseTag、serverUrl、resource status、rootChildCount | log |
| 安全拒绝 | API log/error | rejected reason、无状态变化 | API、log |
| 依赖审计 | npm audit | high=0 或风险接受记录 | backend console |

## 改进建议

### P0：发布前必须优先改

1. 补本地 API 安全边界：实现 API secret、CORS allowlist，并保护状态变更、诊断、导出、事件读取接口。
2. 补 URL allowlist：开始采集、登录窗口、打开主页、搜索页都必须限制到明确允许的抖音 HTTPS 域名和路径。
3. 修复依赖审计 high 项：优先升级 Electron；评估 `@fastify/static`、`fast-uri`、`tmp`、`@xmldom/xmldom`、ExcelJS 依赖链。
4. 建立统一测试入口：增加根 `test:regression` 和 `audit:security`，避免手工漏跑 23 个脚本。
5. 增加 API 安全回归：至少覆盖无 token、错误 token、非法 Origin、非抖音 URL、诊断/导出未授权访问。

### P1：降低回归和维护风险

1. 拆分大文件：优先拆 `collector.ts`、`capture-service.ts`、`App.tsx`，把 URL 安全、采集生命周期、事件归一化、SSE reducer、特别关注、神秘人模块分离。
2. 移除 `collector.ts` 的 `@ts-nocheck`：先为页面回传 payload 增加 schema，再逐步恢复 TypeScript 检查。
3. 引入 Vitest：覆盖纯函数、URL allowlist、事件分类、去重、特别关注匹配、Excel 文件名安全。
4. 增加 Electron smoke：验证打包后 app.asar 内容、server 启动、主页面 DOM mount、升级缓存清理。
5. 增加高频性能压测：模拟大量 comment/gift 批次，验证 UI 队列、SSE、SQLite 和内存上限。

### P2：完善工程质量

1. 统一版本源：根包、server、web、desktop、Electron release tag、README 和安装包名保持一致。
2. 增加配置 schema：校验 HOST、PORT、存储路径、浏览器路径，避免启动期隐式异常。
3. 明确 50000 条事件保留策略：UI/文档说明，并评估是否允许用户配置。
4. 增加覆盖率和 CI：构建、回归、audit、打包 smoke 形成发布门禁。
5. 增加人工验收清单：真实直播间登录、采集、送礼、神秘人、特别关注、导出、升级安装。

## Recommended Execution Order

| Phase | Goal | Work | Exit criteria |
| --- | --- | --- | --- |
| 1 | 安全封口 | API token、CORS、URL allowlist、安全测试 | P0 安全测试通过，非抖音 URL 被拒绝 |
| 2 | 发布门禁 | Electron/依赖升级、npm audit、统一 test 脚本 | audit high=0 或有批准记录，回归一键通过 |
| 3 | 测试体系 | Vitest、API 安全测试、Electron smoke、高频压测 | CI 可稳定跑 build/test/audit |
| 4 | 可维护性 | 拆分大文件、移除 @ts-nocheck、模块化采集逻辑 | 核心文件可类型检查，回归通过 |
| 5 | 产品验收 | 真实直播间人工/半自动验收、发布文档更新 | 关键用户流和导出链路验收通过 |

## Final Assessment

当前项目的功能链路和历史回归能力已经有基础，构建与 23 个回归脚本通过，说明内部核心逻辑不是失控状态。但从需求对齐角度看，最明显的缺口不是“还缺一个脚本”，而是 P0 安全边界和发布门禁没有建立：本地 API、URL allowlist、依赖漏洞、统一测试入口都直接影响能否安全发布。

建议先完成安全封口和测试入口统一，再做大规模拆分。否则拆分会扩大回归面，而安全问题仍然存在。

