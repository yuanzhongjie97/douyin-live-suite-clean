# Subagent 进度同步台账

## 使用目的

本文件用于记录主 Agent 与各 Subagent 的任务进度，防止上下文压缩、会话爆满或中断后丢失关键决策。

后续每个 Subagent 的任何有效产出，都必须同步到本文档，最少包含：

- 做了什么
- 当前进度
- 修改或排查目的
- 当前结果

## 当前项目

- 项目：糖三角 / douyin-live-suite
- 当前有效目录：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`
- 原始项目目录：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite`
- 当前记录日期：`2026-05-28`
- 记录规则：Subagent 负责查清事实、风险和方案；主 Agent 负责统一落地、验证、打包和最终结论。从 `2026-05-28` 起，所有代码改动、构建验证、打包产物和有效 Subagent 结论都必须追加到本文档，作为版本迭代保留依据。

## 总体进度

| 模块 | 负责人 | 进度 | 目的 | 当前结果 |
|---|---|---|---|---|
| 评论去重 | Subagent A | 已完成阶段性排查 | 修复真实评论被过度去重、漏展示的问题 | 已确认后端 30 分钟去重和前端 5 分钟去重过重，已缩短为 1.5 秒级别 |
| 用户身份缓存 | Subagent B | 已完成阶段性方案 | 用 SQLite 补齐稳定用户身份，减少礼物区特别关注丢失和主页打开慢 | 已设计并落地身份缓存与昵称观察表，只用稳定 ID/link，不用昵称命中特别关注 |
| 礼物区身份补齐 | Subagent C | 已完成阶段性修复 | 修复礼物区缺少 `userId/userLink` 导致特别关注 tag 丢失 | 已将礼物身份补齐提前到唯一键、入库、统计、SSE 推送之前 |
| 前端展示回归 | Subagent D | 已完成阶段性排查 | 避免身份补齐后前端旧记录不更新、展示不一致 | 结论是必须在 SSE 前补齐身份，不能依赖前端二次修正 |
| 测试验收 | Subagent E | 已完成阶段性清单 | 建立打包前回归用例 | 已覆盖评论不丢、不重复、礼物区特别关注、神秘人隔离、Excel 导出等检查项 |
| 安装包逻辑 | Subagent F | 已完成阶段性调研 | 支持安装路径选择、智能覆盖旧版本 | 已确认 NSIS assisted 模式、注册表读取和自定义页面方案 |
| 安装脚本审查 | Subagent G | 已完成阶段性验证 | 确认 electron-builder NSIS 钩子是否可用 | 已确认 `customInit`、`customPageAfterChangeDir`、`customCheckAppRunning` 可用 |

## 任务流水

| 时间 | Subagent | 做了什么 | 进度 | 目的 | 结果 |
|---|---|---|---|---|---|
| 2026-05-26 | A | 排查评论采集、后端去重、前端展示去重链路 | 已完成 | 找出评论重复与漏抓的根因 | 发现评论真实重复发言会被长窗口去重误杀 |
| 2026-05-26 | B | 设计 SQLite 用户身份缓存与昵称观察机制 | 已完成 | 为礼物区缺失身份提供稳定补齐来源 | 采用 `userId/userLink` 作为可信身份，不用昵称做特别关注命中 |
| 2026-05-26 | C | 排查礼物区特别关注 tag 丢失和主页打开慢 | 已完成 | 让礼物区和评论区使用一致的用户身份 | 身份补齐必须发生在入库和 SSE 推送前 |
| 2026-05-26 | D | 排查前端展示是否会因身份延迟补齐产生错乱 | 已完成 | 避免前端列表已有记录被 append 去重跳过更新 | 结论是前端不应承担身份修正，后端推送前必须给完整身份 |
| 2026-05-26 | E | 汇总回归测试项 | 已完成 | 防止修复评论/礼物后影响神秘人、特别关注、导出 | 形成打包前人工验收清单 |
| 2026-05-26 | F | 调研安装包路径选择和智能覆盖逻辑 | 已完成 | 支持用户选择安装目录，并避免默认占用 C 盘 | 建议使用 NSIS assisted installer + 注册表读取旧安装位置 |
| 2026-05-26 | G | 审查 NSIS 自定义脚本入口 | 已完成 | 确认安装逻辑可落地 | `apps/desktop/build/installer.nsh` 是正确落地点 |

## 已落地改动摘要

| 改动 | 状态 | 目的 | 结果 |
|---|---|---|---|
| 新增 SQLite 身份缓存表 | 已完成 | 保存稳定用户身份 | 可为后续礼物区补齐 ID/link |
| 新增昵称观察记录 | 已完成 | 记录昵称变化，不把昵称当唯一身份 | 降低误命中特别关注风险 |
| 可信事件写入身份缓存 | 已完成 | 只缓存稳定身份 | 神秘人、匿名、贡献榜、噪音数据不进入普通身份缓存 |
| 礼物事件入库前补齐身份 | 已完成 | 修复礼物区特别关注 tag 丢失 | 礼物区可复用评论区已捕获到的稳定身份 |
| 评论去重窗口缩短 | 已完成 | 避免同用户隔一段时间重复发言被吞 | 后端评论去重窗口从 30 分钟降到 1.5 秒 |
| 前端评论展示去重窗口缩短 | 已完成 | 避免前端隐藏真实重复评论 | 前端评论去重窗口从 5 分钟降到 1.5 秒 |
| 非评论去重保持独立 | 已完成 | 不影响礼物、互动等模块原有去重 | 非评论仍保持较长去重窗口 |
| 安装包改为可选安装路径 | 已完成 | 让用户选择安装目录 | 已支持 assisted installer |
| 智能安装路径逻辑 | 已完成 | 可选自动覆盖旧版本并避开 C 盘 | 默认不勾选，勾选后按注册表旧路径判断 |
| 礼物同源短窗口去重 | 已完成 | 压制同一礼物先昵称后 ID/link 两次入库/SSE | 礼物 `sourceId` 改为身份补齐后短窗口去重，并保留真实连击增量 |
| 用户主页前端直开 | 已完成 | 减少评论区、礼物区点击主页时等待后端解析 | 前端优先使用事件直达链接、`sec_/MS4w` ID 和本地解析缓存，兜底才请求后端 |
| 安装器中文文案 | 已完成 | 修复安装向导勾选框和自定义页显示英文 | NSIS 自定义页文案改为中文，并指定 `installerLanguages: zh_CN` |
| Excel 浏览器下载 | 已完成 | 导出 Excel 默认走 Electron/Chromium 下载 | 导出链接不再开新窗口，桌面端识别 `/api/export.xlsx` 并调用 `downloadURL`，停止采集不再静默写桌面 |
| 礼物身份后到回填 | 已完成 | 修复少量礼物区特别关注 tag 漏显示 | 高质量礼物身份后到时回填旧礼物行、更新 SQLite 并重新 SSE 推送，前端同 `uniqueKey` 高质量行替换旧行 |

## 当前验证结果

| 验证项 | 状态 | 结果 |
|---|---|---|
| Server TypeScript build | 通过 | `apps/server npm run build` 通过 |
| Web build | 通过 | `apps/web npm run build` 通过 |
| UI 布局影响 | 未发现主动修改 | 当前阶段未刻意调整 UI |
| 安装包构建 | 通过 | `V26.5.27.1` 安装包已构建 |
| 版本日志 | 已追加 | 已记录 `V26.5.28.0` |

## 待人工验收

| 验收项 | 目的 | 期望结果 |
|---|---|---|
| 同用户隔 1.5 秒以上重复发同一句评论 | 验证不过度去重 | 两条都显示 |
| 采集源极短时间重复推同一条评论 | 验证仍能过滤噪音重复 | 1.5 秒内重复被抑制 |
| 特别关注用户先评论后送礼 | 验证礼物区身份补齐 | 评论区和礼物区都显示特别关注 tag |
| 点击礼物区用户主页 | 验证打开速度 | 已有身份缓存时应比未缓存更快 |
| 神秘人列表 | 验证隔离规则 | 不被普通用户、特别关注备注、贡献榜数据污染 |
| Excel 导出 | 验证原始数据口径 | 导出不受前端展示过滤影响 |
| 安装包覆盖安装 | 验证安装逻辑 | 可选择路径，智能覆盖不误移动 AppData 数据 |

## 后续记录模板

每次 Subagent 完成一个排查、设计、修复或验证动作，都按下面格式追加：

```md
### YYYY-MM-DD HH:mm - Subagent X - 模块名称

- 做了什么：
- 进度：
- 目的：
- 结果：
- 涉及文件：
- 风险：
- 下一步：
```

## 记录规则

- 只记录有效结论，不记录无意义过程。
- 不用“已优化”“已处理”这类空话，必须写清楚具体改了什么。
- 如果只是排查但未修改，也要写清楚结论和未修改原因。
- 如果发现风险，必须写清影响范围。
- 主 Agent 每次打包前必须更新本文档。
- 上下文爆满后，新的 Agent 必须先读本文档，再继续执行。

### 2026-05-26 22:18 - 主 Agent - plan 遗留问题复查

- 做了什么：复查“评论区重复”和“礼物区部分用户不显示特别关注”两个遗留问题，读取 `capture-service.ts`、`collector.ts`、`db.ts`、`App.tsx` 的去重、身份补齐和特别关注匹配链路。
- 进度：已完成代码修复和构建验证。
- 目的：减少同一评论 DOM 被重扫后生成新 `createdAt/uniqueKey` 导致重复展示；减少礼物事件补齐身份后仍因 ID/link 解析口径不一致导致特别关注漏标。
- 结果：采集端新增 `sourceId` 透传；服务端仅对评论的 `sourceId` 使用 5 分钟稳定指纹去重，不影响礼物连击；礼物事件补齐后的 `userId/userLink/giftName/giftCount` 写回 `payloadJson`；服务端、数据库历史命中查询、前端展示统一支持从主页链接、query、JSON/属性片段里提取 `secUid/userId/openId/webcastUid/fromUserId` 等稳定身份字段。
- 涉及文件：`apps/server/src/types.ts`、`apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/web/src/App.tsx`。
- 验证：`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；本地 Node 样例验证主页链接、`secUid` query、`openId` JSON 片段可归一化到同一匹配 token。
- 风险：评论重复修复依赖抖音 React payload 中能提取到 `msg_id/messageId/id` 等 `sourceId`；没有源消息 ID 的评论仍只按 1.5 秒短窗口去重，以避免误杀用户隔一段时间重复发言。
- 下一步：真实直播间人工验收“旧评论不被重扫重复展示”和“特别关注用户送礼行显示 tag”，尤其关注没有 `sourceId` 的评论场景。

### 2026-05-26 22:21 - 主 Agent - plan 遗留问题接手复核

- 做了什么：按接手要求重新读取 `subagent-progress.md`、`subagent-sync-rules.md`、`subagent-agent-worksplit.md`，并复核当前工作区代码是否包含评论重复与礼物区特别关注漏标两条修复链路。
- 进度：已完成复核，无新增业务代码修改。
- 目的：确认上一轮修复不是只写入文档，且当前代码仍能构建通过。
- 结果：确认 `sourceId` 已透传到 `RawCollectorEvent`，服务端只对评论启用 `source|comment|sourceId` 的 5 分钟去重；礼物事件身份补齐后写回顶层事件与 `payloadJson`；服务端、数据库和前端特别关注匹配均使用稳定 ID/link 归一化，不使用昵称直接命中特别关注。
- 涉及文件：`apps/server/src/types.ts`、`apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/web/src/App.tsx`。
- 验证：`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过。当前有效目录 `douyin-live-suite-clean` 不是 Git 仓库，无法在该目录执行 `git status`。
- 风险：仍需真实直播间验证抖音当前 DOM/React payload 是否稳定提供 `sourceId`；没有 `sourceId` 的评论仍保持 1.5 秒短窗口去重策略。
- 下一步：如需发布，进入打包流程前再更新版本日志与最终验证记录。

### 2026-05-26 23:18 - 主 Agent - V26.5.26.2 打包

- 做了什么：将软件内版本日志新增为 `V26.5.26.2`，记录评论区旧消息重扫去重、礼物区特别关注稳定 ID/link 归一化、礼物 payload 身份回写和不使用昵称命中特别关注四项变更；执行安装包打包。
- 进度：已完成安装包构建。
- 目的：发布本轮 plan 遗留问题修复版本。
- 结果：生成安装包 `apps/desktop/release/糖三角-V26.5.26.2-安装包.exe`，大小 76,934,471 字节，SHA256 `9CE48E5A327DDCD027DE03EB92E529B7E8802B36610D4286D9CD2175B1EB95CB`。
- 涉及文件：`apps/web/src/App.tsx`、`docs/subagent-progress.md`、`apps/desktop/release/糖三角-V26.5.26.2-安装包.exe`。
- 验证：`npm run desktop:pack:fast` 通过；该命令内含 `npm run build:server`、`npm run build:web`、`npm --workspace apps/desktop run pack:fast`。
- 风险：未执行真实直播间人工验收；仍需安装后检查“旧评论不被重扫重复显示”和“特别关注用户送礼行显示 tag”。
- 下一步：安装 `V26.5.26.2` 后在真实直播间做上述两项人工验收。

### 2026-05-27 11:08 - 主 Agent - 安装后 better-sqlite3 ABI 修复

- 做了什么：排查用户安装 `V26.5.26.2` 后启动弹窗报错 `better_sqlite3.node` 使用 `NODE_MODULE_VERSION 127`、当前 Electron 需要 `NODE_MODULE_VERSION 136`；修复打包脚本并重打安装包。
- 进度：已完成代码修复、native 重编、重打包和目录版启动烟测。
- 目的：避免安装包把本机 Node 22 ABI 127 的 `better-sqlite3` 原生模块带入 Electron 37 运行时，导致正式包启动失败。
- 结果：`apps/desktop/package.json` 的 `pack:fast` 改为打包前执行 `node scripts/prepare-native.cjs`，`pack:full` 改为强制执行 `node scripts/prepare-native.cjs --force`；`prepare-native.cjs` 新增 Electron 运行时加载校验，只有 `better-sqlite3 ok for modules 136` 时才允许缓存命中或继续打包；软件内版本日志新增 `V26.5.27.0`。
- 涉及文件：`apps/desktop/package.json`、`apps/desktop/scripts/prepare-native.cjs`、`apps/web/src/App.tsx`、`docs/subagent-progress.md`、`apps/desktop/release/糖三角-V26.5.27.0-安装包.exe`。
- 验证：`npm run desktop:prepare-native:force` 通过并输出 `better-sqlite3 ok for modules 136`；`npm run desktop:pack:fast` 通过；临时目录版 `release/win-unpacked/糖三角.exe` 启动 8 秒后仍存活，启动日志新增 `serverUrl=http://127.0.0.1:3100`，未再出现 `NODE_MODULE_VERSION` 错误。
- 产物：`apps/desktop/release/糖三角-V26.5.27.0-安装包.exe`，大小 76,999,102 字节，SHA256 `70D78E2307AD56EAB436A73DE0BF6BC842418EE3394A3F90A79DA84CFD97FF68`。
- 风险：目录版启动烟测已通过，但未实际运行安装向导覆盖安装；仍需用户安装 `V26.5.27.0` 确认安装路径覆盖逻辑和正式安装后的首次启动。
- 下一步：用 `V26.5.27.0` 替换 `V26.5.26.2` 安装包进行安装验证。

### 2026-05-27 12:55 - 主 Agent - V26.5.27.1 三项修复与打包

- 做了什么：按用户要求使用 Subagent 重新处理三项问题：评论区/礼物区重复自检、评论区和礼物区用户主页打开慢、安装器勾选框英文未汉化；主 Agent 汇总改动、统一构建验证、打包并清理临时目录产物。
- 进度：已完成代码修复、构建验证、目录版启动烟测、安装包构建和本文档同步。
- 目的：降低礼物事件因先昵称后 ID/link 导致重复入库/SSE 的概率；让已有稳定身份或缓存的用户主页点击不再优先走后端解析；让安装向导自定义选项页显示中文。
- Subagent 分工：Worker B/C `019e6799-5307-7f40-af4b-be3a933447a5` 修复前端主页直开和缓存命中；Worker F/G `019e6799-5296-7df3-9a79-1ed458ae5bf2` 修复 NSIS 中文文案和安装器语言；Worker A/C `019e6799-536c-7af1-af9e-6c70c4c89078` 修复礼物同源短窗口去重和身份补齐后去重顺序。
- 结果：`apps/web/src/App.tsx` 新增 `V26.5.27.1` 版本日志，用户点击主页顺序改为直达 URL、前端缓存、后端兜底；`apps/desktop/build/installer.nsh` 的自定义安装选项页标题、运行中提示、目录说明、勾选框和长说明改为中文；`apps/desktop/package.json` 的 `build.nsis.installerLanguages` 设置为 `zh_CN`；`apps/server/src/capture-service.ts` 新增礼物 `sourceId` 15 秒短窗口去重，礼物去重移动到身份补齐后，并让组合增量计算使用已知稳定身份。
- 涉及文件：`apps/web/src/App.tsx`、`apps/desktop/build/installer.nsh`、`apps/desktop/package.json`、`apps/server/src/capture-service.ts`、`docs/subagent-progress.md`。
- 验证：`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；`npm run desktop:prepare-native` 通过并输出 `better-sqlite3 ok for modules 136`；`npm run desktop:pack:fast` 通过；`npx electron-builder --win --dir` 通过，临时目录版 `release/win-unpacked/糖三角.exe` 启动 8 秒后仍存活，最新日志显示 `serverUrl=http://127.0.0.1:3100` 且未新增 `NODE_MODULE_VERSION` 错误；打包烟测后已清理 `release/win-unpacked` 和 `builder-debug.yml`。
- 产物：`apps/desktop/release/糖三角-V26.5.27.1-安装包.exe`，大小 76,923,289 字节，SHA256 `AD3EEC614E57012D305AA2C6032B75EA89A7D91445B96805F926D6BF6D33AF48`。
- 风险：尚未在真实直播间做人工验收；礼物高质量 payload 后到时当前策略会压制第二条入库/SSE 并更新进程内质量标记，但不会回写已经入库的低质量旧行；安装器中文文案已随配置打包，但未手动点击完整安装向导逐页截图确认。
- 下一步：安装 `V26.5.27.1` 后在真实直播间验证评论不重复、礼物不重复、特别关注送礼行正常显示 tag、评论区/礼物区主页点击速度，以及安装向导勾选框中文显示。

### 2026-05-27 13:19 - 主 Agent - V26.5.27.1 重新打包

- 做了什么：按用户“打包”要求，在当前代码基础上重新执行桌面端快速打包。
- 进度：已完成重新打包、产物核对和 release 目录检查。
- 目的：生成当前最新代码对应的 `V26.5.27.1` 安装包，并刷新最终 SHA256，避免继续使用上一次构建哈希。
- 结果：`npm run desktop:pack:fast` 完整通过，命令内含 server build、web build、`prepare-native` 和 NSIS 打包；`prepare-native` 输出 `better-sqlite3 ok for modules 136`，确认 Electron 37 ABI 仍正确。
- 涉及文件：`apps/desktop/release/糖三角-V26.5.27.1-安装包.exe`、`docs/subagent-progress.md`。
- 验证：release 目录检查后仅剩最终安装包；未发现额外 `win-unpacked` 或 `builder-debug.yml` 临时产物。
- 产物：`apps/desktop/release/糖三角-V26.5.27.1-安装包.exe`，大小 76,923,285 字节，SHA256 `338E44D525345FDBA7B0DAF962905D593C9D63115EAD6C738F2459E1E1B31E7E`。
- 风险：本次只重新打包并核对产物，未再次启动目录版烟测，也未手动运行安装向导逐页验证。
- 下一步：用本条记录中的最新 SHA256 作为当前有效安装包校验值。

### 2026-05-28 11:28 - 主 Agent - V26.5.28.0 Excel 下载与礼物 tag 修复

- 做了什么：按用户要求使用不同 Subagent 处理两项问题，并建立“从现在起所有改动必须记录到本文档”的版本保留规则。
- 进度：已完成代码修改、构建验证和本文档同步；未打包。
- 目的：让“导出 Excel”默认走 Electron/Chromium 浏览器下载到本地；修复礼物区少量特别关注 tag 因高质量身份 payload 后到而漏显示。
- Subagent 分工：Worker-Export `019e6c8e-413f-7e11-a5de-5b6f8bca054a` 负责 Excel 导出链路；Worker-GiftTag `019e6c8e-42b7-7151-9b25-11776c7c34ff` 负责礼物区身份与特别关注链路。
- 结果：`apps/web/src/App.tsx` 的导出按钮去掉 `target="_blank"` 并使用浏览器下载；`apps/desktop/main.mjs` 新增本地 `/api/export.xlsx` 识别，遇到导出 URL 时通过 `webContents.downloadURL(url)` 交给 Electron/Chromium 下载，不打开空白页；`apps/server/src/capture-service.ts` 的停止采集不再自动静默保存 Excel 到桌面；`apps/server/src/index.ts` 与 `apps/web/src/api.ts` 同步停止接口返回类型；礼物去重链路新增后到高质量身份回填，重复礼物如果带来更完整 `userId/userLink/payloadJson`，会更新旧礼物行并重新推送；`apps/server/src/db.ts` 新增 `updateEventIdentities()` 只按 `unique_key/session_id/category='gift'` 更新礼物身份；前端收到同 `uniqueKey` 且身份质量更高的礼物事件时替换旧行，特别关注仍只按稳定 ID/link 命中。
- 涉及文件：`apps/web/src/App.tsx`、`apps/desktop/main.mjs`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/server/src/index.ts`、`apps/web/src/api.ts`、`docs/subagent-progress.md`。
- 验证：`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；`node --check apps/desktop/main.mjs` 通过；`npm --workspace apps/desktop run prepare-runtime` 通过；静态检查未发现 `autoSavedPath`、`saveSessionWorkbookToDesktop`、`writeFile(outputPath)` 残留，也未发现导出按钮继续使用 `target="_blank"`。
- 风险：尚未在真实 Electron 窗口手动点击导出确认最终下载目录；下载位置由 Electron/Chromium 默认下载策略决定。礼物 tag 修复仍需真实直播间验证“低质量礼物先显示、身份 payload 后到”时是否稳定回填并刷新 tag；当前策略不使用昵称直接命中特别关注，若全程没有稳定 `userId/userLink`，仍不会显示特别关注 tag。
- 下一步：如需发布，先做真实窗口导出和真实直播间礼物 tag 验收，再执行打包并把产物、大小、SHA256 追加到本文档。

### 2026-05-28 19:17 - 主 Agent - V26.5.28.0 打包

- 做了什么：按用户要求将当前 `V26.5.28.0` 代码打成 Windows 安装包。
- 进度：已完成完整快速打包、产物核对和 release 目录检查。
- 目的：发布包含 Excel 浏览器下载与礼物区特别关注 tag 回填修复的安装包版本。
- 结果：`npm run desktop:pack:fast` 完整通过，命令内含 server build、web build、`prepare-native`、`prepare-runtime`、NSIS 打包和安装包重命名；`prepare-native` 输出 `better-sqlite3 ok for modules 136`，确认 Electron 37 ABI 正确。
- 涉及文件：`apps/desktop/release/糖三角-V26.5.28.0-安装包.exe`、`docs/subagent-progress.md`。
- 验证：release 目录检查后仅剩 `糖三角-V26.5.28.0-安装包.exe`，未发现额外 `win-unpacked` 或 `builder-debug.yml` 临时产物。
- 产物：`apps/desktop/release/糖三角-V26.5.28.0-安装包.exe`，大小 76,923,873 字节，SHA256 `4E626E6C4679E5D93A248B6E95CF767AC790F162E248A7DB7B89293BDB867A0D`。
- 风险：本次只完成构建和产物核对，未实际安装运行，也未在真实 Electron 窗口点击导出或真实直播间验证礼物 tag 回填。
- 下一步：安装 `V26.5.28.0` 后做两项人工验收：导出 Excel 是否进入本地下载目录、礼物区特别关注用户送礼是否稳定显示 tag。

### 2026-05-28 21:11 - 主 Agent + Subagent - V26.5.28.0 神秘人/特别关注丢失回归排查

- 做了什么：按用户反馈只读排查 `V26.5.27.1` 未出现、`V26.5.28.0` 出现的“神秘人丢失”问题；用户补充丢失消息在“神秘人”和“特别关注”都未显示。主 Agent 读取台账与关键代码，并派发两个只读 Subagent 分别检查服务端礼物身份回填链路和前端显示/刷新链路。
- 进度：已完成根因定位；本条未修改业务代码，未重新构建，未打包。
- 目的：确认回归是否来自 `V26.5.28.0` 新增的 Excel 下载、礼物身份后到回填、前端同 `uniqueKey` 替换或神秘人刷新逻辑。
- Subagent 分工：Server/DB 排查 Subagent `019e6eb2-13fe-7970-8a93-eb449484a775`；Web 展示/刷新排查 Subagent `019e6eb2-15b7-7982-a44f-46ffb3da8a40`。
- 结果：高可信根因是 `V26.5.28.0` 新增的礼物身份后到回填策略。`apps/server/src/capture-service.ts` 的 `getGiftIdentityScore()` 只按 `userId/userLink` 完整度打分，不区分“神秘人/特别关注/普通用户”；`mergeGiftIdentityIntoEvent()` 在合并时优先采用后到 candidate 的 `userName/userId/userLink` 和 `payloadJson`，随后 `apps/server/src/db.ts` 的 `updateEventIdentities()` 会把覆盖后的 `payload_json` 持久化。若旧礼物行原本是神秘人或特别关注，后到的普通高质量身份可能把它改成普通礼物，因此同一消息既不进入神秘人统计，也不显示特别关注 tag。
- 前端补充发现：`apps/web/src/App.tsx` 的 `MysteryPopupApp` 与主窗口 SSE 刷新触发只检查顶层 `row.userName/userId/userLink`，未检查 `payloadJson.userName/userId/userLink`；同 `uniqueKey` 礼物替换 `shouldReplaceDisplayItem()` 只看 ID/link 分数是否提高，不看“普通变神秘”或“未命中特别关注变命中”的语义变化。因此即使服务端仍保留部分 payload 身份，也可能出现刷新不及时或旧行未替换。
- 涉及文件：`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/web/src/App.tsx`、`docs/subagent-progress.md`。
- 风险：`V26.5.28.0` 的礼物 tag 回填修复与神秘人/特别关注隔离规则存在冲突；继续使用该版本可能造成少量礼物事件被普通身份覆盖。Excel 下载链路与本次神秘人丢失无直接关系。
- 下一步：修复时应优先保护身份语义：禁止用非神秘 candidate 覆盖已识别为神秘人的 target；禁止用非特别关注身份覆盖已命中特别关注的身份；payload 合并改为保守补缺而不是整体覆盖；前端神秘人刷新条件补充 payload 身份检查；同 `uniqueKey` 替换条件补充“神秘人状态提升/特别关注命中提升”。修复后需要用 mock 构造同 `sourceId/gift/count` 的两条礼物事件回归：先神秘人或特别关注，后普通高质量身份，确认不会再丢失。

### 2026-05-28 21:25 - 主 Agent + Subagent - V26.5.28.0 神秘人回归修复与重打包

- 做了什么：按用户要求修复 `V26.5.28.0` 神秘人/特别关注丢失回归，并重新打包安装包。主 Agent 负责服务端礼物身份合并保护、回归脚本、统一验证和打包；前端 Worker 负责 `apps/web/src/App.tsx` 的 payload 神秘人识别、SSE 刷新触发和同 `uniqueKey` 替换逻辑。
- 进度：已完成代码修改、回归脚本、构建验证、安装包重打包和本文档同步。
- 目的：保留 `V26.5.28.0` 的 Excel 浏览器下载与礼物后到身份回填能力，同时避免后到普通高质量身份把旧礼物行中的神秘人/特别关注语义覆盖掉。
- Subagent 分工：前端 Worker `019e6eba-3fad-77d2-af95-4fc2410a300e` 负责 `apps/web/src/App.tsx`，并独立运行 `npm --workspace apps/web run build` 通过。
- 结果：`apps/server/src/capture-service.ts` 的礼物身份分数加入神秘人语义加权；`mergeGiftIdentityIntoEvent()` 改为保守合并，已有 target 身份优先，只在不冲突时用 candidate 补齐稳定 `userId/userLink`，并禁止普通 candidate 擦掉 target 中已存在的神秘人身份；payload 的 `userName/userId/userLink/text/rawText` 改为保护旧身份和旧文本优先。`apps/web/src/App.tsx` 新增 payload-aware 神秘人 helper，`MysteryPopupApp` 与主窗口 SSE 刷新触发改为同时检查顶层和 payload 身份，同 `uniqueKey` 礼物候选从普通变神秘或神秘身份更完整时允许替换旧行。
- 涉及文件：`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-gift-identity.mjs`、`apps/web/src/App.tsx`、`apps/web/scripts/regression-mystery-refresh.mjs`、`apps/desktop/release/糖三角-V26.5.28.0-安装包.exe`、`docs/subagent-progress.md`。
- 验证：先新增 `apps/server/scripts/regression-gift-identity.mjs` 并确认旧逻辑失败，失败点为“ordinary later identity must not erase mystery identity”；修复后 `node --import tsx apps\server\scripts\regression-gift-identity.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过；`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；`node --check apps/desktop/main.mjs` 通过；`npm run desktop:pack:fast` 通过，命令内含 server build、web build、`prepare-native`、`prepare-runtime`、NSIS 打包和安装包重命名；release 目录检查后仅剩最终安装包，未发现 `win-unpacked` 或 `builder-debug.yml` 临时产物。
- 产物：`apps/desktop/release/糖三角-V26.5.28.0-安装包.exe`，大小 76,923,989 字节，SHA256 `020F03D1D89841DE5B6338FAAB7B6BE9DCD58532C7E236D17093FD9E3BCE93FC`。文件名仍为 `V26.5.28.0`，但哈希已不同于 19:17 旧包 `4E626E6C4679E5D93A248B6E95CF767AC790F162E248A7DB7B89293BDB867A0D`，本条哈希对应修复后的重打包产物。
- 风险：本次通过 mock 回归和构建验证，没有实际安装运行，也未在真实直播间复测神秘人/特别关注；特别关注仍坚持只按稳定 ID/link 命中，不使用昵称兜底。当前目录不是 Git 仓库，版本回滚主要依赖本文档记录的安装包路径、大小、SHA256 和源码文件变更记录。
- 下一步：安装本条新哈希对应的 `V26.5.28.0` 包后，在真实直播间复测三项：神秘人礼物不丢、特别关注送礼 tag 不丢、Excel 导出仍走 Electron/Chromium 下载。

### 2026-05-28 21:39 - 主 Agent - V26.5.28.1 版本号纠正与打包

- 做了什么：响应用户指出“版本号咋没变”，修正上一条神秘人回归修复包仍命名 `V26.5.28.0` 的问题，将软件内版本日志顶部新增 `V26.5.28.1` 并重新打包。
- 进度：已完成版本号修正、回归验证、构建验证、安装包重打包和本文档同步。
- 目的：保证每次可发布修复都有独立版本号，满足后续按版本识别和回滚的要求。
- 结果：确认 `apps/desktop/scripts/finalize-installer.cjs` 的安装包命名来自 `apps/web/src/App.tsx` 中第一个 `version: '...'`，不是来自 `package.json`；已在 `apps/web/src/App.tsx` 顶部新增 `V26.5.28.1` 版本日志，记录神秘人/特别关注丢失回归修复。
- 涉及文件：`apps/web/src/App.tsx`、`apps/desktop/release/糖三角-V26.5.28.1-安装包.exe`、`docs/subagent-progress.md`。
- 验证：`node --import tsx apps\server\scripts\regression-gift-identity.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过；`npm --workspace apps/web run build` 通过；`npm --workspace apps/server run build` 通过；`npm run desktop:pack:fast` 通过，命令内再次执行 server build、web build、`prepare-native`、`prepare-runtime`、NSIS 打包和安装包重命名；release 目录检查后仅剩 `糖三角-V26.5.28.1-安装包.exe`，未发现 `win-unpacked`、`builder-debug.yml` 或旧 `V26.5.28.0` 安装包残留。
- 产物：`apps/desktop/release/糖三角-V26.5.28.1-安装包.exe`，大小 76,923,862 字节，SHA256 `AF507DBBD45E2C0E24535288588228303C832098C5DFFFA7CA4D902DC97594AE`。
- 风险：本次仍未实际安装运行，也未在真实直播间复测；`package.json` 与各 workspace `package.json` 的 npm 包版本仍是历史 `26.5.26`，当前安装包展示和产物命名以 `App.tsx` 版本日志为准。
- 下一步：后续每次打包前必须先确认 `apps/web/src/App.tsx` 顶部版本号已递增，再执行 `desktop:pack:fast`。

### 2026-05-29 14:46 - Worker A Averroes - V26.5.29.0 Server/Electron 自动保存

- 做了什么：实现会话停止后的 Excel 自动保存链路，区分手动停止和主播下播自动停止；允许 Electron 把真实系统目录传给内嵌 server。
- 进度：DONE_WITH_CONCERNS，代码已落地并通过 worker 自测；疑虑是尚未做真实 Electron 安装包人工验收。
- 目的：主播下播自动停止时保存到“文档\糖三角\自动导出”；手动点击“停止采集”时保存到真实桌面根目录 `C:\Users\<用户名>\Desktop`。
- 结果：`apps/desktop/main.mjs` 设置 `DOUYIN_LIVE_SUITE_DOCUMENTS_DIR` 和 `DOUYIN_LIVE_SUITE_DESKTOP_DIR`；`apps/server/src/config.ts` 读取 documents/desktop 根目录；`POST /api/sessions/stop` 调用 `service.stop({ autoSave: 'manual' })`；下播检测调用 `autoSave: 'offline'`；`capture-service.ts` 新增自动保存文件名和路径解析 helper，并在保存失败时只写日志不弹窗。
- 涉及文件：`apps/desktop/main.mjs`、`apps/server/src/config.ts`、`apps/server/src/index.ts`、`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-auto-save-session.mjs`。
- 验证：worker 报告 `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` 红绿验证通过；`npm --workspace apps/server run build` 通过；`node --check apps/desktop/main.mjs` 通过。
- 风险：未在真实安装后的 Electron 窗口里验证手动停止和主播下播后文件实际落点。
- 下一步：主 Agent 做统一回归、构建和打包后，需要用户安装包内人工验收两个保存路径。

### 2026-05-29 14:46 - Worker B Wegener - V26.5.29.0 Web 会话保留与备注显示

- 做了什么：实现停止采集后的前端会话保留、备注名显示和备注参与前端搜索。
- 进度：DONE，代码已落地并通过 worker 自测。
- 目的：避免主播下播或手动停止后导出按钮失效、统计/历史事件/特别关注命中切空，减少备注消息大面积丢失；特别关注命中正文按用户决策显示 `[备注名 / 原昵称] 礼 xxx`。
- 结果：`apps/web/src/App.tsx` 新增 `lastSessionId` 保留上一场会话；停止后继续用已停止会话读取 stats/events/highlight users；开始新采集成功后清空上一场可见消息和实时命中；`buildSearchText()` 把已命中特别关注用户的 remark 纳入前端关键词搜索；`getPreferredUserDisplayName()` 在有备注时返回“备注名 / 原昵称”。
- 涉及文件：`apps/web/src/App.tsx`、`apps/web/scripts/regression-stopped-session-and-remarks.mjs`。
- 验证：worker 报告 `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过；`npm --workspace apps/web run build` 通过。
- 风险：前端保留已停止会话依赖服务端 sessionId 和历史事件接口继续可读；真实下播后的导出按钮仍需安装包内人工验收。
- 下一步：主 Agent 做统一回归、构建和打包。

### 2026-05-29 14:46 - Worker C Lagrange - V26.5.29.0 只读审查

- 做了什么：只读审查 Worker A/B 的自动保存、停止后会话保留和备注展示改动。
- 进度：DONE，未发现必须阻断的问题，未修改文件。
- 目的：检查本轮自动保存设计和特别关注备注显示是否与既有神秘人、特别关注、导出、停止采集链路冲突。
- 结果：确认手动停止、下播停止、普通退出三条 stop/shutdown 路径分离；确认备注只参与已命中行的前端展示和搜索，不改变特别关注稳定 ID/link 命中规则；确认回归脚本覆盖自动保存路径和停止会话读取。
- 涉及文件：只读检查 `apps/server/src/capture-service.ts`、`apps/server/src/index.ts`、`apps/server/src/config.ts`、`apps/desktop/main.mjs`、`apps/web/src/App.tsx`。
- 验证：worker 报告 `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` 通过；`node apps\web\scripts\regression-stopped-session-and-remarks.mjs` 通过。
- 风险：未做真实 Electron 安装包验收，特别是 `app.getPath('desktop')` 和 `app.getPath('documents')` 在用户机器上的实际返回值。
- 下一步：主 Agent 在打包前补充最终静态检查和构建验证。

### 2026-05-29 14:46 - Subagent Ampere - 桌面根目录保存路径只读验收

- 做了什么：按用户补充“放在 `C:\Users\你的用户名\Desktop`”只读核对本轮保存路径链路。
- 进度：DONE，未修改文件。
- 目的：确认手动“停止采集”保存 Excel 到真实桌面根目录，主播下播自动停止保存到“文档\糖三角\自动导出”。
- 结果：确认 Electron 启动 server 前写入 `DOUYIN_LIVE_SUITE_DOCUMENTS_DIR = app.getPath('documents')` 和 `DOUYIN_LIVE_SUITE_DESKTOP_DIR = app.getPath('desktop')`；server 配置从环境变量读取；`/api/sessions/stop` 使用 `autoSave: 'manual'`；下播自动停止使用 `autoSave: 'offline'`；`manual` 输出到 `desktopDir` 根目录，`offline` 输出到 `documentsDir\糖三角\自动导出`，保存前会递归创建目录。
- 涉及文件：只读检查 `apps/desktop/main.mjs`、`apps/server/src/config.ts`、`apps/server/src/index.ts`、`apps/server/src/capture-service.ts`。
- 验证：`node --import tsx apps\server\scripts\regression-auto-save-session.mjs` 通过，输出 `regression-auto-save-session ok`；静态 `rg` 检查命中目标链路。
- 风险：未实际启动打包后的 Electron 验证 `app.getPath('desktop')` 在目标机器上的真实路径值；代码层面已使用 Electron 系统路径，不再自选 OneDrive 或候选路径。
- 下一步：打包后安装运行，人工点击“停止采集”和等待下播自动停止确认文件落点。

### 2026-05-29 14:46 - Worker Beauvoir - 安装包历史版本回滚保护

- 做了什么：修改打包收尾脚本，避免新版本打包时清空旧版本安装包。
- 进度：DONE，代码已落地。
- 目的：满足用户“如果这个版本有问题，可以回滚到上个版本”的要求，至少在 `apps/desktop/release` 中保留历史版本安装包。
- 结果：`apps/desktop/scripts/finalize-installer.cjs` 保持把 `${productName}.exe` 重命名为 `${productName}-${versionTag}-安装包.exe`；新增基于 `productName` 的版本化安装包正则，清理 release 时保留所有 `产品名-V数字.数字.数字.数字-安装包.exe` 和对应 `.blockmap`；继续清理 `win-unpacked`、`builder-debug.yml`、未版本化 exe/blockmap 等临时产物；如果同名版本化安装包已存在，脚本报错而不是静默覆盖。
- 涉及文件：`apps/desktop/scripts/finalize-installer.cjs`。
- 验证：worker 报告 `node --check apps\desktop\scripts\finalize-installer.cjs` 通过，退出码 0。
- 风险：正则只保留 `Vx.x.x.x` 四段数字版本号；如果未来版本号格式变化，需要同步扩展匹配规则。
- 下一步：主 Agent 执行完整验证和打包，确认 release 中同时保留旧包和新包。

### 2026-05-29 14:46 - 主 Agent - V26.5.29.0 整合复核

- 做了什么：汇总本轮 subagent 结果，确认用户决策已落地：自动保存目录、手动停止桌面保存、无下载进度 UI、备注显示格式、备注参与搜索、特别关注仍只按稳定 ID/link 命中，以及历史安装包保留策略。
- 进度：代码整合完成，待最终回归、构建、打包和产物记录。
- 目的：在发布 `V26.5.29.0` 前保证本轮自动保存和备注显示修复不会重复破坏神秘人/特别关注身份隔离，也不会删除上一个可回滚安装包。
- 结果：确认 `apps/web/src/App.tsx` 顶部版本号为 `V26.5.29.0`；确认自动保存、停止会话保留、备注显示与搜索、回滚保护代码均已在当前工作区。
- 涉及文件：`apps/web/src/App.tsx`、`apps/desktop/main.mjs`、`apps/server/src/config.ts`、`apps/server/src/index.ts`、`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-auto-save-session.mjs`、`apps/web/scripts/regression-stopped-session-and-remarks.mjs`、`apps/desktop/scripts/finalize-installer.cjs`、`docs/subagent-progress.md`。
- 验证：待执行最终统一验证。
- 风险：真实直播间和真实安装包运行仍需人工验收；当前目录不是 Git 仓库，回滚主要依赖 release 安装包保留、本文档记录和 SHA256。
- 下一步：运行回归与构建；打包 `V26.5.29.0`；记录安装包路径、大小、SHA256。

### 2026-05-29 14:52 - 主 Agent - V26.5.29.0 最终验证与打包

- 做了什么：在本轮 subagent 改动和回滚保护改动合入后，执行统一回归、构建、Electron 脚本检查和 Windows 安装包打包。
- 进度：已完成最终验证、打包、产物核对和本文档同步。
- 目的：发布包含“下播/手动停止自动保存 Excel”“停止后会话保留与备注显示”“历史安装包保留回滚保护”的 `V26.5.29.0`。
- 结果：`apps/web/src/App.tsx` 顶部版本号为 `V26.5.29.0`；`npm run desktop:pack:fast` 成功生成 `糖三角-V26.5.29.0-安装包.exe`；`apps/desktop/scripts/finalize-installer.cjs` 已保留历史版本安装包，release 目录中同时存在 `V26.5.28.1` 和 `V26.5.29.0` 两个版本，未发现 `win-unpacked`、`builder-debug.yml` 或未版本化 `糖三角.exe` 残留。
- 涉及文件：`apps/desktop/release/糖三角-V26.5.29.0-安装包.exe`、`apps/desktop/release/糖三角-V26.5.28.1-安装包.exe`、`docs/subagent-progress.md`。
- 验证：`node --import tsx apps\server\scripts\regression-auto-save-session.mjs` 通过，输出 `regression-auto-save-session ok`；`node --import tsx apps\server\scripts\regression-gift-identity.mjs` 通过，输出 `gift identity regression checks passed`；`node apps\web\scripts\regression-stopped-session-and-remarks.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过；`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；`node --check apps\desktop\main.mjs` 通过；`node --check apps\desktop\scripts\finalize-installer.cjs` 通过；`npm run desktop:pack:fast` 通过，命令内含 server build、web build、`prepare-native`、`prepare-runtime`、NSIS 打包和安装包重命名。
- 产物：`apps/desktop/release/糖三角-V26.5.29.0-安装包.exe`，大小 76,927,776 字节，SHA256 `3C45A149C3F2475F20F018FE9AECB13D1E35A7CCC0DD7579ABA462D805B4B6B0`。
- 回滚保留：`apps/desktop/release/糖三角-V26.5.28.1-安装包.exe` 仍保留，大小 76,923,862 字节，SHA256 `AF507DBBD45E2C0E24535288588228303C832098C5DFFFA7CA4D902DC97594AE`。
- 风险：本次通过 mock 回归、构建和打包验证，没有实际安装运行，也未在真实直播间验证主播下播自动保存、手动停止桌面保存、备注显示和特别关注 tag；需要安装 `V26.5.29.0` 后人工验收。
- 下一步：安装 `V26.5.29.0` 后验收三项：手动停止保存到 `C:\Users\<用户名>\Desktop`；主播下播自动停止保存到“文档\糖三角\自动导出”；特别关注命中正文显示“备注名 / 原昵称”且礼物 tag 不丢。

### 2026-05-29 15:45 - Subagent Hegel - V26.5.29.0 评论丢失后端只读排查

- 做了什么：只读检查 `apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts` 中 comment 相关采集、过滤、去重、入库和 SSE 推送链路。
- 进度：DONE_WITH_CONCERNS，未修改文件。
- 目的：定位 `V26.5.29.0` 评论区丢失消息发生在采集端、服务端去重、入库还是 SSE。
- 结果：最可疑根因是服务端评论 `sourceId` 5 分钟强去重可能把同 DOM/batch/sourceId 下的不同真实评论吞掉；其次是 `bodyOnlyCommentFingerprint` 450ms 仅按正文去重会吞不同用户同一句评论；还指出采集端粗粒度去重、噪音过滤、评论误判为礼物也是次级风险。
- 涉及文件：只读检查 `apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`。
- 验证：执行静态 `rg` 和定点读取；未运行修改性命令。
- 风险：没有真实直播间原始 batch 样本，无法确认抖音当前 `sourceId` 是否逐评论唯一；建议后续如仍复现，记录 `raw.sourceId/rawText/text/userName/userId/userLink/category`。
- 下一步：用 mock 回归证明同 `sourceId` 不同评论、不同用户同正文不应被吞，再修复服务端去重。

### 2026-05-29 15:45 - Subagent James - V26.5.29.0 评论丢失前端只读排查

- 做了什么：只读检查 `apps/web/src/App.tsx` 中 SSE 接收、清屏、会话保留、前端队列、展示去重、倒计时噪音过滤和关键词聚焦逻辑。
- 进度：DONE_WITH_CONCERNS，未修改源码；运行 web build 会刷新 `apps/web/dist`。
- 目的：判断后端已有评论但前端不显示的路径。
- 结果：最可疑根因是 SSE 出错后只轮询 runtime/stats，不补拉 `/api/events`；其次是 `clearedAt` 作为 SSE effect 依赖会导致清屏时重建 EventSource，cleanup 调用 `clearIncomingQueue()` 可能丢未 flush 评论；展示层去重也会按正文/身份/时间窗隐藏后端已有评论。
- 涉及文件：只读检查 `apps/web/src/App.tsx`。
- 验证：`npm --workspace apps/web run build` 通过。
- 风险：未接入真实浏览器 Network 日志，无法确认丢失时是否发生 SSE 中断或队列溢出。
- 下一步：新增前端回归覆盖“清屏不重建 SSE”和“SSE error 后补拉事件”，再修复。

### 2026-05-29 15:45 - Worker Mill - V26.5.29.1 后端评论去重修复

- 做了什么：修复服务端评论去重过重导致真实评论被吞的问题。
- 进度：DONE，代码已落地并通过 worker 自测；主 Agent 后续做了二次收敛。
- 目的：避免 `V26.5.29.0` 中同 `sourceId` 不同评论、不同用户同正文评论被误判为重复。
- 结果：评论 `sourceId` 不再单独形成 5 分钟强去重键；主 Agent 二次收敛为评论 source 指纹必须包含 `sourceId + userKey + messageKey`，保留同源同用户同正文重扫防护；`bodyOnlyCommentFingerprint` 改为包含评论身份和正文，不再跨不同用户按纯正文吞消息；同一用户/同一身份短窗口内重复同一句仍会被抑制。
- 涉及文件：`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-comment-loss.mjs`。
- 验证：worker 报告 `node --import tsx apps\server\scripts\regression-comment-loss.mjs` 通过；`node --import tsx apps\server\scripts\regression-gift-identity.mjs` 通过。主 Agent 复跑上述两项也通过。
- 风险：如果抖音源消息完全没有稳定 `userKey/messageKey`，仍可能依赖短窗口普通指纹；真实直播间仍需验证旧评论重扫不会明显重复。
- 下一步：与前端修复一起统一构建验证。

### 2026-05-29 15:45 - Worker Heisenberg - V26.5.29.1 前端评论显示回填修复

- 做了什么：修复前端评论已入库但 UI 漏显示的两个路径。
- 进度：DONE，代码已落地并通过 worker 自测。
- 目的：避免清屏导致 SSE 重建丢未 flush 评论；避免 SSE 中断后只刷新 stats/runtime 而不补拉历史事件。
- 结果：主 SSE effect 依赖从 `[clearedAt]` 改为 `[]`，清屏不再重建 EventSource；`stream.onerror` 触发 `loadDashboard({ includeEvents: true })`，可回填后端已入库但前端漏收的评论；前端评论展示去重删除“不同用户短时间同正文”也会被压掉的分支，保留同身份同正文短窗口抑制。
- 涉及文件：`apps/web/src/App.tsx`、`apps/web/scripts/regression-comment-display-loss.mjs`。
- 验证：worker 报告 `node apps\web\scripts\regression-comment-display-loss.mjs` 通过；`node apps\web\scripts\regression-stopped-session-and-remarks.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过。主 Agent 复跑上述三项也通过。
- 风险：如果真实丢失发生在采集端浏览器脚本 `push()` 之前，本次前端回填不能恢复未入库数据；仍需真实直播间观察。
- 下一步：与后端修复一起统一构建验证。

### 2026-05-29 15:45 - 主 Agent - V26.5.29.1 评论丢失修复整合验证

- 做了什么：按系统化调试流程新增失败回归，确认 `V26.5.29.0` 评论丢失有两条可复现路径：后端去重过重和前端 SSE/展示层漏回填；整合 worker 修复并递增版本日志到 `V26.5.29.1`。
- 进度：代码修复、回归脚本、版本日志、构建验证和本文档同步已完成；尚未打包。
- 目的：修复评论区真实消息丢失，同时保留必要的重复噪音抑制和 `V26.5.29.0` 的自动保存/备注显示能力。
- 结果：`apps/server/src/capture-service.ts` 的评论 source 去重改为 `sourceId + userKey + messageKey` 组合，不再仅凭 sourceId 吞不同评论；评论 body 去重带上身份；`apps/web/src/App.tsx` 清屏不重建 SSE，SSE 出错后补拉事件；顶部版本日志新增 `V26.5.29.1`。
- 涉及文件：`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-comment-loss.mjs`、`apps/web/src/App.tsx`、`apps/web/scripts/regression-comment-display-loss.mjs`、`apps/web/scripts/regression-stopped-session-and-remarks.mjs`、`docs/subagent-progress.md`。
- 验证：修复前 `node --import tsx apps\server\scripts\regression-comment-loss.mjs` 失败于“same sourceId must not hide a different real comment”；修复前 `node apps\web\scripts\regression-comment-display-loss.mjs` 失败于“SSE stream effect must not be recreated just because clearedAt changed”。修复后 `node --import tsx apps\server\scripts\regression-comment-loss.mjs` 通过；`node --import tsx apps\server\scripts\regression-gift-identity.mjs` 通过；`node apps\web\scripts\regression-comment-display-loss.mjs` 通过；`node apps\web\scripts\regression-stopped-session-and-remarks.mjs` 通过；`node apps\web\scripts\regression-mystery-refresh.mjs` 通过；`node --import tsx apps\server\scripts\regression-auto-save-session.mjs` 通过；`npm --workspace apps/server run build` 通过；`npm --workspace apps/web run build` 通过；`node --check apps\desktop\main.mjs` 通过。
- 风险：没有真实直播间原始数据样本，无法覆盖采集端浏览器脚本在进入服务端前的所有误过滤路径；当前尚未生成 `V26.5.29.1` 安装包。
- 下一步：如需发布，执行 `npm run desktop:pack:fast` 打包 `V26.5.29.1`，并记录产物大小和 SHA256；安装后重点验收评论不丢、旧评论不明显重复、SSE 中断后是否回填。

### 2026-05-29 15:47 - Subagent Godel - V26.5.29.1 发布前只读审核

- 做了什么：只读核对 `V26.5.29.1` 打包前版本日志、历史安装包保留脚本和 release 目录状态；未执行打包，未修改文件。
- 进度：DONE，只读审核完成。
- 目的：在主 Agent 打包前确认版本号、回滚包保留策略和发布风险，防止重复覆盖同名版本包。
- 结果：确认 `apps/web/src/App.tsx` 的 `VERSION_LOGS` 第一项为 `V26.5.29.1`；确认 `apps/desktop/scripts/finalize-installer.cjs` 保留 `产品名-Vx.x.x.x-安装包.exe` 及对应 blockmap，并在同版本目标已存在时抛错，不静默覆盖；打包前 release 目录只有 `V26.5.28.1` 和 `V26.5.29.0` 两个历史安装包，尚无 `V26.5.29.1`。
- 涉及文件：`apps/web/src/App.tsx`、`apps/desktop/scripts/finalize-installer.cjs`、`apps/desktop/release/`。
- 风险：历史包保留正则只支持四段数字版本号；本次只读审核没有覆盖真实直播间和真实安装后 Electron 行为。
- 下一步：主 Agent 执行 `npm run desktop:pack:fast`，并记录 `V26.5.29.1` 安装包路径、大小、SHA256 和历史包保留状态。

### 2026-05-29 15:47 - 主 Agent - V26.5.29.1 打包

- 做了什么：按用户要求将已验证的 `V26.5.29.1` 评论丢失修复版执行 Windows NSIS 安装包打包，并核对历史包保留和临时产物清理状态。
- 进度：已完成打包、产物核对和本文档同步。
- 目的：发布包含 `V26.5.29.1` 评论不丢修复的安装包，并保留 `V26.5.28.1` 和 `V26.5.29.0` 作为可回滚包。
- 结果：`npm run desktop:pack:fast` 通过，命令内含 server build、web build、`prepare-native`、`prepare-runtime`、NSIS 打包和 `finalize-installer.cjs` 收尾重命名；生成 `apps/desktop/release/糖三角-V26.5.29.1-安装包.exe`，大小 76,927,293 字节，SHA256 `CC9C58C9CA0E3BEC53C1F7F4329499E530532DA99A00D415D62A6A85F1CC4637`。
- 回滚保留：release 目录同时保留 `糖三角-V26.5.28.1-安装包.exe`（76,923,862 字节）和 `糖三角-V26.5.29.0-安装包.exe`（76,927,776 字节）；未发现 `win-unpacked`、`builder-debug.yml` 或未版本化 `糖三角.exe` 残留。
- 涉及文件：`apps/desktop/release/糖三角-V26.5.29.1-安装包.exe`、`apps/desktop/release/糖三角-V26.5.28.1-安装包.exe`、`apps/desktop/release/糖三角-V26.5.29.0-安装包.exe`、`docs/subagent-progress.md`。
- 验证：`npm run desktop:pack:fast` 退出码 0；`Get-FileHash -Algorithm SHA256` 已计算 `V26.5.29.1` SHA256；`Test-Path` 确认 `win-unpacked`、`builder-debug.yml`、`糖三角.exe` 均不存在。
- 风险：本次打包验证覆盖构建、脚本和产物，不等于真实直播间和安装后人工验收；安装后仍需重点验证评论不丢、旧评论不明显重复、SSE 中断后回填，以及下播/手动停止 Excel 保存路径。
- 下一步：安装 `V26.5.29.1` 后在真实直播间人工验收评论区是否还有丢消息；如出现新问题，优先抓取服务端入库事件数量、SSE Network 中断情况和采集端 push 前原始样本。

### 2026-05-29 16:20 - Subagent Darwin - V26.5.29.1 采集端评论丢失只读调查

- 做了什么：只读检查 `apps/server/src/collector.ts` 的页面注入、DOM/React payload 解析、分类、过滤、去重、batch push 链路，并对照 V26.5.29.1 回归脚本与日志开关；未修改文件。
- 进度：DONE_WITH_CONCERNS。
- 目的：判断评论是否可能在进入服务端 `onEvents` 前已经被采集端吞掉。
- 结果：采集端存在多处 push 前丢失边界：chat root selector 变更或虚拟列表高峰可能漏扫；`visibleText` 为空、`skip(text)`、文本长度、统计面板、倒计时、冒号过多等会早退；真实评论如果被 `classify()` 判成 gift，`digestElement()` 会直接 return；不在 chat root 内且无冒号/userLink 的评论会被当作噪音；`reactDataCache` 和 `digestedElements` 按 HTMLElement 缓存，虚拟列表复用元素时可能影响新评论；`push()` 还有 320ms exact 和 900ms coarse 去重，同 pending coarseSignature 的 equal-quality payload 可能被吞；`flush()` 调 `__douyinCollectorBatch` 失败时会吞 batch；Node binding 归一化后 `.filter(item.text)` 也可能丢 `rawText` 有值但 `text` 为空的样本。
- 涉及文件：`apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/scripts/regression-comment-loss.mjs`、`apps/web/scripts/regression-comment-display-loss.mjs`。
- 验证：只读调查，未运行修改性命令。
- 风险：没有真实直播间原始 DOM/batch 样本，不能断言根因；采集端诊断会包含评论正文和用户 ID/link，必须限时、限量、可开关。
- 下一步：加最小诊断采样，比较“页面 digest 看到的评论数”“push queued 数”“binding 收到数”“服务端 onEvents 数”，再决定是否收窄具体过滤或去重规则。

### 2026-05-29 16:20 - Subagent Turing - V26.5.29.1 后端评论丢失边界只读调查

- 做了什么：只读检查 `apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/server/src/index.ts`、`apps/server/scripts/regression-comment-loss.mjs`，沿 `raw -> normalize/filter -> dedupe -> insert -> EventBus/SSE -> /api/events` 梳理仍可能丢评论的边界；未修改文件。
- 进度：DONE_WITH_CONCERNS。
- 目的：判断 V26.5.29.1 后端是否仍可能在入库、去重、SSE 推送或 API 补拉边界丢评论。
- 结果：仍可能丢失的后端路径包括：`persistCollectorEvents` 开头 session mismatch 直接 return，fatal finalize 可能让排队 raw 执行时 session 不匹配；`shouldIgnoreCollectorEvent` 会过滤倒计时、主播数字倒计时、profileId 倒计时、统计面板文本；身份缺失/解析错误时 `userKey` 可能退化为空或同名，导致同正文短窗口误杀；`events.unique_key` 唯一且 `INSERT OR IGNORE` 不返回实际 inserted count，可能出现 SSE 推了但 DB/API/导出没有；SSE 每连接只有内存 `pendingEvents`，超过 400 会裁旧事件，`reply.raw.write()` 返回 false 未等待 drain，断线无 replay；`/api/events` 无 cursor/afterId，前端默认只拉 80 条，断线或队列溢出超过窗口时无法完整补齐。
- 涉及文件：`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/server/src/index.ts`、`apps/server/src/event-bus.ts`、`apps/server/src/utils.ts`、`apps/server/src/collector.ts`、`apps/server/scripts/regression-comment-loss.mjs`、`apps/web/src/api.ts`。
- 验证：只读调查，未运行修改性命令。
- 风险：后端目前缺少实际 inserted count、dedupe reason、SSE write/trim 指标，真实现场只能靠推断；`/api/events` 无 cursor，不能作为完整恢复通道。
- 下一步：先加临时诊断 counters/ring buffer，不先改去重策略；真实复现时抓 raw_received、ignored/deduped、db_inserted、sse_sent、api_visible 五段证据。

### 2026-05-29 16:20 - Subagent Curie - V26.5.29.1 前端显示层只读调查

- 做了什么：只读检查 `apps/web/src/App.tsx`、`apps/web/scripts/regression-comment-display-loss.mjs`，重点追踪 EventSource、incoming queue、清屏、visible events、评论展示去重、关键词聚焦、折叠列表和数量限制。
- 进度：DONE_WITH_CONCERNS。
- 目的：判断后端已入库或 SSE 已推送时，评论仍可能在前端显示层丢失的具体路径。
- 结果：仍可能不显示的路径包括：`enqueueStreamRows()` 和历史回填都会丢 `createdAt < clearedAt` 的行，清屏时间与服务端时间偏差可能误过滤；`isLiveConnectCountdownNoise()` 在入队、flush、历史 normalize 三处过滤评论；展示去重仍可能因身份字段错误复用、`rawText` 完全一样、payload 前缀解析异常而误判重复；评论 incoming queue 上限为 `EVENT_LIMITS.comment * 6 = 720`，窗口移动期间 deferred message 240 条、deferred rows 1200 条，高流量或长时间拖动窗口可能丢已收到事件；最终展示只保留最近 `EVENT_LIMITS.comment = 120` 条；SSE error 后补拉默认只有 80 条，断线期间超过 80 条会天然有缺口；session 消息切换会清空队列和事件；折叠状态下列表不可见且 flush 延迟。
- 涉及文件：`apps/web/src/App.tsx`、`apps/web/src/api.ts`、`apps/web/src/styles.css`、`apps/web/src/types.ts`、`apps/web/scripts/regression-comment-display-loss.mjs`。
- 验证：Subagent 运行 `node apps/web/scripts/regression-comment-display-loss.mjs` 通过。
- 风险：现有前端回归偏静态，不能证明高流量、断线、清屏边界和队列溢出场景安全；多处过滤/去重没有可观测原因码。
- 下一步：先加只在诊断模式启用的前端 debug counters/reason logs，不改业务行为；新增模拟回归覆盖清屏边界、队列溢出、断线 80+ 评论回填、window moving deferred、倒计时误判、同 rawText 不同用户。

### 2026-05-29 16:20 - 主 Agent - V26.5.29.1 仍丢评论诊断计划

- 做了什么：接到用户反馈 `V26.5.29.1` 真实直播间仍存在评论区丢失后，按系统化调试流程分派 Darwin/Turing/Curie 三个只读 subagent，并本地只读复核评论采集、后端入库/SSE、前端显示和现有回归脚本覆盖范围。
- 进度：诊断计划已完成，尚未修改业务代码。
- 目的：避免继续猜修去重规则，先建立跨层证据链，区分丢失发生在采集端 push 前、服务端过滤/去重/入库、SSE/API 回填还是前端显示层。
- 结果：新增计划文档 `docs/superpowers/plans/2026-05-29-comment-loss-diagnostics.md`。计划建议下一版优先做 `V26.5.29.2` 诊断版：给每条评论生成跨层 `diagId`；采集端记录 `digest/push/flush/binding` 原因码；服务端记录 raw_received、ignored/deduped、row_built、db attempted/inserted/ignored、bus publish；SSE 记录 queue/flush/write_false/trim；前端记录 SSE 收到数、clearedAt/noise/queue overflow/display dedupe、DOM 行数；同时把 SSE error 评论回填从默认 80 条扩大到 1000 条。
- 涉及文件：计划涉及 `apps/server/src/comment-diagnostics.ts`、`apps/server/src/collector.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/db.ts`、`apps/server/src/index.ts`、`apps/web/src/api.ts`、`apps/web/src/App.tsx`、`apps/server/scripts/regression-comment-diagnostics.mjs`、`apps/web/scripts/regression-comment-display-diagnostics.mjs`、`docs/subagent-progress.md`。
- 验证：本轮只读复核确认当前目录不是 Git 仓库；确认 `apps/desktop/release/糖三角-V26.5.29.1-安装包.exe` 仍存在，大小 76,927,293 字节；未执行构建或打包。
- 风险：诊断版会暴露最近评论正文和用户 ID/link 到本地诊断接口/剪贴板，必须限制 ring buffer 大小并只用于复现；如果用户需要立即普通修复，仍缺真实样本支撑。
- 下一步：按计划实现诊断版并跑回归；真实直播间复现时用 `/api/diagnostics/comment-flow` 和前端“复制诊断”输出判断断点，再决定最终业务修复。
### 2026-05-29 16:35 - Worker Noether - V26.5.29.2 服务端评论诊断核心

- 做了什么：实现服务端诊断核心最小闭环，新增 `commentDiagnostics` 单例、`diagId` 构造、counters、recent ring buffer 和 reset；让 `db.insertEvents()` 返回 `attempted/inserted/ignored/insertedKeys`；在服务端 `onEvents/persist/filter/dedupe/row/db/bus` 与 SSE queue/flush/write/trim 边界记录 counters 和最近决策；新增本地诊断接口和轻量回归脚本。
- 进度：DONE。
- 目的：先定位评论丢失发生在服务端过滤/去重/入库、SSE 队列/写入，还是 API 可见性边界，不继续猜测业务去重策略。
- 结果：`/api/diagnostics/comment-flow` 返回 counters 和 recent，`/api/diagnostics/comment-flow/reset` 可清空诊断状态，`/api/diagnostics/events` 可按 session/category/limit 只读检查入库事件；`insertEvents()` 保留 `INSERT OR IGNORE` 和原剪裁行为，同时暴露实际插入结果；SSE 增加 `sse.event_seen/sse.queue/sse.queue_trimmed/sse.flushed_events/sse.write_false/sse.closed_before_queue`。
- 涉及文件：`apps/server/src/comment-diagnostics.ts`、`apps/server/src/db.ts`、`apps/server/src/capture-service.ts`、`apps/server/src/index.ts`、`apps/server/scripts/regression-comment-diagnostics.mjs`、`docs/subagent-progress.md`。
- 验证：`node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` 通过，输出 `comment diagnostics regression checks passed`；`node --import tsx apps\server\scripts\regression-comment-loss.mjs` 通过，输出 `comment loss regression checks passed`；`npm --workspace apps/server run build` 通过，`tsc -p tsconfig.json` 退出码 0。
- 风险：本轮未接入 collector 页内 digest/push/flush 诊断，也未实现前端复制诊断按钮；recent ring buffer 会在本地诊断接口暴露最近评论正文和用户 ID/link，已限制为内存 800 条且正文裁剪，但真实复现时仍应只在本机短期使用。诊断脚本为了避免当前 `better-sqlite3` Electron ABI 与 Node ABI 冲突，对 DB 返回形态做静态/轻量验证，没有实例化真实 SQLite。
- 下一步：由 collector/frontend 诊断 worker 补齐采集端和显示层 counters 后，在真实直播间复现时同时采集 `/api/diagnostics/comment-flow` 与前端复制诊断输出。

### 2026-05-29 16:45 - Main Agent - V26.5.29.2 collector/frontend diagnostic integration

- What changed: continued the V26.5.29.2 diagnostic build after the server worker. Added collector-side diagnostics in `apps/server/src/collector.ts`: Node binding counters for payload batches/items/comment rows/empty-text filtering; exposed `__douyinCollectorDiag`; added page-side `diag()` reason codes for `digest.empty_text`, `digest.skip_text`, `digest.classified_gift_return`, `digest.comment_countdown_noise`, `digest.too_many_colons_without_payload`, `digest.outside_chat_no_colon`, `digest.same_element_fingerprint`, `push.exact_dedupe`, `push.pending_coarse_replaced`, `push.pending_coarse_dropped`, `push.previous_coarse_dropped`, `push.queued`, `flush.batch_sent`, and `flush.batch_failed`.
- Progress: code changes for collector, frontend regression script, and comment-specific server counters are complete; full verification and packaging are still pending.
- Purpose: locate real-room comment loss before guessing another business-rule change, especially whether the row disappears before service `onEvents`, during service filter/dedupe/DB insert, in SSE queue/flush, or in frontend queue/display.
- Result: kept existing collector decisions, windows, dedupe thresholds, special-follow rules, and Excel save rules unchanged. Added comment-specific DB counters `db.comment_attempted/db.comment_inserted/db.comment_ignored_unique` in `apps/server/src/capture-service.ts`, and comment-specific SSE counters `sse.comment_event_seen/sse.comment_queue/sse.comment_flushed_events/sse.comment_queue_trimmed` in `apps/server/src/index.ts` so comment counts can be reconciled without gift/entry/interaction noise.
- Files: `apps/server/src/collector.ts`, `apps/server/src/capture-service.ts`, `apps/server/src/index.ts`, `apps/server/scripts/regression-comment-diagnostics.mjs`, `apps/web/scripts/regression-comment-display-diagnostics.mjs`, `apps/web/src/App.tsx`.
- Verification so far: `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` passed; `node apps\web\scripts\regression-comment-display-diagnostics.mjs` passed; `npm --workspace apps/server run build` passed.
- Subagent conclusion: Leibniz completed a read-only review with `DONE_WITH_CONCERNS`. Confirmed `V26.5.29.2` version log, frontend diagnostics ref, copy diagnostics action, SSE effect dependency `[]`, and 1000-comment backfill exist. Flagged the web diagnostics regression script matching garbled text instead of `复制诊断`; fixed it. Flagged DB/SSE counters mixed all event categories; added comment-specific counters. Noted the web diagnostics regression is still mainly static coverage rather than a full browser behavior simulation.
- Risk: `commentDiagnostics` recent ring buffer exposes local recent comment text/user fields through the local diagnostics endpoint and clipboard JSON; it remains memory-only, capped at 800 recent decisions, with long text trimmed. Current `apps/desktop/release` in this workspace only shows `糖三角-V26.5.29.1-安装包.exe`; expected rollback packages `V26.5.28.1` and `V26.5.29.0` were not present during the 16:45 check and must be considered before release.
- Next step: run the full planned verification suite, then package `V26.5.29.2` only after all checks pass and record installer path/size/SHA256 plus release directory rollback status.

### 2026-05-29 17:03 - Main Agent - V26.5.29.2 verification and package

- What changed: completed the V26.5.29.2 diagnostic build and Windows installer packaging after collector/server/frontend diagnostics were integrated.
- Progress: DONE. Code changes, regression verification, build verification, packaging, installer hash, and release directory audit are complete.
- Purpose: provide an installable build that can diagnose the remaining real-room comment loss across collector digest/push/flush/binding, service filter/dedupe/DB/bus, SSE queue/flush, API backfill, and frontend queue/display/DOM.
- Result: generated installer `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.2-安装包.exe`; size 76,931,102 bytes; SHA256 `D09D328AEE7A9DB841B0E9F9F6D319EC9E5566313C13B3835C92220E2AC11E5B`.
- Release directory audit: current workspace release directory contains `糖三角-V26.5.29.1-安装包.exe` (76,927,293 bytes) and `糖三角-V26.5.29.2-安装包.exe` (76,931,102 bytes). Expected older rollback packages `糖三角-V26.5.28.1-安装包.exe` and `糖三角-V26.5.29.0-安装包.exe` were not present in the current release directory during this final audit. `win-unpacked`, `builder-debug.yml`, and unversioned `糖三角.exe` are not present.
- Verification passed:
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `npm --workspace apps/server run build` -> passed, `tsc -p tsconfig.json` exit code 0
  - `npm --workspace apps/web run build` -> passed, `tsc -b && vite build` exit code 0
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `npm run desktop:pack:fast` -> passed, including server build, web build, `better-sqlite3 ok for modules 136`, runtime preparation, Electron/NSIS packaging, and installer finalization.
- Real-room diagnostic procedure for this version: install V26.5.29.2, start a real live room, and when a Douyin comment is visible but missing in the app, immediately click `复制诊断` in the app and also open `http://127.0.0.1:3100/api/diagnostics/comment-flow`. Compare collector counters (`digest/push/flush/binding`), service counters (`service.raw_comment_received`, `service.ignored.*`, `service.deduped.*`, `db.comment_*`, `service.bus_published`), SSE counters (`sse.comment_event_seen`, `sse.comment_queue`, `sse.comment_flushed_events`, `sse.comment_queue_trimmed`, `sse.write_false`), API counters, and frontend counters (`sseCommentRows`, `skippedClearedAt`, `skippedNoise`, `queueOverflow`, `displayDuplicate`, DOM rows).
- Risk: this package is still not a substitute for real-room verification. It fixes the known insufficient SSE comment backfill window by requesting up to 1000 comments and makes the remaining loss observable, but if the comment disappears inside Douyin page parsing before collector push, the diagnostic output is needed to select the final business-rule change instead of guessing.

### 2026-05-29 18:03 - Main Agent - handoff context intake and release audit

- What changed: read the required handoff files `docs/subagent-progress.md`, `docs/subagent-sync-rules.md`, and `docs/subagent-agent-worksplit.md`; performed a read-only workspace/release audit; no business code, build config, or package artifact was changed.
- Progress: DONE.
- Purpose: accept the new-window handoff context and reconcile it with the actual current workspace before any further work.
- Result: confirmed the active directory is `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean` and it is not a Git repository. Also found a version-state mismatch: the user-provided handoff text names latest packaged version `V26.5.29.1`, while this progress ledger already contains a later `2026-05-29 17:03` record for packaged diagnostic version `V26.5.29.2`.
- Release directory audit: `apps/desktop/release` currently contains `糖三角-V26.5.29.1-安装包.exe` (76,927,293 bytes, last modified 2026-05-29 15:46:44) and `糖三角-V26.5.29.2-安装包.exe` (76,931,102 bytes, last modified 2026-05-29 17:00:44). The rollback packages named in the handoff text, `糖三角-V26.5.28.1-安装包.exe` and `糖三角-V26.5.29.0-安装包.exe`, were not present in this release directory during the audit.
- Verification: `git status --short` in the active directory returned `fatal: not a git repository (or any of the parent directories): .git`; `Get-ChildItem apps\desktop\release -Filter *.exe` returned the two installer files listed above.
- Files: `docs/subagent-progress.md`, `docs/subagent-sync-rules.md`, `docs/subagent-agent-worksplit.md`, `apps/desktop/release`.
- Risk: do not assume `V26.5.29.1` is still the latest local package unless the user explicitly wants to ignore or roll back from the recorded `V26.5.29.2` diagnostic package. Rollback coverage is weaker than the handoff text states because only `.29.1` and `.29.2` are currently visible in the active release directory.
- Next step: wait for the next concrete task; for any business fix, regression, or packaging action, continue appending conclusions and verification results to this ledger.

### 2026-06-01 11:31 - Main Agent - V26.5.29.3 安装后空白页修复与打包

- 做了什么：接到用户反馈安装新包后主窗口只显示浅色网格空白页；按系统化调试流程复核前序证据、分派只读 subagent Darwin 审查静态资源/缓存链路，并补齐渲染器启动防护、桌面端空白页诊断、服务端静态壳缓存与缺失资源回归。
- 进度：DONE。代码修复、回归验证、构建验证、安装包打包、产物核对和本文档同步已完成。
- 目的：降低升级安装后 Electron/Chromium 使用旧 `index.html` 或旧 hash asset 造成 React 未挂载、只剩背景网格的风险；同时在仍出现空白页时让 `desktop-startup.log` 能记录 renderer console、preload error 和 `#root` 状态。
- 子 agent 结论：
  - Bacon/Helmholtz 前序只读调查结论：已安装目录 `D:\糖三角\@douyin-live-suitedesktop\resources\app.asar` 仍是 `V26.5.29.1`，不是当前工作区的 `V26.5.29.2`；已安装 asar 不含 `复制诊断` 和 `comment-diagnostics.js`，当前工作区 web dist 可正常渲染，未证明普通前端 bundle 崩溃。
  - Helmholtz 还指出 `readTheme` / `readMessageFontSize` 初始渲染直接读 `localStorage.getItem()` 存在早期崩溃风险；本轮已通过统一 `readLocalStorageItem()` try/catch 防护覆盖。
  - Darwin 本轮只读审查确认：原 `apps/server/src/index.ts` 中 `@fastify/static` 无自定义缓存头，SPA fallback 裸 `reply.sendFile('index.html')`；缺失的 `/assets/old-hash.js` 会落入 `/*` fallback 返回 HTML 200，module script 因 MIME/content 不匹配失败时可表现为 React 根节点空白。
- 结果：
  - `apps/server/src/index.ts` 新增 `registerWebStaticShell()`，`index.html` 和 SPA fallback 返回 `Cache-Control: no-store, no-cache, must-revalidate`，并关闭 fallback HTML 的 `etag/lastModified/cacheControl` 自动头。
  - 已存在的 `/assets/*` 继续由静态服务返回，hash asset 显式使用 `public, max-age=31536000, immutable`；缺失的 `/assets/*` 新增 404 截断，不再 fallback 成 `index.html`。
  - `apps/server/scripts/regression-static-shell-cache.mjs` 新增真实 Fastify 注入回归，覆盖 `/` 和 SPA fallback 禁缓存、现有 JS asset 非 HTML、缺失旧 hash asset 返回 404、API route 不被 SPA fallback 吞掉。
  - `apps/web/src/App.tsx` 顶部版本日志递增到 `V26.5.29.3`；本地存储读取已统一走 try/catch，避免 `localStorage.getItem()` 异常导致初始渲染空白。
  - `apps/desktop/main.mjs` 已包含空白页诊断：记录 renderer `console-message`、`preload-error`、`dom-ready` 时的 URL/title/bodyText/root child count/root HTML length。
- 涉及文件：`apps/server/src/index.ts`、`apps/server/scripts/regression-static-shell-cache.mjs`、`apps/web/src/App.tsx`、`apps/web/scripts/regression-stopped-session-and-remarks.mjs`、`apps/web/scripts/regression-renderer-startup-guards.mjs`、`apps/desktop/main.mjs`、`apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`、`docs/subagent-progress.md`。
- 验证通过：
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed，生成 web JS `assets/index-DMYc6IUQ.js`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `npm run desktop:pack:fast` -> passed，包含 server build、web build、`better-sqlite3 ok for modules 136`、runtime preparation、Electron/NSIS packaging 和 installer finalization。
- 产物：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.3-安装包.exe`，大小 76,932,284 字节，SHA256 `CDE16C21EC411201A0967CEEB3853F1803EB9F4A8B94863F8F080EF1571F11C7`。
- 回滚保留：release 目录当前保留 `糖三角-V26.5.29.1-安装包.exe`（76,927,293 字节）、`糖三角-V26.5.29.2-安装包.exe`（76,931,102 字节）、`糖三角-V26.5.29.3-安装包.exe`（76,932,284 字节）；未发现 `win-unpacked`、`builder-debug.yml`、未版本化 `糖三角.exe` 或 `糖三角.exe.blockmap` 残留。
- 风险：本轮修复覆盖“旧 HTML/缺失 hash asset/本地存储读取异常/缺少 renderer 诊断”这些空白页路径，但没有在用户机器上完成真实覆盖安装后的人工启动验证；若安装后仍空白，优先读取 `C:\Users\85855\AppData\Roaming\糖三角\runtime\desktop-startup.log` 中的 `main console-message`、`did-fail-load`、`dom-ready rootChildCount/rootHtmlLength`。
- 下一步：安装 `V26.5.29.3` 后确认顶部版本号显示 `V26.5.29.3`；如果仍出现浅色网格空白页，立即不要反复安装，先回传 `desktop-startup.log` 最后 100 行和当前安装目录 `resources\app.asar` 的修改时间/大小。
### 2026-06-01 21:18 - Main Agent - V26.5.29.4 cross-machine blank-page cache fix

- What changed: investigated the new fact that V26.5.29.3 opens normally on the local machine but still shows the pale grid blank page on other computers after install/upgrade. Treated this as an environment/install/runtime-cache issue instead of a normal React-render issue. Added desktop startup cache defense, bumped the visible version log to `V26.5.29.4`, added regression coverage for the new risk, rebuilt and repackaged.
- Progress: DONE for code, regression checks, build, package, hash, and release audit. Real validation on an affected other computer is still required.
- Purpose: fix the credible upgrade path where another computer's Electron/Chromium HTTP cache still contains an old `index.html` for `http://127.0.0.1:3100/`; that old HTML points to an old hashed JS asset no longer present in the new package, leaving only the CSS/background grid and an empty React root.
- Subagent conclusions:
  - Anscombe: current local installation under `D:\糖三角\@douyin-live-suitedesktop` is already updated to V26.5.29.3 and its startup log shows renderer `bodyText` containing `V26.5.29.3` with `rootChildCount:1`; local success does not prove other machines are on the same installed exe/path.
  - Locke: confirmed a credible stale Electron HTTP-cache path. V26.5.29.3 server-side `no-store` only helps after Chromium requests the new `index.html`; it does not clear an already cached old HTML shell. Recommended `session.defaultSession.clearCache()` before first renderer load and a version/startup cache-busting query on the main URL. Also warned not to use broad `clearStorageData()` because it could delete localStorage/login/config state.
  - Bernoulli: confirmed the existing blank-page tests were useful but incomplete. They covered static shell headers, missing asset 404, localStorage `getItem` guards, and renderer diagnostics by source checks. They did not cover NSIS install on another machine, old Electron userData/cache, installed `app.asar` contents, real server startup, real DOM mount, or upgrade-cache smoke. Recommended package-structure smoke and upgrade-cache smoke tests.
  - A new review subagent could not be spawned because the agent thread limit had been reached; Main Agent performed the local read-only review instead.
- Result:
  - `apps/desktop/main.mjs` now imports Electron `session`, calls `session.defaultSession.clearCache()` after `app.whenReady()` and before creating/loading the main window, and logs either `renderer HTTP cache cleared` or the clear error. It only clears HTTP cache; it does not call `clearStorageData()`, does not clear localStorage, does not clear IndexedDB, and does not change user settings/login data.
  - `apps/desktop/main.mjs` now wraps both main-window load paths with `withDesktopCacheBuster(url)`, adding `desktopBoot=<appVersion>-<timestamp>` to the local renderer URL. This covers the immediate `loadURL(url)` path and the delayed `startEmbeddedServer().then(nextUrl => loadURL(nextUrl))` path.
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs` now asserts the desktop startup imports `session`, has `clearRendererHttpCache()` using `session.defaultSession.clearCache()`, has `withDesktopCacheBuster()`, and uses it for main-window `loadURL`.
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs` was added to check the prepared runtime bundle includes server entry, web `index.html`, existing referenced JS/CSS assets, and current version `V26.5.29.4` inside the JS asset.
  - `apps/web/src/App.tsx` top version log was bumped to `V26.5.29.4` with a note that the desktop app clears Electron HTTP cache and adds a startup query for the main entry.
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs` version assertion was updated to `V26.5.29.4`.
- Files: `apps/desktop/main.mjs`, `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`, `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`, `apps/web/src/App.tsx`, `apps/web/scripts/regression-stopped-session-and-remarks.mjs`, `docs/subagent-progress.md`.
- Verification passed:
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-BjEA2BVW.js` and CSS `assets/index-rxdyJc3r.css`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, `better-sqlite3 ok for modules 136`, runtime preparation, Electron/NSIS packaging, and installer finalization.
- Package: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.4-安装包.exe`; size `76,932,152` bytes; SHA256 `84718E135C69896AE458325E7B002617079F90843DFE17CC83DFAB10723B45C0`.
- Release rollback status: release directory currently keeps `糖三角-V26.5.29.1-安装包.exe` (76,927,293 bytes), `糖三角-V26.5.29.2-安装包.exe` (76,931,102 bytes), `糖三角-V26.5.29.3-安装包.exe` (76,932,284 bytes), and `糖三角-V26.5.29.4-安装包.exe` (76,932,152 bytes). No `win-unpacked`, `builder-debug.yml`, unversioned installer exe, or blockmap residue was observed in the release listing after finalization.
- Risk: this still is not a full other-computer installation smoke test. The new fix directly addresses the most credible stale HTTP-cache path and avoids clearing user data, but if another computer is launching a different installed exe, has an install path mismatch, has a renderer process crash, has security software interference, or has a port/process conflict, the same blank symptom may still need the affected machine's `desktop-startup.log`.

### 2026-06-02 17:44 - Main Agent - V26.5.29.6 cross-machine blank-page diagnostic package

- What changed: user confirmed that V26.5.29.4 still shows the pale grid blank page on other computers, while the local machine can open normally. Treated the previous stale HTTP-cache hypothesis as insufficient and moved this round to a diagnostic package instead of another blind business fix.
- Progress: DONE for source changes, regression checks, builds, packaging, hash, release audit, local desktop-entry smoke test, and this progress record. Real validation on an affected other computer is still required.
- Purpose: make the next affected-computer report distinguish these paths: wrong/old executable or install location, server startup or port failure, JS/CSS asset load failure, renderer JavaScript crash, React root not mounting after assets loaded, or localStorage write restrictions.
- Subagent status: attempted to spawn a new read-only explorer for the V26.5.29.5/29.6 diagnostic audit, but the agent thread limit was already reached. Main Agent performed the local audit and records this as a process limitation, not a subagent conclusion.
- Result:
  - `apps/desktop/main.mjs` adds `APP_RELEASE_TAG = 'V26.5.29.6'` and logs startup identity: `releaseTag`, Electron `appVersion`, `process.execPath`, `app.getAppPath()`, `userData`, and `resourcesPath`. This is intended to prove whether the affected computer is launching the new package or an old/wrong exe.
  - `apps/desktop/main.mjs` adds renderer request diagnostics using Electron `session.defaultSession.webRequest.onCompleted/onErrorOccurred` for localhost renderer traffic, logging resource type, status, cache flag, MIME, error, and URL.
  - `apps/desktop/main.mjs` adds `runRendererAssetSelfCheck(baseUrl)` before loading the renderer. It fetches the local index and referenced `/assets/*.js` and CSS with `cache: no-store`, then logs status, MIME, length, whether the response looks like HTML, and a short head snippet.
  - `apps/desktop/main.mjs` replaces the old single `dom-ready` state dump with `inspectRendererState()` plus delayed checks at 500 ms, 2000 ms, and 5000 ms after `dom-ready` and `did-finish-load`. The log includes URL, readyState, title, body text, `rootChildCount`, `rootHtmlLength`, script/style URLs, and browser resource timing entries.
  - `apps/web/src/App.tsx` top version log is now `V26.5.29.6` dated `2026-06-02`.
  - `apps/web/src/App.tsx` adds `writeLocalStorageItem()` and routes UI preference writes through it, so restricted renderer profiles that throw on `localStorage.setItem` do not interrupt rendering.
  - `apps/desktop/package.json` remains semver `26.5.29`; visible package identity is tracked by `APP_RELEASE_TAG` and the web version log.
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs` now checks startup identity logging, request diagnostics, self-check diagnostics, delayed renderer inspections, cache clearing, and cache-busted `loadURL`.
  - `apps/web/scripts/regression-renderer-startup-guards.mjs` now allows `window.localStorage.setItem()` only inside `writeLocalStorageItem()` and rejects direct calls elsewhere.
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs` now tracks `V26.5.29.6`.
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs` now asserts both `V26.5.29.6` and package date `2026-06-02`.
- Packaging note: an earlier V26.5.29.5 installer was generated first, but after correcting the package date the bundle content changed. The finalize script correctly refused to overwrite the existing `糖三角-V26.5.29.5-安装包.exe`; to preserve rollback clarity and avoid same-version different-content packages, the final diagnostic package was incremented to `V26.5.29.6`.
- Files: `apps/desktop/main.mjs`, `apps/desktop/package.json`, `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`, `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`, `apps/web/src/App.tsx`, `apps/web/scripts/regression-renderer-startup-guards.mjs`, `apps/web/scripts/regression-stopped-session-and-remarks.mjs`, `docs/subagent-progress.md`.
- Verification passed:
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-mr1ujjX-.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm run desktop:pack:fast` -> passed, including server build, web build, `better-sqlite3 ok for modules 136`, runtime preparation, Electron/NSIS packaging, and installer finalization.
- Local smoke test: launched the desktop Electron entry from `apps/desktop` for about 10 seconds, then stopped only the workspace Electron processes. The startup log showed `releaseTag=V26.5.29.6`, `appVersion=26.5.29`, `serverUrl=http://127.0.0.1:3100`, self-check asset `index-mr1ujjX-.js` status 200 with JavaScript MIME, CSS status 200 with CSS MIME, renderer requests for mainFrame/script/stylesheet status 200, and `main renderer-inspect` with `bodyText` containing `V26.5.29.6` and `rootChildCount=1`. This is a local development-entry smoke only, not a substitute for affected-computer install validation.
- Package: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.6-安装包.exe`; size `76,933,898` bytes; SHA256 `773A177D6261092314EC6EE5783BD759631D61C20D68D8E04F57B50B62CC11F3`.
- Release rollback status: release directory currently keeps `糖三角-V26.5.29.1-安装包.exe` (76,927,293 bytes), `糖三角-V26.5.29.2-安装包.exe` (76,931,102 bytes), `糖三角-V26.5.29.3-安装包.exe` (76,932,284 bytes), `糖三角-V26.5.29.4-安装包.exe` (76,932,152 bytes), `糖三角-V26.5.29.5-安装包.exe` (76,933,297 bytes), and `糖三角-V26.5.29.6-安装包.exe` (76,933,898 bytes). No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or blockmap residue was observed after finalization.
- Risk: V26.5.29.6 is primarily a diagnostic package plus localStorage write hardening. It does not prove the other-computer blank page is fixed. If an affected computer still opens to the pale grid, the `desktop-startup.log` from that machine should now show which component failed.
- Next step for affected computers: install V26.5.29.6 and collect `C:\Users\<user>\AppData\Roaming\糖三角\runtime\desktop-startup.log` immediately after the blank page appears. The critical lines are `releaseTag=V26.5.29.6`, `appVersion=26.5.29`, `execPath=...`, `appPath=...`, `resourcesPath=...`, `serverUrl=...`, `renderer self-check index...`, `renderer self-check asset...`, `renderer request completed/error...`, `main console-message...`, `main renderer-inspect...`, and any `startup error`, `did-fail-load`, `preload-error`, or `render-process-gone`.
- Supersession note: any older V26.5.29.4 next-step line below is historical only; use the V26.5.29.6 diagnostic package and log checklist above.
- Next step: install `V26.5.29.4` on an affected other computer. On first launch, check `C:\Users\<user>\AppData\Roaming\糖三角\runtime\desktop-startup.log` for `renderer HTTP cache cleared`, `serverUrl=...`, and `main dom-ready` with `rootChildCount` greater than 0 and `bodyText` containing `V26.5.29.4`. If it still shows the pale grid, collect that log plus the actual launched `糖三角.exe` path and installed `resources\app.asar` size/time.

### 2026-06-02 21:10 - Main Agent - V26.5.29.7 browser capture blank-page fix

- What changed: investigated the user-provided affected-computer startup log for the clarified symptom: after clicking login/start capture, the Douyin browser page spins and then blanks. The log proved that V26.5.29.6 main renderer loaded correctly, JS/CSS assets were 200, and React root mounted; the failure moved to the click-time browser/login/capture path.
- Progress: code fix and regression verification are done; packaging is about to run and package metadata will be appended after the installer is generated.
- Purpose: fix two observed failure paths after interaction: React production error #440 in the main renderer and stale/crashed Playwright login browser contexts causing `/api/browser/state` 500 plus login reuse failure.
- Subagent status: attempted to spawn a new read-only explorer for the browser/login/capture chain, but the agent thread limit was reached. Main Agent performed the investigation locally and records this as a process limitation, not a subagent conclusion.
- Evidence from user log:
  - Installed app was current diagnostic package: `releaseTag=V26.5.29.6`, `appVersion=26.5.29`, `execPath=D:\糖三角\@douyin-live-suitedesktop\糖三角.exe`, `appPath=D:\糖三角\@douyin-live-suitedesktop\resources\app.asar`.
  - Static shell and assets loaded: index 200, JS `assets/index-mr1ujjX-.js` 200, CSS 200, `rootChildCount=1`, body text included `V26.5.29.6`.
  - Before the click failure, the renderer logged `Uncaught Error: Minified React error #440`; React's development message for this code is that a function wrapped in `useEffectEvent` cannot be called during rendering.
  - After interaction, `/api/browser/login` returned 409 and `/api/browser/state` returned 500 twice, then the app window closed and the SSE request failed because the embedded server was shutting down.
- Result:
  - `apps/web/src/App.tsx` no longer imports or uses React `useEffectEvent`. It now uses a local `useStableEvent()` helper for callbacks that are called from timers, event handlers, and state updaters. This preserves stable callback identity without triggering React error #440.
  - `apps/web/src/App.tsx` dashboard polling effect now depends on stable `activeSessionId` instead of `runtime.activeSession` object identity, reducing the rapid repeated `/api/browser/state` refresh loop visible in the log.
  - `apps/server/src/capture-service.ts` adds `resetLoginContext()` and uses it when login browser state reads fail. A stale or closed Playwright context now resets to `loginWindowOpen=false`, `loggedIn=false`, and does not make `/api/browser/state` return 500.
  - `apps/server/src/capture-service.ts` now handles failure while reusing an existing login browser context by clearing that stale context and launching a fresh browser instead of staying stuck on the bad context.
  - Visible release tag and version log were bumped to `V26.5.29.7`.
- New regression scripts:
  - `apps/web/scripts/regression-renderer-effect-event-crash.mjs`: failed before the fix because `useEffectEvent` was still present and polling depended on `runtime.activeSession`; passed after the fix.
  - `apps/server/scripts/regression-browser-state-stale-context.mjs`: failed before the fix because a stale context made `getBrowserState()` throw; passed after the fix.
- Files: `apps/web/src/App.tsx`, `apps/server/src/capture-service.ts`, `apps/web/scripts/regression-renderer-effect-event-crash.mjs`, `apps/server/scripts/regression-browser-state-stale-context.mjs`, `apps/desktop/main.mjs`, `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`, `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`, `apps/web/scripts/regression-stopped-session-and-remarks.mjs`, `docs/subagent-progress.md`.
- Verification passed before packaging:
  - `node apps\web\scripts\regression-renderer-effect-event-crash.mjs` -> `renderer effect-event crash regression checks passed`
  - `node --import tsx apps\server\scripts\regression-browser-state-stale-context.mjs` -> `browser state stale context regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-DEWgRDG7.js`
  - `node --check apps\desktop\main.mjs`, `node --check apps\desktop\scripts\finalize-installer.cjs`, and `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
- Risk: this fix is based on the affected-machine log evidence and local automated regression. It still needs installation validation on the affected computer by clicking login/start capture again. If the embedded Douyin browser itself still blanks because of Douyin anti-automation, network policy, GPU/driver, or security software, the next log should now show a cleaner browser launch/state path instead of React #440 and `/api/browser/state` 500.

### 2026-06-02 20:48 - Main Agent - V26.5.29.7 final package verification

- What changed: completed the post-packaging ledger update for the V26.5.29.7 browser capture blank-page fix. No additional business code was changed in this step.
- Progress: DONE for package metadata verification, targeted regression re-run, release directory audit, local startup-log smoke evidence, and this progress record.
- Purpose: preserve a rollback-capable release record and make clear which package should be installed on affected computers for the "click login/start capture, Douyin browser spins then blanks" symptom.
- Subagent status: attempted another read-only audit subagent after context handoff, but spawning still failed because the agent thread limit had been reached. Main Agent performed the local source/package verification and records this as a process limitation, not a subagent conclusion.
- Result:
  - Package exists: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.7-安装包.exe`.
  - Package size: `76,933,695` bytes.
  - Package SHA256: `45DD02B8384B5127BD1F4605CD792D2F559140639048E2D56A5D2B6B47D9BDBA`.
  - `apps/desktop/main.mjs` has `APP_RELEASE_TAG = 'V26.5.29.7'`.
  - `apps/web/src/App.tsx` top version log is `V26.5.29.7`.
  - `apps/web/src/App.tsx` contains `useStableEvent()` usages and no `useEffectEvent` usage was found.
  - `apps/server/src/capture-service.ts` contains `resetLoginContext()` and handles stale login contexts in `getBrowserState()`, `openLoginWindow()`, and `closeLoginWindow()`.
- Verification re-run after handoff:
  - `node apps\web\scripts\regression-renderer-effect-event-crash.mjs` -> `renderer effect-event crash regression checks passed`
  - `node --import tsx apps\server\scripts\regression-browser-state-stale-context.mjs` -> `browser state stale context regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
- Local smoke evidence: local startup log after V26.5.29.7 launch contains `releaseTag=V26.5.29.7`, asset self-check for `assets/index-DEWgRDG7.js` status 200 with JavaScript MIME, renderer request status 200 for that JS asset, and `main renderer-inspect` with body text containing `V26.5.29.7` plus `rootChildCount=1`.
- Release rollback status: release directory currently keeps `糖三角-V26.5.29.1-安装包.exe` (76,927,293 bytes), `糖三角-V26.5.29.2-安装包.exe` (76,931,102 bytes), `糖三角-V26.5.29.3-安装包.exe` (76,932,284 bytes), `糖三角-V26.5.29.4-安装包.exe` (76,932,152 bytes), `糖三角-V26.5.29.5-安装包.exe` (76,933,297 bytes), `糖三角-V26.5.29.6-安装包.exe` (76,933,898 bytes), and `糖三角-V26.5.29.7-安装包.exe` (76,933,695 bytes).
- Risk: this verifies source, packaged artifact, and local startup. It still does not replace an affected-computer install validation. If V26.5.29.7 still blanks after clicking login/start capture on another computer, collect the new `desktop-startup.log` immediately; the key regression signals are whether React #440 is gone, whether `/api/browser/state` still returns 500, and whether Playwright/browser launch reports a new environmental failure.
- Next step: install `V26.5.29.7` on the affected computer, click login/start capture once, and if it still blanks, return the fresh `desktop-startup.log` from that run instead of reusing the V26.5.29.6 log.

### 2026-06-03 00:00 - Main Agent - V26.5.29.7 real-room comment and gift remark regression intake

- What changed: user reported two V26.5.29.7 real-room regressions with screenshots: (1) live room shows user `看风云` comment `保持现状。`, but app captured `[看风云]: 18。`; (2) gift panel can lose special-follow remark display.
- Progress: initial read-only investigation only; no production code changed yet.
- Purpose: separate the new data-chain regressions from the previous V26.5.29.7 browser blank-page fix and avoid another blind patch.
- Subagent status: attempted to spawn two read-only explorer subagents, one for comment extraction and one for gift special-follow remark display. Both attempts failed because the current thread has reached the subagent limit. Main Agent continued the same read-only investigation locally and records this as a process limitation, not a subagent conclusion.
- Initial evidence:
  - Comment path: `apps/server/src/collector.ts` builds comment payload from `visibleText(scopedElement)`, then `parseUser()` strips `昵称:` from that text. The screenshot mismatch strongly suggests the collector selected a visible text fragment containing time/side text (`18。`) instead of the actual comment body (`保持现状。`), or preferred DOM text over structured React payload text when both exist.
  - Service path: `apps/server/src/capture-service.ts` stores `message: parsedMessage` for comments, so if the collector sends `text=18。`, the service will faithfully persist/display the wrong body rather than recover the true comment.
  - Gift remark path: `apps/web/src/App.tsx` computes `getEffectiveUserName()` and `getPreferredUserDisplayName()` with `parseGiftEventDetails(item).userName` before direct `item.userName`. In gift rendering, it creates `giftItem = parsedGift.userName ? { ...item, userName: parsedGift.userName } : item` before calling `renderUserLabel()`. This can make the displayed original name come from parsed gift text instead of the identity-enriched event row, even when `highlightUser` remark is present.
- Proposed next step before code changes: add focused failing regressions for these two screenshots/behaviors, then implement minimal fixes:
  - Comment regression: a collector/source-level fixture where one chat item includes nickname, true body, and a nearby `18。`/time fragment; expected payload is `userName=看风云`, `text=保持现状。`, and not `18。`.
  - Gift remark regression: a web display-level fixture where a gift event has stable `userId/userLink` matching a special-follow remark and a parsed gift text user fragment; expected label remains `备注名 / 原昵称`, not the parsed/fallback name.
- Risk: without a real DOM/diagnostics sample from the affected run, the comment fix must be based on inferred DOM structure from the screenshot and current collector logic. If the real Douyin DOM changed differently, V26.5.29.8 may need the copied diagnostics payload to refine extraction.

### 2026-06-03 00:05 - Main Agent - subagent governance update

- What changed: user clarified the future workflow: when issues appear, the Main Agent is responsible for controlling subagents and coordinating issue discovery, fixes, regression verification, and packaging. The Main Agent must perform final quality gatekeeping for the previously mentioned six release steps.
- Progress: governance rule accepted and recorded. Historical completed subagents from the blank-page investigation were closed to release thread capacity.
- Purpose: prevent excessive stale subagent threads, avoid fragmented ownership, and make final release quality the Main Agent's explicit responsibility.
- Result:
  - Closed historical completed subagents: `019e8113-d42e-7b60-b66c-9957947718c4`, `019e8113-f87b-7d22-8792-7bfac7a703c6`, `019e812b-add4-71d2-b782-381abfbc8f7c`, `019e834d-0962-7601-a596-3f35b5efd378`, `019e834d-23aa-7da3-be45-bf849c4d6f1e`, `019e879b-9947-78d3-afa6-ab28aff8571b`.
  - Future subagent use must be scoped, bounded, and controlled by the Main Agent; completed subagents should be closed after their conclusions are recorded.
  - Main Agent final gate for release work includes: problem confirmation, root-cause investigation, code fix integration, regression verification, packaging, and release/rollback record.
  - Quality has highest priority over speed. No completion, fix, or package-success claim should be made without fresh verification evidence and an entry in this progress ledger.
- Risk: subagent results are advisory and must not be treated as final release approval. Main Agent still owns integration correctness, regression coverage, versioning, package metadata, and user-facing conclusion.
- Next step: for the current V26.5.29.7 regressions, Main Agent should spawn only the minimum necessary new subagents after the fix scope is approved, then close them once their recorded conclusions are integrated.

### 2026-06-03 11:48 - Main Agent - V26.5.29.8 comment body and gift remark fix

- What changed: integrated two scoped worker fixes for the V26.5.29.7 real-room regressions: comment body extraction could capture side noise such as `18。` instead of the real body `保持现状。`, and gift rows could display a parsed gift-text nickname instead of the special-follow `备注名 / 原昵称` label.
- Progress: DONE for code integration, main-agent review, regression verification, installer packaging, release metadata, rollback record, and this ledger update.
- Purpose: preserve real comment bodies first, while keeping old duplicate/comment-loss protections; preserve special-follow display rules for gift rows without changing the stable ID/link-only matching rule.
- Subagent conclusions:
  - Popper (`019e8b84-1d81-7d60-9061-a1a99495a780`) owned `apps/server/src/collector.ts` and `apps/server/scripts/regression-comment-body-noise.mjs`. It added comment body node candidate selection and side-noise filtering. Red-green evidence from the worker: before fix the fixture produced `18。 保持现状。`; after fix `npx tsx apps/server/scripts/regression-comment-body-noise.mjs` printed `comment body noise regression checks passed`.
  - Ramanujan (`019e8b84-1e16-7843-a59c-4d1c4dab4386`) owned `apps/web/src/App.tsx` and `apps/web/scripts/regression-gift-remark-display.mjs`. It stopped passing a parsed gift-text username into `renderUserLabel()` and made display-name priority `item.userName`, then payload username, then parsed gift username. Red-green evidence from the worker: before fix a stable-ID matched gift displayed `[备注名 / 礼物文本昵称]`; after fix `node apps/web/scripts/regression-gift-remark-display.mjs` printed `web gift remark display regression checks passed`.
- Main Agent review result:
  - `apps/server/src/collector.ts` now uses `chooseCommentBodyCandidate()` only for comment rows, prefers content/comment/message/text DOM nodes, filters level/time/badge-style side noise, and leaves the original whole-row stripping fallback in place.
  - `apps/server/scripts/regression-comment-body-noise.mjs` was extended by Main Agent to also assert that a real numeric comment body `18。` is preserved when it is the actual comment content, not a sibling side-noise node.
  - `apps/web/src/App.tsx` gift rendering calls `renderUserLabel(item, '', highlightUser)` for gift rows. `getPreferredUserDisplayName()` prioritizes stored event/payload names over parsed gift text. `getHighlightUserMatch()` still matches only stable `userId/userLink` tokens, not nickname or remark.
  - Visible release identity was bumped to `V26.5.29.8` in `apps/web/src/App.tsx` and `apps/desktop/main.mjs`. Version-bound regression assertions were updated.
- Files:
  - `apps/server/src/collector.ts`
  - `apps/server/scripts/regression-comment-body-noise.mjs`
  - `apps/web/src/App.tsx`
  - `apps/web/scripts/regression-gift-remark-display.mjs`
  - `apps/desktop/main.mjs`
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - `docs/subagent-progress.md`
- Verification:
  - `npx tsx apps\server\scripts\regression-comment-body-noise.mjs` -> `comment body noise regression checks passed`
  - `node apps\web\scripts\regression-gift-remark-display.mjs` -> `web gift remark display regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-browser-state-stale-context.mjs` -> `browser state stale context regression checks passed`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node apps\web\scripts\regression-renderer-effect-event-crash.mjs` -> `renderer effect-event crash regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-ClDpIyd7.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/desktop run prepare-runtime` -> passed
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, `better-sqlite3 ok for modules 136`, runtime preparation, Electron/NSIS packaging, and installer finalization.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.8-安装包.exe`
  - Size: `76,934,471` bytes
  - SHA256: `7C555FA925997FC65552356CE5858FAFF76F23C9C872ABC69E6DB75BE1F94F99`
- Release rollback status: the release directory currently contains `糖三角-V26.5.29.7-安装包.exe` (76,933,695 bytes) and `糖三角-V26.5.29.8-安装包.exe` (76,934,471 bytes). No `win-unpacked`, unversioned `糖三角.exe`, or blockmap residue was listed after finalization.
### 2026-06-03 12:35 - Main Agent - V26.5.29.9 comment action and rich body fix

- What changed: user reported two V26.5.29.8 real-room comment regressions with screenshots. First, a real comment whose body contained the action word `dianzan` (`user34525803: dianzan hen lei hai shang yao`) was missing from the comment panel. Second, a rich comment (`yuchen: @mianhuatang [emoji] [emoji] dui`) was captured/displayed as only the short tail body `dui`.
- Progress: DONE for root-cause investigation, code fix, subagent read-only review, regression verification, build, packaging, release metadata, rollback listing, and this ledger update. Real-room install validation is still required.
- Evidence from `C:\Users\85855\xwechat_files\wxid_vftjp6c4p9t412_ea53\msg\file\2026-06\desktop-startup(1).log`:
  - The log still contains older V26.5.29.6 white-page/React #440 evidence, but that is the previous browser blank-page issue.
  - For the V26.5.29.8 comment-loss time window, renderer requests for `/api/events?category=comment&limit=1000&sessionId=S6TyfnlWvm` and `/api/browser/state` returned HTTP 200 repeatedly. This points away from frontend startup/SSE transport failure and toward collector/service classification or message extraction.
- Root cause:
  - `apps/server/src/collector.ts` classified any visible text containing the action word `dianzan` as `interaction`, so an ordinary comment whose body started with that word could be routed away from the comment panel.
  - `apps/server/src/utils.ts` had the same broad fallback interaction classification pattern.
  - `apps/server/src/collector.ts` could let a short DOM body candidate such as `dui` overwrite a fuller current body containing an `@mention` and emoji labels.
- Result:
  - `apps/server/src/collector.ts` now uses `looksLikeInteractionText()` for interaction classification. It rejects username-colon comment text and requires compact action-style whole-row text such as user-like `dianzan`, `guanzhu`, `fenxiang le zhibojian`, `dianliang le dengpai`, or score/fan-club action lines.
  - `apps/server/src/utils.ts` narrows `INTERACTION_PATTERNS` to anchored action-style patterns and makes `classifyText()` reject `username: body` before interaction classification.
  - `apps/server/src/collector.ts` now preserves richer comment text when the current body contains `@` or bracketed emoji labels, and blocks short-tail candidates from replacing a fuller body.
  - `apps/server/src/collector.ts` now reads `[role="img"]` `aria-label/title` text in ordered visible text collection, so DOM emoji spans can contribute a text label.
  - `apps/server/src/collector.ts` avoids treating the chat root container itself as one message target in chat-source digest collection, reducing merged multi-row noise.
  - Visible release identity is now `V26.5.29.9` in `apps/desktop/main.mjs` and the top `apps/web/src/App.tsx` version log.
  - Version-bound regression scripts now track `V26.5.29.9`.
- New regression scripts:
  - `apps/server/scripts/regression-comment-action-and-rich-body.mjs`: covers three DOM comments where the middle body contains the action word `dianzan`; all three must remain `comment`. It also covers `@mention + role=img emoji labels + tail text` and requires the full rich body, not just the tail.
  - `apps/server/scripts/regression-comment-action-classification.mjs`: covers service fallback classification and parsing for comment bodies containing `dianzan`, while keeping compact action texts as `interaction`.
- Subagent conclusions:
  - Gibbs (`019e8bb5-6f4f-7391-81aa-58ab85ec891c`) completed read-only backend investigation. It found the broad collector interaction regex and the short-tail comment body candidate overwrite path, and proposed the two focused regressions above.
  - Laplace (`019e8bb5-9757-7d60-90ca-ba0daf54c8cb`) completed read-only frontend/service-chain investigation. It found that the frontend renders `item.message` directly and does not strip `@mention` or emoji; if a row is classified as `interaction`, it goes to the interaction panel, not the comment panel. It also found the matching broad fallback pattern in `apps/server/src/utils.ts`.
  - Einstein (`019e8bbf-3acc-7483-bdaf-9394635107bb`) completed read-only final review. It judged the collector classification fix, rich-body protection, utils fallback consistency, and new regression coverage as passing. It flagged a versioning risk because package manifests remain semver (`26.5.26` root/server/web and `26.5.29` desktop), while visible release identity is `APP_RELEASE_TAG`/web version log `V26.5.29.9`. Main Agent decision: keep package manifests unchanged because this project has been using semver package versions plus a four-part visible release tag; the installer filename and UI/log release tag carry the rollback version.
- Files changed:
  - `apps/server/src/collector.ts`
  - `apps/server/src/utils.ts`
  - `apps/server/scripts/regression-comment-action-and-rich-body.mjs`
  - `apps/server/scripts/regression-comment-action-classification.mjs`
  - `apps/web/src/App.tsx`
  - `apps/desktop/main.mjs`
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - `docs/subagent-progress.md`
- Verification passed:
  - `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` -> `comment action word and rich body regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` -> `comment action classification regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-body-noise.mjs` -> `comment body noise regression checks passed`
  - `node apps\web\scripts\regression-gift-remark-display.mjs` -> `web gift remark display regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-browser-state-stale-context.mjs` -> `browser state stale context regression checks passed`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node apps\web\scripts\regression-renderer-effect-event-crash.mjs` -> `renderer effect-event crash regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-BnKV_4rU.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/desktop run prepare-runtime` -> passed
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, `better-sqlite3 ok for modules 136`, runtime preparation, Electron/NSIS packaging, and installer finalization.
  - Post-package recheck: `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs`, `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs`, `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs`, and `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` all passed.
- Verification note:
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` failed once immediately after bumping source version but before rebuilding/preparing runtime, because `.bundle` still contained the old web asset. After `npm --workspace apps/web run build` and `npm --workspace apps/desktop run prepare-runtime`, the same check passed. This was a stale local bundle order issue, not a business regression.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.9-安装包.exe`
  - Size: `76,934,453` bytes
  - SHA256: `251F5313413F1B9EE7769B4D234203C077427D5883845C58358074BB36555302`
- Release rollback status:
  - `糖三角-V26.5.29.7-安装包.exe` (76,933,695 bytes)
  - `糖三角-V26.5.29.8-安装包.exe` (76,934,471 bytes)
  - `糖三角-V26.5.29.9-安装包.exe` (76,934,453 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - Interaction classification is intentionally stricter. If Douyin emits an unusual action wording outside the anchored patterns, that action may be classified as a comment until a real sample is added.
  - Emoji preservation depends on available DOM text/attributes (`alt`, `aria-label`, `title`, or role-img labels). If Douyin uses canvas/background images with no accessible label, text capture still cannot infer the visual emoji name.
  - Automated regression covers the two screenshot-like scenarios and previous key paths, but real-room install validation is still required after installing V26.5.29.9.
- Next step: install `V26.5.29.9` on the affected computer and validate the two exact reported cases: (1) a normal comment whose text contains the action word `dianzan` must remain in the comment panel; (2) a rich comment with `@mention` and emoji must display the full body instead of only the tail text. If either still fails, capture copied diagnostics plus a fresh `desktop-startup.log`.

- Risk:
  - The comment fix is based on an inferred DOM shape from the real-room screenshot plus a synthetic collector regression. If Douyin renders the true body in a different node pattern on another room/account, the copied diagnostics or raw DOM sample will still be needed to refine extraction.
  - Real-room install validation is still required. This local automation verifies source-level and package-level behavior, but it does not prove that every affected external computer and live room DOM now behaves identically.
- Next step: install `V26.5.29.8` on the affected computer and validate the two reported scenarios: (1) comments like `看风云: 保持现状。` should no longer become `18。`; (2) stable-ID/link matched gift rows should display `备注名 / 原昵称`. If either still fails, collect a fresh copied diagnostics payload plus the current `desktop-startup.log`.
### 2026-06-03 12:36 - Main Agent - latest-version pointer

- Supersession note: the historical V26.5.29.8 next-step line near the end of this file is superseded by the V26.5.29.9 record in this file. The current package to install and validate is `V26.5.29.9`.
- Current package: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.9-安装包.exe`.
- Current package SHA256: `251F5313413F1B9EE7769B4D234203C077427D5883845C58358074BB36555302`.

### 2026-06-03 13:05 - Main Agent - V26.5.29.10 host-like action classification fix

- What changed: user pasted a V26.5.29.9 copied diagnostics JSON. It showed `stats.comments=69`, DOM comment rows `69`, `displayCategoryMismatch=0`, and the first comment item was `category=comment`, `message=for host liked`, `rawText=username : for host liked`, `giftCount=9`. This means the frontend did not lose the row; the collector/service classification put a like action into the comment lane.
- Progress: DONE for diagnosis, red-green regression, code fix, subagent read-only review, version bump, regression verification, build, packaging, release audit, post-package recheck, and this ledger update. Real-room validation is still required.
- Root cause:
  - V26.5.29.9 intentionally protected all `username: body` text from interaction classification to prevent real comments such as `like is tiring and hurts the waist` from being swallowed.
  - That protection was too broad. Douyin can also emit true action rows in colon format, such as `username : for host liked`.
  - The action pattern also did not include the exact short action phrase `for host liked`, so both colon-format and compact-format variants fell through to `comment`.
- Result:
  - `apps/server/src/collector.ts` now treats only complete short action text after a colon as interaction. It specifically allows `like`, `follow`, `for host liked`, `shared live room`, fan-club/light-board actions, and score actions, without returning to broad "contains like" matching.
  - `apps/server/src/utils.ts` now mirrors the same colon-action whitelist in `classifyText()`.
  - `apps/server/src/collector.ts` and `apps/server/src/utils.ts` now parse colon-format interaction rows so the username is preserved and the message becomes the action text.
  - `formatInteractionMessage()` already formats any action containing the like word as `like xN`; the new regression confirms `giftCount=9` produces `like x9`.
  - Visible release identity was bumped to `V26.5.29.10` in `apps/desktop/main.mjs` and `apps/web/src/App.tsx`.
- Subagent conclusion:
  - Meitner (`019e8bd6-ad63-7663-bc61-2306b698dcdb`) completed read-only review. It confirmed the copied diagnostics matched the current code path: `looksLikeInteractionText()` rejected all `username: body` rows, `classifyText()` did the same, and `for host liked` was absent from interaction patterns. It recommended a narrow whitelist for the complete action phrase instead of deleting the colon protection.
- Files changed:
  - `apps/server/src/collector.ts`
  - `apps/server/src/utils.ts`
  - `apps/server/scripts/regression-comment-action-classification.mjs`
  - `apps/server/scripts/regression-comment-action-and-rich-body.mjs`
  - `apps/web/src/App.tsx`
  - `apps/desktop/main.mjs`
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - `docs/subagent-progress.md`
- Red-green evidence:
  - Before the fix, `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` failed with actual `comment` vs expected `interaction` for colon-style `for host liked`.
  - Before the fix, `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` failed because the DOM fixture produced `category=comment` for `user : for host liked`.
  - After the fix, both commands passed.
- Verification passed:
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` -> `comment action classification regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` -> `comment action word and rich body regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-body-noise.mjs` -> `comment body noise regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs` -> `comment diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-browser-state-stale-context.mjs` -> `browser state stale context regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `node --import tsx apps\server\scripts\regression-static-shell-cache.mjs` -> `static shell cache regression checks passed`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-gift-remark-display.mjs` -> `web gift remark display regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node apps\web\scripts\regression-renderer-effect-event-crash.mjs` -> `renderer effect-event crash regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-CXkmzW9z.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs`, `node --check apps\desktop\scripts\finalize-installer.cjs`, and `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/desktop run prepare-runtime` -> passed
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, native check, runtime preparation, Electron/NSIS packaging, and installer finalization.
  - Post-package recheck: `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs`, `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs`, `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs`, and `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` all passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.10-安装包.exe`
  - Size: `76,934,857` bytes
  - SHA256: `01DFDD4F7A6ECA893E4472B45969A9AA32996B8347D1A97165DFE0345DB8F44F`
- Release rollback status:
  - `糖三角-V26.5.29.7-安装包.exe` (76,933,695 bytes)
  - `糖三角-V26.5.29.8-安装包.exe` (76,934,471 bytes)
  - `糖三角-V26.5.29.9-安装包.exe` (76,934,453 bytes)
  - `糖三角-V26.5.29.10-安装包.exe` (76,934,857 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - The interaction whitelist is deliberately narrow. Other unseen Douyin action phrases in colon format may still land in comments until a real sample is added.
  - This keeps the safer boundary that real comments containing the like word, such as `like is tiring and hurts the waist`, remain comments.
- Next step: install `V26.5.29.10` on the affected computer. In copied diagnostics after a few minutes of capture, `for host liked` rows should move out of `commentItems` and increase interaction counts instead of inflating comment counts.

### 2026-06-03 13:24 - Main Agent - V26.5.29.11 copied diagnostics enhancement

- What changed: user requested copied diagnostics enhancement after V26.5.29.10 diagnostics showed `stats.comments=15`, visible comment rows `13`, and `displayDuplicate=2`. The existing copy payload only included first/last visible comments and aggregate counters, so it could not identify which two rows were hidden or whether the duplicate decision was correct.
- Progress: DONE for design, red-green regression, implementation, regression verification, build, packaging, package metadata, release audit, and this progress record.
- Result:
  - `apps/web/src/App.tsx` now includes `commentItems.recentComments`: summaries of the latest visible comments.
  - `apps/web/src/App.tsx` now includes `commentItems.recentSkippedComments`: recent frontend display skips for comment rows, including `reason`, candidate row summary, matched existing row summary, and duplicate window when applicable.
  - `apps/web/src/App.tsx` now includes `duplicateRules`: comment duplicate window, non-comment duplicate window, scan limit, and skipped-sample limit.
  - `apps/web/src/App.tsx` now includes `ui.incomingQueueLengths` so future diagnostics can distinguish frontend queue backlog from display filtering.
  - Diagnostic summaries include bounded fields only: uniqueKey, category, createdAt, userName, userId, userLink, message, rawText, payloadText, and sourceId.
  - Visible release identity was bumped to `V26.5.29.11`.
- Red-green evidence:
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` failed before implementation because `recentComments` was absent.
  - After implementation, the same command passed.
- Files changed:
  - `apps/web/src/App.tsx`
  - `apps/web/scripts/regression-comment-display-diagnostics.mjs`
  - `apps/desktop/main.mjs`
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - `docs/subagent-progress.md`
- Verification passed:
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` -> `comment action classification regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` -> `comment action word and rich body regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-CD4vtacH.js` during pre-pack build and the same asset during packaging.
  - `node --check apps\desktop\main.mjs`, `node --check apps\desktop\scripts\finalize-installer.cjs`, and `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `npm --workspace apps/desktop run prepare-runtime` -> passed
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, native check, runtime preparation, Electron/NSIS packaging, and installer finalization.
  - Post-package recheck: `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs`, `node apps\web\scripts\regression-comment-display-diagnostics.mjs`, and `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` all passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.11-安装包.exe`
  - Size: `76,935,666` bytes
  - SHA256: `0405B03FA8CBAF84DFCA0D14789904BB3BECCF3BBB1194F7D12712B9CC0084C8`
- Release rollback status:
  - `糖三角-V26.5.29.7-安装包.exe` (76,933,695 bytes)
  - `糖三角-V26.5.29.8-安装包.exe` (76,934,471 bytes)
  - `糖三角-V26.5.29.9-安装包.exe` (76,934,453 bytes)
  - `糖三角-V26.5.29.10-安装包.exe` (76,934,857 bytes)
  - `糖三角-V26.5.29.11-安装包.exe` (76,935,666 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - This version primarily improves diagnosis. It does not change frontend duplicate rules.
  - The copied JSON is larger, but recent comments and skipped samples are bounded to keep it practical for chat/file sharing.
- Next step: install `V26.5.29.11`, reproduce the 15-vs-13 style case if it appears, click copy diagnostics, and inspect `commentItems.recentSkippedComments` to see exactly which comment rows were hidden and why.

### 2026-06-03 13:26 - Main Agent - V26.5.29.11 copied diagnostics independent recheck

- What changed: user continued from a compacted context and asked to enhance copied diagnostics. Main Agent re-read the required progress/sync/worksplit files and independently checked the already implemented `V26.5.29.11` copied diagnostics enhancement instead of relying only on the handoff summary.
- Progress: DONE for source/version/package evidence recheck and this ledger update. No business code was changed in this recheck.
- Result:
  - `apps/web/src/App.tsx` still has visible version `V26.5.29.11`.
  - `apps/desktop/main.mjs` still has `APP_RELEASE_TAG = 'V26.5.29.11'`.
  - Copy diagnostics fields are present in source: `commentItems.recentComments`, `commentItems.recentSkippedComments`, `duplicateRules`, and `ui.incomingQueueLengths`.
  - Release package exists at `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.11-安装包.exe`.
- Verification passed:
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `Get-FileHash -Algorithm SHA256 ...糖三角-V26.5.29.11-安装包.exe` -> `0405B03FA8CBAF84DFCA0D14789904BB3BECCF3BBB1194F7D12712B9CC0084C8`
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.11-安装包.exe`
  - Size: `76,935,666` bytes
  - SHA256: `0405B03FA8CBAF84DFCA0D14789904BB3BECCF3BBB1194F7D12712B9CC0084C8`
- Next step: install `V26.5.29.11` on the affected computer. If comments still appear missing, copy diagnostics again and inspect `commentItems.recentSkippedComments` to identify the exact hidden candidate and matched existing row.

### 2026-06-03 14:55 - Main Agent - V26.5.29.12 comment display retention and latency diagnostics

- What changed: user installed `V26.5.29.11` and pasted copied diagnostics for a running room showing `stats.comments=153`, `frontend.sseCommentRows=153`, `commentItems.count=120`, `dom.rows=120`, `displayDuplicate=3`, `displayUniqueKeyDuplicate=5`, `incomingQueueLengths.comment=0`, and reported slow comment acquisition plus missing comment messages.
- Progress: DONE for diagnosis, red-green regression, code fix, subagent investigation/final review, verification, packaging, release audit, rollback listing, and this ledger update.
- Root cause:
  - This diagnostic does not support a service/SSE break for the 153-vs-120 symptom. The frontend saw 153 comment rows through SSE, but `apps/web/src/App.tsx` had `EVENT_LIMITS.comment = 120`.
  - `normalizeDisplayItems()`, `appendDisplayItem()`, and `appendDisplayItemsWithDiagnostics()` all ultimately retained only the newest `EVENT_LIMITS[category]` rows, so the visible comment state and DOM naturally stayed at 120 even after 153 comments arrived.
  - The 3 display duplicate skips and 5 unique-key duplicate skips do not explain the 33-row gap; the main visible gap was the display retention window.
- Result:
  - `apps/web/src/App.tsx` now keeps the latest 1000 comment rows in frontend display state instead of 120. Entry, interaction, gift, and log retention limits are unchanged.
  - Copied diagnostics now includes `displayLimits` and `displayWindow.commentStatsMinusDisplay`, `commentSseMinusDisplay`, and `commentDisplayLimitReached`, so future diagnostics can distinguish actual capture loss from frontend display-window retention.
  - Frontend diagnostics now includes lightweight latency/pressure fields: `lastSseCommentReceivedAt`, `lastCommentEnqueuedAt`, `lastCommentDisplayFlushAt`, `maxCommentQueueLength`, `commentFlushCount`, and `commentRowsFlushed`.
  - Visible release identity was bumped to `V26.5.29.12` in `apps/desktop/main.mjs` and the top `apps/web/src/App.tsx` version log.
- Red-green evidence:
  - Before implementation, `node apps\web\scripts\regression-comment-display-loss.mjs` failed with `frontend comment display limit should retain the 1000-row history backfill; got 120`.
  - Before implementation, `node apps\web\scripts\regression-comment-display-diagnostics.mjs` failed because copied diagnostics did not expose `displayLimits`.
  - After implementation, both commands passed.
- Subagent conclusions:
  - Russell (`019e8c38-0cdc-7812-8897-4bfbff8aec78`) completed read-only frontend investigation. It confirmed `153 -> 120` is explained by `EVENT_LIMITS.comment = 120` and the `.slice(-EVENT_LIMITS[category])` retention in display normalization/append paths. It judged `displayDuplicate=3` as not the primary cause and recommended increasing the comment retention window plus exposing display-limit diagnostics.
  - Hypatia (`019e8c38-2c1a-75a2-8279-e5fa2bf028d4`) completed read-only service/SSE investigation. It confirmed `frontend.sseCommentRows=153` means the frontend EventSource handler parsed 153 comment rows; `commentItems.count` and `dom.rows` are current display state, not full service or SSE totals. It recommended adding display-window and queue/latency diagnostics for the user's "slow" symptom.
  - Kepler (`019e8c41-f7f2-75f3-a941-60d695644af2`) completed final read-only review. It found no release-blocking issue, confirmed the fix directly targets the 153-vs-120 symptom, and noted the remaining non-blocking risk that rendering up to 1000 DOM rows is heavier than 120 because the current list is not truly virtualized.
- Files changed:
  - `apps/web/src/App.tsx`
  - `apps/web/scripts/regression-comment-display-loss.mjs`
  - `apps/web/scripts/regression-comment-display-diagnostics.mjs`
  - `apps/web/scripts/regression-stopped-session-and-remarks.mjs`
  - `apps/desktop/main.mjs`
  - `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs`
  - `apps/desktop/scripts/regression-runtime-bundle-assets.cjs`
  - `docs/subagent-progress.md`
- Verification passed:
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` -> `comment action classification regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` -> `comment action word and rich body regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node apps\web\scripts\regression-gift-remark-display.mjs` -> `web gift remark display regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-BrR3wFPk.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs`, `node --check apps\desktop\scripts\finalize-installer.cjs`, and `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/desktop run prepare-runtime` -> passed
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed, including server build, web build, native check, runtime preparation, Electron/NSIS packaging, signing, and installer finalization.
  - Post-package recheck: `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs`, `node apps\web\scripts\regression-comment-display-loss.mjs`, `node apps\web\scripts\regression-comment-display-diagnostics.mjs`, `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs`, `node --import tsx apps\server\scripts\regression-comment-loss.mjs`, `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs`, `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs`, `node --import tsx apps\server\scripts\regression-gift-identity.mjs`, `node apps\web\scripts\regression-gift-remark-display.mjs`, and `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` all passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.12-安装包.exe`
  - Size: `76,935,592` bytes
  - SHA256: `A668F31FB8BA5D1F6AF9B15EFB473DD8EF475E04A7B481FAA512DE653448E6A6`
- Release rollback status:
  - `糖三角-V26.5.29.11-安装包.exe` (76,935,666 bytes)
  - `糖三角-V26.5.29.12-安装包.exe` (76,935,592 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - The comment panel now may render up to 1000 DOM rows. This is heavier than 120 rows, but final review judged it non-blocking. If affected computers still report slow UI after installing `V26.5.29.12`, prioritize a true variable-height virtual list or a user-visible retention setting.
  - This fix addresses frontend retention-window loss. If future copied diagnostics show `stats.comments` or backend DB inserted counts lower than the real livestream, then the next investigation should focus on collector/service ingestion rather than frontend display.
- Next step: install `V26.5.29.12` on the affected computer. During the same kind of room capture, confirm that `commentItems.count` can exceed 120 and that copied diagnostics show `displayLimits.comment = 1000`. If comments still appear slow or missing, paste the new copied diagnostics so the new timing and queue fields can identify the slow segment.

### 2026-06-03 16:35 - Main Agent - confirmed business rules for next release

- What changed: user answered the Main Agent's open questions about the current project rules. These rules supersede the `V26.5.29.12` assumption that the comment panel should retain 1000 visible rows.
- Progress: IN PROGRESS. These rules are recorded first; code/regression/package work will follow in the next release record.
- Confirmed rules:
  - Comment panel displays only the latest 200 comments.
  - Excel export must include all comments, not just the visible comment panel rows.
  - `recommended the live` / `推荐了直播` belongs in interaction, not comment.
  - `congratulations ... upgraded to Lv.xx` belongs in comment.
  - `congratulations ... became No.xx contribution user` belongs in comment.
  - Real comments containing action words such as like/recommend/share/follow are still pending policy.
  - Same user sending the exact same comment within 1.5 seconds must keep both rows.
  - Different users sending the same content must keep all rows.
  - Emoji labels must display completely.
  - `@mention` text must be preserved completely.
  - Comments should appear in the shortest possible time without harming other modules.
  - Highest priority is no missed display.
  - No user setting is needed for all-vs-latest display.
  - Gift special-follow remark display remains `remark / original nickname` when stable ID/link matches.
  - Gift rows without stable `userId/userLink` must not match special follow by nickname.
  - Mystery/anonymous/contribution/top identities must not pollute the normal user identity cache.
  - Copied diagnostics recent-comment size can be larger if useful.
  - Visible version must increment for every code change and new package.
  - Correction on 2026-06-09: visible version is date-based. Format is `VYY.M.D.N`, where `YY.M.D` is the package date and `N` is the package sequence for that date. Example: `V26.5.29.13` means the 13th package on 2026-05-29. If packaging on 2026-06-09, the first package should be `V26.6.9.1`.
  - Release directory should keep the latest 2 rollback packages.
- Immediate implications:
  - `apps/web/src/App.tsx` must change comment display retention from `1000` to `200`.
  - Frontend comment display duplicate suppression must not hide same-user same-text repeated comments.
  - Collector/service classification must move `推荐了直播` to interaction while keeping level-up and contribution congratulation rows in comment.
  - Historical note: the earlier `Next package should be V26.5.29.13` line was later corrected by the user on 2026-06-09; do not use it as a general rule for future dates.

### 2026-06-03 17:05 - Main Agent - V26.5.29.14 confirmed-rules release

- What changed:
  - Implemented the user-confirmed rules from `2026-06-03 16:35`.
  - `V26.5.29.13` was built first but was not accepted as final because final read-only review found the old frontend comment body-dedupe function still contained suppressing logic. Main Agent treated that as release-blocking future-risk, changed the code again, and bumped the visible release to `V26.5.29.14`.
- Progress: DONE for red-green regression, implementation, final review response, build, package, post-package verification, release retention audit, and this ledger update.
- Result:
  - `apps/web/src/App.tsx`
    - Top visible version log is now `V26.5.29.14`.
    - `EVENT_LIMITS.comment` is now `200`, so the comment panel displays only the latest 200 comments.
    - Comment display no longer suppresses rows by body/identity time-window dedupe. `isDuplicateEventMetaWithinWindow()` returns false for comments, and `isDuplicateCommentMetaWithinWindow()` itself is now inert (`return false`) so future call sites cannot re-enable the old behavior by accident.
    - Unique-key duplicate handling remains separate, so the same backend row can still be replaced when appropriate without hiding distinct real comment rows.
  - `apps/server/src/collector.ts`
    - Collector page-side interaction classification now treats the exact action `推荐了直播` as interaction.
    - Collector `push()` no longer performs exact/coarse body dedupe for `comment` payloads; comments are queued directly to prioritize no missed display.
    - Rich body extraction preserving `@mention` and emoji labels remains covered.
  - `apps/server/src/utils.ts`
    - Service classification now treats compact and colon-style `推荐了直播` as interaction.
    - `parseMessage()` and interaction formatting preserve the action text.
    - Level-up and contribution congratulation rows remain comments by default and by regression.
  - `apps/server/src/capture-service.ts`
    - Service collector dedupe for comments no longer uses same-user/same-body 1.5s fingerprints. Comment source-id rescan protection remains only for the same `sourceId + userKey + messageKey` fingerprint.
  - `apps/server/src/db.ts`
    - `getExportEventsForSession()` no longer uses `EXPORT_EVENT_LIMIT = 20000`; export reads all persisted events for the session in ascending order. This makes Excel independent from the visible 200-row comment panel.
  - `apps/desktop/scripts/finalize-installer.cjs`
    - Added `VERSIONED_INSTALLER_KEEP_COUNT = 2` and version-aware pruning so the release directory keeps only the latest two versioned installers.
  - `apps/desktop/main.mjs`
    - `APP_RELEASE_TAG` is now `V26.5.29.14`.
- New/updated regressions:
  - `apps/web/scripts/regression-comment-display-loss.mjs`
    - Asserts comment display limit is exactly 200.
    - Asserts different users same text are kept.
    - Asserts same user same text within 1.5s is kept.
    - Asserts the production comment body-dedupe function itself is inert.
  - `apps/web/scripts/regression-comment-display-diagnostics.mjs`
    - Asserts diagnostics remain present and no longer depend on rawText/body duplicate suppression.
  - `apps/server/scripts/regression-comment-loss.mjs`
    - Changed same-user same-text short-window expectation from suppressed to kept.
  - `apps/server/scripts/regression-comment-action-classification.mjs`
    - Added compact/colon `推荐了直播` interaction cases, negative ordinary-recommend comment cases, and level-up/contribution comment guards.
  - `apps/server/scripts/regression-comment-action-and-rich-body.mjs`
    - Added DOM collector `推荐了直播` interaction case and kept rich `@mention`/emoji regression.
  - `apps/server/scripts/regression-export-all-comments.mjs`
    - Added source-level regression that export query must not use a fixed export limit.
  - `apps/desktop/scripts/regression-installer-retention.cjs`
    - Added source-level regression for latest-two installer retention.
- Red-green evidence:
  - Before fixes, `node apps\web\scripts\regression-comment-display-loss.mjs` failed because same-user same-text comments were still considered duplicates and because the display limit was still 1000.
  - Before fixes, `node --import tsx apps\server\scripts\regression-comment-loss.mjs` failed because service dedupe suppressed same-user same-text comments.
  - Before fixes, `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` failed because `推荐了直播` classified as comment.
  - Before fixes, `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` failed because DOM `推荐了直播` classified as comment.
  - Before fixes, `node apps\server\scripts\regression-export-all-comments.mjs` failed because `EXPORT_EVENT_LIMIT` existed.
  - Before fixes, `node apps\desktop\scripts\regression-installer-retention.cjs` failed because installer finalizer did not declare/enforce latest-two retention.
  - After first `V26.5.29.13` package, Heisenberg final review found `isDuplicateCommentMetaWithinWindow()` still contained old suppressing logic. Main Agent added a stricter regression, watched it fail, changed the function to inert, bumped to `V26.5.29.14`, and rebuilt/repackaged.
- Subagent conclusions:
  - Heisenberg (`019e8caa-1494-7403-b9e1-c557fe977be9`) completed initial read-only audit. It identified required changes in `App.tsx`, `collector.ts`, `utils.ts`, `capture-service.ts`, `db.ts`, `main.mjs`, and `finalize-installer.cjs`; it also flagged that existing tests still encoded old behavior.
  - Heisenberg completed final read-only review after the first package and blocked `V26.5.29.13` because the old frontend comment body-dedupe function still contained suppressing logic even though the current path returned false earlier. Main Agent accepted this as a release-blocking future-risk and produced `V26.5.29.14`.
- Verification passed for final `V26.5.29.14`:
  - `node apps\web\scripts\regression-comment-display-loss.mjs` -> `web comment display loss regression checks passed`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs` -> `web comment display diagnostics regression checks passed`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` -> `web stopped session and remarks regression checks passed`
  - `node apps\web\scripts\regression-gift-remark-display.mjs` -> `web gift remark display regression checks passed`
  - `node apps\web\scripts\regression-mystery-refresh.mjs` -> `web mystery refresh regression checks passed`
  - `node apps\web\scripts\regression-renderer-startup-guards.mjs` -> `renderer startup guard regression checks passed`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs` -> `desktop renderer blank diagnostics regression checks passed`
  - `node apps\desktop\scripts\regression-installer-retention.cjs` -> `installer retention regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs` -> `comment loss regression checks passed`
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs` -> `comment action classification regression checks passed`
  - `npx tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs` -> `comment action word and rich body regression checks passed`
  - `node apps\server\scripts\regression-export-all-comments.mjs` -> `export all comments regression checks passed`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs` -> `gift identity regression checks passed`
  - `node --import tsx apps\server\scripts\regression-auto-save-session.mjs` -> `regression-auto-save-session ok`
  - `npm --workspace apps/server run build` -> passed
  - `npm --workspace apps/web run build` -> passed; generated web JS `assets/index-B-itCp9q.js` and CSS `assets/index-rxdyJc3r.css`
  - `node --check apps\desktop\main.mjs` -> passed
  - `node --check apps\desktop\scripts\finalize-installer.cjs` -> passed
  - `node --check apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> passed
  - `npm --workspace apps/desktop run prepare-runtime` -> passed before packaging
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs` -> `desktop runtime bundle asset regression checks passed`
  - `npm run desktop:pack:fast` -> passed for final `V26.5.29.14`, including server build, web build, native check, runtime preparation, Electron/NSIS packaging, signing, and installer finalization.
  - Post-package rechecks passed: runtime bundle asset regression, renderer blank diagnostics, installer retention, web comment display loss/diagnostics, server comment loss, server classification, DOM rich body/action, export all comments, gift identity, gift remark display, stopped session/remarks, and mystery refresh.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.14-安装包.exe`
  - Size: `76,935,206` bytes
  - SHA256: `14474E17DB51BC22DC9E4DC802ABB236A39368440D9DB50D100DAF4CA0CE147F`
- Release rollback status:
  - `糖三角-V26.5.29.13-安装包.exe` (76,935,928 bytes)
  - `糖三角-V26.5.29.14-安装包.exe` (76,935,206 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - Export now reads all persisted session events, but the database still has the existing per-session retention cap (`MAX_EVENTS_PER_SESSION = 50000`). If a single very long session exceeds that cap, old persisted events may already have been pruned before export.
  - Comment source-id rescan protection remains for the same `sourceId + userKey + messageKey` within the source window. This is intended to avoid old DOM rescan duplicates; if Douyin emits sourceId collisions for distinct comments, diagnostics should show service dedupe reason `source`.
  - Prioritizing no missed display means repeated real comments are kept; users may see more duplicates if the collector receives the same comment without stable sourceId and through different DOM nodes.
- Next step: install `V26.5.29.14` and run a real live-room check. In copied diagnostics, expected state is `displayLimits.comment = 200`, repeated same-user comments should not appear in `recentSkippedComments` as `duplicate`, `推荐了直播` should increase `interactions`, and release startup log should show `releaseTag=V26.5.29.14`.

### 2026-06-03 18:35 - Main Agent - V26.5.29.15 comment key/backfill fix

- Context: User provided a `V26.5.29.14` diagnostic for session `NtpoDBT1CO` showing `stats.comments = 256`, `commentItems.count = 200`, `frontend.sseCommentRows = 255`, `displayUniqueKeyDuplicate = 7`, and very high `historyCommentBackfill = 21191`, then supplied the known-good `V26.5.28.0` installer for comparison.
- Investigation:
  - Extracted and compared the known-good `V26.5.28.0` runtime code from the installer at `C:\Users\85855\xwechat_files\wxid_vftjp6c4p9t412_ea53\msg\file\2026-06\糖三角-V26.5.28.0-安装包.exe`.
  - Confirmed current collector `push()` already bypasses exact/coarse body dedupe for comments, so the main remaining display-loss risks were downstream.
  - Reproduced that current `buildUniqueKey()` generated the same key for two same-user same-text comments in the same millisecond even when payload `sourceId` differed, because comment payload fields were not part of the key seed.
  - Found service stats/SSE still used all built rows after `INSERT OR IGNORE`; duplicate-key rows could inflate live stats and be published even though they were not exportable DB rows.
  - Found frontend session heartbeat messages could trigger repeated full event backfills. With 4s room heartbeat and 1000-comment pull, diagnostics could accumulate huge `historyCommentBackfill` and repeatedly merge old rows into the display path.
- Changes:
  - `apps/server/src/utils.ts`: comment `uniqueKey` seed now includes parsed payload `sourceId`, `rawText`, `text`, and `collectorSeq` so real repeated comments do not collide when timestamps match.
  - `apps/server/src/capture-service.ts`: adds a per-session collector event sequence to comment payloads; after DB insert, live stats and SSE publication now use only rows whose insert indexes actually succeeded.
  - `apps/server/src/db.ts`: `InsertEventsResult` now includes `insertedIndexes: Set<number>` so duplicate rows in the same batch are not miscounted by unique-key Set membership.
  - `apps/web/src/App.tsx`: session heartbeat no longer requests full event backfill unless the active session changed; repeated full backfills are throttled with `SESSION_EVENT_REFRESH_COOLDOWN_MS`.
  - `apps/web/src/App.tsx` and `apps/web/src/api.ts`: copy diagnostics now includes server `/api/diagnostics/comment-flow` and `/api/diagnostics/events` comment snapshots; frontend comment diagnostics reset on new session and clear.
  - `apps/web/src/App.tsx`: version log bumped to `V26.5.29.15`.
- New regressions:
  - `apps/server/scripts/regression-comment-unique-key.mjs`
  - `apps/server/scripts/regression-db-insert-indexes.mjs`
  - `apps/web/scripts/regression-comment-history-backfill.mjs`
- Red-green evidence:
  - Before fixes, `regression-comment-unique-key.mjs` failed because two distinct same-user same-text comments produced identical SHA1 keys.
  - Before fixes, `regression-db-insert-indexes.mjs` failed because DB insert result did not expose inserted row indexes and service code counted/published all attempted rows.
  - Before fixes, `regression-comment-history-backfill.mjs` failed because frontend had no session event backfill cooldown and heartbeat session messages triggered history event refresh.
- Verification passed:
  - `node --import tsx apps\server\scripts\regression-comment-unique-key.mjs`
  - `node apps\server\scripts\regression-db-insert-indexes.mjs`
  - `node apps\web\scripts\regression-comment-history-backfill.mjs`
  - `node --import tsx apps\server\scripts\regression-comment-diagnostics.mjs`
  - `node --import tsx apps\server\scripts\regression-comment-loss.mjs`
  - `node --import tsx apps\server\scripts\regression-comment-action-classification.mjs`
  - `node --import tsx apps\server\scripts\regression-comment-action-and-rich-body.mjs`
  - `node --import tsx apps\server\scripts\regression-comment-body-noise.mjs`
  - `node apps\server\scripts\regression-export-all-comments.mjs`
  - `node --import tsx apps\server\scripts\regression-gift-identity.mjs`
  - `node apps\web\scripts\regression-comment-display-loss.mjs`
  - `node apps\web\scripts\regression-comment-display-diagnostics.mjs`
  - `node apps\web\scripts\regression-stopped-session-and-remarks.mjs`
  - `npm --workspace apps/server run build`
  - `npm --workspace apps/web run build`
  - `node apps\desktop\scripts\regression-renderer-blank-diagnostics.cjs`
  - `npm --workspace apps/desktop run prepare-runtime`
  - `node apps\desktop\scripts\regression-runtime-bundle-assets.cjs`
  - `node apps\desktop\scripts\regression-installer-retention.cjs`
  - `npm run desktop:pack:fast`
  - Post-package rechecks: runtime bundle asset regression, renderer blank diagnostics, and installer retention all passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.15-安装包.exe`
  - Size: `76,936,176` bytes
  - SHA256: `370BCD282D42504DF3CB19E2A293F10BD1F8253FE2E89F01A2D064BF35FF8BB0`
- Release rollback status:
  - `糖三角-V26.5.29.14-安装包.exe` (76,935,206 bytes)
  - `糖三角-V26.5.29.15-安装包.exe` (76,936,176 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was present after finalization.
- Risk:
  - Not yet validated against a live Douyin room after this fix.
  - If Douyin emits distinct real comments with the exact same sourceId, rawText, text, user identity, and created timestamp, the service source dedupe can still treat them as a rescan duplicate; copied diagnostics will now include server counters and recent decisions to confirm that case.
- Next step: install `V26.5.29.15` and test a live room. Expected diagnostics after install: `historyCommentBackfill` should stay close to actual reconnect/new-session backfill, `db.comment_ignored_unique` should not grow for real repeated comments, and `displayUniqueKeyDuplicate` should mainly indicate history/SSE replay of the same inserted row rather than real comment loss.

### 2026-06-08 18:05 - Main Agent - V26.5.29.18 P0 security closure and package

- Context: User approved fixing only P0 risks exposed by PRD/SOP/risk reports, without changing business behavior. User also required backup before edits and document sync after boundary decisions.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\p0-fix-20260608-172513`
- Changes:
  - `apps/server/src/security.ts`: added runtime local API token helpers, HttpOnly Cookie serialization, timing-safe token check, and stricter local Origin parsing.
  - `apps/server/src/index.ts`: all `/api/*` now require valid local API Cookie; invalid Origin, `Origin: null`, `file://`, `data:` and remote origins are rejected before business handlers; static assets stay unauthenticated; shell responses set the Cookie.
  - Start capture remains restricted to `https://live.douyin.com/{roomId}`; login/user entry remains restricted to necessary Douyin HTTPS pages.
  - `apps/server/scripts/regression-api-security.mjs`: covers no Cookie/valid Cookie for `/api/sessions/active`, `/api/events`, `/api/export.xlsx`, `/api/events/stream`, `Origin: null`, and URL allowlist.
  - `apps/server/scripts/regression-api-production-security.mjs`: production `buildApp` regression verifies invalid Origin and `Origin: null` GET return 403 even with valid Cookie.
  - `apps/server/scripts/pressure-export-100k.mjs`: adds 100k event stats/export pressure test without changing `MAX_EVENTS_PER_SESSION = 50000`.
  - `package.json`: `test:regression` now builds, prepares desktop runtime, then runs server/web/desktop regressions so bundle version checks are not stale.
  - `apps/desktop/package.json` / `apps/server/package.json` / `package-lock.json`: Electron is `40.10.2`; `better-sqlite3` is `12.10.0`. Electron `42.3.3` was tried but blocked by `better-sqlite3` V8/Electron ABI build failure.
  - `apps/desktop/main.mjs` and `apps/web/src/App.tsx`: visible release bumped to `V26.5.29.18`.
  - Docs synced: PRD, enhanced testing SOP, risk review, security risk acceptance, test report, iteration log, and this progress ledger.
- Verification:
  - `npm run test:regression` -> passed: server 14 scripts, web 8 scripts, desktop 3 scripts.
  - `node --import tsx apps\server\scripts\regression-api-production-security.mjs` -> passed.
  - `node --import tsx apps\server\scripts\pressure-export-100k.mjs` -> passed; `totalMs=7630`, `exportBuildMs=3673`, `xlsxMb=2.5`, `rssDeltaMb=694.2`, final `rssMb=772.1`.
  - `npm run audit:security` -> passed with no high; remaining 2 moderate vulnerabilities are `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed using `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`; Electron native check printed `better-sqlite3 ok for modules 143`.
  - Post-package `node apps\desktop\scripts\run-regressions.cjs` -> passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.18-安装包.exe`
  - Size: `85,321,120` bytes
  - SHA256: `AE8ECA5938E3FE2B82CBEF59A05A98C981F6A1D07440B98F0A1D2016FE5FAEEA`
- Release rollback status:
  - `糖三角-V26.5.29.17-安装包.exe` (85,322,851 bytes)
  - `糖三角-V26.5.29.18-安装包.exe` (85,321,120 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was listed after finalization.
- Risk:
  - Installation wizard and installed-app launch smoke were not executed in this turn.
  - Real Douyin live-room smoke was not executed and remains manual.
  - 100k event export can complete, but memory use is high. Current official retention boundary remains 50k until a separate decision accepts the memory cost or implements streaming export.
  - `exceljs -> uuid` remains moderate and is documented in security risk acceptance.

### 2026-06-08 19:18 - Main Agent - V26.5.29.18 non-invasive recheck

- Context: User asked to continue after P0 closure; this pass deliberately avoided running the installer or overwriting an installed app.
- Verification:
  - Current workspace confirmed as `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`.
  - `npm run test:regression` -> passed: server 14 scripts, web 8 scripts, desktop 3 scripts.
  - `npm run audit:security` -> passed for high audit gate; remaining 2 moderate vulnerabilities are still `exceljs -> uuid`.
  - `Get-FileHash -Algorithm SHA256` for `糖三角-V26.5.29.18-安装包.exe` -> `AE8ECA5938E3FE2B82CBEF59A05A98C981F6A1D07440B98F0A1D2016FE5FAEEA`.
  - Non-invasive installer inspection: file is PE, contains NSIS/Nullsoft markers, Authenticode status is `NotSigned`.
  - Release directory only listed `糖三角-V26.5.29.17-安装包.exe` and `糖三角-V26.5.29.18-安装包.exe`; no extra release residue was found.
- Docs:
  - Appended the fresh recheck to `docs/project-test-report-2026-06-08.md`.
  - Appended iteration item 46 to `docs/iteration-log.md`.
- Risk:
  - Installed-app launch smoke remains manual because running the installer may overwrite the user's current installation.
  - Real Douyin live-room smoke remains manual.

### 2026-06-08 19:54 - Main Agent - V26.5.29.19 native ABI startup fix

- Context: User installed `V26.5.29.18` and startup failed with `better_sqlite3.node` compiled against `NODE_MODULE_VERSION 127`; Electron 40 requires `NODE_MODULE_VERSION 143`.
- Backup:
  - Code/doc backup: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\native-abi-fix-20260608-193131`
  - Release backup before debug packaging: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\release-before-native-debug-20260608-193254`
  - Conflict package backup before final repack: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\release-conflict-v26.5.29.19-20260608-195023`
- Root cause:
  - Previous gate validated workspace `node_modules\better-sqlite3`, but not the final packaged `release\win-unpacked\resources\app.asar.unpacked` native module.
  - Cover install can retain an old `better-sqlite3` native directory under the install path.
- Changes:
  - Added `apps/desktop/scripts/regression-packaged-native-abi.cjs`.
  - `apps/desktop/package.json` now runs `regression-packaged-native-abi.cjs --required` after `electron-builder` and before `finalize-installer`.
  - Added `apps/desktop/scripts/regression-installer-native-cleanup.cjs`.
  - `apps/desktop/build/installer.nsh` now removes old `resources\app.asar.unpacked\node_modules\better-sqlite3` before installing new files.
  - Removed hard-coded release version assertions from desktop regressions; they now read the visible version from `apps/web/src/App.tsx`.
  - Bumped visible release to `V26.5.29.19`.
- Verification:
  - `node apps\desktop\scripts\regression-installer-native-cleanup.cjs` -> passed.
  - `node apps\desktop\scripts\regression-packaged-native-abi.cjs --required` during package -> passed with `electron=40.10.2`, `modules=143`.
  - `npm run test:regression` -> passed: server 14 scripts, web 8 scripts, desktop 4 scripts.
  - `npm run audit:security` -> high=0; remaining 2 moderate vulnerabilities are `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed.
  - Post-package `node apps\desktop\scripts\run-regressions.cjs` -> passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.19-安装包.exe`
  - Size: `85,322,361` bytes
  - SHA256: `EC65CFEFF5441BE6E88A285204FE1EF88A747E424F9C966671E40EEAAC0EB30A`
- Release rollback status:
  - `糖三角-V26.5.29.18-安装包.exe` (85,321,120 bytes)
  - `糖三角-V26.5.29.19-安装包.exe` (85,322,361 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was present after finalization.
- Risk:
  - Installed-app launch needs user-side validation because running the installer can overwrite the user's current install.
  - Real Douyin live-room smoke remains manual.

### 2026-06-08 20:14 - Main Agent - V26.5.29.20 direct native addon ABI fix

- Context: User installed `V26.5.29.19` and the same `better_sqlite3.node` `NODE_MODULE_VERSION 127` vs `143` error still appeared.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\native-abi-direct-node-fix-20260608-200007`
- Evidence:
  - Real installed file: `D:\糖三角\@douyin-live-suitedesktop\resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node`
  - Installed file SHA256 before `.20`: `B936C55E4D59433FCE3E84B6E98CCDC8AF0E7EB9243D0C12F1570045DA972B9F`
  - Directly requiring that `.node` with Electron reproduced the user error.
- Corrected root cause:
  - `V26.5.29.19` validated the package entry, but `better-sqlite3` does not load the native addon until database construction or direct `.node` require.
  - Workspace native binary cannot stay Electron ABI during Node server regressions, so packaging must switch to Electron ABI and then restore Node ABI.
- Changes:
  - `apps/desktop/scripts/prepare-native.cjs`: direct `node-gyp rebuild --runtime=electron --target=40.10.2` inside `node_modules\better-sqlite3`; verification directly requires `better_sqlite3.node` and creates an in-memory database.
  - `apps/desktop/scripts/regression-packaged-native-abi.cjs`: directly requires packaged `better_sqlite3.node` and checks `nativeAddonType=object`.
  - `apps/desktop/scripts/prepare-node-native.cjs`: added Node ABI rebuild/verification.
  - Root `test:regression`: restores Node ABI before server/web/desktop tests.
  - Desktop `pack:fast` / `pack:full`: build Electron ABI for packaging, verify packaged `.node`, finalize installer, then restore Node ABI.
  - Visible release bumped to `V26.5.29.20`.
- Verification:
  - `node apps\desktop\scripts\prepare-node-native.cjs --force` -> passed, Node modules `127`.
  - `npm run test:regression` -> passed: server 14, web 8, desktop 4.
  - `npm run audit:security` -> high=0; remaining 2 moderate vulnerabilities are `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed; packaged ABI gate output `electron=40.10.2`, `modules=143`, `nativeAddonType=object`, `databaseType=function`.
  - Post-package `node apps\desktop\scripts\run-regressions.cjs` -> passed.
  - Post-package Node check -> passed, Node modules `127`.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.20-安装包.exe`
  - Size: `85,322,944` bytes
  - SHA256: `5C32511A5B0AAE4D72BEC3A66CAAFF073DF4E79C7C441948B3F30A1C91E4B907`
- Release rollback status:
  - `糖三角-V26.5.29.19-安装包.exe` (85,322,361 bytes)
  - `糖三角-V26.5.29.20-安装包.exe` (85,322,944 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was present after finalization.
- Risk:
  - User still needs to install `V26.5.29.20` because the current real install directory remains `.19` content.
  - Real Douyin live-room smoke remains manual.

### 2026-06-09 11:47 - Main Agent - V26.6.9.1 full risk closure pass

- Context: User asked to fix all remaining risks and confirmed statistics/export should try to represent full live history.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\full-risk-closure-20260609-114752`
- Changes:
  - Added date-version release plan `docs/superpowers/plans/2026-06-09-full-risk-closure.md`.
  - Added session aggregate tables for category totals, unique users, gift totals, and mystery user totals.
  - DB now aggregates successfully inserted events before raw-event retention pruning.
  - Excel export now includes `全量统计汇总`, `全量礼物排行`, and `当前保留明细说明`.
  - Config parsing now validates local-only host and numeric port before listen.
  - Collector page payloads now pass through `collector-payload.ts` before entering business callbacks.
  - Visible release updated to `V26.6.9.1` in `apps/web/src/App.tsx` and `apps/desktop/main.mjs`.
- New tests:
  - `regression-full-history-stats.mjs`
  - `regression-export-full-history-summary.mjs`
  - `regression-config-validation.mjs`
  - `regression-collector-payload-schema.mjs`
  - `regression-release-version.cjs`
  - `regression-chinese-readability.cjs`
- Pressure result:
  - 10k: retained detail 10k, total 1080 ms, RSS delta 101.9 MB, xlsx 0.3 MB.
  - 50k: retained detail 50k, total 5767 ms, RSS delta 290.5 MB, xlsx 1.3 MB.
  - 100k: retained detail 48k, total 8746 ms, RSS delta 349.8 MB, xlsx 1.2 MB.
- Remaining note:
  - `collector.ts` still has file-level `@ts-nocheck`; payload boundary is now typed, but full collector strict typing remains a staged refactor to avoid breaking capture behavior.
- Verification:
  - `npm run test:regression` -> passed: server 18, web 8, desktop 6.
  - `npm run audit:security` -> passed with high=0; remaining moderate `exceljs -> uuid` is retained because npm's fix downgrades ExcelJS to breaking `3.4.0`.
  - `node --import tsx apps\server\scripts\pressure-export-100k.mjs` -> passed for 10k/50k/100k.
  - `npm run desktop:pack:fast` -> passed; packaged native ABI gate output `nativeAddonType=object`, `modules=143`.
  - Post-package desktop regressions passed.
  - Post-package Node ABI check passed with modules 127.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.1-安装包.exe`
  - Size: `85,324,719` bytes
  - SHA256: `5EF8F45912E2765B100D37B74B8DF367B8931F60D45D3E4F35D37E379F0557A3`
- Release rollback status:
  - `糖三角-V26.5.29.20-安装包.exe` (85,322,944 bytes)
  - `糖三角-V26.6.9.1-安装包.exe` (85,324,719 bytes)
  - No `win-unpacked`, `builder-debug.yml`, unversioned `糖三角.exe`, or `.blockmap` residue was present after finalization.

### 2026-06-09 12:45 - Main Agent - P0 special-follow display boundary logged

- Context: User asked whether the current special-follow display `特别关注 备注名` + `[备注名 / 原昵称] 礼 礼物内容` was a later change, then requested this issue be listed as P0.
- Finding:
  - Historical normal rule in `V26.5.14.1`: marker shows remark, message body shows real nickname.
  - Later rule in `V26.5.29.0`: matched body displays `备注名 / 原昵称`.
  - `V26.5.29.8` fixed gift rows so the original nickname comes from stable event identity, not parsed gift text.
- Action:
  - Added P0 item to `docs/project-risk-review-2026-06-08.md`.
  - Promoted special-follow module to P0 in `docs/testing-sop-enhanced-2026-06-08.md`.
  - Added `TC-HL-001_特别关注命中展示格式` to testing SOP.
- Historical status at that point:
  - Logged only. No production code changed yet.
  - It was pending user decision at that time: restore historical display `特别关注 备注名` + `[原昵称] ...`, or keep current `特别关注 备注名` + `[备注名 / 原昵称] ...`.
  - Closed by the later `V26.6.9.2` entry after user confirmed the historical display.

### 2026-06-09 14:37 - Main Agent - V26.6.9.2 special-follow display restoration

- Context: User confirmed final boundary: only change special-follow display wording, do not change capture, matching, storage, stats, or export. User also confirmed raw detail retention remains fixed at 50,000; Excel export architecture, code signing, CI/coverage, and external API support are not part of this round.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\highlight-display-restore-20260609-143746`
- Change:
  - `apps/web/src/App.tsx`: `getPreferredUserDisplayName()` now returns the original nickname even when a highlight remark exists.
  - The highlight marker still displays `特别关注 备注名`; gift/comment body user labels no longer display `备注名 / 原昵称`.
  - Visible release bumped to `V26.6.9.2`; package semver bumped to `26.6.9-2`.
- Regression:
  - `apps/web/scripts/regression-gift-remark-display.mjs` now asserts matched gift rows display `[原昵称]`.
  - Red check was confirmed first: before the source change, the script failed with actual `[备注名 / 原昵称]` and expected `[原昵称]`.
  - After the source change, `regression-gift-remark-display.mjs` and `regression-stopped-session-and-remarks.mjs` passed.
- Docs:
  - Synced PRD, enhanced testing SOP, risk report, test report, tech stack, security risk acceptance, and iteration log with the new boundary and current not-do decisions.
- Verification:
  - `npm run test:regression` -> passed: server 18, web 8, desktop 6.
  - `npm run audit:security` -> passed with high=0; remaining moderate `exceljs -> uuid` retained.
  - `npm run desktop:pack:fast` -> passed; packaged native ABI gate passed and Node ABI was restored.
  - `node apps\desktop\scripts\run-regressions.cjs` -> passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe`
  - Size: `85,324,896` bytes
  - SHA256: `01B6696502EEF5700C8AF24ACCF38D39B3974393C05CB467324A16C94162E92C`
  - Code signing: `NotSigned`, per user decision for this round.
- Release rollback status:
  - `糖三角-V26.6.9.1-安装包.exe` (85,324,719 bytes)
  - `糖三角-V26.6.9.2-安装包.exe` (85,324,896 bytes)
- Current status:
  - Automated P0 checks passed. Real installation and real Douyin live-room smoke remain manual/non-hard-gate.

### 2026-06-09 15:10 - Main Agent - Test coverage tightening

- Context: User asked to continue and tell them if anything is needed. Main Agent reviewed current automated cases against the SOP without changing product behavior.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\test-coverage-tighten-20260609-151022`
- Change:
  - Tightened `apps/web/scripts/regression-stopped-session-and-remarks.mjs` so the stopped-session/remark regression also asserts the current special-follow display boundary: highlight remark must not be merged into the displayed user label.
  - Updated SOP and test report to record the additional coverage.
  - Added `docs/test-coverage-matrix-2026-06-09.md` to map PRD/SOP P0 areas to actual regression scripts and remaining manual smoke gaps.
- Verification:
  - `npm run test:web` -> passed: 8 web regression scripts.
- Current status:
  - No business source behavior changed and no new package was built for this test-only adjustment.
  - To continue real acceptance, user input needed: a valid `https://live.douyin.com/{roomId}` live-room URL and confirmation that the installed `V26.6.9.2` package can be launched for manual smoke.

### 2026-06-09 15:44 - Main Agent - V26.6.9.2 installed real live-room smoke

- Context: User provided live-room URL `https://live.douyin.com/962565925628`, allowed installing/running the current package, confirmed Douyin account is normal, and asked to use isolated mock for special-follow if no real ID is available.
- Package/install:
  - Installer: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe`
  - SHA256: `01B6696502EEF5700C8AF24ACCF38D39B3974393C05CB467324A16C94162E92C`
  - Silent install returned exit code 0.
  - Registry now shows `糖三角 26.6.9-2`.
  - Installed exe: `D:\糖三角\@douyin-live-suitedesktop\糖三角.exe`.
- Startup:
  - Installed app started from the D drive path.
  - Startup log contains `releaseTag=V26.6.9.2`, `appVersion=26.6.9-2`, `serverUrl=http://127.0.0.1:3100`.
  - Local service is listening on `127.0.0.1:3100` owned by the installed `糖三角.exe`.
  - Renderer inspection showed `rootChildCount=1`; no white-screen evidence.
- Login:
  - `/api/browser/login` opened the Douyin login/live entry.
  - `/api/browser/state` returned `loggedIn=true`, `profileDisplayName=天晴了`.
- Real smoke:
  - Started session `8O4oe_OrQC` for `https://live.douyin.com/962565925628`.
  - Room resolved to `冻腰冻拐（三角洲行动）的抖音直播间`; host `冻腰冻拐（三角洲行动）`; `isLive=true`.
  - After a short run and manual stop, stats were comments 42, entries 18, interactions 12, gifts 161, giftUnits 171, logs 3, uniqueUsers 220.
  - Manual stop cleared active session and retained stopped-session stats.
  - Desktop auto-save file was created: `C:\Users\85855\Desktop\糖三角-20260609-153806-冻腰冻拐（三角洲行动）-8O4oe_OrQC.xlsx`.
  - ExcelJS read the file successfully; sheets included `全量统计汇总`, `全量礼物排行`, `当前保留明细说明`, `评论`, `进场`, `互动`, `礼物`, `日志`.
  - Export API produced `tmp\smoke-export-8O4oe_OrQC.xlsx`, 35,340 bytes.
- Verification rerun:
  - `npm run test:regression` passed: server 18, web 8, desktop 6.
  - `npm run audit:security` passed high=0; remaining moderate `exceljs -> uuid`.
  - `npm run test:web` passed: web 8.
- Docs updated:
  - `docs/project-test-report-2026-06-08.md`
  - `docs/project-risk-review-2026-06-08.md`
  - `docs/testing-sop-enhanced-2026-06-08.md`
  - `docs/test-coverage-matrix-2026-06-09.md`
  - `docs/iteration-log.md`
- Remaining smoke gap:
  - Real special-follow hit was not covered because no real matching user ID was available. It remains covered by isolated mock regressions; do not inject fake events into real sessions.

### 2026-06-09 22:17 - Main Agent - V26.6.9.3 comment duplicate and gift order closeout

- Context: User reported two bugs: duplicate comments in the comment panel and newly introduced out-of-order gift messages. User provided real room `https://live.douyin.com/127874409138` and asked to fix, self-test, and package.
- Backup:
  - Code backup before edit: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\duplicate-order-fix-edit-20260609-220000`
  - Docs sync backup: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\docs-sync-v26.6.9.3-20260609-221711`
- Change:
  - Server comment unique key now ignores changing `createdAt` and `collectorSeq` for comments with stable `sourceId`.
  - Capture payload now carries `ingestSeq`.
  - Web event ordering uses `id`, then payload `ingestSeq`, then `uniqueKey`.
  - Gift identity replacement preserves original `id`, `createdAt`, and `ingestSeq`.
  - Version bumped to `V26.6.9.3` / `26.6.9-3`.
- Verification:
  - `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs` -> passed.
  - `node apps/web/scripts/regression-gift-display-order.mjs` -> passed.
  - `node apps/desktop/scripts/regression-release-version.cjs` -> passed.
  - `npm run test:regression` -> passed: server 18, web 9, desktop 6.
  - `npm run audit:security` -> passed high=0; remaining moderate `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.3-安装包.exe`
  - Size: `85,326,404` bytes.
  - SHA256: `46209A29BAB8127250F719CBD256B10C302980047EB672106447638B2970D8CD`.
- Installed smoke:
  - Silent install returned exit code 0; registry shows `糖三角 26.6.9-3`.
  - Startup log contains `releaseTag=V26.6.9.3`, `appVersion=26.6.9-3`, and `serverUrl=http://127.0.0.1:3100`.
  - API cookie security still works: no-cookie request returned 401, valid cookie with local origin returned 200.
- Real smoke:
  - Started session `ehGrIJDv6x` for `https://live.douyin.com/127874409138`.
  - Room resolved to `婷哥kiki🎙️ ⁸⁰²³的抖音直播间`; `isLive=true`.
  - Short run captured comments 13, entries 111, interactions 6, gifts 5, logs 2.
  - Comment duplicate check: `DUP_UNIQUE_KEY=0`; `sourceId/userId/message` duplicate groups = 0.
  - Gift order check: 5 real gift rows had consistent latest-first `id/createdAt/ingestSeq`.
  - Stop API cleared active session.
  - Export API generated 25,770 bytes XLSX; SHA256 `F237C55ECE23AAAFFDC6C1350F1466DB253A410EAC1EA075591C986C19C9974C`.
- Current status:
  - P0 bugs are fixed and packaged in `V26.6.9.3`.
  - User final release acceptance is still required after using the installer in their own workflow.

### 2026-06-10 11:25 - Main Agent - P0 capture integrity root-cause fix

- Context: User reported three P0 capture issues and asked to investigate root cause before fixing: gift `送你花花 x1` displayed as `你花花 x1`; rich comment body could be incomplete; highlight users could be missed in comment/gift rows.
- Backup:
  - `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\pre-fix-capture-regressions-20260610-110333`
- Root cause:
  - Gift cleanup treated standalone `送` as removable even when it was part of a compact gift name.
  - Rich comment parsing could keep overlapped parent/child text, producing incomplete or duplicated leading mention text for some DOM shapes.
  - Frontend highlight matching did not include raw `payload.userLink` in identity candidates.
- Change:
  - `apps/server/src/utils.ts`: service gift fallback parser now preserves compact gift names like `送你花花` while stripping standalone action `送 `.
  - `apps/server/src/collector.ts`: browser collector uses the same gift action boundary and folds rich-comment leading overlap before final output.
  - `apps/web/src/App.tsx`: highlight matching candidates now include `payload.userLink`.
  - Added/updated targeted regressions for gift prefix, rich comment body, and payload-only highlight identity.
- Verification:
  - `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` -> passed.
  - `node apps/web/scripts/regression-highlight-payload-identity.mjs` -> passed.
  - `npx tsc -p apps/server/tsconfig.json --noEmit` -> passed.
  - `npm run test:regression` with project-local test storage -> passed: server 20, web 10, desktop 6.
- Docs:
  - Updated `docs/iteration-log.md`, `docs/project-prd-2026-06-05.md`, `docs/testing-sop-enhanced-2026-06-08.md`, `docs/project-test-report-2026-06-08.md`, and `docs/project-risk-review-2026-06-08.md`.
- Current status:
  - Source-level P0 fixes are complete and verified.
  - No new installer was built in this pass; if release is needed, create the next date-based version and run packaging/install smoke.
  - Exact real-room DOM for the reported comment screenshot is still not available; if truncation reproduces, collect session ID, timestamp, screenshot, visible text, and copied diagnostics.

### 2026-06-10 11:55 - Main Agent - V26.6.10.1 package closeout

- Context:
  - Continue the P0 capture integrity goal and package the verified fixes using the user date-version rule.
- Additional change:
  - `apps/server/scripts/run-regressions.mjs` now sets project-local `tmp/server-regression-storage` and per-script DB paths. This avoids regression tests opening the default parent-level storage path and keeps tests isolated from real runtime data.
- Verification:
  - `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` -> passed.
  - `node apps/web/scripts/regression-highlight-payload-identity.mjs` -> passed.
  - `npm run test:regression` -> passed: server 20, web 10, desktop 6.
  - `npm run audit:security` -> passed high=0; remaining moderate `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed; packaged native ABI regression passed.
- Package:
  - Version: `V26.6.10.1` / `26.6.10-1`.
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.1-安装包.exe`.
  - Size: `85,327,097` bytes.
  - SHA256: `77CBA10028BFAD590ABEF3EA93769BC65983EF3BE60BAA622F1B17C98515EE84`.
- Docs updated:
  - `docs/iteration-log.md`
  - `docs/project-prd-2026-06-05.md`
  - `docs/testing-sop-enhanced-2026-06-08.md`
  - `docs/project-risk-review-2026-06-08.md`
  - `docs/project-test-report-2026-06-08.md`
- Current status:
  - V26.6.10.1 is packaged and ready for user smoke.
  - Exact real-room DOM for the rich comment screenshot remains the only unproven field-specific part. If it reproduces, collect session ID, timestamp, screenshot, exact visible text, and copied diagnostics.

### 2026-06-10 12:15 - Main Agent - V26.6.10.2 rich comment root-aria closeout

- Context:
  - Continued completion audit for the original P0 capture-integrity goal.
  - Added a closer mock for real rich-comment DOM: full text on row/container `aria-label`, child node only `@XX欢迎`.
- Root cause:
  - V26.6.10.1 covered full body in child nodes and content-container aria labels.
  - If the complete body was on the row itself, the short child node could still win scoring and output only `@XX欢迎`.
  - Generic noise filtering could also reject a real comment candidate that contained words such as `直播间`.
- Change:
  - `apps/server/src/collector.ts`: comment body candidates include the current node, strip username prefixes, allow @/punctuated rich user comments through generic-fragment filtering, and boost candidates that extend the current short visible body.
  - `apps/server/scripts/regression-comment-rich-mention-body.mjs`: added content-container and whole-row `aria-label` cases.
  - Version bumped to `V26.6.10.2` / `26.6.10-2`.
- Verification:
  - `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-comment-action-and-rich-body.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-comment-body-noise.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-comment-loss.mjs` -> passed.
  - `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` -> passed.
  - `node apps/web/scripts/regression-highlight-payload-identity.mjs` -> passed.
  - `npm run test:regression` -> passed: server 20, web 10, desktop 6.
  - `npm run audit:security` -> passed high=0; remaining moderate `exceljs -> uuid`.
  - `npm run desktop:pack:fast` -> passed; packaged native ABI regression passed.
- Package:
  - Path: `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.2-安装包.exe`.
  - Size: `85,325,946` bytes.
  - SHA256: `50AE8AF70AF1CDED74AA530DD5E67C1F7BEC8B7D2FBD9E389F353FD4B585660A`.
- Docs updated:
  - `docs/iteration-log.md`
  - `docs/project-test-report-2026-06-08.md`
  - `docs/testing-sop-enhanced-2026-06-08.md`
  - `docs/project-risk-review-2026-06-08.md`
  - `docs/project-prd-2026-06-05.md`
- Current status:
  - V26.6.10.2 is the current packaged build for user smoke.
  - Final release acceptance remains with the user after real-room observation.
