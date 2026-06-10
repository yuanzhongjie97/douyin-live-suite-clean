# 项目测试报告

生成日期：2026-06-05  
测试环境：Windows / PowerShell / Node.js `v22.16.0` / npm `10.9.2`

## 1. 测试结论

构建和现有回归脚本通过；依赖安全审计未通过。

| 项目 | 结果 | 说明 |
| --- | --- | --- |
| 服务端 TypeScript 构建 | PASS | `npm --workspace apps/server run build` 退出码 0 |
| 前端 TypeScript + Vite 构建 | PASS | `npm --workspace apps/web run build` 退出码 0 |
| 根构建脚本 | PASS | `npm run --silent build --if-present` 退出码 0 |
| 回归脚本 | PASS | 23 个脚本全部退出码 0 |
| 依赖安全审计 | FAIL | `npm audit --json` 退出码 1，9 个漏洞 |
| 覆盖率 | N/A | 项目未配置覆盖率工具 |
| 真实抖音直播端到端 | Not Run | 未接入可稳定复现的真实直播间自动化 |

## 2. 执行命令

```powershell
npm run --silent build --if-present
npm --workspace apps/server run build
npm --workspace apps/web run build
npx tsx apps/server/scripts/regression-*.mjs
npx tsx apps/web/scripts/regression-*.mjs
node apps/desktop/scripts/regression-*.cjs
npm audit --json
```

说明：项目没有统一 `test` 脚本，本次按目录枚举并执行所有 `regression-*` 脚本。

## 3. 构建结果

### 服务端构建

命令：

```powershell
npm --workspace apps/server run build
```

结果：PASS  
证据：`tsc -p tsconfig.json` 完成，退出码 0。

### 前端构建

命令：

```powershell
npm --workspace apps/web run build
```

结果：PASS  
证据：

- `tsc -b` 通过。
- `vite build` 成功。
- 输出资源：
  - `dist/index.html` 0.40 kB
  - `dist/assets/index-rxdyJc3r.css` 99.57 kB
  - `dist/assets/index-CPwG7lKL.js` 262.27 kB

## 4. 回归脚本结果

### 后端脚本

| 脚本 | 结果 |
| --- | --- |
| `apps/server/scripts/regression-auto-save-session.mjs` | PASS |
| `apps/server/scripts/regression-browser-state-stale-context.mjs` | PASS |
| `apps/server/scripts/regression-comment-action-and-rich-body.mjs` | PASS |
| `apps/server/scripts/regression-comment-action-classification.mjs` | PASS |
| `apps/server/scripts/regression-comment-body-noise.mjs` | PASS |
| `apps/server/scripts/regression-comment-diagnostics.mjs` | PASS |
| `apps/server/scripts/regression-comment-loss.mjs` | PASS |
| `apps/server/scripts/regression-comment-unique-key.mjs` | PASS |
| `apps/server/scripts/regression-db-insert-indexes.mjs` | PASS |
| `apps/server/scripts/regression-export-all-comments.mjs` | PASS |
| `apps/server/scripts/regression-gift-identity.mjs` | PASS |
| `apps/server/scripts/regression-static-shell-cache.mjs` | PASS |

### 前端脚本

| 脚本 | 结果 |
| --- | --- |
| `apps/web/scripts/regression-comment-display-diagnostics.mjs` | PASS |
| `apps/web/scripts/regression-comment-display-loss.mjs` | PASS |
| `apps/web/scripts/regression-comment-history-backfill.mjs` | PASS |
| `apps/web/scripts/regression-gift-remark-display.mjs` | PASS |
| `apps/web/scripts/regression-mystery-refresh.mjs` | PASS |
| `apps/web/scripts/regression-renderer-effect-event-crash.mjs` | PASS |
| `apps/web/scripts/regression-renderer-startup-guards.mjs` | PASS |
| `apps/web/scripts/regression-stopped-session-and-remarks.mjs` | PASS |

### 桌面端脚本

| 脚本 | 结果 |
| --- | --- |
| `apps/desktop/scripts/regression-installer-retention.cjs` | PASS |
| `apps/desktop/scripts/regression-renderer-blank-diagnostics.cjs` | PASS |
| `apps/desktop/scripts/regression-runtime-bundle-assets.cjs` | PASS |

## 5. 依赖安全审计

命令：

```powershell
npm audit --json
```

结果：FAIL，退出码 1。

摘要：

| 严重级别 | 数量 |
| --- | ---: |
| critical | 0 |
| high | 4 |
| moderate | 5 |
| total | 9 |

主要漏洞来源：

| 依赖 | 严重级别 | 说明 |
| --- | --- | --- |
| `electron` | high | 多个 Electron 安全公告，fixAvailable `37.10.3` |
| `@fastify/static` | moderate | 路径遍历/encoded separator bypass，fixAvailable `9.1.3` |
| `@xmldom/xmldom` | high | XML 注入/DoS 传递依赖 |
| `fast-uri` | high | path traversal / host confusion |
| `tmp` | high | path traversal |
| `exceljs`/`uuid` | moderate | 传递依赖漏洞 |

建议：

- 把 `npm audit` 纳入发布门禁。
- 优先升级 Electron 并重新跑桌面打包回归。
- 升级或替代 `@fastify/static`，重新验证静态资源缓存脚本。
- 对 ExcelJS 依赖链做专项评估。

## 6. 覆盖分析

### 已覆盖能力

| 能力 | 覆盖方式 |
| --- | --- |
| 服务端 TypeScript 编译 | `npm --workspace apps/server run build` |
| 前端 TypeScript/Vite 编译 | `npm --workspace apps/web run build` |
| 评论分类和正文噪音过滤 | server regression scripts |
| 评论丢失链路诊断 | server/web regression scripts |
| 评论唯一键 | server regression script |
| 礼物身份/备注展示 | server/web regression scripts |
| 导出所有评论 | server regression script |
| 静态资源缓存/白屏诊断 | server/desktop regression scripts |
| 自动保存路径 | server regression script |
| 安装包保留 | desktop regression script |

### 覆盖不足

| 缺口 | 风险 | 建议 |
| --- | --- | --- |
| 无统一 `test` 脚本 | 人工漏跑脚本 | 增加根 `test:regression` |
| 无覆盖率 | 不知道核心逻辑覆盖程度 | 引入 Vitest coverage |
| 无 API 安全测试 | 本地 API 暴露风险无法防回归 | 增加 CORS/token/URL allowlist 测试 |
| 无 React 组件测试 | UI 状态复杂，易回归 | 引入 React Testing Library |
| 无真实 Electron smoke | 安装包跨机器问题只能事后诊断 | 增加打包后 app.asar/启动 smoke |
| 无真实抖音端到端 | DOM 变更风险高 | 准备人工/半自动验收清单 |
| 无性能压测 | 高频直播场景可能退化 | 增加批量事件压测脚本 |

## 7. PRD 对齐测试点

| ID | 优先级 | 场景 | 期望结果 | 验证方式 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| TP-001 | P0 | 桌面启动加载主页面 | 不白屏，本地服务可用 | Electron smoke、日志 | 部分覆盖 |
| TP-002 | P0 | 登录后开始采集 | 创建 running 会话并写入事件 | UI、API、数据库 | 需人工/端到端 |
| TP-003 | P0 | 评论高频输入 | 不丢失、不重复、可诊断 | 回归脚本、数据库 | 部分覆盖 |
| TP-004 | P0 | 送礼识别 | 礼物名、数量、身份正确 | 回归脚本 | 已覆盖部分 |
| TP-005 | P0 | 停止后导出 | 数据保留，Excel 包含历史评论 | 回归脚本、Excel | 已覆盖部分 |
| TP-006 | P1 | 特别关注备注 | 显示 `备注 / 原昵称` | 回归脚本、UI | 已覆盖部分 |
| TP-007 | P1 | 神秘人列表 | 只展示神秘人，最近活动可展开 | 回归脚本、UI | 部分覆盖 |
| TP-008 | P1 | 白屏/缓存问题 | 资源状态和 React 根节点可诊断 | 回归脚本、日志 | 已覆盖部分 |
| TP-009 | P1 | 本地 API 安全 | 跨源和无 token 请求被拒绝 | API 自动化 | 未覆盖 |
| TP-010 | P2 | 主题/字号/窗口状态 | 重启后恢复 | UI、localStorage、IPC | 部分覆盖 |

## 8. 建议的测试体系补充

### 根脚本建议

```json
{
  "scripts": {
    "test": "npm run test:regression",
    "test:build": "npm run build:server && npm run build:web",
    "test:server": "tsx apps/server/scripts/run-regressions.mjs",
    "test:web": "tsx apps/web/scripts/run-regressions.mjs",
    "test:desktop": "node apps/desktop/scripts/run-regressions.cjs",
    "test:regression": "npm run test:build && npm run test:server && npm run test:web && npm run test:desktop",
    "audit:security": "npm audit"
  }
}
```

### 自动化优先级

1. P0：API 安全、URL allowlist、会话开始/停止、导出、评论/礼物持久化。
2. P1：特别关注、神秘人、静态资源缓存、桌面启动 smoke。
3. P2：主题、窗口状态、样式回归和边界显示。

## 9. 发布建议

当前状态适合继续开发和内部回归，不建议直接作为安全达标版本发布。发布前至少应完成：

- 修复或接受并记录 `npm audit` 高危项。
- 本地 API 加 token 和 CORS 限制。
- 采集/登录 URL allowlist。
- 增加统一回归测试入口。

