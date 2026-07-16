# 阶段索引

只读取当前任务需要的阶段文件。所有阶段都先读取仓库中的：

```text
.ai-bridge/daily-product-research/00-shared-context.md
```

| 阶段 | 文件 | 何时读取 | 核心产物 |
|---:|---|---|---|
| 01 | `01-baseline-audit.md` | 首次接入、现状不清、需要扫描项目 | 复用矩阵、冲突清单、实施切片 |
| 02 | `02-contracts-data-model.md` | 设计 Prisma、队列和响应契约 | 版本化模型、迁移、RLS、稳定 candidateId |
| 03 | `03-scheduling-orchestration.md` | 实现每日 08:00、幂等、恢复 | Scheduler、专用队列、Worker、阶段状态机 |
| 04 | `04-connectors-source-health.md` | 接平台、CSV、来源状态 | 统一 Connector、SourceHealth、容错和预算 |
| 05 | `05-normalization-dedup.md` | 清洗、合并、重复推荐治理 | 规范化、fingerprint、30 天抑制 |
| 06 | `06-keywords-demand.md` | 扩词和验证购买意图 | 5/20/10 关键词、需求等级、置信度 |
| 07 | `07-competition-analysis.md` | 分析价格带、集中度和缺口 | competition、market gap、差异化建议 |
| 08 | `08-profit-capacity.md` | 完整成本、UV/激光工艺 | Decimal 利润、三情景、产能和瓶颈 |
| 09 | `09-compliance-risk.md` | 侵权、合规、召回、物流 | LOW/MEDIUM/HIGH/BLOCKED、审核任务 |
| 10 | `10-scoring-decision.md` | 评分、硬门槛、版本管理 | 九组件评分、稳定排名、决策分池 |
| 11 | `11-reporting-history.md` | 生成日报和历史 API | 七类 MD/JSON 工件、快照、存储 |
| 12 | `12-console-approval.md` | 接管理后台和人工动作 | 今日选品、来源、评分、历史、日志页面 |
| 13 | `13-feedback-learning.md` | 关联上架、订单、广告、退款 | 反馈事件、周度评估、DRAFT 权重建议 |
| 14 | `14-tests-security-observability.md` | 系统加固、CI、安全和监控 | 验证矩阵、RLS、故障注入、指标、告警 |
| 15 | `15-release-rollout.md` | 灰度发布、迁移和回滚 | DISABLED/DRY_RUN/SHADOW/PILOT/GENERAL |
| 16 | `16-final-acceptance.md` | 最终上线判定 | 验收证据、GO/CONDITIONAL_GO/NO_GO |
| 总控 | `99-master-orchestrator.md` | 顺序实施、多阶段恢复 | 状态文件、入口/出口闸门、交接协议 |
| 完整交付 | `100-local-server-ready-platform-goal.md` | Windows 电脑作为服务器、全页面补齐、可直接登录使用 | Docker 本机栈、页面清零、每日选品、局域网、备份恢复、最终 READY 判定 |

## 选择规则

- “先看看怎么接”或“设计一下” → 阶段 01。
- “开始实现” → 读取总控，从首个未完成阶段继续。
- “只做数据库” → 阶段 02。
- “每天 8 点自动跑” → 阶段 03。
- “接 Etsy/Amazon/CSV” → 阶段 04。
- “重复商品太多” → 阶段 05。
- “关键词、需求真假” → 阶段 06。
- “竞争和蓝海缺口” → 阶段 07。
- “利润、UV、激光产能” → 阶段 08。
- “侵权与禁售” → 阶段 09。
- “评分、TOP 10、回滚权重” → 阶段 10。
- “日报、历史报告” → 阶段 11。
- “后台页面和审批” → 阶段 12。
- “订单回传和模型优化” → 阶段 13。
- “测试、安全、监控” → 阶段 14。
- “上线、灰度、回滚” → 阶段 15。
- “最终验收” → 阶段 16。
- “把电脑当服务器”“页面全部补齐”“功能全开后直接使用” → 完整交付目标 100。

## 永久护栏

1. 真实证据优先于模型判断。
2. 未知值不写成零。
3. HIGH/BLOCKED 风险一票否决。
4. 弱信号不能立即打样。
5. TOP 不重复、不凑数。
6. 正式上架、改价、采购、广告等外部写操作必须人工审批。
7. 新表必须延续 organization/workspace 隔离和 RLS。
8. 工作区已有未提交修改不能被清理或覆盖。
