# 糖三角测试 SOP

生成日期：2026-06-05

## 目标

在不依赖真实抖音直播间的情况下，用构建、源码回归、mock 数据、API 安全检查和人工验收共同保证产品质量。真实直播间测试仍保留为发布前人工验收项，因为账号、直播间和网络环境不可稳定自动化。

## 发布前必跑命令

```powershell
npm run test:regression
npm run audit:security
```

如果准备打包安装包，再追加：

```powershell
npm run desktop:pack:fast
node apps\desktop\scripts\run-regressions.cjs
```

## 功能模块测试

| 模块 | 自动化方式 | Mock 数据要求 | 质量门禁 |
| --- | --- | --- | --- |
| API 安全 | `apps/server/scripts/regression-api-security.mjs` | 非法 Origin、cross-site POST、非抖音 URL、合法本机 Origin | 非法跨站状态变更不得进入 handler；非抖音 URL 必须拒绝 |
| 启动与静态资源 | `regression-static-shell-cache.mjs`、桌面白屏诊断脚本 | 临时 web dist、缺失旧 hash asset | index 禁缓存；缺失 asset 返回 404，不回退 HTML |
| 登录与浏览器状态 | `regression-browser-state-stale-context.mjs` | mock stale BrowserContext | stale context 自动清理，不暴露旧登录状态 |
| 评论采集/分类 | server comment regression scripts | mock RawCollectorEvent、评论文本、互动文本 | 真实评论不丢不重；互动/礼物分类正确 |
| 礼物与身份 | `regression-gift-identity.mjs`、`regression-gift-remark-display.mjs` | mock 礼物、神秘人、特别关注身份 | 普通身份不得覆盖神秘人；备注显示不丢 |
| 入库与导出 | `regression-db-insert-indexes.mjs`、`regression-export-all-comments.mjs` | 临时 SQLite 或源码断言 | 只统计实际插入事件；导出全量会话事件 |
| 前端展示 | web regression scripts | mock SSE rows、历史回填、localStorage 异常 | 评论显示窗口、诊断、备注、神秘人刷新符合预期 |
| 桌面打包 | desktop regression scripts | mock release 目录、源码断言 | runtime 资源、安装包保留、白屏诊断链路完整 |

## Mock 数据原则

1. 每个 mock 只覆盖一个明确行为，不把多个风险混在一个用例里。
2. 用户身份字段至少覆盖 `userName`、`userId`、`userLink`、`payloadJson` 四类来源。
3. 评论 mock 必须包含同用户重复评论、不同用户相同正文、互动文本、礼物文本。
4. 安全 mock 必须包含合法本机来源和非法远程来源，避免只测拒绝不测放行。
5. 导出 mock 必须覆盖超过 UI 显示窗口的历史事件，防止导出被前端显示上限误影响。

## 人工验收清单

| 场景 | 步骤 | 通过标准 |
| --- | --- | --- |
| 首次启动 | 打开桌面客户端 | 主界面渲染，无白屏，日志有 serverUrl 和资源状态 |
| 登录 | 点击“登录抖音”并完成登录 | 登录窗口可打开/关闭，状态显示当前账号 |
| 开始采集 | 输入合法 `https://live.douyin.com/{roomId}` | 创建 running session，评论/进场/互动/礼物开始展示 |
| 非法 URL | 输入非抖音或 http URL | UI 显示拒绝信息，不启动采集页 |
| 停止采集 | 采集中点击停止 | session stopped，数据保留，统计不清零 |
| 导出 Excel | 停止后导出 | Excel 可下载，包含评论、进场、互动、礼物和统计 |
| 特别关注 | 配置 `highlight_users.txt` 后采集命中用户 | 命中高亮，显示“备注 / 原昵称”，主页打开仍使用稳定 ID/link |
| 神秘人 | 采集神秘人进场/评论/送礼 | 神秘人列表刷新，展开动态来源正确 |
| 升级安装 | 覆盖安装新版本后启动 | 不加载旧 hash 资源，不白屏 |

## 失败处理

1. 自动化失败：先定位失败脚本对应模块，不跳过脚本继续发布。
2. `audit:security` 失败：如果 high 漏洞未清零，必须记录风险接受依据和受影响依赖链。
3. 人工验收失败：记录复现步骤、日志路径、直播间 URL、时间点和截图，再进入修复。
4. 修复后必须重新跑 `npm run test:regression`，不能只跑单个脚本。

## 发布准入

- `npm run test:regression` 退出码为 0。
- `npm run audit:security` 无 high 漏洞，或有明确风险接受记录。
- 至少完成一次真实直播间人工验收。
- 打包发布时必须完成桌面安装包 smoke，并确认 release 目录没有临时构建残留。
