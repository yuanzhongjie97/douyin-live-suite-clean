# 安全审计剩余风险记录

生成日期：2026-06-05

## 已修复或缓解

| 项目 | 处理 |
| --- | --- |
| 本地 API CORS 过宽 | 已收敛为本机来源 allowlist。 |
| 跨站状态变更请求 | 已增加 `Origin` / `Sec-Fetch-Site` 拦截，非法 cross-site POST 不进入业务 handler。 |
| 非抖音 URL 进入采集/登录入口 | 已增加 HTTPS 抖音域名 allowlist，开始采集仅允许 `https://live.douyin.com/{roomId}`。 |
| `@fastify/static` 漏洞 | 已升级到 `9.1.3`。 |
| `fast-uri`、`tmp`、`@xmldom/xmldom`、`brace-expansion`、`ip-address` | 已通过普通 `npm audit fix` 升级依赖树。 |
| 本地 API `/api/*` 鉴权 | 2026-06-08 已增加运行期 HttpOnly Cookie；无 Cookie 返回 401，非法 Origin 返回 403。 |
| `Origin: null` / 非本机来源 | 2026-06-08 已对 `/api/*` 显式拒绝，GET 数据面和 POST 状态变更都覆盖。 |
| `electron` high 审计项 | 2026-06-08 已升级到 `electron@40.10.2`，`npm run audit:security` 无 high。 |

## 剩余 npm audit 项

| 依赖 | 当前状态 | 为什么不强制修复 | 后续处理 |
| --- | --- | --- | --- |
| `exceljs -> uuid` | `exceljs@4.4.0` 依赖 `uuid@8.3.2` | `npm audit fix --force` 会安装 `exceljs@3.4.0`，属于降级，可能影响 Excel 导出格式和兼容性。 | 保持当前版本；如要清零，需要评估替代导出库或等待 ExcelJS 上游修复依赖。 |

## 当前审计结论

截至 2026-06-09，`npm run audit:security` 通过，high=0。剩余 2 个 moderate 来自 `exceljs -> uuid`，本轮不通过 `npm audit fix --force` 降级 ExcelJS，继续保留风险接受记录并由导出回归与 10 万事件压测兜底。

2026-06-09 复核：`V26.6.9.1` 已通过 `npm run audit:security`，high 项仍为 0。`V26.6.9.2` 本轮只改特别关注前端展示口径，不改依赖树，已重跑 `npm run audit:security`，high 项仍为 0。ExcelJS 当前稳定版本仍传递依赖 `uuid@8.3.2`，强制修复路径会把 ExcelJS 降到 `3.4.0`，存在导出兼容性回退风险，因此继续接受 moderate，并保留导出专项回归和 10 万事件压测作为质量门禁。
