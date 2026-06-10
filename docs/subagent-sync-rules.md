# Subagent 同步规则

## 目标

所有 Subagent 的工作必须沉淀到文档，避免上下文爆满、会话压缩、Agent 切换后丢失历史结论。

## 唯一进度台账

后续统一维护：

- `docs/subagent-progress.md`

不要再把进度分散写到多个文档里。

## 每次必须记录

每个 Subagent 完成一次排查、设计、修复、验证后，必须追加以下内容：

- 做了什么
- 进度
- 目的
- 结果

建议同时补充：

- 涉及文件
- 风险
- 下一步

## 标准模板

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

## 主 Agent 职责

主 Agent 必须负责：

- 分派 Subagent 任务。
- 汇总 Subagent 结论。
- 把有效结论写入 `docs/subagent-progress.md`。
- 代码落地前检查是否已有历史结论。
- 打包前更新最终进度和验证结果。

## Subagent 职责

Subagent 必须负责：

- 查清事实。
- 给出证据。
- 标注风险。
- 明确是否已完成。
- 不直接用模糊表述代替结论。

## 上下文恢复流程

新 Agent 接手时必须先读：

1. `docs/subagent-progress.md`
2. `docs/subagent-sync-rules.md`
3. 当前分支 `git status`
4. 最近一次版本日志或打包记录

读完后再继续执行，避免重复排查、重复修改、漏掉历史约束。
