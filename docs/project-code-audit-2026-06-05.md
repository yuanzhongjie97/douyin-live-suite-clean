# 项目代码审计报告

生成日期：2026-06-05  
项目路径：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`

## 审计范围

本次审计覆盖项目自有源码、脚本和文档：

- 根工作区配置：`package.json`、`package-lock.json`、`tsconfig.base.json`、`.gitignore`
- 后端：`apps/server/src/*`、`apps/server/scripts/regression-*`
- 前端：`apps/web/src/*`、`apps/web/scripts/regression-*`
- 桌面端：`apps/desktop/main.mjs`、`preload.cjs`、`package.json`、`scripts/*`
- 文档：`README.md`、`docs/*.md`、`docs/superpowers/plans/*.md`

排除范围：

- 第三方依赖：`node_modules`
- 构建产物：`dist`、`.bundle`
- 发布二进制：`apps/desktop/release/*.exe`
- 图片/图标等二进制资源

注意：当前目录没有 `.git` 元数据，`git status` 返回 `fatal: not a git repository`，因此本报告是全量源码审计，不是基于提交差异的审计。

## 总体结论

项目是一个完整的 Windows 桌面采集工具：Electron 拉起本地 Fastify 服务，服务端用 Playwright 驱动抖音页面采集 DOM 事件，SQLite 持久化，React/Vite 前端通过 REST + SSE 展示实时数据并支持 Excel 导出。

当前代码的可运行性较好：服务端 TypeScript 构建、前端 TypeScript/Vite 构建和 23 个回归脚本均通过。但安全和维护性存在明确缺口：本地 API 缺少请求鉴权且 CORS 全放开；采集/登录入口没有抖音 URL 白名单；核心采集器关闭了 TypeScript 检查；依赖审计存在 9 个漏洞，其中 4 个 high；前端和采集服务文件过大，业务规则高度耦合。

## 做得好的地方

- 根配置启用了 TypeScript `strict`，前后端构建能通过。
- Fastify 路由大部分使用 Zod 做请求结构校验。
- SQLite 使用 prepared statement、WAL、事件唯一键、索引和每会话事件保留上限。
- SSE 做了批量推送、队列上限和心跳，前端也做了批量消费和虚拟列表，考虑了高频直播消息场景。
- Electron 主窗口开启了 `contextIsolation` 和 `sandbox`，外链打开有域名限制。
- 前端对 `localStorage` 读写做了 try/catch 防护，降低受限渲染环境白屏风险。
- 有一批针对历史问题的回归脚本，覆盖评论丢失、礼物身份、静态资源缓存、白屏诊断、安装包保留等场景。

## 主要问题

### 1. 本地 API 无鉴权且 CORS 全放开

严重级别：High  
位置：`apps/server/src/index.ts:71`、`apps/server/src/index.ts:95`、`apps/server/src/index.ts:112`、`apps/server/src/index.ts:119`、`apps/server/src/index.ts:161`

现状：

- `@fastify/cors` 配置为 `origin: true`。
- `POST /api/sessions/start`、`/stop`、`/api/browser/login`、`/api/browser/login/close`、`/api/users/open-profile` 等可改变状态或驱动浏览器的接口没有请求密钥。
- 服务默认监听 `127.0.0.1`，降低了局域网暴露面，但不能阻止用户浏览器访问恶意网页后对本机服务发起跨站请求；CORS 全放开还允许读取响应。

影响：

- 恶意网页可能驱动本地采集服务打开登录窗口、停止会话、访问用户主页、读取本地统计/会话信息。
- 如果用户已登录抖音，浏览器自动化上下文会带有登录态，风险更高。

建议：

- 启动时生成本地 API secret，由 Electron 或前端注入，并要求所有状态变更/浏览器驱动接口携带 `x-douyin-live-suite-token`。
- CORS 仅允许当前本地服务同源、`localhost`/`127.0.0.1` 指定端口，生产桌面模式下尽量不接受任意 Origin。
- 诊断、导出、会话详情等含数据接口也应纳入同一鉴权策略。

### 2. 采集和登录入口没有抖音 URL 白名单

严重级别：High  
位置：`apps/server/src/index.ts:95`、`apps/server/src/index.ts:119`、`apps/server/src/capture-service.ts:854`、`apps/server/src/capture-service.ts:1159`、`apps/server/src/utils.ts:110`

现状：

- API 只校验 `z.string().url()`。
- `normalizeLiveUrl()` 会去掉 query/hash，但不是 allowlist；非抖音 URL 会原样返回。
- `start()` 和 `openLoginWindow()` 会把该 URL 交给 Playwright 进入持久化浏览器上下文。

影响：

- 本地服务可能被诱导访问任意 URL。
- 由于 Playwright 使用持久化 profile，错误目标站点可能影响登录态、缓存、cookie 或采集上下文。

建议：

- 对直播采集入口只允许 `https://live.douyin.com/<roomId>` 或明确支持的抖音直播 URL。
- 对用户主页解析只允许 `https://www.douyin.com/user/*`、`/follow/*` 和必要的抖音搜索 URL。
- 明确拒绝 `file://`、`http://127.0.0.1`、`localhost`、内网地址、非 HTTPS 和非抖音域名。

### 3. 依赖审计未通过

严重级别：High  
位置：`apps/desktop/package.json:28`、`apps/server/package.json:12`、`apps/server/package.json:15`、`apps/desktop/package.json:19`

验证命令：`npm audit --json`  
结果：退出码 1，漏洞总数 9，其中 high 4、moderate 5。

主要项：

- `electron@37.2.0`：存在多个 Electron 安全公告，fixAvailable 为 `37.10.3`，非 semver major。
- `@fastify/static@8.2.0`：路径遍历/route guard bypass，修复建议到 `9.1.3`，semver major。
- `@xmldom/xmldom`、`fast-uri`、`tmp`：传递依赖 high。
- `exceljs` 通过 `uuid` 牵出 moderate，修复路径需要谨慎评估版本回退/替代。

建议：

- 优先升级 Electron 到审计建议的安全版本并重新验证打包。
- 评估 `@fastify/static` 升级到 9.x 的兼容性，至少在现版本下关闭目录 listing 并保留静态资源回归脚本。
- 对 ExcelJS 依赖链单独评估；如果官方升级路径不直接可用，记录风险接受依据或替代方案。

### 4. 核心采集器关闭 TypeScript 检查

严重级别：High  
位置：`apps/server/src/collector.ts:1`、`apps/server/src/collector.ts:75`

现状：

- `collector.ts` 文件首行是 `// @ts-nocheck`。
- 该文件约 2699 行，是核心 DOM 观察、分类、批量回传逻辑。
- 页面侧回传 payload 在 `exposeBinding('__douyinCollectorBatch')` 中只做了轻量 `typeof` 处理，没有 Zod/schema 级别边界校验。

影响：

- 核心链路无法获得 TypeScript 的静态安全保护。
- 抖音 DOM 结构变化或页面侧异常 payload 更容易造成运行期错误、误分类、数据丢失。

建议：

- 先把页面注入脚本和 Node 侧采集类拆分。
- 为 `RawCollectorEvent` 边界增加 schema 校验。
- 分阶段移除 `@ts-nocheck`：先为外部边界和核心函数补类型，再收紧全部文件。

### 5. 诊断和数据接口缺少访问边界

严重级别：Warning  
位置：`apps/server/src/index.ts:181`、`apps/server/src/index.ts:184`、`apps/server/src/index.ts:196`、`apps/server/src/index.ts:228`

现状：

- `/api/diagnostics/comment-flow` 暴露最近评论诊断信息。
- `/api/diagnostics/comment-flow/reset` 可重置诊断数据。
- `/api/diagnostics/events` 可读取事件。
- `/api/export.xlsx` 可导出 Excel。

影响：

- 在无鉴权和 CORS 全放开的前提下，诊断和导出接口会扩大本地数据泄露面。

建议：

- 与本地 API secret 一起纳入鉴权。
- 对导出接口增加只允许同源页面触发或使用一次性导出 token。

### 6. 版本号和发布标识不一致

严重级别：Warning  
位置：`package.json:3`、`apps/web/package.json:3`、`apps/server/package.json:3`、`apps/desktop/package.json:3`、`apps/desktop/main.mjs:5`

现状：

- 根包、web、server 是 `26.5.26`。
- desktop 包是 `26.5.29`。
- Electron 主进程 release tag 是 `V26.5.29.15`。
- README 默认产物路径仍写 `Douyin Live Suite 1.0.0.exe`，与实际中文产品名/版本化安装包不一致。

影响：

- 发布追踪、问题定位和用户日志比对容易混乱。
- 文档和产物命名不一致会影响交付验收。

建议：

- 建立单一版本源，例如根 `package.json` 或独立 `version.json`。
- 打包脚本、前端版本日志、Electron `APP_RELEASE_TAG` 和 README 从同一版本源生成或至少在发布前校验。

### 7. 单文件体量过大，维护和回归风险高

严重级别：Warning  
位置：`apps/web/src/App.tsx`、`apps/web/src/styles.css`、`apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`

现状：

- `App.tsx` 约 3500+ 行，包含版本日志、主题、本地存储、SSE、虚拟列表、特别关注、神秘人、用户主页解析、布局等多类职责。
- `styles.css` 约 3700+ 行。
- `collector.ts` 约 2700 行，`capture-service.ts` 约 2300 行。

影响：

- 修改局部功能时容易触发跨模块回归。
- 测试只能靠字符串断言和大范围回归脚本，难以形成清晰单元边界。

建议：

- 前端拆为：API hook、SSE reducer、虚拟列表组件、特别关注模块、神秘人窗口模块、主题/布局模块。
- 后端拆为：URL 安全、登录态、采集生命周期、事件归一化/去重、身份缓存、导出服务。
- 每次拆分保持行为不变，并用现有回归脚本守住输出。

### 8. 测试体系没有统一入口和覆盖率

严重级别：Warning  
位置：`package.json`、`apps/server/package.json`、`apps/web/package.json`

现状：

- 没有根 `test` 脚本。
- 没有 Vitest/Jest/Playwright Test 配置。
- 回归脚本存在但分散在三个目录，需要手工组合执行。
- 没有覆盖率报告。

影响：

- 新增功能时很难判断哪些脚本必须跑。
- CI 接入成本高，容易漏跑浏览器相关回归。

建议：

- 增加根脚本：`test:regression`、`test:server`、`test:web`、`test:desktop`。
- 对纯函数和路由补 Vitest；保留现有 Node 回归脚本作为集成/结构回归。
- 输出 JUnit/覆盖率，便于自动化验收。

### 9. 配置读取缺少启动期校验

严重级别：Suggestion  
位置：`apps/server/src/config.ts:17`、`apps/server/src/config.ts:18`

现状：

- `HOST`、`PORT`、路径类环境变量直接读取。
- `Number(process.env.PORT ?? 3100)` 可能得到 `NaN`。

建议：

- 用 Zod 或轻量 parser 对环境变量做启动期校验。
- 端口、路径、浏览器目录等配置错误应在启动日志中给出明确诊断。

## 架构风险矩阵

| 类别 | 风险 | 等级 | 证据 |
| --- | --- | --- | --- |
| 安全 | 本地 API 无鉴权，CORS 全放开 | High | `origin: true`，状态变更接口无 token |
| 安全 | Playwright 可被传入任意 URL | High | URL 只做 `z.string().url()` |
| 依赖 | `npm audit` 9 个漏洞 | High | 4 high、5 moderate |
| 类型 | 核心采集器 `@ts-nocheck` | High | `collector.ts:1` |
| 可维护性 | 前端/采集/服务大文件 | Warning | 多个文件超过 2000 行 |
| 测试 | 没有统一测试入口/覆盖率 | Warning | package scripts 缺失 |
| 发布 | 版本号不一致 | Warning | 26.5.26 / 26.5.29 / V26.5.29.15 |

## 建议优先级

1. 先补本地 API secret、CORS allowlist、URL allowlist，并为这些安全边界增加自动化测试。
2. 升级 Electron，评估 `@fastify/static` 和传递依赖漏洞修复。
3. 建立根 `test:regression` 脚本，把当前 23 个回归脚本纳入统一入口。
4. 分阶段拆分 `collector.ts`、`capture-service.ts`、`App.tsx`。
5. 统一版本源和发布文档，避免交付产物、日志和 README 不一致。

