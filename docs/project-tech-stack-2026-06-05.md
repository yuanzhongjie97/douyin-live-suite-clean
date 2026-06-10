# 项目技术栈说明

生成日期：2026-06-05

## 项目形态

这是一个 npm workspaces 管理的 TypeScript/JavaScript 桌面应用项目。

工作区：

| 工作区 | 包名 | 版本 | 角色 |
| --- | --- | --- | --- |
| 根目录 | `douyin-live-suite` | `26.6.9-2` | workspace、构建、开发脚本 |
| `apps/server` | `@douyin-live-suite/server` | `26.6.9-2` | 本地后端、采集服务、数据库、导出 |
| `apps/web` | `@douyin-live-suite/web` | `26.6.9-2` | React 前端监控台 |
| `apps/desktop` | `@douyin-live-suite/desktop` | `26.6.9-2` | Electron 桌面壳和打包 |

运行模式：

- 开发：`npm run dev` 同时启动 Fastify 后端和 Vite 前端。
- 桌面开发：`npm run desktop:dev` 先构建 server/web，再启动 Electron。
- 生产桌面：Electron 内嵌本地服务，加载 `apps/web/dist` 静态前端。

## 前端技术栈

| 分类 | 技术 | 版本/证据 | 用途 |
| --- | --- | --- | --- |
| UI 框架 | React | `^19.1.0` | 监控台 UI、状态渲染 |
| DOM 渲染 | React DOM | `^19.1.0` | Web 页面挂载 |
| 构建工具 | Vite | `^6.3.5`，实际构建输出显示 `v6.4.2` | 开发服务器、生产构建 |
| 编译 | TypeScript | `^5.8.3` | 类型检查和构建 |
| 样式 | 原生 CSS | `apps/web/src/styles.css` | 主题、布局、列表、弹窗 |
| 实时通信 | EventSource/SSE | `apps/web/src/App.tsx` | 接收后端事件流 |
| HTTP 客户端 | browser `fetch` | `apps/web/src/api.ts` | 调用 REST API |
| 本地状态 | `localStorage` | `apps/web/src/App.tsx` | 主题、字号、筛选、折叠、面板尺寸 |

前端主要模块：

- `App.tsx`：主应用、SSE、事件列表、神秘人窗口、特别关注、主题和布局。
- `api.ts`：REST API 封装。
- `types.ts`：前端领域类型。
- `styles.css`：全局样式和主题。

前端补充建议：

- 引入组件/模块拆分，降低 `App.tsx` 单文件复杂度。
- 引入 Vitest + React Testing Library 覆盖纯函数和核心交互。
- 对 SSE reducer、去重逻辑、特别关注匹配逻辑建立独立单元测试。
- 增加错误边界，避免单个面板渲染异常导致整屏不可用。

## 后端技术栈

| 分类 | 技术 | 版本/证据 | 用途 |
| --- | --- | --- | --- |
| 运行时 | Node.js | 本机验证 `v22.16.0` | 后端服务、脚本、构建 |
| Web 框架 | Fastify | `^5.2.1` | REST API、SSE |
| CORS | `@fastify/cors` | `^11.1.0` | 开发/跨源访问 |
| 静态资源 | `@fastify/static` | `^9.1.3` | 托管前端 dist |
| 自动化浏览器 | Playwright | `^1.53.1` | 打开抖音页面、注入 DOM 观察器 |
| 数据库 | better-sqlite3 | `^12.10.0` | 本地 SQLite 持久化 |
| 数据导出 | ExcelJS | `^4.4.0` | Excel 工作簿导出 |
| 数据校验 | Zod | `^3.24.4` | API 请求参数校验 |
| ID 生成 | nanoid | `^5.1.5` | 会话 ID |
| TS 运行 | tsx | `^4.19.4` | 开发和回归脚本运行 TS/MJS |

后端主要模块：

- `index.ts`：Fastify app、路由、SSE、静态资源托管。
- `capture-service.ts`：采集生命周期、登录窗口、事件持久化、自动保存、特别关注、用户主页解析。
- `collector.ts`：Playwright 页面控制、DOM 观察、事件提取和批量回传。
- `db.ts`：SQLite schema、会话/事件/身份缓存/统计查询。
- `utils.ts`：URL 归一化、文本分类、礼物解析、唯一键生成。
- `exporter.ts`：Excel 导出。
- `playwright-runtime.ts`：Chromium 安装/路径选择。
- `comment-diagnostics.ts`：评论链路诊断计数和最近决策记录。

后端补充建议：

- `security.ts` 已负责本地 API Cookie 鉴权、Origin allowlist、抖音 URL allowlist。
- 后续移除 `collector.ts` 的文件级 `@ts-nocheck`，当前已新增 `collector-payload.ts` 收敛页面 payload 边界。
- 把事件归一化、去重、身份缓存、自动导出拆为独立服务。
- 环境变量已通过 `parseServerConfig()` 做启动期 schema 校验；后续可补不可写目录的真实 I/O 检查。

## 桌面端技术栈

| 分类 | 技术 | 版本/证据 | 用途 |
| --- | --- | --- | --- |
| 桌面壳 | Electron | `40.10.2` | Windows 桌面窗口 |
| 打包 | electron-builder | `26.8.1` | NSIS 安装包 |
| 平台 | Windows | `electron-builder --win nsis` | 主要交付目标 |
| 预加载 | Electron preload | `apps/desktop/preload.cjs` | 暴露有限窗口 API |
| 本地服务嵌入 | dynamic import | `apps/desktop/main.mjs` | 启动 server dist |
| 日志 | 文件日志 | `desktop-startup.log` | 启动/资源/渲染诊断 |

桌面端能力：

- 查找可用本地端口。
- 设置服务环境变量。
- 启动内嵌 Fastify 服务。
- 加载前端页面并添加 cache buster。
- 清理 Electron HTTP 缓存。
- 记录窗口尺寸、位置、置顶状态。
- 控制外链仅允许抖音域名。
- 拦截本地 Excel 导出链接并触发下载。

桌面端补充建议：

- Electron 已升级到 `40.10.2` 并通过 high=0 审计门禁。
- 已新增版本门禁，`APP_RELEASE_TAG` 与软件内版本日志按 `VYY.M.D.N` 规则一致。
- 对 `preload` 暴露的 IPC 入参做更严格校验。

## 数据库与存储

数据库：SQLite，通过 `better-sqlite3` 同步访问。

核心表：

- `sessions`：采集会话。
- `events`：评论、进场、互动、礼物、日志事件。
- `session_event_totals`：会话级分类累计统计。
- `session_unique_users`：会话级去重用户累计。
- `session_gift_totals`：会话级礼物累计排行。
- `session_mystery_user_totals`：会话级神秘人累计汇总。
- `user_identity_cache`：用户身份缓存。
- `user_identity_name_observations`：昵称与身份观察关系。

索引：

- `idx_events_session_created_at`
- `idx_events_session_category`
- `idx_identity_name_scope`
- `idx_identity_cache_last_seen`

存储路径：

- 开发默认：项目根 `storage`
- 桌面运行：Electron `userData/runtime`
- 浏览器 profile：`browser-profile`
- Playwright browser：`ms-playwright`

补充建议：

- 对导出大量事件时的内存占用做压力测试。
- 给数据库迁移补版本表，避免后续 schema 演进只能靠 `ensureColumn`。

## 测试技术栈

当前测试不是标准测试框架，而是 Node 脚本回归：

| 目录 | 数量 | 类型 |
| --- | ---: | --- |
| `apps/server/scripts/regression-*.mjs` | 18 | 后端、采集、数据库、静态资源、安全、配置、导出 |
| `apps/web/scripts/regression-*.mjs` | 8 | 前端展示、去重、备注、启动防护 |
| `apps/desktop/scripts/regression-*.cjs` | 6 | 桌面打包/白屏诊断/安装包保留/native ABI/版本/中文可读性 |

已使用工具：

- `node`
- `npx tsx`
- Node 内置 `assert`
- Playwright Chromium，用于部分采集器回归脚本
- TypeScript 构建
- Vite 构建
- `npm audit`

测试栈不足：

- 无统一 `test` 脚本。
- 无 Vitest/Jest。
- 无 Playwright Test。
- 无覆盖率。
- 无 CI 配置。
- 无真实抖音直播间端到端验收脚本。

## 构建与发布

根脚本：

- `npm run build`：构建 server 和 web。
- `npm run desktop:dev`：构建 server/web，准备 native，再启动 Electron。
- `npm run desktop:pack`：快速打包。
- `npm run desktop:pack:full`：强制准备 native/runtime 后完整打包。

当前发布产物：

- `apps/desktop/release/糖三角-V26.6.9.2-安装包.exe`
- `apps/desktop/release/糖三角-V26.6.9.1-安装包.exe`
- `apps/desktop/release/糖三角-V26.5.29.20-安装包.exe` 作为回滚包保留。

发布栈补充建议：

- CI/覆盖率本轮按用户决策先不做；后续可建立 install、build、test、audit、pack smoke。
- 发布前自动检查版本号一致性。
- 代码签名本轮按用户决策先不做，当前 `signAndEditExecutable` 为 false。

## 安全技术栈现状

已有保护：

- Electron renderer 使用 `contextIsolation` 和 `sandbox`。
- Electron 外链打开限制到 `www.douyin.com`、`live.douyin.com`。
- 本地 API 使用运行期 HttpOnly Cookie 鉴权，所有 `/api/*`、SSE、导出接口都需要鉴权。
- Origin allowlist 显式拒绝 `Origin: null`、`file://`、`data:`、非 HTTP(S) 和非本机来源。
- 开始采集只允许 `https://live.douyin.com/{roomId}`。
- API 请求结构用 Zod 校验。
- 启动配置用 Zod 校验。
- SQLite 使用 prepared statements。
- `npm run audit:security` high=0；`exceljs -> uuid` moderate 进入风险接受记录。

缺口：

- 核心采集器 `@ts-nocheck`。
- `exceljs -> uuid` 仍有 moderate 审计项。
- 导出仍使用内存 buffer，超大场次如需更低峰值应改 streaming writer。
- 当前安装包未代码签名。

建议补充的安全栈：

- 本地 API token。
- CORS allowlist。
- URL allowlist。
- Helmet 或等价安全 header。
- npm audit 作为发布门禁。
- 依赖升级策略和安全公告跟踪。
