# 电商设计图保持产品一致性智能体 — 架构总览

## 20 阶段能力图谱

```
波段 A（适配）:  契约 → 推送 → 前端 → 租户
波段 B（稳定）:  幂等 → 压测 → 评分 → SLO
波段 C（聪明）:  知识 → 通道 → 规划 → 自检
波段 D（主动）:  感知 → 建议 → 排程 → 护栏 → 代理
波段 E（记忆）:  记录 → 学习 → 验收
```

## 核心模块

| 模块 | 职责 | 阶段 |
|------|------|------|
| `web/routes/integration.py` | 平台对接 API（9+1 种 taskType） | 1 |
| `web/services/job_queue.py` | 幂等任务队列 + 超时分层 + 熔断 | 5 |
| `common/platform_tasks.py` | 文本任务执行 + LLM评分 + 自检 | 7, 12 |
| `agents/planner.py` | 多步骤任务规划器 | 11 |
| `agents/verifier.py` | 输出质量自检器 | 12 |
| `agents/tools_registry.py` | 工具注册中心 | 10 |
| `common/platform_channel.py` | 平台数据通道 | 10 |
| `common/platform_knowledge_sync.py` | 知识库同步 | 9 |
| `common/memory_store.py` | 经验卡片 + 召回 | 2 |
| `common/working_memory.py` | 工作记忆 | 18 |
| `common/permission_client.py` | 权限客户端 | 16 |
| `common/proxy_client.py` | 全功能代理客户端 | 17 |
| `services/event_subscriber.py` | 事件订阅器 | 13 |
| `services/suggestion_engine.py` | 主动建议引擎 | 14 |
| `services/scheduler.py` | 自动排程器 | 15 |
| `services/review_learning.py` | 审核复盘学习 | 19 |
