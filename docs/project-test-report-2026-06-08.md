# 项目测试报告

生成日期：2026-06-08  
最近更新：2026-06-09  
当前验收版本号：`V26.6.9.2`  
测试环境：Windows / PowerShell / Node.js `v22.16.0` / npm `10.9.2`  
当前安装包：`C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe`

## 1. 测试结论

`V26.6.9.2` 本轮修复 P0 特别关注展示格式：只改前端展示口径，不改变采集、匹配、入库、统计和导出逻辑。已完成一次安装版覆盖安装、启动、真实抖音直播间采集、停止和 Excel 导出 smoke；真实 smoke 仍不作为硬门禁。

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 完整回归 | PASS | 2026-06-09 15:42 复跑 `npm run test:regression` 通过：server 18、web 8、desktop 6 |
| 安全审计 | PASS | 2026-06-09 15:42 复跑 `npm run audit:security` high=0；剩余 2 个 moderate |
| 特别关注展示回归 | PASS | 红灯验证先失败于 `[备注名 / 原昵称]`，修复后 `regression-gift-remark-display.mjs` 通过 |
| 100k 压测 | Not Re-run | 本轮不改保留上限和导出架构，沿用 `V26.6.9.1` 压测结论 |
| 桌面打包 | PASS | `npm run desktop:pack:fast` 生成 `V26.6.9.2` 安装包，packaged native ABI 门禁通过 |
| 安装覆盖与启动 | PASS | 静默覆盖安装 `26.6.9-2` 成功；安装版启动日志包含 `releaseTag=V26.6.9.2`、`serverUrl=http://127.0.0.1:3100`，主界面 DOM 已渲染 |
| 真实直播间 smoke | PASS | `https://live.douyin.com/962565925628` 采集、停止、自动保存和导出接口均通过 |

## 2. 当前命令结果

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `node apps\web\scripts\regression-gift-remark-display.mjs` | PASS | 红灯验证后修复，确认礼物行显示 `[原昵称]` |
| `node apps\web\scripts\regression-stopped-session-and-remarks.mjs` | PASS | 停止会话和备注搜索相关回归未受影响 |
| `npm run test:regression` | PASS | build + prepare-runtime + server/web/desktop regression；server 18、web 8、desktop 6 |
| `npm run audit:security` | PASS | high=0；`exceljs -> uuid` moderate 保留 |
| `npm run desktop:pack:fast` | PASS | 生成 `V26.6.9.2` 安装包；native ABI 门禁通过并恢复 Node ABI |
| `node apps\desktop\scripts\run-regressions.cjs` | PASS | 打包后桌面静态回归 |
| `npm run test:web` | PASS | 2026-06-09 测试补强后复跑：web 8 个回归脚本全部通过 |

## 3. P0 安全结果

| 用例 | 结果 |
| --- | --- |
| 无 Cookie 请求 `/api/sessions/active`、`/api/events`、`/api/export.xlsx`、`/api/events/stream` 返回 401 | PASS |
| 正确 Cookie 请求上述接口成功 | PASS |
| `Origin: null` POST 返回 403 且业务 handler 不执行 | PASS |
| 非法 Origin GET 即使带正确 Cookie 也返回 403 | PASS |
| 非抖音 URL、HTTP URL、域名伪装 URL 被拒绝 | PASS |

## 4. 压测结果

命令：

```powershell
node --import tsx apps\server\scripts\pressure-export-100k.mjs
```

| 指标 | 数值 |
| --- | ---: |
| 事件数 | 100000 |
| 当前源码保留上限 | 50000 |
| retainedEvents | 48000 |
| totalMs | 8746 |
| xlsxMb | 1.2 |
| rssDeltaMb | 349.8 |

结论：10 万事件统计和导出可完成；累计统计可代表新版本接收后的全量历史，Excel 明细仍只代表当前保留的原始事件。正式原始事件保留边界仍保持当前源码 5 万事件；本轮不直接升到 10 万。

## 5. 发布产物

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.2-安装包.exe` |
| 大小 | 85,324,896 bytes |
| SHA256 | `01B6696502EEF5700C8AF24ACCF38D39B3974393C05CB467324A16C94162E92C` |
| 回滚保留 | `糖三角-V26.6.9.1-安装包.exe` |
| 代码签名 | `NotSigned`；按用户决策本轮先不做签名 |

## 6. V26.6.9.2 安装版真实 smoke

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 覆盖安装 | PASS | `糖三角-V26.6.9.2-安装包.exe /S` 退出码 0；注册表显示 `糖三角 26.6.9-2` |
| 安装路径 | PASS | `D:\糖三角\@douyin-live-suitedesktop\糖三角.exe` |
| 启动无白屏 | PASS | `desktop-startup.log` 记录 `releaseTag=V26.6.9.2`、`appVersion=26.6.9-2`、`serverUrl=http://127.0.0.1:3100`，`rootChildCount=1` |
| 本地服务绑定 | PASS | `127.0.0.1:3100` 由安装版 `糖三角.exe` 监听 |
| 登录状态 | PASS | `/api/browser/state` 返回 `loggedIn=true`，`profileDisplayName=天晴了` |
| 真实直播间 | PASS | `https://live.douyin.com/962565925628`，会话 `8O4oe_OrQC` |
| 采集结果 | PASS | 停止后统计：评论 42、进场 18、互动 12、礼物 161、礼物件数 171、日志 3、唯一用户 220 |
| 手动停止自动保存 | PASS | 桌面生成 `C:\Users\85855\Desktop\糖三角-20260609-153806-冻腰冻拐（三角洲行动）-8O4oe_OrQC.xlsx` |
| Excel 文件可读 | PASS | ExcelJS 成功读取自动保存文件，包含 `全量统计汇总`、`全量礼物排行`、`当前保留明细说明`、`评论`、`进场`、`互动`、`礼物`、`日志` sheet |
| 导出接口 | PASS | `/api/export.xlsx?sessionId=8O4oe_OrQC` 生成 `tmp\smoke-export-8O4oe_OrQC.xlsx`，大小 35,340 bytes |
| 特别关注真实命中 | Not Covered | 用户无法提供真实特别关注用户 ID；本轮用 `regression-gift-remark-display.mjs`、`regression-stopped-session-and-remarks.mjs` 的隔离 mock 覆盖，不向真实会话注入假事件 |

## 7. 剩余风险

| 风险 | 优先级 | 是否阻断 | 处理意见 |
| --- | --- | --- | --- |
| 特别关注真实用户命中未现场截图 | P1 | 否 | 当前无可命中的真实特别关注 ID；继续以隔离 mock 回归保障展示口径，后续有真实 ID 再补截图 |
| `exceljs -> uuid` moderate | P2 | 否 | 不降级 ExcelJS；保留安全接受记录 |
| 10 万事件原始明细上限未提升 | P1 | 否 | 统计已累计汇总；当前保留上限不提升；后续如需要全量明细再考虑流式导出 |
| `collector.ts @ts-nocheck` 和大文件 | P1/P2 | 否 | 已加 payload schema 边界；后续分模块治理 |

## 8. 2026-06-09 测试覆盖补强

本次只补强测试脚本和文档，不改业务代码，不重新打包。

| 项 | 结果 |
| --- | --- |
| 备份 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\backups\test-coverage-tighten-20260609-151022` |
| 补强脚本 | `apps/web/scripts/regression-stopped-session-and-remarks.mjs` |
| 新增断言 | 特别关注 remark 不得拼入展示用户名；展示用户名保持原昵称 |
| 验证命令 | `npm run test:web` |
| 验证结果 | PASS：web 8 个回归脚本全部通过 |

## 9. 历史记录：2026-06-08 19:18 二次复核

本次复核不新增业务代码，不重新运行安装器，也不覆盖用户已安装版本。

| 项 | 结果 |
| --- | --- |
| 工作目录 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean`，未使用 `sms-relay-platform` |
| `npm run test:regression` | PASS：server 14、web 8、desktop 3 |
| `npm run audit:security` | PASS：high=0；仍有 `exceljs -> uuid` 2 个 moderate |
| 安装包 SHA256 | `AE8ECA5938E3FE2B82CBEF59A05A98C981F6A1D07440B98F0A1D2016FE5FAEEA` |
| 安装包结构 | 非侵入式检查为 PE 可执行文件，包含 NSIS/Nullsoft 标记 |
| 代码签名 | `NotSigned`，当前安装包未做 Authenticode 签名 |
| release 目录 | 仅保留 `V26.5.29.17` 回滚包和 `V26.5.29.18` 当前包，未发现额外残留 |

二次复核结论：P0 自动化门禁仍通过；安装向导、安装后启动、真实直播间 smoke 仍需人工验收，不作为本轮 P0 自动化阻断。

## 10. V26.5.29.19 安装后 native ABI 修复复测

触发问题：用户安装 `V26.5.29.18` 后启动报错，`better_sqlite3.node` compiled against `NODE_MODULE_VERSION 127`，但 Electron 40 运行时需要 `NODE_MODULE_VERSION 143`。

根因判断：原打包链路只验证工作区 `node_modules` 可被 Electron 加载，没有把最终 `release\win-unpacked\resources\app.asar.unpacked` 中的 native 模块作为门禁；覆盖安装时也可能保留旧版本 `better-sqlite3` native 残留。

修复：

- 版本号升为 `V26.5.29.19`。
- 新增 `apps/desktop/scripts/regression-packaged-native-abi.cjs`，在 `electron-builder` 生成安装器后、`finalize-installer` 清理前，使用最终打包出的 `糖三角.exe` 加载最终 `app.asar.unpacked` 内的 `better-sqlite3`。
- `apps/desktop/package.json` 的 `pack:fast` / `pack:full` 已接入 `regression-packaged-native-abi.cjs --required`。
- `apps/desktop/build/installer.nsh` 在安装新文件前清理旧 `resources\app.asar.unpacked\node_modules\better-sqlite3`，避免覆盖安装残留旧 ABI native 文件。
- 新增 `regression-installer-native-cleanup.cjs`，防止清理逻辑被误移到安装后。

验证：

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `node apps\desktop\scripts\regression-installer-native-cleanup.cjs` | PASS | 安装器清理旧 native 残留规则存在，且不在安装后误删新模块 |
| `node apps\desktop\scripts\regression-packaged-native-abi.cjs --required` | PASS | 打包流程中输出 `electron=40.10.2`、`modules=143` |
| `npm run test:regression` | PASS | server 14、web 8、desktop 4 |
| `npm run audit:security` | PASS | high=0；仍有 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS | 生成 `V26.5.29.19` 安装包，打包中 native ABI 门禁通过 |
| `node apps\desktop\scripts\run-regressions.cjs` | PASS | 打包后桌面静态回归 |

发布产物：

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.19-安装包.exe` |
| 大小 | 85,322,361 bytes |
| SHA256 | `EC65CFEFF5441BE6E88A285204FE1EF88A747E424F9C966671E40EEAAC0EB30A` |
| 回滚保留 | `糖三角-V26.5.29.18-安装包.exe` |
| release 清理 | 未发现 `win-unpacked`、`builder-debug.yml`、未版本化 `糖三角.exe` 残留 |

历史结论：`V26.5.29.18` 不建议继续安装；当时生成 `V26.5.29.19` 用于复测。该版本随后被 `V26.5.29.20`、`V26.6.9.1` 和当前 `V26.6.9.2` 取代。

## 11. V26.5.29.20 native ABI 二次修复复测

触发问题：用户安装 `V26.5.29.19` 后仍报同一类错误，真实安装目录 `D:\糖三角\@douyin-live-suitedesktop\resources\app.asar.unpacked\node_modules\better-sqlite3\build\Release\better_sqlite3.node` 仍为 Node ABI 127。

真正根因：`V26.5.29.19` 的门禁仍是误判。脚本 require 了 `better-sqlite3` 包入口，但包入口不会立即加载 native addon；必须直接加载 `better_sqlite3.node` 或创建数据库实例才会触发 ABI 校验。

修复：

- 版本号升为 `V26.5.29.20`。
- `prepare-native.cjs` 改为直接 `node-gyp rebuild --runtime=electron --target=40.10.2`，生成真正的 Electron ABI 143 native 文件。
- `prepare-native.cjs` 和 `regression-packaged-native-abi.cjs` 都改为直接 require `better_sqlite3.node`，并创建 `:memory:` 数据库验证真实可用性。
- 新增 `prepare-node-native.cjs`，打包后恢复 Node ABI 127，避免服务端 Node 回归无法加载 `better-sqlite3`。
- 根 `test:regression` 开头先执行 `prepare-node-native.cjs`。

验证：

| 命令 | 结果 | 备注 |
| --- | --- | --- |
| `node apps\desktop\scripts\prepare-node-native.cjs --force` | PASS | 恢复 Node ABI 127 |
| `npm run test:regression` | PASS | server 14、web 8、desktop 4 |
| `npm run audit:security` | PASS | high=0；仍有 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS | 打包中直接加载最终 `.node`，输出 `nativeAddonType=object`、`modules=143` |
| `node apps\desktop\scripts\run-regressions.cjs` | PASS | 打包后桌面静态回归 |
| `node -e "new (require('better-sqlite3'))(':memory:').close()"` | PASS | 打包结束后 Node ABI 已恢复 |

发布产物：

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.5.29.20-安装包.exe` |
| 大小 | 85,322,944 bytes |
| SHA256 | `5C32511A5B0AAE4D72BEC3A66CAAFF073DF4E79C7C441948B3F30A1C91E4B907` |
| 回滚保留 | `糖三角-V26.5.29.19-安装包.exe` |
| release 清理 | 未发现 `win-unpacked`、`builder-debug.yml`、未版本化 `糖三角.exe` 残留 |

历史结论：`V26.5.29.18`、`V26.5.29.19` 都不建议继续使用；当前验收版本为 `V26.6.9.2`，`V26.6.9.1` 作为上一稳定包保留。

## 12. V26.6.9.1 全量历史统计与风险收敛复测

版本规则：用户已明确版本号按打包日期约定，2026-06-09 首个修复包为 `V26.6.9.1`。

本轮目标：

- 统计口径改为尽量代表全量直播历史，新增会话级累计汇总。
- Excel 导出增加“全量统计汇总”和“当前保留明细说明”。
- 配置启动增加 Zod 校验，非法 `HOST/PORT` 在 listen 前失败。
- 发布版本增加日期版本门禁，防止再次误用历史日期发布线。
- collector 页面 payload 增加严格归一化边界，降低 `@ts-nocheck` 风险。

已新增/更新自动化：

| 脚本 | 覆盖点 |
| --- | --- |
| `apps/server/scripts/regression-full-history-stats.mjs` | 原始事件裁剪后统计仍保留累计历史 |
| `apps/server/scripts/regression-export-full-history-summary.mjs` | Excel 包含全量统计和保留明细说明 |
| `apps/server/scripts/regression-config-validation.mjs` | 非法 HOST/PORT 启动前失败 |
| `apps/server/scripts/regression-collector-payload-schema.mjs` | 页面 payload 进入业务前归一化 |
| `apps/desktop/scripts/regression-release-version.cjs` | `VYY.M.D.N` 日期版本和 releaseTag 一致 |
| `apps/desktop/scripts/regression-chinese-readability.cjs` | 关键中文输出可读 |

压测最新结论：

| 事件数 | 保留明细行 | 总耗时 | RSS 增量 | Excel 大小 |
| --- | ---: | ---: | ---: | ---: |
| 10,000 | 10,000 | 1,080 ms | 101.9 MB | 0.3 MB |
| 50,000 | 50,000 | 5,767 ms | 290.5 MB | 1.3 MB |
| 100,000 | 48,000 | 8,746 ms | 349.8 MB | 1.2 MB |

结论：新统计汇总可覆盖 10 万接收事件；明细仍受保留窗口限制。100k 场景内存明显低于上一轮全量明细导出路径，但导出仍为 buffer 方式，后续如继续追求更低峰值可再做 streaming writer。

打包结果：

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.1-安装包.exe` |
| 大小 | 85,324,719 bytes |
| SHA256 | `5EF8F45912E2765B100D37B74B8DF367B8931F60D45D3E4F35D37E379F0557A3` |
| 回滚保留 | `糖三角-V26.5.29.20-安装包.exe` |
| release 清理 | 未发现 `win-unpacked`、`builder-debug.yml`、未版本化 `糖三角.exe` 残留 |

最终验证：

| 命令 | 结果 |
| --- | --- |
| `npm run test:regression` | PASS：server 18、web 8、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `node --import tsx apps\server\scripts\pressure-export-100k.mjs` | PASS：10k/50k/100k |
| `npm run desktop:pack:fast` | PASS：生成 `V26.6.9.1` 安装包，packaged native ABI 门禁通过 |
| `node apps\desktop\scripts\run-regressions.cjs` | PASS |
| `node -e "new (require('better-sqlite3'))(':memory:').close()"` | PASS：打包后 Node ABI 恢复为 127 |

## 13. V26.6.9.3 评论重复与礼物顺序修复复测

触发问题：

- 用户反馈评论区出现重复情况。
- 用户反馈礼物区中显示的消息顺序乱，且属于上一版未出现的新 bug。

修复范围：

- `apps/server/src/utils.ts`：评论 `uniqueKey` 对带 `sourceId` 的同源评论改用稳定来源字段，不再把变化的 `createdAt`、`collectorSeq` 纳入同一 DOM 事件的唯一键，避免同一条评论反复扫描后生成多条记录。
- `apps/server/src/capture-service.ts` / `apps/server/src/types.ts`：采集事件增加 `ingestSeq`，用于同时间戳事件的稳定顺序兜底。
- `apps/web/src/App.tsx`：礼物列表排序在 `createdAt/id` 不足以区分时使用 `payload.ingestSeq`，礼物身份补齐更新只替换身份字段，不覆盖原始 `id/createdAt/ingestSeq`。
- 版本按用户日期规则升为 `V26.6.9.3` / `26.6.9-3`。

专项验证：

| 命令 | 结果 |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-unique-key.mjs` | PASS：同 `sourceId/rawText/text` 评论在不同 `createdAt/collectorSeq` 下保持同一 uniqueKey |
| `node apps/web/scripts/regression-gift-display-order.mjs` | PASS：同时间戳、无 DB id 的礼物行按 `ingestSeq` 稳定排序 |
| `node apps/desktop/scripts/regression-release-version.cjs` | PASS：`V26.6.9.3` 与 `26.6.9-3` 一致 |
| `npm run test:regression` | PASS：server 18、web 9、desktop 6 |
| `npm run audit:security` | PASS：high=0；保留 `exceljs -> uuid` 2 个 moderate |
| `npm run desktop:pack:fast` | PASS：生成 `V26.6.9.3` 安装包，packaged native ABI 门禁通过 |

发布产物：

| 项 | 值 |
| --- | --- |
| 安装包 | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.9.3-安装包.exe` |
| 大小 | 85,326,404 bytes |
| SHA256 | `46209A29BAB8127250F719CBD256B10C302980047EB672106447638B2970D8CD` |
| 回滚保留 | `糖三角-V26.6.9.2-安装包.exe` |

安装版真实直播间 smoke：

| 项 | 结果 |
| --- | --- |
| 覆盖安装 | PASS：安装器 `/S` 退出码 0，注册表显示 `糖三角 26.6.9-3` |
| 安装后启动 | PASS：启动日志包含 `releaseTag=V26.6.9.3`、`appVersion=26.6.9-3`、`serverUrl=http://127.0.0.1:3100` |
| 登录状态 | PASS：`/api/browser/state` 返回 `loggedIn=true`，`profileDisplayName=天晴了` |
| 直播间 | `https://live.douyin.com/127874409138` |
| 会话 ID | `ehGrIJDv6x` |
| 房间识别 | `婷哥kiki🎙️ ⁸⁰²³的抖音直播间`，`isLive=true` |
| 短时采集结果 | 评论 13、进场 111、互动 6、礼物 5、日志 2 |
| 评论重复检查 | PASS：1000 条查询窗口内 `DUP_UNIQUE_KEY=0`，`sourceId/userId/message` 重复组为 0 |
| 礼物顺序检查 | PASS：5 条真实礼物的 `id/createdAt/ingestSeq` 均按最新在前一致排序 |
| 手动停止 | PASS：`/api/sessions/stop` 返回 200，停止后 active session 为空 |
| 导出接口 | PASS：`/api/export.xlsx?sessionId=ehGrIJDv6x` 生成 25,770 bytes Excel，SHA256 `F237C55ECE23AAAFFDC6C1350F1466DB253A410EAC1EA075591C986C19C9974C` |

结论：`V26.6.9.3` 针对“评论重复”和“礼物区顺序乱”的专项回归、全量发布回归、安全审计、打包和安装版真实直播间 smoke 均已执行。真实 smoke 为短时样本，不能替代用户最终发布拍板；若后续在更高峰直播间复现，应保留会话 ID、时间点和诊断信息继续定位。
## 14. 2026-06-10 P0 Capture Integrity Retest

Trigger:
- Gift name was incomplete: live-room gift `送你花花 x1` could be shown as `你花花 x1`.
- Rich comment body could be incomplete or overlapped, for example only showing `@XX欢迎` while the live room had more text.
- Highlight users could miss hits in comment/gift rows when the stable identity existed only in `payloadJson`.

Changed files:
- `apps/server/src/utils.ts`
- `apps/server/src/collector.ts`
- `apps/web/src/App.tsx`
- `apps/server/scripts/regression-gift-name-prefix.mjs`
- `apps/server/scripts/regression-comment-rich-mention-body.mjs`
- `apps/web/scripts/regression-highlight-payload-identity.mjs`

Verification:
| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npx tsc -p apps/server/tsconfig.json --noEmit` | PASS |
| `npm run test:regression` | PASS: server 20, web 10, desktop 6 |

Notes:
- Full regression used project-local test storage to avoid the current sandbox failing to open the default outer `storage` database path.
- Rich-comment protection now covers mention nodes, short-tail nodes, full-body nodes, and overlapped leading phrase mock cases. If the real live room still reproduces truncation, keep session ID, timestamp, screenshot, visible text, and copied diagnostics for DOM-specific follow-up.

## 15. V26.6.10.1 Package Verification

Purpose:
- Package the 2026-06-10 P0 capture integrity fixes with the correct date-version rule.
- Confirm regression, security audit, and packaged native ABI gates still pass after the version bump.

Version:
- Visible release tag: `V26.6.10.1`
- npm semver: `26.6.10-1`

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS: server 20, web 10, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `npm run desktop:pack:fast` | PASS; `regression-packaged-native-abi.cjs --required` passed |

Release artifact:

| Item | Value |
| --- | --- |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.1-安装包.exe` |
| Size | `85,327,097` bytes |
| SHA256 | `77CBA10028BFAD590ABEF3EA93769BC65983EF3BE60BAA622F1B17C98515EE84` |

Conclusion:
- Automated release gates for V26.6.10.1 passed.
- Final real-room acceptance remains a user decision. Focus the smoke on compact gift names beginning with `送`, rich comments with @/emoji/full text, and real special-follow hits in comment/gift rows.

## 16. V26.6.10.2 Rich Comment Root-Aria Retest

Purpose:
- Cover a closer real-DOM risk where the full comment text is stored on the chat row or content container `aria-label/title`, while child visible nodes only expose the short prefix `@XX欢迎`.

Changed coverage:
- `apps/server/scripts/regression-comment-rich-mention-body.mjs` now includes:
  - child mention + full body node,
  - child short prefix + full body `aria-label`,
  - content container `aria-label`,
  - whole row `aria-label` with child short prefix.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-action-and-rich-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-body-noise.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-loss.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-gift-name-prefix.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run test:regression` | PASS: server 20, web 10, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |
| `node apps/desktop/scripts/run-regressions.cjs` | PASS: desktop 6 |
| `node -e "new (require('better-sqlite3'))(':memory:').close()"` | PASS |

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.10.2` / `26.6.10-2` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.10.2-安装包.exe` |
| Size | `85,325,946` bytes |
| SHA256 | `50AE8AF70AF1CDED74AA530DD5E67C1F7BEC8B7D2FBD9E389F353FD4B585660A` |

Conclusion:
- The known P0 capture issues are covered by automated regressions and packaged in V26.6.10.2.
- Real-room final acceptance remains with the user. If a new rich-comment truncation appears, collect session ID, timestamp, screenshot, exact visible text, and copied diagnostics.

## 17. 2026-06-11 P0 Comment/Gift Remark Closure Retest

Purpose:
- Turn recurring "comment loss" and "gift remark loss" issues into a traceable gate from collector input through DB, SSE, diagnostics, and frontend copy diagnostics.
- Keep the confirmed product boundaries unchanged: UI recent window only, 50,000 retained raw events per session, stable-identity-only highlight matching, no nickname fallback.

Changed coverage:
- Added `apps/server/scripts/regression-capture-integrity-ledger.mjs`.
- Added `apps/server/scripts/regression-capture-integrity-runtime.mjs`.
- Added `apps/web/scripts/regression-copy-diagnostics-gift-remarks.mjs`.
- Added `/api/diagnostics/capture-integrity`.
- Copy diagnostics now include persisted gifts, recent gifts, capture integrity ledger, and highlight match details with `matchedBy/matchedValue`.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-ledger.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-capture-integrity-runtime.mjs` | PASS |
| `node apps/web/scripts/regression-copy-diagnostics-gift-remarks.mjs` | PASS |
| `node apps/web/scripts/regression-highlight-payload-identity.mjs` | PASS |
| `npm run build:server` | PASS |
| `npm run build:web` | PASS |
| `npm run test:regression` | PASS: server 22, web 11, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |

Conclusion:
- P0 comment loss and gift remark loss now have automated traceability gates.
- No new package was produced in this pass; current installer remains V26.6.10.2 unless a separate packaging step is requested.
- Real-room final acceptance remains with the user. For any future recurrence, collect session ID, timestamp, screenshot, visible text, gift row, highlight config line, and copied diagnostics.

## 18. V26.6.11.1 Manual Test Package

Purpose:
- Package the 2026-06-11 P0 comment/gift remark closure for user manual testing.

Version:
- Visible release tag: `V26.6.11.1`
- npm semver: `26.6.11-1`

Command results:

| Command | Result |
| --- | --- |
| `node apps/desktop/scripts/regression-release-version.cjs` | PASS |
| `npm run test:regression` | PASS: server 22, web 11, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed during packaging |

Release artifact:

| Item | Value |
| --- | --- |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.1-安装包.exe` |
| Size | `85,327,837` bytes |
| SHA256 | `32B409FAC6C0E06E975C51F16B0FF9FB36A0A82BC28A7A55CD784DF49937E47C` |

Notes:
- Packaging initially detected the expected Node ABI 127 vs Electron ABI 143 mismatch, then rebuilt `better-sqlite3` for Electron 40 ABI 143 and passed the packaged native ABI gate.
- `finalize-installer.cjs` removed `win-unpacked` after packaging; a post-finalize manual re-run of `regression-packaged-native-abi.cjs --required` is therefore not applicable.
- Final manual acceptance remains with the user.

## 19. 2026-06-11 P0 Strong Mock Retest

Purpose:
- Strengthen the mock-based release gate for repeated comments and lost gift remarks after the P0 closure.
- This pass only adds tests and documentation. It does not change business behavior and does not produce a new installer.

Command results:

| Command | Result | Notes |
| --- | --- | --- |
| `node --import tsx apps/server/scripts/regression-capture-integrity-strong-mock.mjs` | PASS | Same-source comment rescan, real repeated comments, identity-late gift, payload-only identity, DB/export/ledger/SSE/highlight diagnostics |
| `node apps/web/scripts/regression-gift-identity-update-remark-mock.mjs` | PASS | Same-`uniqueKey` gift identity update replaces the row, keeps original order fields, and recomputes highlight remark |
| `npm run test:server` | PASS | server 23 scripts |
| `npm run test:web` | PASS | web 12 scripts |
| `npm run test:regression` | PASS | build + server 23 + web 12 + desktop 6 |
| `npm run audit:security` | PASS | high=0; remaining `exceljs -> uuid` 2 moderate |

Conclusion:
- Comment duplicate prevention and real repeated-comment preservation now have one end-to-end mock gate through DB, export source, ledger, and SSE.
- Gift remark recovery now has both backend and frontend mock gates: backend updates/publishes the identity-late row; frontend replaces the existing row and recomputes the remark.
- Real-room testing remains a smoke/DOM-change discovery step. If the issue recurs, collect session ID, timestamp, screenshot, visible live-room text, gift row, highlight config line, and copied diagnostics.

## 20. V26.6.11.2 Real-Room Message Loss Fix Retest

Purpose:
- Fix the remaining real-room message loss risk without changing business display boundaries.
- Validate the real Douyin room provided by the user: `https://live.douyin.com/127874409138`.

Changed coverage:
- Added `apps/server/scripts/regression-collector-loss-resilience.mjs`.
- Added `apps/web/scripts/regression-stream-queue-no-comment-loss.mjs`.
- Added `apps/web/scripts/regression-vite-proxy-port.mjs`.
- Added real-room smoke helper `apps/server/scripts/smoke-real-room-message-integrity.mjs`.

Fix summary:
- Collector batch send failures now requeue the unsent batch instead of discarding it.
- No-source comments now carry `collectorClientId` so retry sends remain idempotent while true repeated comments remain distinguishable.
- Chat DOM text-node mutation is observed, and high-frequency fallback scan now checks the latest 80 rows every 250ms.
- Server SSE no longer trims pending events before writing to the client.
- Frontend comment stream queue keeps the current 50,000 event boundary before display-window trimming; UI still displays recent 200 comments.
- Vite dev proxy follows `PORT`, avoiding accidental proxying to another local project on 3100.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-collector-loss-resilience.mjs` | PASS |
| `node apps/web/scripts/regression-stream-queue-no-comment-loss.mjs` | PASS |
| `node apps/web/scripts/regression-vite-proxy-port.mjs` | PASS |
| `npm run test:regression` | PASS: server 24, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS: 90s real-room smoke |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

Real-room smoke result:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 90 seconds |
| Room title | `婷哥kiki🎙️ ⁸⁰²³的抖音直播间` |
| Raw events | 58 |
| Raw comments | 3 |
| Persisted events | 56 |
| Persisted comments | 1 |
| Entries / interactions / gifts | 53 / 2 / 0 |
| Comment ledger | raw 3, deduped 2, DB inserted 1, bus published 1 |
| Interpretation | The three raw comments had the same `sourceId=7650137793749947402` and same content, so two were DOM rescans and were correctly deduped. No evidence of distinct real comments being dropped in this smoke. |

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.11.2` / `26.6.11-2` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.2-安装包.exe` |
| Size | `85,327,499` bytes |
| SHA256 | `1369BD4C4A56C7E12B001C9CEDC94C5BFD9ACF26CC8615B7158C34F39E06B2A4` |

Conclusion:
- Known P0 message-loss risks in collector retry, DOM text reuse, SSE pending trim, frontend queue trim, and dev proxy port mismatch are mitigated.
- Installation/manual acceptance still remains with the user.

## 21. V26.6.11.3 React Payload Cache Retest

Purpose:
- Fix the remaining real-room risk where Douyin recycles a DOM chat row but the collector reuses stale React payload identity from the previous message.
- Validate that stale `sourceId/userId/userLink` cannot cause false comment dedupe or gift/highlight remark loss.

Fix summary:
- React payload data is cached only by scoped chat item root, current visible-row fingerprint, and a short 120ms TTL.
- If the visible row text/title/aria/data fingerprint changes, the collector rereads React props instead of reusing old identity.
- Same `sourceId` with different user/text is explicitly protected by regression coverage.
- Real-room smoke now reports duplicate `sourceId` groups and flags any group with different user/text variants.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-react-data-cache-refresh.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-sourceid-row-reuse.mjs` | PASS |
| `npm run test:regression` | PASS: server 26, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS: 180s real-room smoke |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

Real-room smoke result:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 180 seconds |
| Raw events | 210 |
| Raw comments | 27 |
| Persisted events | 122 |
| Persisted comments | 9 |
| Entries / interactions / gifts | 111 / 2 / 0 |
| Comment ledger | raw 27, deduped 18, DB inserted 9, bus published 9 |
| SourceId duplicate groups | all duplicate groups had `variantCount=1` |
| Interpretation | The repeated raw comments were repeated scans of the same visible comments; no evidence of distinct real comments being merged or dropped in this smoke. |

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.11.3` / `26.6.11-3` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.3-安装包.exe` |
| Size | `85,328,637` bytes |
| SHA256 | `D76B5A9D02C5F38BE3FDB6720CAC20D686AE246809FCBBFC748E33B31B5AB56B` |

Conclusion:
- The newly identified stale React payload risk is mitigated and covered by regression tests.
- Final real-room manual acceptance remains with the user.

## 22. V26.6.11.4 Real-Room Smoke Observer and Stop-Race Retest

Purpose:
- Strengthen real-room smoke evidence by comparing collector/DB/SSE output against leaf-level visible DOM rows.
- Fix the stop/heartbeat race that could crash real-room smoke with `Target page, context or browser has been closed`.

Fix summary:
- The smoke observer now reads only leaf-level message rows and rejects concatenated container text with multiple `:` / `：` separators.
- Collector heartbeat exits while stopping/not running and catches closed-target races around `installObserver`.
- Closed-target errors during normal stop no longer become fatal errors.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-collector-heartbeat-stop-race.mjs` | PASS |
| `npm run test:regression` | PASS: server 28, web 14, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `node apps/server/scripts/smoke-real-room-message-integrity.mjs https://live.douyin.com/127874409138` | PASS: 180s real-room smoke |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

Real-room smoke result:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 180 seconds |
| Raw events | 173 |
| Raw comments | 39 |
| Persisted events | 122 |
| Persisted comments | 13 |
| Entries / interactions / gifts | 103 / 6 / 0 |
| Comment ledger | raw 39, deduped 26, DB inserted 13, bus published 13 |
| SourceId duplicate groups | all duplicate groups had `variantCount=1` |
| Visible DOM observer | uniqueComments 11, `unmatchedCount=0` |
| Interpretation | Collector, DB, SSE, ledger, and leaf-level visible DOM observer were consistent in this smoke. No evidence of distinct real comments being dropped. |

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.11.4` / `26.6.11-4` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.4-安装包.exe` |
| Size | `85,328,389` bytes |
| SHA256 | `9AD1EFEB9C8ACC9B616268860382A273232E791D6C71500619F5DDA9C80B89C6` |

Conclusion:
- The real-room smoke harness now provides stronger evidence and no longer crashes during normal stop.
- Final installation/manual acceptance remains with the user.

## 23. V26.6.11.5 UI Backfill Window and Page-Probe Retest

Purpose:
- Investigate continued user-visible message loss on `https://live.douyin.com/127874409138`.
- Distinguish collector/DB/SSE loss from UI recent-window and history-backfill loss.

Root cause found:
- `/api/events` returns recent comments in descending order.
- The web UI previously sliced the tail of the returned array before sorting, so when history backfill returned more than 600 comments, the newest comments could be removed before the 200-row visible window was computed.
- This can make the UI appear to lose recent comments even when collector, DB and SSE are consistent.

Fix summary:
- `normalizeDisplayItems()` now sorts all candidate events by real event order first, then applies the display-window candidate trim and final 200-row comment window.
- Real-room smoke now installs an in-page `MutationObserver + 250ms scan` visible comment probe and reports `pageProbe` counters.

Command results:

| Command | Result |
| --- | --- |
| `node apps/web/scripts/regression-comment-history-desc-order.mjs` | PASS |
| `node apps/web/scripts/regression-comment-display-loss.mjs` | PASS |
| `node apps/web/scripts/regression-comment-history-backfill.mjs` | PASS |
| `node apps/web/scripts/regression-stream-queue-no-comment-loss.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-collector-heartbeat-stop-race.mjs` | PASS |
| 90s real-room smoke | PASS: raw comments 30, persisted comments 10, `pageProbe.unmatchedCount=0` |
| 5m real-room smoke | PASS: raw comments 126, persisted comments 42, deduped 84 |
| `npm run test:regression` | PASS: server 28, web 15, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

Five-minute smoke result:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 300 seconds |
| Raw events | 319 |
| Raw comments | 126 |
| Persisted events | 171 |
| Persisted comments | 42 |
| Entries / interactions / gifts | 121 / 8 / 0 |
| Comment ledger | raw 126, deduped 84, DB inserted 42, bus published 42 |
| SourceId suspicious groups | `[]` |
| Node visible observer | uniqueComments 36, `unmatchedCount=0` |
| In-page probe | scans 790, mutations 387, candidates 10658, uniqueComments 36, `unmatchedCount=0` |

Conclusion:
- This round found and fixed a UI-side latest-comment backfill loss risk.
- The enhanced real-room sample did not show distinct visible comments being dropped by collector/DB/SSE.
- Full installed-app acceptance remains with the user.

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.11.5` / `26.6.11-5` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.5-安装包.exe` |
| Size | `85,329,047` bytes |
| SHA256 | `A8746750CCE8FF323EDE15A4DD8C0801BD84091E3925AAE87C9943F04C1B3118` |

## 24. V26.6.11.6 Visible Leaf Comment Capture Retest

Purpose:
- Continue investigating user-visible message loss on `https://live.douyin.com/127874409138`.
- Verify that a real visible comment row outside the selected primary chat root is still captured.

Root cause found:
- A 5-minute real-room smoke before this fix found comments visible to both the Node observer and in-page probe, but absent from raw collector events and persisted DB rows.
- A minimal reproduction showed that when a main chat root exists, a valid leaf-level visible comment outside that root can be missed by the collector's root-focused scan.

Fix summary:
- The collector now runs a narrow full-page visible-leaf fallback scan.
- The fallback only scans leaf-level message candidates such as `comment-item`, `chat-item`, `listitem`, `commentItem`, and `messageItem`.
- Parent containers with nested visible message leaves are rejected to avoid concatenated pseudo-comments.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-visible-leaf-fallback.mjs` | PASS after reproducing RED before fix |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-observer.mjs` | PASS |
| `node apps/web/scripts/regression-comment-history-desc-order-ui.mjs` | PASS |
| 90s real-room smoke | PASS: raw comments 42, persisted comments 14, deduped 28, `unmatchedCount=0` for both observers |
| `npm run test:regression` | PASS: server 29, web 16, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `npm run desktop:pack:fast` | PASS; packaged native ABI gate passed |

Real-room smoke result:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 90 seconds |
| Raw events | 101 |
| Raw comments | 42 |
| Persisted events | 68 |
| Persisted comments | 14 |
| Entries / interactions / gifts | 53 / 1 / 0 |
| Comment ledger | raw 42, deduped 28, DB inserted 14, bus published 14 |
| SourceId suspicious groups | `[]` |
| Node visible observer | uniqueComments 13, `unmatchedCount=0` |
| In-page probe | uniqueComments 13, `unmatchedCount=0` |

Conclusion:
- This round found and fixed a collector-side visible-leaf scan gap.
- Final installed-app acceptance remains with the user.

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.11.6` / `26.6.11-6` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.11.6-安装包.exe` |
| Size | `85,328,840` bytes |
| SHA256 | `A8E138B7F5E4266ECD6C4D0BCDCF66AAE0FFDD4AF5074A94A6ADB4E1FCBE96EE` |

## 25. 2026-06-12 Split Comment and Rich Mention Retest

Purpose:
- Continue the P0 investigation for user-reported comment loss in the real Douyin room `https://live.douyin.com/127874409138`.
- Verify two newly observed DOM shapes: username/body split across sibling nodes, and rich comments where a shorter body node can hide the full `@mention + text + emoji` row text.

Fix summary:
- The collector now merges split visible comments when a leaf node contains only `用户名：` and the actual body is available on the parent or next sibling.
- Rich comment body selection no longer lets a shorter candidate replace a full text that already contains `@mention` or bracket emoji markers.
- Repeated bracket emoji bodies such as `[比心] [比心] [比心]` are preserved instead of being collapsed as duplicate rich prefixes.
- Real-room smoke now reports all visible leaf message rows, including comments, gifts, entries, interactions and unknown rows.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-comment-sibling-body-fallback.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-comment-rich-mention-body.mjs` | PASS |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-message-probe.mjs` | PASS |
| `npm run test:regression` | PASS: server 31, web 16, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |

Real-room smoke evidence:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 180 seconds |
| Raw comments | 21 |
| Persisted comments | 7 |
| Deduped comments | 14 |
| Visible comment observer | `unmatchedCount=0` |
| In-page comment probe | `unmatchedCount=0` |
| Visible message probe | `unmatchedCount=0` |
| In-page message probe | `unmatchedCount=0` |
| Unknown visible rows | `[]` |

Conclusion:
- The two concrete real-room loss modes found after `V26.6.11.6` are mitigated at source level and covered by regression scripts.
- This pass was not packaged and did not change the release version. Installed-app acceptance remains with the user after the next package is produced.

## 26. 2026-06-12 Stop Boundary Pending Drain Retest

Purpose:
- Continue the P0 real-room message-loss investigation after the split-comment fix.
- Verify that messages visible immediately before stopping collection are flushed from the browser page into the service before page cleanup.

Root cause found:
- A 5-minute real-room smoke exposed unmatched visible entry rows near the stop boundary.
- Code review confirmed the old cleanup path cancelled `flushTimer` and then executed `pending.length = 0`, so a newly observed event could be discarded if stop happened before the delayed flush ran.

Fix summary:
- `collector.stop()` now awaits the page cleanup function.
- The page cleanup function performs one final `bootstrapScan()`, `scanVisibleLeafComments()`, and `await flush()` before disconnecting observers and clearing timers.
- The real-room smoke classifier now treats `来了/进入直播间` as entry before gift detection, and requires gift `xN` to be an isolated token.

Command results:

| Command | Result |
| --- | --- |
| `node --import tsx apps/server/scripts/regression-collector-stop-drains-pending.mjs` | RED before fix, PASS after fix |
| `node --import tsx apps/server/scripts/regression-real-room-smoke-visible-message-probe.mjs` | PASS |
| `npm run test:server` | PASS: 32 scripts |
| `npm run test:regression` | PASS: server 32, web 16, desktop 6 |
| `npm run audit:security` | PASS: high=0; remaining `exceljs -> uuid` 2 moderate |
| `node apps/desktop/scripts/regression-release-version.cjs` | PASS: `V26.6.12.1` / `26.6.12-1` |
| `npm run desktop:pack:fast` | PASS: packaged native ABI gate passed |

Real-room smoke evidence:

| Item | Value |
| --- | --- |
| Room | `https://live.douyin.com/127874409138` |
| Duration | 300 seconds |
| Raw events | 268 |
| Raw comments | 90 |
| Persisted events | 144 |
| Persisted comments | 18 |
| Persisted entries | 126 |
| Comment ledger | raw 90, deduped 72, DB inserted 18, bus published 18 |
| Node visible comment observer | `unmatchedCount=0` |
| In-page comment probe | `unmatchedCount=0` |
| Node visible message probe | `unmatchedCount=0` |
| In-page message probe | `unmatchedCount=0` |
| Unmatched visible messages | `[]` |
| SourceId suspicious groups | `[]` |

Conclusion:
- The stop-boundary pending discard risk is fixed at source level and covered by regression.
- This pass is packaged as `V26.6.12.1`. Installed-app acceptance remains with the user.

Release artifact:

| Item | Value |
| --- | --- |
| Version | `V26.6.12.1` / `26.6.12-1` |
| Installer | `C:\Users\85855\PycharmProjects\PythonProject\douyin-live-suite-clean\apps\desktop\release\糖三角-V26.6.12.1-安装包.exe` |
| Size | `85,329,128` bytes |
| SHA256 | `3AE6D269F9A90BEB52585649C131C7E47A9D822A7D16D294555FDFCA3B71CEEB` |
