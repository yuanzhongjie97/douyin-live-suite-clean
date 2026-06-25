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

## 2026-06-11 V26.6.11.2 Real-Room Message Loss Risk Closure

### Status

- P0 message-loss risks identified in this pass are mitigated and packaged as `V26.6.11.2`.
- This does not change the user-confirmed product boundary: each session still retains 50,000 raw detail events, and UI still shows only the recent window.

### Newly Mitigated P0 Risks

| Risk | Previous trigger | Mitigation |
| --- | --- | --- |
| Collector batch send failure drops pending messages | `__douyinCollectorBatch` throws or the Node binding is briefly unavailable | Failed batches are requeued; pending is capped at the 50,000 session boundary instead of being cleared |
| No-source comment retry creates duplicate rows | A retry of the same no-source comment receives a new collector sequence | Collector payload now carries `collectorClientId`; `buildUniqueKey` uses it as a stable retry key |
| Douyin reuses a chat DOM row by changing text | MutationObserver did not listen to `characterData`; fallback scan could miss intermediate text | Chat observer now listens to text-node changes; fallback scan checks latest 80 rows every 250ms |
| Server SSE drops queued events before client write | Pending SSE events over 400 were trimmed | SSE pending trim removed; backpressure remains observable through `sse.write_false` |
| Frontend drops comments before display flush | Comment incoming queue was `EVENT_LIMITS.comment * 6` | Comment queue and window-move deferred buffers now preserve the 50,000 event session boundary before recent-window display trim |
| Dev preview points to the wrong local project | Vite proxy hardcoded `localhost:3100`, while 3100 may be occupied | Vite proxy now follows `process.env.PORT` |

### Verification

| Check | Result |
| --- | --- |
| `npm run test:regression` | PASS: server 24, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| Real-room smoke | PASS: 90s on `https://live.douyin.com/127874409138`; raw comments 3, persisted comments 1, deduped 2 same-source DOM rescans |
| `npm run desktop:pack:fast` | PASS; installer `糖三角-V26.6.11.2-安装包.exe`, SHA256 `1369BD4C4A56C7E12B001C9CEDC94C5BFD9ACF26CC8615B7158C34F39E06B2A4` |

### Remaining Risks

- Very long high-traffic real-room observation is still a smoke/discovery activity, not a hard automated gate.
- Existing non-P0 risks remain: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.
- If a distinct visible comment is still missing, the required evidence is: session ID, timestamp, screenshot, exact visible text, copied diagnostics, and whether the row appears in `/api/diagnostics/events`.

## 2026-06-11 V26.6.11.3 Stale React Payload Risk Closure

### Status

- Additional P0 message-loss/remark-loss risk is mitigated and packaged as `V26.6.11.3`.
- The product boundary is unchanged: 50,000 raw detail events per session, recent UI window only, no full-history UI, no nickname fallback for special-follow matching.

### Newly Mitigated P0 Risk

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Stale React payload reused across recycled chat rows | Douyin virtual list reuses the same DOM row while React props from the previous message remain cached by element | A new visible comment/gift can inherit old `sourceId/userId/userLink`, causing false dedupe or missing special-follow remark | React payload cache now requires current row fingerprint match and a 120ms TTL; changed rows reread React props |
| Same sourceId row reuse could be interpreted as duplicate | A row-like source id repeats but visible user/text changes | Distinct real comments could be collapsed | `regression-comment-sourceid-row-reuse.mjs` verifies same `sourceId` with different user/text persists as separate comments |

### Verification

| Check | Result |
| --- | --- |
| `npm run test:regression` | PASS: server 26, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| Real-room smoke | PASS: 180s on `https://live.douyin.com/127874409138`; raw comments 27, persisted comments 9, deduped 18 same-source rescans; all duplicate sourceId groups `variantCount=1` |
| `npm run desktop:pack:fast` | PASS; installer `糖三角-V26.6.11.3-安装包.exe`, SHA256 `D76B5A9D02C5F38BE3FDB6720CAC20D686AE246809FCBBFC748E33B31B5AB56B` |

### Remaining Risks

- Very long high-traffic real-room observation remains a smoke/discovery activity.
- Existing non-P0 risks remain unchanged: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.
- If the user still observes a missing visible comment or gift remark, preserve session ID, timestamp, screenshot, copied diagnostics, exact visible text/gift row, and highlight config before changing logic again.

## 2026-06-11 V26.6.11.4 Smoke Observer and Stop-Race Risk Closure

### Status

- Additional P0 validation/stability risks are mitigated and packaged as `V26.6.11.4`.
- Product boundaries are unchanged: recent UI window only, 50,000 raw detail events per session, no full-history UI, no code signing, no CI gate.

### Newly Mitigated Risks

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Real-room smoke observer reports false unmatched comments | Broad DOM selectors read the entire chat container text, producing concatenated pseudo-comments | Smoke evidence becomes noisy and can hide the true cause | Observer now samples leaf message rows only and rejects text with multiple username/body separators |
| Stop/heartbeat race crashes collector smoke | Stop closes the page/context while heartbeat is inside `installObserver()` | Smoke exits with `Target page, context or browser has been closed`, weakening validation and risking runtime fatal noise | Heartbeat exits while stopping/not running and closed-target errors during normal stop are tolerated |

### Verification

| Check | Result |
| --- | --- |
| `npm run test:regression` | PASS: server 28, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| Real-room smoke | PASS: 180s on `https://live.douyin.com/127874409138`; raw comments 39, persisted comments 13, deduped 26, `suspiciousRawCommentGroups=[]`, visible observer `unmatchedCount=0` |
| `npm run desktop:pack:fast` | PASS; installer `糖三角-V26.6.11.4-安装包.exe`, SHA256 `9AD1EFEB9C8ACC9B616268860382A273232E791D6C71500619F5DDA9C80B89C6` |

### Remaining Risks

- Real-room smoke remains a sampled validation method; the user's long-running installed-app acceptance is still the final release decision.
- Existing non-P0 risks remain unchanged: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.

## 2026-06-11 V26.6.11.5 UI Backfill Window Risk Closure

### Status

- A P0 user-visible message-loss risk was identified in the web UI history backfill path and fixed.
- Collector/DB/SSE evidence from the enhanced real-room smoke did not show distinct visible comments being dropped in the sampled run.

### Newly Mitigated Risks

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Latest comments disappear after history backfill | `/api/events` returns newest-first rows, while `normalizeDisplayItems()` sliced the array tail before sorting | When more than 600 comment rows are backfilled, the UI can keep older comments and omit newer visible comments | Sort all candidate rows by event order first, then apply the recent display window |
| Real smoke misses short-lived visible rows | Node-side 1s polling can miss DOM rows that appear and disappear between polls | Smoke may falsely conclude collector is complete | Add in-page `MutationObserver + 250ms scan` probe and report `pageProbe.unmatchedCount` |

### Verification

| Check | Result |
| --- | --- |
| `node apps/web/scripts/regression-comment-history-desc-order.mjs` | PASS |
| Frontend comment regressions | PASS: display loss, history backfill, stream queue no comment loss |
| Real-room smoke with page probe | PASS: 5 minutes on `https://live.douyin.com/127874409138`; raw comments 126, persisted comments 42, deduped 84, `suspiciousRawCommentGroups=[]`, `visibleCommentObserver.unmatchedCount=0`, `pageProbe.unmatchedCount=0` |
| `npm run test:regression` | PASS: server 28, web 15, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| `npm run desktop:pack:fast` | PASS; installer `糖三角-V26.6.11.5-安装包.exe`, SHA256 `A8746750CCE8FF323EDE15A4DD8C0801BD84091E3925AAE87C9943F04C1B3118` |

### Remaining Risks

- UI still intentionally shows only the latest 200 comments; database, export, statistics and diagnostics remain the authoritative full retained detail path.
- Final installed-app acceptance remains with the user, especially during a busier room period where comments exceed the recent UI window quickly.

## 2026-06-11 V26.6.11.6 Visible Leaf Comment Capture Risk Closure

### Status

- A P0 collector-side message-loss risk was reproduced with the real room and mitigated.
- Product boundaries are unchanged: 50,000 raw detail events per session, UI recent window only, no full-history UI, no nickname fallback for special-follow matching.

### Newly Mitigated Risk

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Visible leaf comment outside the primary chat root is missed | Douyin renders or moves a real visible comment row outside the selected chat root while another chat root still exists | The comment is visible to the user but absent from raw collector events, DB, SSE and export | Collector now runs a narrow full-page visible-leaf fallback scan every 250ms and on install; it scans only leaf-level message candidates and rejects parent containers with nested visible leaves |

### Evidence

| Check | Result |
| --- | --- |
| Failed real-room smoke before fix | 5m on `https://live.douyin.com/127874409138` found visible unmatched comments, including `中古表时间廊：@天真恋 我的发言和婷哥的分一样的，一惊一乍` |
| `node --import tsx apps/server/scripts/regression-comment-visible-leaf-fallback.mjs` | RED before fix, PASS after fix |
| `node apps/web/scripts/regression-comment-history-desc-order-ui.mjs` | PASS: actual React UI keeps newest 200 comments from 1000 DESC API rows |
| `npm run test:regression` | PASS: server 29, web 16, desktop 6 |
| 90s real-room smoke after fix | PASS: raw comments 42, persisted comments 14, deduped 28, `suspiciousRawCommentGroups=[]`, `visibleCommentObserver.unmatchedCount=0`, `pageProbe.unmatchedCount=0` |

### Remaining Risks

- The fallback scan increases diagnostic noise counters such as `collector.digest.empty_text` because it deliberately samples more visible candidates; this is acceptable while no伪评论 enters DB.
- Real-room smoke remains sampled validation. Long-running installed-app acceptance is still needed for a busy room period.
- Existing non-P0 risks remain unchanged: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.
## 2026-06-12 Split Comment and Rich Mention Risk Closure

### Status

- Two additional P0 source-level message-loss risks found in the real room are mitigated.
- This entry records source and test closure only. It is not a packaged release record.
- Product boundaries are unchanged: 50,000 raw detail events per session, UI recent window only, no full-history UI, no nickname fallback for special-follow matching.

### Newly Mitigated Risks

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Split visible comment loses body | Douyin renders `用户名：` as one visible leaf and renders the body in the parent or next sibling | The user can see the comment body, but the collector may persist only an empty username/colon row or skip the real body | Collector now resolves split visible comment text from parent/next sibling before classification |
| Rich mention comment is truncated | A row contains `@mention + text + emoji`, while an inner content node contains only the shorter plain body | DB/export/diagnostics miss the leading mention and trailing emoji markers, causing visible-message smoke mismatches | Body candidate selection preserves full rich text when it contains the shorter candidate and rich markers |
| Repeated emoji body is over-collapsed | A real comment body consists of repeated bracket emoji markers such as `[比心] [比心] [比心]` | The persisted comment loses one or more emoji markers | Rich-prefix collapse now skips all-repeated marker bodies |

### Evidence

| Check | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-sibling-body-fallback.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-message-probe.mjs` | PASS |
| `npm run test:regression` | PASS: server 31, web 16, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| 180s real-room smoke | PASS: raw comments 21, persisted comments 7, deduped 14, all visible/page comment and message unmatched counts are 0 |

### Remaining Risks

- Long-running installed-app acceptance is still needed after the next package is produced.
- Real-room smoke remains sampled validation and may expose new Douyin DOM variants later.
- Existing non-P0 risks remain unchanged: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.

## 2026-06-12 Stop Boundary Pending Drain Risk Closure

### Status

- A P0 stop-boundary message-loss risk is mitigated at source level.
- This entry records source and test closure only. It is not a packaged release record.
- Product boundaries are unchanged: 50,000 raw detail events per session, UI recent window only, no full-history UI, no nickname fallback for special-follow matching.

### Newly Mitigated Risks

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Pending browser events are discarded on stop | A live message is observed shortly before manual stop, auto-stop, or smoke timeout; delayed flush has not run yet | The message can be visible in the browser but absent from raw collector events, DB, SSE and export | Stop cleanup now runs one final scan and `await flush()` before disconnecting observers, clearing timers and emptying pending state |
| Real smoke misclassifies entry as gift | A username contains `x5` or similar text and the row says `来了` | Diagnostics report a false unmatched gift, hiding the real category | Smoke classifier now evaluates entry before gift and requires gift `xN` to be an isolated token |

### Evidence

| Check | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-collector-stop-drains-pending.mjs` | RED before fix, PASS after fix |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-message-probe.mjs` | PASS |
| `npm run test:server` | PASS: 32 scripts |
| `npm run test:regression` | PASS: server 32, web 16, desktop 6 |
| `npm run audit:security` | PASS: high=0; existing `exceljs -> uuid` moderate remains |
| 300s real-room smoke | PASS: raw events 268, raw comments 90, persisted comments 18, entries 126, all visible/page comment and message unmatched counts are 0 |
| 600s real-room smoke | PASS: raw events 600, raw comments 205, persisted comments 51, entries 241, interactions 10, all visible/page comment and message unmatched counts are 0, `unmatchedVisibleMessages=[]`, `suspiciousRawCommentGroups=[]` |

### Remaining Risks

- The current evidence covers sampled real-room traffic and mock stop-boundary behavior; user installed-app acceptance remains required after packaging.
- Real-room smoke can still reveal new Douyin DOM variants later.
- Existing non-P0 risks remain unchanged: `collector.ts @ts-nocheck`, large-file coupling, export buffer memory profile, no code signing, no CI/coverage gate, no external API support.

## 2026-06-16 Boundary Review: Comment Loss and Gift Remark Loss

### Confirmed Product Boundary

- Comment loss is judged at the DB, statistics, export, and diagnostics layers. The UI recent window is not full history.
- Gift remark loss is judged by stable identity matching. A gift must hit special-follow remarks when `userId`, `userLink`, payload identity, or sec_uid from a profile URL is available.
- Nickname fallback remains out of scope because it can match the wrong person in busy rooms.
- Screenshots alone are not enough for future recurrence triage; copied diagnostics are required to identify the broken layer.

### Risk Code Paths That Can Affect Recurrence

| Area | Code path | Possible trigger | Failure if regressed |
| --- | --- | --- | --- |
| Collector DOM parsing | `apps/server/src/collector.ts` visible scan, React payload cache, gift bridge, pending flush | Douyin changes DOM shape, reuses rows, delays payload identity, or stop happens before flush | Visible comments/gifts never reach raw collector events |
| Server filtering and dedupe | `apps/server/src/capture-service.ts` `persistCollectorEvents`, recent duplicate maps, gift identity updates | Same text appears quickly, source identity changes, gift identity arrives later | Real comments are filtered/deduped, or gift remark update is not republished |
| Unique key generation | `apps/server/src/utils.ts` `buildUniqueKey` | Same source rescans or no-source repeated comments | Duplicate rows appear, or real repeated comments collapse into one |
| DB/API/export | `apps/server/src/db.ts`, `apps/server/src/exporter.ts` | Query limit confusion or export source mismatch | DB/export evidence diverges from UI or stats |
| SSE and frontend queues | `apps/server/src/index.ts`, `apps/web/src/App.tsx` EventSource, incoming queues, display limits | Slow UI, window move, queue backlog, stream reconnect | DB has data but UI recent window or diagnostics look incomplete |
| Special-follow matching | `apps/server/src/capture-service.ts`, `apps/web/src/App.tsx` highlight matching | Identity only exists in payload or arrives after first gift row | Gift row appears without remark despite stable identity |

### Current Risk Status

- No runtime source code changed in this review; this is a boundary and impact-surface update.
- Existing P0 mitigations remain valid, but recurrence must be diagnosed by layer before another fix is attempted.
- Remaining structural risks are still P1/P2 unless evidence shows DB/export loss or stable-identity remark miss: collector `@ts-nocheck`, large collector file, export buffer memory profile, no code signing, no CI/coverage hard gate, no external API support.

## 2026-06-16 UI Full-History Query Risk Closure

### Status

- The previous product boundary "recent UI window only, no full-history UI" is superseded for comments and gifts.
- The main realtime panels remain bounded for performance: comments 200 and gifts 120.
- A separate DB-backed history query now covers retained comments and gifts in the UI, so manual review no longer depends only on Excel.

### Mitigated Risk

| Risk | Trigger | Impact | Mitigation |
| --- | --- | --- | --- |
| Operator cannot inspect old retained comments/gifts in UI | A busy room exceeds the realtime 200/120 display windows | User may believe comments or gift remarks are lost even though DB/export retained them | Added `/api/events/history` keyset pagination and a `历史查询` UI panel for comments/gifts |
| Full history UI causes main panel lag | Attempting to load all rows into realtime arrays | Main capture window becomes slow or unstable | History query is separate from realtime `events.comment/events.gift`; each page is capped at 200 |
| Search or category switch shows stale rows | Slow request returns after the user switches comment/gift or keyword | UI can display wrong evidence during triage | History panel ignores stale responses by request sequence |

### Remaining Boundary

- History query can only show events still retained in SQLite under the current 50,000 raw-detail limit.
- It does not change collector parsing, dedupe, SSE, statistics, Excel export, special-follow matching, or nickname-fallback policy.
- Long-duration real-room acceptance still requires user拍板 after packaging.

## 2026-06-18 P0 Recurrence Risk Update

### Comment appears lost in the UI

Current status: mitigated by stronger UI traceability.

- Main realtime comment panel remains capped at 200 rows for performance.
- DB-backed history query is the formal retained-history UI path.
- Frontend diagnostics now record `displayedInMainWindow`, `mainWindowTrimmed`, and `historyQueryable`.
- If a comment exists in DB/history but is not visible in the main panel because of the 200-row window, the issue is classified as display-window trimming, not data loss.

Remaining risk: real Douyin DOM changes can still cause collector-side misses. If reproduced, triage must include screenshot, session ID, time point, copied diagnostics, and the visible comment/gift text.

### Gift special-follow remark disappears

Current status: mitigated for stable-identity and clean identity-cache scenarios.

- Matching still uses stable identity only: top-level `userId/userLink`, payload `userId/userLink`, or extracted sec_uid.
- Gifts without direct identity can backfill identity from the same-session/same-room clean identity cache built by earlier comment/entry/interaction events.
- Highlight diagnostics now expose `source: identity_cache_backfill` for cache-backed gift remarks.
- If one display name maps to multiple stable identities, the gift does not backfill and diagnostics record `gift.identity_conflict`.

Remaining risk: a gift with no direct identity and no prior clean identity cache remains `pending_identity`; pure nickname fallback is intentionally disabled to avoid mislabeling same-name users.

### Updated residual risks

- `apps/server/src/collector.ts` still has broad responsibilities and `@ts-nocheck`; collector DOM changes remain the highest long-term source of real-room regressions.
- Main UI is not a full-history renderer by design; full retained history must be checked through the history query panel and export.
- Any release that touches collector, event dedupe, SSE, history query, or highlight matching must run the P0 mock gates before packaging.

## 2026-06-23 P0 Recurrence Risk Closure Update

### Newly mitigated P0 risks

| Risk | Trigger | Impact if unfixed | Mitigation |
| --- | --- | --- | --- |
| DOM row mutation lacks traceability | Douyin reuses or mutates a visible chat row while collector scans it more than once | Hard to tell whether a comment was never scanned, scanned then filtered, or scanned as duplicate | Collector now attaches `collectorTraceId`, `collectorObservedAt`, `collectorSource`, and `domRevision`; mutation observers mark row revision before digest |
| Diagnostic fields create duplicate comments | Trace/time/revision fields change on every scan | Same visible comment can become multiple business fingerprints | Trace fields are explicitly excluded from `makeElementFingerprint()` and business unique-key generation |
| Gift appears before stable identity | Gift payload lacks `userId/userLink`, then the same user later appears in comment/entry/interaction with stable identity | Gift row remains without special-follow remark even though identity becomes knowable later | Server backfills pending gift rows from clean same-session/same-room identity cache and republishes the same `uniqueKey` |
| Gift and identity are in the same collector batch | A gift is parsed before a later comment/entry in the same batch establishes stable identity | DB history backfill cannot see the not-yet-inserted gift, so the first visible gift row can still miss its remark | Server now backfills eligible in-memory gift rows before DB insert, then keeps the same `uniqueKey` for UI replacement |

### Boundaries unchanged

- Main realtime windows remain comments 200 and gifts 120.
- Raw detail retention remains 50,000 events per session.
- Special-follow matching still does not use pure nickname fallback.
- Real-room smoke remains acceptance evidence, not an automated release hard gate.

### Remaining non-P0 risks

- `apps/server/src/collector.ts` remains a large `@ts-nocheck` file; future DOM variants may still require targeted regressions.
- No code signing, no CI coverage hard gate, no external API support by current user decision.
- Gift rows with no direct identity and no prior or later clean identity cache remain `pending_identity` by design.

## 2026-06-24 P0 Dynamic Chat Root Risk Closure

### Newly mitigated P0 risk

| Risk | Trigger | Impact if unfixed | Mitigation |
| --- | --- | --- | --- |
| Late chat root short-lived comments are missed | Douyin creates a new chat root after collector installation and removes comment rows before the 250ms fallback scan | A visible comment can fail to enter raw collector events, DB, history query, Excel, and diagnostics | `document.body` now observes subtree mutations, detects added chat roots, immediately attaches chat observers, and scans the new root once |

### Verification

| Check | Result |
| --- | --- |
| `regression-collector-late-chat-root-observer.mjs` | RED before fix, PASS after fix |
| `regression-collector-loss-resilience.mjs` | PASS; static gate now protects dynamic chat-root observer behavior |
| `npm run test:regression` | PASS: server 36, web 17, desktop 6 |
| `npm run audit:security` | PASS for high gate |
| `npm run desktop:pack:fast` | PASS: `糖三角-V26.6.24.1-安装包.exe` |

### Remaining risk

- This closes one concrete collector-side漏采窗口. It does not prove every future Douyin DOM variant is covered.
- The highest remaining long-term risk is still collector complexity: `apps/server/src/collector.ts` is large and `@ts-nocheck`.
- User final acceptance remains required for installed-app real-room behavior.

## 2026-06-24 P0 Gift Backfill Speed Risk Closure

### Newly mitigated P0 risk

| Risk | Trigger | Impact if unfixed | Mitigation |
| --- | --- | --- | --- |
| Gift identity-later backfill scans DB too often | A large live room emits many clean stable identities while the session has many gift rows | Server persist queue can spend tens of ms per identity scanning historical gift rows, delaying DB insert, SSE publish, and collector flush acknowledgement | Backfill now keeps a session/room/name pending-gift index and skips historical DB candidate scans unless a matching pending gift exists |

### Verification

| Check | Result |
| --- | --- |
| `regression-gift-backfill-skip-unneeded-db-scan.mjs` | RED before fix with 80 unnecessary DB scans, PASS after fix |
| `regression-gift-pending-identity-backfill.mjs` | PASS; gift-first identity-later behavior preserved |
| `npm run test:regression` | PASS: server 37, web 17, desktop 6 |
| `npm run audit:security` | PASS for high gate |

### Remaining risk

- This closes the identified server-side scan pressure. It does not by itself prove every real Douyin DOM comment-loss variant is closed.
- Pending gift state is in-memory and scoped to the running capture session; app restart intentionally does not perform broad historical repair scans during normal live capture.
- The highest long-term risk remains collector DOM complexity and real-room variants.

## 2026-06-25 P0 Non-Live Noise, Latency, and Short-ID Remark Risk Closure

### Newly mitigated P0 risks

| Risk | Trigger | Impact if unfixed | Mitigation |
| --- | --- | --- | --- |
| Private/customer-service/notification rows enter comments | Douyin side panels or hidden non-live panels exist in the page DOM | Comment area, DB, statistics, and Excel contain non-live messages such as customer-service prompts or private-message history | Collector now rejects nodes inside non-live panels unless they are inside a live chat root; diagnostics record `digest.non_live_panel_noise` |
| Profile ID is displayed as username | A row has `MS4w.../sec_uid` but no real nickname | UI shows a confusing long ID instead of a neutral missing-name state | Web display-name fallback now filters direct profile IDs and returns `未知用户` |
| Comment latency cannot be localized | User sees delayed comments but diagnostics only show frontend SSE/display time | Slow collector scan, flush, server persist, DB insert, or SSE publish cannot be separated | Payload and diagnostics now include collector observed/flushed, server received, DB inserted, and bus published timestamps |
| Short numeric special-follow config is assumed equivalent to `sec_uid` | User config uses a Douyin short ID while event only has `MS4w/sec_uid` | Gift remark appears lost or, worse, could be incorrectly matched by nickname if forced | Highlight config diagnostics classify `short_id`; short IDs match only explicit `displayId/shortId/uniqueId` fields, and misses record `short_id_not_resolved_to_event_identity` |

### Verification

| Check | Result |
| --- | --- |
| `regression-comment-non-live-panel-noise.mjs` | PASS; private/customer-service/notification rows are dropped while live comments remain |
| `regression-comment-latency-diagnostics.mjs` | PASS; latency segments are recorded and mock P95 target stays under 1 second |
| `regression-highlight-short-id-diagnostics.mjs` | PASS; short ID config, hit, and miss diagnostics are exposed |
| `regression-gift-message-bridge-short-identity.mjs` | PASS; gift message bridge preserves `displayId/shortId/uniqueId` |
| `regression-unknown-user-and-highlight-diagnostics.mjs` | PASS; frontend does not display raw profile IDs as usernames and copy diagnostics include highlight config/misses |
| `npm run test:regression` | PASS: server 41, web 18, desktop 6 |
| `npm run audit:security` | PASS for high gate; remaining low/moderate only |
| `npm run desktop:pack:fast` | PASS: `糖三角-V26.6.25.1-安装包.exe` |

### Remaining risk

- This closes the specific diagnostic report where non-live side-panel content was collected as comments. Future Douyin DOM variants still require screenshot, session ID, time point, copied diagnostics, and history/export comparison.
- Short numeric Douyin ID remains a conditional match: if Douyin does not expose `displayId/shortId/uniqueId` in the event and no binding exists, the remark will not display by design.
- Collector complexity and `@ts-nocheck` remain P1 structural risks.
