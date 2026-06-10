# AI Coding 项目闭环案例：糖三角直播采集工具

生成日期：2026-06-10  
项目仓库：`douyin-live-suite-clean`  
当前源码版本：`V26.6.10.2` / `26.6.10-2`  
项目定位：Windows 桌面端抖音直播间数据采集、实时监控与 Excel 复盘工具

## 1. 项目概述

糖三角直播采集工具是一款面向直播运营、场控和数据复盘人员的 Windows 桌面应用。软件通过 Electron 承载 React 控制台，通过本地 Fastify 服务控制 Playwright Chromium 登录和采集抖音直播间公开可见互动数据，并将评论、进场、互动、礼物、特别关注命中、神秘人识别和统计结果持久化到 SQLite，最终支持 Excel 导出和采集结束自动保存。

本项目的特点不是单点功能开发，而是围绕真实业务反馈建立了一套 AI Coding 驱动的闭环：需求文档、风险评估、编码实现、自动化测试、真实验收、用户边界拍板、文档同步和发布记录持续联动。

## 2. 技术栈

| 层级 | 技术栈 | 作用 |
| --- | --- | --- |
| 桌面端 | Electron、electron-builder、NSIS | Windows 客户端、主窗口、登录窗口、安装包打包 |
| 前端 | React、Vite、TypeScript、CSS | 实时监控台、消息列表、统计、特别关注、神秘人窗口 |
| 后端 | Node.js、Fastify、TypeScript | 本地 API、会话管理、SSE 实时流、采集调度 |
| 采集 | Playwright Chromium | 登录态复用、直播间页面打开、DOM 采集脚本注入 |
| 数据 | SQLite、better-sqlite3 | 会话、事件、累计统计、本地持久化 |
| 导出 | ExcelJS | 分类明细、全量统计汇总、当前保留明细说明导出 |
| 校验 | Zod | 启动配置校验、采集 payload 归一化边界 |
| 测试 | Node 回归脚本、npm scripts、npm audit、压测脚本 | server/web/desktop 回归、安全审计、10 万事件压测 |

## 3. AI Coding 工作流

本项目采用“用户拍板边界 + AI 执行研发闭环”的方式推进：

1. 需求阶段：从现有源码、README、历史迭代记录和用户反馈反推 PRD，形成 `docs/project-prd-2026-06-05.md`。
2. 风险阶段：对代码、架构、安全、性能和发布链路做风险复核，形成 `docs/project-risk-review-2026-06-08.md`。
3. 测试阶段：把 PRD、风险项和用户边界转为测试 SOP 与覆盖矩阵，形成 `docs/testing-sop-enhanced-2026-06-08.md` 和 `docs/test-coverage-matrix-2026-06-09.md`。
4. 编码阶段：针对 P0/P1 问题逐项修复，包括 API 鉴权、Origin 拦截、URL 白名单、Electron 版本、安全审计、native ABI、特别关注展示、评论/礼物采集完整性等。
5. 验证阶段：通过 `npm run test:regression`、`npm run audit:security`、10 万事件压测、安装包启动 smoke 和真实直播间采集验证。
6. 验收阶段：用户明确版本号规则、功能边界、真实 smoke 是否作为硬门禁、代码签名和 CI 是否纳入当前版本。
7. 文档同步：每次关键修复后同步 PRD、风险报告、测试 SOP、测试报告、覆盖矩阵和迭代记录，保证文档与源码状态一致。

## 4. 需求到研发的闭环

项目需求不是一次性固定，而是在真实使用中不断收敛。典型闭环包括：

| 问题来源 | 用户边界确认 | 研发处理 | 验证方式 |
| --- | --- | --- | --- |
| 本地 API 存在跨来源访问风险 | 本地 API 只服务 Electron 桌面端，不支持外部脚本 | 运行期 HttpOnly Cookie 鉴权，所有 `/api/*` 统一校验 | API 安全回归、非法 Origin 回归 |
| `Origin: null` 可能绕过来源检查 | 必须拦截 `Origin: null`、`file://`、`data:` | 非法 Origin 前置返回 403 | `regression-api-security.mjs` |
| 非抖音 URL 进入采集链路 | 采集只允许 `https://live.douyin.com/{roomId}` | URL allowlist | URL 安全回归 |
| 大直播间全量统计边界 | 原始明细继续固定 5 万，统计尽量代表全量历史 | 新增会话级累计统计与 Excel 汇总 sheet | 全量统计回归、100k 压测 |
| 特别关注展示格式变更 | 只改展示口径，不动采集、匹配、入库、导出 | 标记区显示备注，正文用户名显示原昵称 | web 回归与 mock 用例 |
| Electron high 漏洞 | high 必须清零，失败则不发布 | 升级 Electron 到可打包版本并修复 native ABI | `npm audit`、打包 ABI 门禁 |

## 5. 关键工程问题

### 5.1 本地 API 安全封口

早期本地 API 面向 `127.0.0.1` 提供服务，但如果缺少鉴权和严格来源校验，恶意网页可能尝试读取或触发本地接口。修复后：

- 服务启动生成运行期 token。
- 首屏通过 HttpOnly Cookie 给桌面页面授权。
- 所有 `/api/*`，包括读取、写入、SSE、导出都必须鉴权。
- `Origin: null`、远程网页、`file://`、`data:` 和非本机来源直接拒绝。
- 静态资源不鉴权，避免影响主界面加载。

### 5.2 采集完整性

直播间 DOM 会变化，评论和礼物文本结构可能出现富文本、mention、emoji、aria-label、礼物名前缀等复杂情况。项目通过补充回归用例锁定关键边界：

- 评论富文本正文不能因 mention 节点被截断。
- 礼物名里的前缀字符不能被误删，例如 `送你花花`。
- 特别关注匹配需要考虑 `payloadJson.userLink`、`payloadJson.userId` 等稳定身份字段。
- 普通昵称匹配不作为稳定匹配条件，降低误命中风险。

### 5.3 性能与大数据边界

项目针对高频直播间做过多轮性能治理：

- SSE 从逐条推送改为批量推送。
- 前端事件队列批量消费。
- 虚拟列表降低 DOM 节点数量。
- UI 最近显示窗口与数据库原始明细保留窗口分离。
- 统计口径通过会话累计汇总尽量代表全量直播历史。
- 10 万事件压测用于评估导出耗时、内存、文件大小和是否调整上限。

当前用户确认边界：每会话原始事件明细继续固定 5 万；统计和 Excel 汇总尽量代表新版本接收后的全量历史；不默认升到 10 万明细。

### 5.4 发布与 native ABI

Electron 与 `better-sqlite3` 这类 native 模块存在 ABI 匹配风险。项目曾在安装后暴露 `NODE_MODULE_VERSION` 不匹配问题，后续修复为：

- 打包前为 Electron runtime rebuild native 模块。
- 打包后直接加载最终 `app.asar.unpacked` 内的 `better_sqlite3.node` 验证。
- 打包完成后恢复 Node ABI，保证本地回归仍可运行。
- 安装器覆盖安装前清理旧 native 残留，避免旧文件污染新版本。

## 6. 测试体系

项目测试入口集中在 npm scripts：

```powershell
npm run test:regression
npm run audit:security
node --import tsx apps\server\scripts\pressure-export-100k.mjs
```

覆盖范围包括：

| 测试层级 | 覆盖内容 |
| --- | --- |
| server regression | API 安全、URL 白名单、采集归一化、数据库去重、导出、统计 |
| web regression | 评论展示、礼物展示、特别关注展示、SSE、历史回填、启动保护 |
| desktop regression | 版本一致性、白屏诊断、runtime bundle、安装器清理、native ABI |
| security audit | npm high 级漏洞门禁 |
| pressure test | 10 万事件统计与导出压力验证 |
| real smoke | 安装版启动、登录状态、真实直播间采集、停止、自动保存、Excel 可读 |

测试策略上，真实直播间 smoke 用于发布前增强信心，但不作为唯一硬门禁。核心质量由可重复的 mock、回归脚本、压测和安全审计保障。

## 7. 验收与发布

项目建立了明确的发布边界：

- 版本号按日期约定：`VYY.M.D.N`，例如 `V26.6.10.2` 表示 2026-06-10 第 2 个版本。
- 安装包保留 SHA256，方便发布产物核验。
- P0 问题必须自动化回归通过。
- 用户负责最终业务验收和发布拍板。
- 真实抖音直播间人工验收不作为硬门禁，但建议每次发布前执行。
- 代码签名、CI、外部 API 支持当前不纳入本阶段。

## 8. 项目文档资产

| 文档 | 作用 |
| --- | --- |
| `docs/project-prd-2026-06-05.md` | 需求、范围、验收标准、非功能边界 |
| `docs/project-tech-stack-2026-06-05.md` | 技术栈说明 |
| `docs/project-risk-review-2026-06-08.md` | P0/P1/P2 风险和缓解状态 |
| `docs/testing-sop-enhanced-2026-06-08.md` | 测试 SOP 和模块测试矩阵 |
| `docs/test-coverage-matrix-2026-06-09.md` | 自动化覆盖与人工验收缺口 |
| `docs/project-test-report-2026-06-08.md` | 测试结果、压测、发布产物记录 |
| `docs/iteration-log.md` | 历史迭代和问题修复记录 |

## 9. 可写入简历的项目描述

糖三角直播采集工具是一款基于 Electron、React、Fastify、Playwright 和 SQLite 的 Windows 桌面应用，用于抖音直播间评论、进场、互动、礼物、特别关注和神秘人数据的实时采集、展示、持久化和 Excel 导出。本人通过 AI Coding 方式主导项目从需求反推、风险复核、P0 安全修复、采集完整性修复、自动化回归、压测、安装包打包到真实直播间 smoke 的闭环建设，建立了 PRD、风险报告、测试 SOP、覆盖矩阵、测试报告和版本发布记录等工程文档体系。

可强调的成果：

- 建立本地 API 运行期 Cookie 鉴权和 Origin 拦截，覆盖所有 `/api/*` 数据面接口。
- 修复 Electron + better-sqlite3 native ABI 打包风险，增加最终安装包 native 模块验证门禁。
- 建立 server/web/desktop 三层回归脚本，覆盖采集、展示、导出、安全和桌面启动。
- 用 10 万事件压测验证统计和导出边界，区分全量统计与当前保留明细。
- 将用户反馈转化为需求边界、测试用例和发布验收标准，形成 AI Coding 研发闭环。

## 10. 面试讲述要点

面试时可以按以下顺序讲：

1. 先讲业务问题：直播间高频互动数据需要实时观察和复盘，普通人工观察无法保留结构化历史。
2. 再讲技术方案：Electron 桌面壳 + 本地 Fastify 服务 + Playwright 采集 + SQLite 持久化 + React 实时控制台 + ExcelJS 导出。
3. 然后讲工程闭环：不是只写功能，而是建立 PRD、风险报告、测试 SOP、自动化回归、压测、真实 smoke 和发布记录。
4. 重点讲两个技术难点：本地 API 安全封口、Electron native ABI 打包问题。
5. 最后讲边界意识：真实直播间不可完全稳定复现，所以用 mock 回归兜底；超大直播间全量明细先不盲目扩容，而是通过压测和用户拍板确定边界。

## 11. 当前仍保留的改进项

本项目并非宣称无风险，当前仍有明确后续改进方向：

- `collector.ts` 仍有文件级 `@ts-nocheck`，已通过 payload schema 收窄风险，后续应分模块治理。
- 前端和采集核心文件较大，长期应渐进拆分。
- Excel 导出仍使用内存 buffer，若未来要求超大直播间全量明细，需要 streaming writer。
- CI 和覆盖率未接入，当前回归主要依赖本地命令。
- 安装包暂未做代码签名，Windows 可能提示未知发布者。
- 真实特别关注命中截图依赖可命中的真实用户 ID，当前主要由 mock 回归覆盖。

## 12. 项目价值总结

这个项目的核心价值在于把 AI Coding 从“辅助写代码”推进到“辅助完成工程闭环”。AI 不只参与实现功能，也参与需求整理、风险识别、测试设计、回归执行、发布验证和文档同步；用户负责业务边界和最终验收拍板。这样的协作方式能在个人项目或小团队场景中快速建立接近工程化交付的质量体系。
