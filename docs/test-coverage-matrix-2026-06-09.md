# 测试覆盖矩阵

生成日期：2026-06-09  
当前版本：`V26.6.9.2`  
项目路径：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`

## 1. 当前自动化入口

| 命令 | 覆盖范围 | 当前状态 |
| --- | --- | --- |
| `npm run test:regression` | 构建、server/web/desktop 全量回归 | 已通过，server 18、web 8、desktop 6 |
| `npm run test:server` | 后端 API、安全、采集归一化、数据库、导出、统计 | 已纳入总回归 |
| `npm run test:web` | 前端展示、SSE、历史回填、特别关注、神秘人、启动防护 | 2026-06-09 测试补强后已通过 |
| `npm run test:desktop` | 桌面版本、安装器、native ABI、白屏诊断、runtime 资源 | 已纳入总回归 |
| `npm run audit:security` | high 级 npm audit 门禁 | 已通过，剩余 `exceljs -> uuid` moderate 接受 |

## 2. P0 覆盖矩阵

| P0 模块 | 自动化脚本 | 覆盖结论 | 仍需人工 |
| --- | --- | --- | --- |
| 本地 API Cookie 鉴权 | `regression-api-security.mjs`、`regression-api-production-security.mjs` | 无 Cookie 401、非法 Origin 403、正确 Cookie 200 | 安装后确认主窗口同源请求正常 |
| `Origin: null` 拦截 | `regression-api-security.mjs`、`regression-api-production-security.mjs` | 已覆盖 GET/POST 数据面拒绝 | 无 |
| URL 白名单 | `regression-api-security.mjs` | 非抖音、HTTP、域名混淆被拒绝 | 真实 UI 输入非法 URL |
| 评论不丢不重 | `regression-comment-loss.mjs`、`regression-comment-unique-key.mjs`、`regression-comment-display-loss.mjs`、`regression-comment-history-backfill.mjs` | mock 和前端回填已覆盖；`V26.6.9.2` 真实 smoke 已采集评论 42 条 | 更长时间的大直播间真实评论流 |
| 礼物身份和数量 | `regression-gift-identity.mjs` | 身份补齐、重复礼物、数量合并已覆盖；`V26.6.9.2` 真实 smoke 已采集礼物 161 条、礼物件数 171 | 更长时间的真实礼物流 |
| 特别关注展示 | `regression-gift-remark-display.mjs`、`regression-stopped-session-and-remarks.mjs` | 已锁定：标记区显示备注，正文用户名显示原昵称 | 真实命中截图确认 |
| 停止后保留会话 | `regression-auto-save-session.mjs`、`regression-stopped-session-and-remarks.mjs` | 手动停止/历史会话选择已覆盖；`V26.6.9.2` 真实 smoke 停止后统计保留 | 无 |
| Excel 导出 | `regression-export-all-comments.mjs`、`regression-export-full-history-summary.mjs`、`pressure-export-100k.mjs` | 全分类、全量统计汇总、当前保留明细、10 万压测已覆盖；`V26.6.9.2` 自动保存 Excel 可读 | 无 |
| 桌面启动和白屏诊断 | `regression-renderer-blank-diagnostics.cjs`、`regression-runtime-bundle-assets.cjs`、`regression-static-shell-cache.mjs` | 静态资源和白屏诊断逻辑已覆盖；`V26.6.9.2` 安装版真实启动无白屏 | 后续新包复验 |
| native ABI | `regression-packaged-native-abi.cjs`、`regression-installer-native-cleanup.cjs` | 打包产物直接加载 `better_sqlite3.node` 已覆盖；`V26.6.9.2` 覆盖安装后启动通过 | 后续新包复验 |
| 版本号规则 | `regression-release-version.cjs` | 已锁定 `V26.6.9.2` 与 `26.6.9-2` 一致 | 无 |

## 3. P1/P2 缺口

| 缺口 | 优先级 | 当前决策 | 触发风险 |
| --- | --- | --- | --- |
| 特别关注真实命中截图未覆盖 | P1 | 当前无真实可命中的用户 ID；用隔离 mock 覆盖展示口径 | 真实现场仍可能需要截图确认 |
| 更长时间大直播间 smoke | P1 | 本轮已完成一次短 smoke，不作为硬门禁 | 抖音 DOM/接口变化可能绕过 mock |
| Excel streaming writer | P1 | 本轮不改 | 若后续要求超大直播间全量明细，buffer 峰值仍可能偏高 |
| `collector.ts @ts-nocheck` | P1 | 已用 payload schema 收窄，后续分阶段治理 | 采集器内部类型错误仍可能漏过编译 |
| CI/覆盖率 | P2 | 本轮不做 | 测试仍依赖本地手动触发 |
| 代码签名 | P2 | 本轮不做 | Windows 可能提示未知发布者 |
| 外部 API 支持 | P2 | 本轮不做 | 第三方脚本无法作为官方入口使用 |

## 4. 真实 smoke 已执行记录

| 项 | 结果 |
| --- | --- |
| 安装包 | `糖三角-V26.6.9.2-安装包.exe` |
| 覆盖安装 | PASS，注册表显示 `糖三角 26.6.9-2` |
| 启动日志 | PASS，包含 `releaseTag=V26.6.9.2`、`serverUrl=http://127.0.0.1:3100`、主界面 `rootChildCount=1` |
| 直播间 | `https://live.douyin.com/962565925628` |
| 会话 ID | `8O4oe_OrQC` |
| 采集结果 | 评论 42、进场 18、互动 12、礼物 161、礼物件数 171、唯一用户 220 |
| 手动停止 | PASS，停止后统计保留 |
| 自动保存 | `C:\Users\85855\Desktop\糖三角-20260609-153806-冻腰冻拐（三角洲行动）-8O4oe_OrQC.xlsx` |
| Excel 校验 | PASS，ExcelJS 可读，分类 sheet 和全量统计 sheet 存在 |
| 特别关注真实命中 | 未覆盖，用户无法提供真实 ID；不向真实会话注入 mock |

## 5. 后续需要用户提供的信息

1. 若要补特别关注真实命中截图，需要提供能在直播间真实命中的用户 ID/备注。
2. 若要验证关播自动保存，需要提供或等待会关播的直播间；当前代码路径已有自动保存逻辑和回归覆盖。
3. 若要把 smoke 升级为发版硬门禁，需要重新确认门禁标准和失败处理方式。

## 6. 真实验收建议顺序

1. 安装 `V26.6.9.2`，确认主界面无白屏，启动日志包含 `releaseTag=V26.6.9.2`。
2. 打开登录窗口，确认只能进入必要的抖音 HTTPS 页面。
3. 输入真实直播间 URL 开始采集，观察评论、进场、互动、礼物是否有数据。
4. 若有特别关注用户，确认标记区显示备注，正文用户名显示原昵称。
5. 手动停止采集，确认统计和历史列表不清空。
6. 导出 Excel，人工打开文件，确认包含全量统计汇总、当前保留明细说明和分类 sheet。
7. 如果直播间关播，观察是否自动停止并按既有路径保存。

## 7. V26.6.9.3 覆盖矩阵追加

| P0 模块 | 自动化脚本 | 真实 smoke | 当前结论 |
| --- | --- | --- | --- |
| 评论重复防护 | `regression-comment-unique-key.mjs`、`regression-comment-display-loss.mjs`、`regression-comment-history-backfill.mjs` | `127874409138` 会话 `ehGrIJDv6x` 采集评论 13 条 | 1000 条查询窗口内 `DUP_UNIQUE_KEY=0`，`sourceId/userId/message` 重复组为 0 |
| 礼物顺序稳定 | `regression-gift-display-order.mjs`、`regression-gift-identity.mjs` | `127874409138` 会话 `ehGrIJDv6x` 采集礼物 5 条 | 真实礼物 `id/createdAt/ingestSeq` 均按最新在前一致排序 |
| 安装版启动 | `regression-runtime-bundle-assets.cjs`、`regression-renderer-blank-diagnostics.cjs` | 安装版日志包含 `releaseTag=V26.6.9.3`、`serverUrl=http://127.0.0.1:3100` | 未见白屏证据，API 可用 |
| 发布门禁 | `npm run test:regression`、`npm run audit:security`、`npm run desktop:pack:fast` | 安装包 `糖三角-V26.6.9.3-安装包.exe` | 回归通过，high=0，包 SHA256 `46209A29BAB8127250F719CBD256B10C302980047EB672106447638B2970D8CD` |
| 导出接口 | `regression-export-all-comments.mjs`、`regression-export-full-history-summary.mjs` | `/api/export.xlsx?sessionId=ehGrIJDv6x` | 生成 25,770 bytes Excel，SHA256 `F237C55ECE23AAAFFDC6C1350F1466DB253A410EAC1EA075591C986C19C9974C` |

仍需用户最终验收：`V26.6.9.3` 虽已完成短时真实 smoke，但发布前是否接受该版本仍由用户拍板；建议在实际目标直播间观察更长时间，重点看高峰评论刷屏和连续礼物场景。
