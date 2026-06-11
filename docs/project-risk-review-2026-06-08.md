# 糖三角代码风险复核报告

生成日期：2026-06-08  
项目路径：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`

## 复核范围

本次只复核 `douyin-live-suite-clean` 项目，不包含 `http://127.0.0.1:3100/` 上运行的其他本地服务。

覆盖范围：

- 根工作区：`package.json`、`package-lock.json`、`tsconfig.base.json`
- 后端：`apps/server/src/*`、`apps/server/scripts/*`
- 前端：`apps/web/src/*`、`apps/web/scripts/*`
- 桌面端：`apps/desktop/main.mjs`、`apps/desktop/package.json`、`apps/desktop/scripts/*`
- 已有质量文档：`docs/project-code-audit-2026-06-05.md`、`docs/security-risk-acceptance-2026-06-05.md`、`docs/testing-sop-2026-06-05.md`

## 技术栈现状

| 层级 | 技术栈 | 证据 |
| --- | --- | --- |
| 前端 | React 19、Vite 6、TypeScript 5 | `apps/web/package.json` |
| 后端 | Fastify 5、TypeScript、better-sqlite3、Playwright、Zod、ExcelJS | `apps/server/package.json` |
| 桌面端 | Electron 40.10.2、electron-builder、NSIS | `apps/desktop/package.json` |
| 测试 | 自研 Node 回归脚本，根命令聚合构建、server/web/desktop regression | `package.json`、各 `scripts/run-regressions.*` |

## 已缓解的旧高风险项

以下风险在当前源码中已经有明确缓解，不应再按未修复 P0 处理：

| 风险 | 当前状态 | 证据 |
| --- | --- | --- |
| 本地 API CORS 全放开 | 已改为本机来源 allowlist | `apps/server/src/index.ts:77`、`apps/server/src/security.ts:17` |
| 跨站状态变更请求 | 已增加 `Origin` / `Sec-Fetch-Site` 拦截 | `apps/server/src/index.ts:83`、`apps/server/src/security.ts:26` |
| 非抖音 URL 进入采集或登录入口 | 已增加抖音 HTTPS allowlist | `apps/server/src/index.ts:119`、`apps/server/src/index.ts:147`、`apps/server/src/security.ts:54` |
| 静态资源旧 hash 回退 HTML | 已对 `/assets/*` 缺失资源返回 404 | `apps/server/src/index.ts:58` |
| 服务默认监听局域网 | 桌面嵌入服务显式设置 `127.0.0.1` | `apps/desktop/main.mjs:237` |
| 本地 API 缺少运行期鉴权 | 已通过 HttpOnly Cookie 保护所有 `/api/*`，静态资源不鉴权 | `apps/server/src/index.ts`、`apps/server/src/security.ts` |
| `Origin: null` 和非法 Origin | 已对 `/api/*` 非法 Origin 直接 403，覆盖 GET 数据面和 POST 状态变更 | `apps/server/src/index.ts`、`apps/server/scripts/regression-api-production-security.mjs` |
| Electron high 审计项 | 已升级到 `electron@40.10.2`，`npm run audit:security` 无 high | `apps/desktop/package.json`、`package-lock.json` |

## 当前仍未解决的风险

### P0-01：本地 API 缺少显式会话密钥，`Origin: null` 会被放行（已缓解）

**位置：** `apps/server/src/security.ts:17`、`apps/server/src/index.ts:77`、`apps/web/src/api.ts:11`  
**当前状态：** 已缓解。

- 服务启动生成运行期 token。
- 首屏 `index.html` 和 fallback shell 设置 `HttpOnly; SameSite=Strict; Path=/api` Cookie。
- 所有 `/api/*` 请求统一校验 Cookie；无 Cookie 返回 401。
- 带非法 Origin、`Origin: null`、`file://`、`data:` 等来源的 `/api/*` 请求直接返回 403；GET 数据面不再只依赖 CORS。

**影响：**

原 P0 影响已被运行期 Cookie 和非法 Origin 拦截缓解。外部脚本不再是官方支持入口；若未来需要外部集成，应另行设计受控 token 机制。

**建议：**

1. 保持 `regression-api-security.mjs` 和 `regression-api-production-security.mjs` 为 P0 门禁。
2. 如未来需要外部脚本访问 API，必须新增独立授权方案，不能复用桌面 Cookie。

### P0-02：依赖安全审计仍有 high 漏洞（已缓解）

**位置：** `apps/desktop/package.json:28`、`package-lock.json`  
**验证：** `npm run audit:security` 退出码为 0。  
**当前状态：** 已缓解。

- `electron@40.10.2` 满足当前 high 审计门禁。
- `electron@42.3.3` 曾尝试但与 `better-sqlite3` Electron ABI 编译失败，因此选择 `electron@40.10.2` 作为当前可打包版本。
- `better-sqlite3` 已升级到 `12.10.0` 并通过 Node 回归与 Electron 40 原生模块校验。
- `exceljs -> uuid` 仍有 moderate 项。

**影响：**

high 发布门禁已通过；moderate 项继续按风险接受管理。

**建议：**

1. 不再强行升级 Electron 42，除非 `better-sqlite3` 或替代 SQLite 方案确认支持。
2. ExcelJS/uuid 若无法无损升级，应保留风险接受记录，并补导出边界测试。

### P1-01：数据读取和导出接口仍未纳入鉴权（已缓解，后续保留增强项）

**位置：** `apps/server/src/index.ts:213`、`apps/server/src/index.ts:232`、`apps/server/src/index.ts:239`、`apps/server/src/index.ts:283`、`apps/server/src/index.ts:296`  
**当前状态：** 已缓解。

- `/api/events`、`/api/stats`、`/api/highlight-users`、`/api/diagnostics/*`、`/api/export.xlsx`、`/api/events/stream` 均进入统一 `/api/*` Cookie 鉴权。
- 非法 Origin 即使带正确 Cookie 也会返回 403。

**影响：**

原“裸读数据面”风险已缓解。后续增强项是为导出增加一次性下载 token，但当前 P0 不阻断。

**建议：**

后续可为导出接口额外增加一次性下载 token，降低同一桌面会话内 URL 复用风险。

### P1-02：核心采集器仍关闭 TypeScript 检查

**位置：** `apps/server/src/collector.ts:1`  
**现状：**

- `collector.ts` 首行仍为 `// @ts-nocheck`。
- 文件约 2699 行，承担 Playwright 页面采集、DOM 解析、事件识别、礼物暂存、批量回传等核心职责。

**影响：**

抖音 DOM 变更、payload 字段缺失、异步回调时序变化更容易绕过静态检查，导致评论/礼物丢失或误分类。

**建议：**

1. 先定义页面侧回传 payload schema。
2. 把页面注入脚本、DOM 工具、礼物暂存、事件归一化拆成独立模块。
3. 分阶段移除 `@ts-nocheck`，每阶段都跑采集/评论/礼物/身份回归。

**2026-06-09 进展：** 已新增 `apps/server/src/collector-payload.ts`，页面侧回传 payload 先经过严格归一化边界再进入采集回调；新增 `regression-collector-payload-schema.mjs`。`collector.ts` 全文件 `@ts-nocheck` 尚未完全移除，风险已收窄但未完全关闭。

### P1-03：导出链路一次性加载事件并生成内存 buffer

**位置：** `apps/server/src/capture-service.ts:1323`、`apps/server/src/exporter.ts:50`  
**现状：**

- `exportSessionWorkbook()` 读取当前会话全部可导出事件。
- `buildWorkbookBuffer()` 使用 ExcelJS 在内存中生成完整 workbook buffer。
- 数据库有单会话事件上限裁剪，但长时间直播或大直播间仍可能产生较大导出负载。

**影响：**

高频直播场景下，导出可能造成内存峰值、UI 卡顿或自动保存失败。

**建议：**

1. 增加导出压力测试：1 万、5 万、10 万事件。
2. 记录导出耗时、峰值内存、文件大小。
3. 需要时改为分批读取或 streaming writer。

**2026-06-09 进展：** 已新增会话级累计汇总，统计不再依赖当前保留的原始事件；Excel 增加“全量统计汇总”和“当前保留明细说明”。压测脚本覆盖 1 万、5 万、10 万。导出接口仍返回内存 buffer，因明细受保留窗口限制，风险下降但未完全流式化。

### P1-04：配置启动期校验不足

**位置：** `apps/server/src/config.ts:17`、`apps/server/src/config.ts:18`  
**现状：**

- `HOST`、`PORT`、路径类环境变量直接读取。
- `Number(process.env.PORT ?? 3100)` 可能得到 `NaN`。

**影响：**

异常环境变量可能导致服务启动失败、监听错误地址、数据落到非预期路径。

**建议：**

使用 Zod 或轻量 parser 做启动期配置校验；限制生产桌面模式 host 必须为 `127.0.0.1`。

**2026-06-09 状态：** 已缓解。`parseServerConfig()` 使用 Zod 校验 `HOST`、`PORT` 和路径类配置，`HOST` 仅允许本机地址，非法 `PORT` 会在 listen 前报错；新增 `regression-config-validation.mjs`。

### P1-05：版本号和发布标识仍不一致

**位置：** `package.json:3`、`apps/web/package.json:3`、`apps/server/package.json:3`、`apps/desktop/package.json:3`、`apps/desktop/main.mjs:8`  
**现状：**

- 根、web、server、desktop 当前均为 `26.6.9-2`。
- Electron release tag 为 `V26.6.9.2`。
- 软件内版本日志首项为 `V26.6.9.2`。

**影响：**

用户反馈、日志、安装包、测试报告之间难以精确对应；发布验收容易误判版本。

**建议：**

建立单一版本源，并在打包前运行版本一致性检查。版本号必须按用户规则生成，不能由脚本自行猜测。用户于 2026-06-09 明确更正：可见发布版本按打包日期约定，格式为 `VYY.M.D.N`，例如 `V26.5.29.13` 表示 2026-05-29 的第 13 个版本；若 2026-06-09 打包，当天首包应为 `V26.6.9.1`。

**2026-06-09 状态：** 已缓解。已新增发布版本门禁 `apps/desktop/scripts/regression-release-version.cjs`，强制 `VERSION_LOGS[0].version`、`APP_RELEASE_TAG` 和日期版本规则一致。当前可见版本已更新为 `V26.6.9.2`，各 workspace `package.json` 已统一为 npm semver `26.6.9-2`。

### P2-01：大文件和职责耦合造成回归成本高

**位置：**

- `apps/web/src/App.tsx`：约 3551 行
- `apps/web/src/styles.css`：约 3789 行
- `apps/server/src/collector.ts`：约 2699 行
- `apps/server/src/capture-service.ts`：约 2349 行
- `apps/server/src/db.ts`：约 993 行

**影响：**

局部改动容易影响采集、展示、导出、身份解析等多个功能面；测试定位成本高。

**建议：**

按功能模块渐进拆分，不做一次性大重构。每拆一个模块必须保留行为等价回归。

### P2-02：中文文案/编码可读性存在交付风险

**位置：** `apps/desktop/package.json`、`apps/server/src/exporter.ts`、旧 `docs/*.md` 中部分中文输出  
**现状：**

终端读取时可见部分中文字符串呈乱码。该问题可能来自文件编码、终端解码或历史写入编码不一致。

**影响：**

若乱码进入安装包名、Excel 表头、日志、测试文档，会降低验收和运维可读性。

**建议：**

统一源码和文档为 UTF-8；发布前检查安装包名、窗口标题、Excel 表头、启动日志和 README。

## 当前风险优先级

| 优先级 | 必须处理项 | 处理目标 |
| --- | --- | --- |
| P0 | 特别关注命中展示格式边界未确认 | 已按用户确认边界缓解：标记区显示 `特别关注 备注名`，正文用户名恢复为 `[原昵称]`；只改展示口径，不改采集、匹配、入库、统计和导出 |
| P1 | `collector.ts` 文件级 `@ts-nocheck` | 已增加 payload schema 边界；后续拆文件后再彻底移除 |
| P1 | Excel streaming writer | 当前 10 万压测通过且明细受保留窗口限制；后续如要求更低峰值再改流式写入 |
| P1 | 安装后真实启动和直播间 smoke | 已完成一次 `V26.6.9.2` 覆盖安装、启动、真实采集、停止和导出 smoke；后续发版仍建议按 SOP 复验 |
| P2 | 大文件拆分和编码治理 | 降低长期维护与交付可读性风险 |

## 已执行验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:regression` | 通过：server 18、web 8、desktop 6 个回归脚本 |
| `node --import tsx apps\server\scripts\regression-api-production-security.mjs` | 通过：非法 Origin/`Origin: null` GET 返回 403，本机 Origin + Cookie 返回 200 |
| `node --import tsx apps\server\scripts\pressure-export-100k.mjs` | 通过：10k/50k/100k；100k 总耗时 8746ms，保留明细 48000 行，xlsx 1.2MB，RSS 增量 349.8MB |
| `npm run audit:security` | 通过：无 high；剩余 2 个 moderate 来自 `exceljs -> uuid` |
| `npm run desktop:pack:fast` | 通过：生成 `糖三角-V26.6.9.1-安装包.exe`，packaged native ABI 门禁通过 |
| `node apps\desktop\scripts\run-regressions.cjs` | 通过：桌面静态回归、版本门禁、中文可读性门禁 |

2026-06-09 `V26.6.9.2` 特别关注展示修复追加验证：

| 命令 | 结果 |
| --- | --- |
| `node apps\web\scripts\regression-gift-remark-display.mjs` | 红灯验证先失败于 `[备注名 / 原昵称]`，修复后通过，确认礼物行显示 `[原昵称]` |
| `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` | 通过，停止会话和备注搜索相关逻辑未受影响 |
| `npm run test:regression` | 通过：server 18、web 8、desktop 6 |
| `npm run audit:security` | 通过：high=0，剩余 `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | 通过：生成 `糖三角-V26.6.9.2-安装包.exe`，packaged native ABI 门禁通过 |
| `node apps\desktop\scripts\run-regressions.cjs` | 通过：桌面静态回归、版本门禁、中文可读性门禁 |
| `V26.6.9.2` 覆盖安装和真实直播间 smoke | 通过：安装到 `D:\糖三角\@douyin-live-suitedesktop`；启动日志 `releaseTag=V26.6.9.2`、`serverUrl=http://127.0.0.1:3100`；直播间 `962565925628` 会话 `8O4oe_OrQC` 采集后统计评论 42、进场 18、互动 12、礼物 161、唯一用户 220；停止后桌面自动保存 Excel，导出接口可生成文件 |

`V26.6.9.2` 安装包：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe`，大小 85,324,896 bytes，SHA256 `01B6696502EEF5700C8AF24ACCF38D39B3974393C05CB467324A16C94162E92C`，未签名。

## 后续处理建议

1. P0 特别关注命中展示格式已按用户确认恢复：从 `[备注名 / 原昵称]` 改回 `[原昵称]`，标记区继续显示备注。
2. 统计已改为会话级累计汇总，尽量代表全量直播历史；原始明细仍受保留窗口限制。
3. 10 万总事件压测通过，但本轮不把正式原始事件保留上限从 5 万提高到 10 万。
4. 保留 P1/P2：`collector.ts` 文件级 `@ts-nocheck`、导出 streaming writer、大文件拆分、特别关注真实命中截图。代码签名、CI/覆盖率、外部 API 支持按用户决策本轮先不做。
5. `V26.6.9.2` 已完成一次真实安装和直播间 smoke；真实特别关注命中因缺少可命中的真实用户 ID，继续由隔离 mock 回归覆盖，后续拿到真实 ID 后再补现场截图。

## 2026-06-08 追加：V26.5.29.18 安装后 native ABI 崩溃

**用户反馈：** 覆盖安装后启动报错，`better_sqlite3.node` compiled against `NODE_MODULE_VERSION 127`，Electron 40 运行时要求 `NODE_MODULE_VERSION 143`。

**级别：** P0，影响桌面端启动。

**根因：**

- 原门禁只验证工作区 `node_modules\better-sqlite3` 可被 Electron 加载。
- 未验证最终打包输出 `release\win-unpacked\resources\app.asar.unpacked\node_modules\better-sqlite3`。
- 覆盖安装路径存在旧 native 目录残留时，可能继续加载旧 ABI 文件。

**已修复：**

- 新增最终打包目录 native ABI 门禁：`apps/desktop/scripts/regression-packaged-native-abi.cjs --required`。
- 打包流程在 `electron-builder` 后、`finalize-installer` 前强制运行该门禁。
- 安装器在写入新程序文件前清理旧 `resources\app.asar.unpacked\node_modules\better-sqlite3`。
- 版本升为 `V26.5.29.19`，避免与已失败的 `V26.5.29.18` 混淆。

**验证：**

| 命令 | 结果 |
| --- | --- |
| `npm run test:regression` | 通过：server 14、web 8、desktop 4 |
| `npm run audit:security` | 通过：high=0；剩余 `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | 通过：打包中 native ABI 门禁输出 `electron=40.10.2`、`modules=143` |
| `node apps\desktop\scripts\run-regressions.cjs` | 通过：桌面静态回归 |

**历史状态：** `V26.5.29.19` 用于当时的 native ABI 修复复测，随后被 `V26.5.29.20`、`V26.6.9.1` 和当前 `V26.6.9.2` 取代，不再作为当前验收版本。

## 2026-06-08 追加：V26.5.29.19 native ABI 门禁误判

**用户反馈：** 安装 `V26.5.29.19` 后仍报 `NODE_MODULE_VERSION 127/143` 不匹配。

**级别：** P0，影响桌面端启动。

**根因修正：**

- `V26.5.29.19` 的验证脚本 require 了 `better-sqlite3` 包目录/包入口。
- `better-sqlite3` 包入口返回构造函数，不会立即加载 `build\Release\better_sqlite3.node`。
- 实际启动时创建数据库实例才会加载 native addon，所以 `.19` 门禁是假通过。
- 直接加载真实安装目录的 `better_sqlite3.node` 可复现用户报错。

**已修复：**

- `prepare-native.cjs` 改为直接对 `node_modules\better-sqlite3` 执行 `node-gyp rebuild --runtime=electron --target=40.10.2`。
- Electron native 验证改为直接 require `better_sqlite3.node`，并创建 `:memory:` 数据库。
- 新增 `prepare-node-native.cjs`，打包后恢复 Node ABI 127，避免 Node 服务端回归失败。
- 版本升为 `V26.5.29.20`。

**验证：**

| 命令 | 结果 |
| --- | --- |
| `npm run test:regression` | 通过：server 14、web 8、desktop 4 |
| `npm run audit:security` | 通过：high=0；剩余 `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | 通过：打包中直接加载最终 `.node`，输出 `nativeAddonType=object`、`modules=143` |
| `node apps\desktop\scripts\run-regressions.cjs` | 通过 |

**当前状态：** 自动化已覆盖真实 native addon 加载；`V26.6.9.1` 作为上一稳定包保留，当前新验收版本改为 `V26.6.9.2`。

## 2026-06-09 追加：V26.6.9.1 全量历史统计与剩余风险收敛

**本轮用户边界：** 统计尽量代表全量直播历史；只修复风险问题，不破坏原业务采集行为。总事件 10 万先压测给结论，不默认提升正式原始事件保留上限。

**已修复/缓解：**

- 新增会话级累计统计表，事件入库成功后先累计，再执行原始事件保留窗口裁剪。
- `getStats()` 改用累计统计，评论、进场、互动、礼物、日志、唯一用户、礼物排行和神秘人汇总不再只依赖当前保留明细。
- Excel 导出增加“全量统计汇总”“全量礼物排行”“当前保留明细说明”，避免把明细 sheet 误认为全量历史。
- 启动配置增加 Zod 校验，`HOST` 仅允许本机地址，非法 `PORT` 在 listen 前失败。
- collector 页面 payload 进入业务前先经过 schema 归一化，降低异常 DOM 字段导致分类/入库异常的风险。
- 发布版本按用户规则更新为 `V26.6.9.1`，并增加日期版本门禁和中文可读性门禁。

**压测结论：**

| 事件数 | 保留明细行 | 总耗时 | RSS 增量 | Excel 大小 |
| --- | ---: | ---: | ---: | ---: |
| 10,000 | 10,000 | 1080 ms | 101.9 MB | 0.3 MB |
| 50,000 | 50,000 | 5767 ms | 290.5 MB | 1.3 MB |
| 100,000 | 48,000 | 8746 ms | 349.8 MB | 1.2 MB |

**发布产物：**

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.1-安装包.exe` |
| 大小 | 85,324,719 bytes |
| SHA256 | `5EF8F45912E2765B100D37B74B8DF367B8931F60D45D3E4F35D37E379F0557A3` |
| 回滚保留 | `糖三角-V26.5.29.20-安装包.exe` |
| release 清理 | 未发现 `win-unpacked`、`builder-debug.yml`、未版本化 `糖三角.exe` 残留 |

**剩余非 P0 风险：**

- `collector.ts` 仍保留文件级 `@ts-nocheck`，但关键输入边界已收敛到 `collector-payload.ts`。
- Excel 导出仍使用 `writeBuffer()`，当前因明细受保留窗口限制且 100k 压测通过，暂不阻断；若后续要求更低峰值，应改 streaming writer。
- `exceljs -> uuid` 仍有 2 个 moderate 审计项；不通过强制降级 ExcelJS 修复。
- `V26.6.9.2` 已完成一次安装后真实启动、真实直播间采集、停止和导出验证；后续发版仍按 SOP 复验。

## 2026-06-09 追加：P0 特别关注展示格式边界已确认并修复

**用户反馈：** 当前命中展示为：

```text
特别关注 备注名
[备注名 / 原昵称] 礼 礼物内容
```

用户指出该格式是后续改动产生，要求先登记为问题并按 P0 处理。

**级别：** P0。该展示直接影响运营人员识别重点用户，若备注和真实昵称展示口径不符合预期，可能造成误读、重复识别或现场响应错误。

**已调查到的历史口径：**

- `V26.5.14.1` 版本日志写明“恢复特别关注展示规则：标记区显示备注，消息正文显示真实昵称”。
- `V26.5.29.0` 按后续需求改为“特别关注命中正文显示备注名 / 原昵称”。
- `V26.5.29.8` 修复礼物行原昵称被礼物文本昵称覆盖的问题，稳定为 `[备注名 / 原昵称]`。

**用户最终确认边界：** 恢复历史正常展示：

```text
特别关注 备注名
[原昵称] 礼 礼物内容
```

**修复范围：**

- 只改前端展示口径，特别关注标记区继续显示备注名。
- 礼物和评论正文的用户名区只显示原昵称，不再拼接 `备注名 / 原昵称`。
- 不改采集、稳定 ID/link 匹配、入库、统计和 Excel 导出逻辑。

**当前状态：** 已修复并补充 `apps/web/scripts/regression-gift-remark-display.mjs` 回归。若后续再次要求在正文显示备注，必须重新确认产品边界。

**同步边界：** 用户同时确认每会话原始明细继续固定 50000 条；Excel 导出架构本轮不改；真实直播间 smoke 不增加为发版硬门禁；代码签名、CI/覆盖率、外部 API 支持本轮先不做。

## 2026-06-09 追加：V26.6.9.2 安装版真实 smoke 已执行

**验证范围：**

- 安装包：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe`
- SHA256：`01B6696502EEF5700C8AF24ACCF38D39B3974393C05CB467324A16C94162E92C`
- 覆盖安装：静默安装退出码 0，注册表显示 `糖三角 26.6.9-2`。
- 启动路径：`D:\糖三角\@douyin-live-suitedesktop\糖三角.exe`。
- 启动日志：`releaseTag=V26.6.9.2`、`appVersion=26.6.9-2`、`serverUrl=http://127.0.0.1:3100`，主界面 `rootChildCount=1`，未见白屏崩溃日志。
- 真实直播间：`https://live.douyin.com/962565925628`。
- 采集会话：`8O4oe_OrQC`，主播 `冻腰冻拐（三角洲行动）`。
- 停止后统计：评论 42、进场 18、互动 12、礼物 161、礼物件数 171、日志 3、唯一用户 220。
- 自动保存：`C:\Users\85855\Desktop\糖三角-20260609-153806-冻腰冻拐（三角洲行动）-8O4oe_OrQC.xlsx`。
- Excel 验证：ExcelJS 可读取，包含 `全量统计汇总`、`全量礼物排行`、`当前保留明细说明`、`评论`、`进场`、`互动`、`礼物`、`日志`。

**风险状态：** 安装后启动、真实采集、停止、导出这条链路已完成一次 smoke，当前不再作为未执行缺口。特别关注真实命中因用户无法提供可命中的真实用户 ID，未向真实会话注入假事件，继续由 mock 回归覆盖；后续如果提供真实 ID/备注，再补现场截图。

## 2026-06-09 追加：V26.6.9.3 评论重复与礼物顺序风险已缓解

**用户反馈：**

- 评论区出现重复情况。
- 礼物区中显示的消息顺序乱，属于新 bug。

**级别：** P0。评论重复会导致运营误判直播间互动量、重复响应同一用户；礼物顺序错乱会影响礼物流水观察、重点用户识别和现场节奏判断。

**根因：**

- 带 `sourceId` 的评论在唯一键中混入 `createdAt/collectorSeq`，同一 DOM 评论被再次扫描时会因为时间和批次变化生成不同 `uniqueKey`。
- 礼物身份补齐和同时间戳排序缺少稳定接收顺序兜底，前端合并替换时存在覆盖原始排序字段的风险。

**修复：**

- 同源评论唯一键改为基于稳定来源字段；无 `sourceId` 的评论继续保留采集序号区分，避免误删真实重复评论。
- 采集 payload 增加 `ingestSeq`；前端排序在 `id` 不足时使用 `payload.ingestSeq`；礼物身份补齐只替换身份字段，不覆盖原始 `id/createdAt/ingestSeq`。
- 版本升为 `V26.6.9.3`，安装包 SHA256 为 `46209A29BAB8127250F719CBD256B10C302980047EB672106447638B2970D8CD`。

**验证证据：**

| 验证项 | 结果 |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs` | PASS |
| `node apps/web/scripts/regression-gift-display-order.mjs` | PASS |
| `npm run test:regression` | PASS：server 18、web 9、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS |
| 真实直播间 smoke | `https://live.douyin.com/127874409138` 会话 `ehGrIJDv6x`，采集评论 13、礼物 5 |
| 评论重复检查 | `DUP_UNIQUE_KEY=0`，`sourceId/userId/message` 重复组为 0 |
| 礼物顺序检查 | 真实礼物 `id/createdAt/ingestSeq` 顺序一致 |
| 导出接口 | 生成 Excel 25,770 bytes |

**当前状态：** P0 已缓解。仍建议用户用 `V26.6.9.3` 在更长时间、更高峰直播间继续观察；若复现，需要记录会话 ID、复现时间点、评论/礼物文本和诊断信息。
## 2026-06-10 Additional P0 Capture Integrity Review

### P0: Gift name compact-prefix loss

Status: Mitigated.

Root cause:
- Gift cleanup treated the single Chinese action word `送` as removable even when it was part of the gift name.
- Example: `用户A 送你花花 x1` could be normalized to gift name `你花花`.

Fix:
- Standalone `送` is only treated as an action when separated as `送 `.
- Compact gift names such as `送你花花` are preserved.
- The same rule is applied in service fallback parsing and browser collector parsing.

Evidence:
- `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` -> PASS.
- `npm run test:regression` -> PASS: server 20, web 10, desktop 6.

### P0: Rich comment body truncation or overlap

Status: Partially mitigated with automated coverage; real DOM still requires field confirmation if it reproduces.

Root cause found in code path:
- The collector can receive overlapping parent/child visible text for rich comments.
- A short mention-tail node and a full-body node can be concatenated into a duplicated or shortened visible body.

Fix:
- Added rich-comment overlap folding before final comment body output.
- Added regression coverage for mention + short-tail + full body and short-first + full-body aria label cases.

Evidence:
- `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` -> PASS.
- `npm run test:regression` -> PASS.

Residual risk:
- The exact live-room screenshot DOM is not available in this workspace. If the user sees another incomplete comment, collect session ID, timestamp, screenshot, visible live-room text, and copied diagnostics.

### P0: Highlight user missed when identity is only in payload

Status: Mitigated.

Root cause:
- Frontend highlight matching considered top-level `item.userLink` and `payload.userId`, but not raw `payload.userLink`.
- Some comment/gift rows can carry the stable profile link only in `payloadJson`.

Fix:
- Added `payload.userLink` to frontend highlight identity candidates.
- Matching still uses stable ID/link only; nickname fallback remains disabled.

Evidence:
- `node apps/web/scripts/regression-highlight-payload-identity.mjs` -> PASS.
- `npm run test:regression` -> PASS.

Release note:
- `V26.6.10.1` installer was built after this pass. Packaging used the user date-version rule and produced `apps/desktop/release/糖三角-V26.6.10.1-安装包.exe`.

## 2026-06-10 Additional Release Evidence for V26.6.10.1

### Status

- P0 gift compact-prefix loss: mitigated by parser boundary and regression.
- P0 rich comment incomplete body: mitigated for known overlapped rich DOM shapes; exact user screenshot DOM still requires field confirmation if reproduced.
- P0 highlight user payload-only identity miss: mitigated by adding `payload.userLink` to stable identity candidates.

### Verification

| Check | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS: server 20, web 10, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

### Release Artifact

| Item | Value |
| --- | --- |
| Version | `V26.6.10.1` / `26.6.10-1` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.1-安装包.exe` |
| Size | `85,327,097` bytes |
| SHA256 | `77CBA10028BFAD590ABEF3EA93769BC65983EF3BE60BAA622F1B17C98515EE84` |

### Remaining Risks

- Real live-room DOM for the reported incomplete rich comment was not available in the repository. If truncation reproduces, collect session ID, timestamp, screenshot, exact visible live-room text, and copied diagnostics before changing parser rules again.
- Existing non-P0 risks remain unchanged: `@ts-nocheck` in the collector, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.

## 2026-06-10 Additional Release Evidence for V26.6.10.2

### Status

- V26.6.10.2 supersedes V26.6.10.1 for the 2026-06-10 P0 capture-integrity fix.
- Additional rich-comment root cause was covered: full text may exist on row/container `aria-label/title` while visible child text is only `@XX欢迎`.
- Gift compact-prefix and payload-only highlight fixes remain unchanged.

### Verification

| Check | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-action-and-rich-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-body-noise.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-loss.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS: server 20, web 10, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

### Release Artifact

| Item | Value |
| --- | --- |
| Version | `V26.6.10.2` / `26.6.10-2` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.2-安装包.exe` |
| Size | `85,325,946` bytes |
| SHA256 | `50AE8AF70AF1CDED74AA530DD5E67C1F7BEC8B7D2FBD9E389F353FD4B585660A` |

### Remaining Risks

- The exact screenshot DOM still has not been captured from the live room, so final field acceptance remains the user's decision.
- Existing non-P0 risks remain unchanged: `@ts-nocheck` in the collector, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.

## 2026-06-11 Additional P0 Comment/Gift Remark Closure

### P0: Comment loss or duplicate ambiguity

**Status:** Mitigated.

**Risk before fix:** high-volume rooms could make it unclear whether a missing comment was dropped in collector parsing, backend dedupe, DB insert, SSE delivery, or frontend display. Without a shared ledger, diagnosis depended on screenshots and manual comparison.

**Mitigation:**

- Added capture integrity ledger counters for comment raw input, filter, dedupe, DB insert, DB unique ignore, and bus publish.
- Preserved the existing unique-key boundary: stable `sourceId` rescans collapse to one event; no-source consecutive same comments remain distinguishable through sequence fields.
- Added `/api/diagnostics/capture-integrity` and expanded copy diagnostics so support can compare visible comments against persisted DB rows and ledger counters.
- Added runtime regression `apps/server/scripts/regression-capture-integrity-runtime.mjs` to verify two same-user same-text comments with different source IDs both persist, while same-source gift identity updates do not create duplicate rows.

### P0: Gift remark loss for highlight users

**Status:** Mitigated.

**Risk before fix:** gift rows could initially arrive without stable identity, then receive `userId/userLink` later. If the update was not visible in diagnostics or not republished, the frontend could fail to recompute highlight remarks, making special-follow gifts look like ordinary gifts.

**Mitigation:**

- Highlight matching remains stable-identity only: top-level `userId/userLink`, payload `userId/userLink`, and sec_uid extracted from profile links; no nickname fallback.
- Later gift identity updates update DB identity fields and payload, then republish the same gift row for frontend remark recomputation.
- Diagnostics now record gift highlight match details: `category`, `uniqueKey`, `remark`, `matchedBy`, `matchedValue`.
- Frontend copy diagnostics include persisted gifts, recent visible gifts, capture integrity ledger, and visible/persisted highlight match details.
- Display boundary is unchanged: marker shows `特别关注 备注名`; gift body keeps `[原昵称] 礼 礼物内容`.

### 2026-06-11 Verification

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-ledger.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-capture-integrity-runtime.mjs` | PASS |
| `node apps/web/scripts/regression-copy-diagnostics-gift-remarks.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS: server 22, web 11, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |

**Remaining non-P0 risks unchanged:** `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support, and real-room long-duration smoke still requiring user final acceptance.

## 2026-06-11 Strong Mock Retest for Comment/Gift Remark Closure

### Status

- P0 comment duplicate/loss and gift remark loss now have stronger mock gates beyond static source checks.
- No business behavior was changed in this pass; the change is test/documentation hardening only.
- No new installer was produced; current manual test package remains `V26.6.11.1`.

### Additional Mitigation Evidence

| Risk | Added Gate | Result |
| --- | --- | --- |
| Same DOM comment rescan creates duplicate rows | `regression-capture-integrity-strong-mock.mjs` | PASS: same `sourceId` rescan is deduped once |
| Real repeated comments are accidentally dropped | `regression-capture-integrity-strong-mock.mjs` | PASS: same-user same-text and different-user same-text comments persist |
| Gift identity arrives late and remark is not recalculated | `regression-capture-integrity-strong-mock.mjs`, `regression-gift-identity-update-remark-mock.mjs` | PASS: DB/payload update, SSE republish, frontend row replacement, and remark recomputation are covered |
| Highlight identity only exists in payload | `regression-capture-integrity-strong-mock.mjs` | PASS: payload-only comment/gift identity can match highlight users |

### Latest Verification

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-strong-mock.mjs` | PASS |
| `node apps/web/scripts/regression-gift-identity-update-remark-mock.mjs` | PASS |
| `npm run test:server` | PASS: server 23 scripts |
| `npm run test:web` | PASS: web 12 scripts |
| `npm run test:regression` | PASS: server 23, web 12, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |

### Residual Risk

- Real Douyin DOM changes can still expose parser shapes that mocks do not know yet. Treat real-room testing as smoke and discovery, not the only proof.
- If the user reproduces comment loss or gift remark loss, collect session ID, timestamp, screenshot, copied diagnostics, visible live-room text, gift row, and highlight config line before changing logic again.
