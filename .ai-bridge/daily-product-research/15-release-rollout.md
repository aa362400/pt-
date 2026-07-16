# 15 · 发布、灰度、迁移与回滚提示词

> 先读取：`00-shared-context.md`、阶段 14 的验证矩阵和运行手册，以及当前部署、CI、数据库、队列、监控和 Feature Flag 实现。  
> 前置条件：阶段 02 至 14 的出口闸门已通过，或所有未通过项已被明确记录并判定不阻塞灰度。  
> 本阶段目标：以可逆、可观测、默认安全的方式把每日精准选品能力发布到真实环境。发布不等于直接启用全部来源和外部写操作。

## 你的任务

为当前平台实现并演练一套分层发布方案：

```text
部署代码与迁移
→ 默认关闭高成本和真实采集
→ 运行数据库与租户安全检查
→ DRY_RUN 本地或测试环境
→ SHADOW 影子运行
→ PILOT 指定组织/工作区灰度
→ 扩大只读使用范围
→ 稳定后再考虑一般可用
```

本阶段可以修改发布配置、Feature Flag、运行手册、部署检查和必要的发布脚本，但不能新增大块业务功能，不能绕过阶段 14 的失败项，也不能自动开启正式上架、改价、采购或广告。

## 必读位置

```text
根目录 package/工作区配置
后端/package.json
后端/src/main.ts
后端/src/app.module.ts
后端/src/shared/config/**
后端/src/shared/feature-flags/**
后端/src/shared/queue/**
后端/src/shared/database/**
后端/src/shared/tenancy/**
后端/src/features/product-research/daily/**
后端/src/features/automation/**
后端/src/workers/**
后端/prisma/schema.prisma
后端/prisma/migrations/**
后端/src/cli/**
智能体前端/package.json
智能体前端/src/App.tsx
智能体前端/src/features/daily-product-research/**
docker-compose*.yml
Dockerfile
nginx/**
.github/workflows/**
monitoring/**
docs/ops/**
.ai-bridge/daily-product-research/verification-matrix.md
.ai-bridge/daily-product-research/runbook.md
```

## 一、发布模式

建立单一、明确的运行模式，不允许各模块自行猜测环境：

```text
DISABLED
DRY_RUN
SHADOW
PILOT
GENERAL
```

### DISABLED

- 不创建每日 run。
- 不执行真实连接器。
- 后台页面可隐藏或显示“功能未启用”。
- 旧手动 Ozon 研究和现有自动化继续工作。
- 数据库模型存在不代表功能已开启。

### DRY_RUN

- 允许管理员手动启动 synthetic、Mock 或 CSV 运行。
- 默认不调用真实付费来源。
- 不向外部平台执行任何写操作。
- 生成完整阶段状态、评分和报告，用于验证契约、迁移和 UI。
- 报告明确标记 `dryRun=true` 和数据来源类型。

### SHADOW

- 按正式时间表创建运行，但结果只对管理员可见。
- 可以调用已批准的只读真实来源。
- 不创建面向普通运营人员的行动通知。
- 不自动创建产品、Listing、采购或广告任务。
- 与当前人工选品结果做对比，但不影响现有经营流程。

### PILOT

- 仅允许明确加入 allowlist 的组织和工作区。
- 结果对指定运营人员可见。
- 可创建内部开发任务、设计提示词和 Listing 草稿，但继续走人工审核。
- 所有来源、预算、候选上限和 Worker 并发使用保守配置。
- 每个 Pilot 工作区必须有负责人和回滚联系人。

### GENERAL

- 对符合资格的组织开放每日只读选品和人工审批链路。
- 真实来源仍按组织授权逐项启用。
- 正式上架、改价、删品、广告和采购继续保留人工审批开关。
- 进入 GENERAL 前必须完成阶段 16 的最终验收和至少一个稳定 Pilot 周期。

## 二、Feature Flag 与作用域

优先复用当前 Feature Flag 能力。若仓库没有完整实现，提供最小、可审计、服务端权威的开关。

至少支持：

```text
daily_product_research.enabled
daily_product_research.mode
daily_product_research.scheduler_enabled
daily_product_research.real_connectors_enabled
daily_product_research.csv_import_enabled
daily_product_research.agent_summaries_enabled
daily_product_research.feedback_learning_enabled
daily_product_research.internal_draft_actions_enabled
daily_product_research.general_access_enabled
```

作用域优先级：

```text
紧急全局关闭
> 组织级覆盖
> 工作区级 Pilot 配置
> 系统默认
```

要求：

- 服务端检查是权威，前端隐藏不是安全措施。
- Flag 变更写入审计，包含旧值、新值、操作者、原因和时间。
- 正在运行的 run 使用其 `configSnapshot`，除紧急停止外不被中途改写。
- 全局紧急关闭可以阻止新运行入队，并在阶段边界安全停止现有运行。
- 开关失效或配置服务不可用时采用更保守状态，不能默认全开。
- Pilot allowlist 使用稳定 organizationId/workspaceId，不使用名称模糊匹配。

## 三、配置分类

把配置分为三类，并明确所有权。

### 非敏感运行配置

```text
业务时区
Cron 表达式
候选上限
TOP 上限
补偿窗口
来源超时
来源最大页数
Worker 并发
Agent 调用上限
报告保留期
最低毛利率
最低广告后净利率
最大退款率
```

这些配置可以进入配置服务、数据库或非敏感环境配置，但必须经过 schema 校验并形成 run-level snapshot。

### 敏感配置引用

```text
平台访问凭证引用
对象存储凭证引用
第三方 Agent Provider 凭证引用
通知渠道凭证引用
```

要求：

- 只保存密钥管理系统或现有凭证服务中的引用，不在文档、前端、数据库业务 JSON 或日志中保存明文。
- 发布检查只验证引用存在、权限最小和可轮换，不打印值。
- Pilot 环境使用独立或受限凭证，不能直接复用高权限生产凭证。

### 业务版本配置

```text
ScoringVersion
RiskRuleVersion
NormalizationRuleVersion
ProfitRuleVersion
FeeRuleVersion
PromptVersion
ConnectorContractVersion
ReportSchemaVersion
```

这些版本必须可查询、可审计、可锁定。发布清单中记录当前活跃版本，但不能在运行中无记录覆盖。

## 四、数据库发布策略

采用 expand、migrate、switch、contract 的兼容顺序。本轮默认只执行 expand 和 migrate，不在首发删除旧字段。

### 1. Expand

- 新增表、枚举、索引和 nullable 关联。
- 保留旧 `ProductResearchReport`、旧候选审批和旧 API。
- 新代码能够处理字段不存在、旧记录无关联和数据尚未回填的状态。
- 大表索引遵循仓库现有并发索引策略。
- 新表的 RLS policy 与迁移同批交付。

### 2. Migrate

如需回填：

- 使用单独 CLI 或队列任务。
- 默认 dry-run。
- 按 organization、workspace、日期和批次分页。
- 有 checkpoint、幂等键、速率限制和进度日志。
- 不根据标题模糊匹配强行生成 candidateId。
- 无法可靠映射的旧记录写入回填报告，保留旧读取路径。
- 回填失败不能影响当前线上手动选品。

### 3. Switch

- 新 API 和新页面先读取结构化新数据。
- 对旧记录使用明确兼容适配器。
- 只有验证新链路稳定后，才考虑将新运行作为默认每日入口。
- 不在 Pilot 期间删除旧读取逻辑。

### 4. Contract

删除旧字段、旧表或旧适配器不属于本阶段默认范围。必须另开迁移项目，证明：

```text
无生产读取方
无历史报告依赖
无回滚需求
数据已备份
用户已完成迁移
```

## 五、迁移演练

在临时 PostgreSQL 环境执行：

```text
空库完整迁移
当前生产结构副本升级
带代表性旧数据的升级
RLS 验证
回填 dry-run
小批量正式回填
迁移后应用启动
旧 API 回归
新 API smoke
```

必须记录：

```text
迁移耗时
锁等待
表大小和索引大小
失败点
回滚步骤
是否需要维护窗口
```

禁止直接修改已经在其它环境部署过的 migration.sql。发现问题时新增修复迁移。

## 六、部署顺序

推荐顺序：

```text
1. 备份和基线快照
2. 部署数据库 expand 迁移
3. 验证 RLS、索引和唯一约束
4. 部署后端 API，功能保持 DISABLED
5. 部署 Worker，scheduler 保持关闭
6. 部署前端隐藏入口或管理员入口
7. 运行 synthetic DRY_RUN
8. 开启管理员手动 DRY_RUN
9. 开启 SHADOW scheduler
10. 观察一个完整周期
11. 选择 Pilot 工作区
12. 开启 PILOT
13. 复盘指标和异常
14. 通过阶段 16 后决定是否 GENERAL
```

若当前部署系统要求前端先行或服务滚动更新，调整顺序时必须保证：

- 新前端兼容旧后端响应。
- 新后端兼容旧前端请求。
- 新 Worker 不会读取旧代码无法理解的 job。
- 队列 payload 有 schemaVersion。
- 混合版本期间未知 schema 被安全拒绝或延后，不造成数据破坏。

## 七、启动前检查

实现或扩展发布检查 CLI，至少验证：

```text
数据库连接
Redis/BullMQ 连接
对象存储可写和私有读取
活跃 ScoringVersion 存在且合法
风险规则存在且未过期
业务时区和 Cron 合法
新表和 RLS 已就绪
专用队列已注册
Worker 可消费受控测试 job
Feature Flag 默认安全
Pilot allowlist 格式正确
预算和并发上限非空且合法
真实连接器凭证引用仅在获批来源存在
告警和 dashboard 可查询
```

输出只能显示状态和脱敏引用，不能显示密钥、Token 或 Cookie。

启动检查失败时，功能保持 DISABLED，不能“先上线再看”。

## 八、SHADOW 验证

SHADOW 至少运行一个完整业务日，建议覆盖三个连续周期。每次检查：

```text
08:00 是否只创建一个 run
补偿运行是否正确
来源成功率与数据新鲜度
候选数量和去重比
Agent 调用数、Token 和费用
阶段耗时
PARTIAL/FAILED 原因
TOP 是否唯一且不凑数
利润缺失和风险门槛
报告 MD/JSON 一致性
对象存储和下载权限
租户隔离
队列积压
```

与当前人工流程做旁路比较：

- 不要求结果完全相同。
- 重点检查系统是否提供更完整证据、成本和风险解释。
- 记录明显误报、漏报和不可执行建议。
- 不使用人工结果反向覆盖本次评分事实。

## 九、Pilot 选择与准入

Pilot 工作区建议满足：

```text
有明确负责人
平台连接只读权限已验证
供应链成本较完整
愿意执行人工审核
有可回传的订单或人工反馈
业务量适中
无高敏感或高监管类目作为首批
```

每个 Pilot 建立发布记录：

```text
organizationId/workspaceId
负责人
开始日期
启用来源
运行模式
预算
评分版本
风险规则版本
成功标准
停止条件
回滚联系人
```

禁止通过前端名称搜索误加入其它组织。

## 十、Pilot 成功标准

至少观察一个完整周或预先批准的最小周期。建议标准：

```text
每日计划成功率达到目标
无重复 run
无跨租户事件
无密钥或 PII 泄漏
关键来源失败可降级
报告生成成功率达到目标
TOP 无 fingerprint 重复
HIGH/BLOCKED 未进入立即打样
零 TOP 能正常呈现
预算未异常超限
运营人员可理解证据和门槛原因
内部任务/草稿创建均经过人工确认
无外部平台意外写入
```

业务质量指标作为观察，不用首周强制证明长期收益：

```text
候选可执行率
人工批准率
成本补全率
误报/漏报反馈
从推荐到打样的周期
```

## 十一、停止条件

出现以下任一情况，立即停止新运行并评估回滚：

```text
跨租户读取或写入
密钥、Cookie、PII 泄漏
未经审批的外部平台写操作
数据库不可逆错误或迁移异常
同一业务日大量重复 run
风险 HIGH/BLOCKED 进入外部执行链
费用或请求量失控
队列持续积压并影响其它核心任务
报告包含虚构数字或来源错配
监控和审计无法追踪关键动作
```

低严重度单来源失败不一定需要全局关闭，可以禁用该来源并保持 PARTIAL 报告。

## 十二、回滚层级

### Level 1：功能关闭

- 将运行模式切换为 DISABLED。
- 关闭 scheduler 和新手动触发入口。
- 保留数据和只读历史查询。
- Worker 在阶段边界停止新工作。

### Level 2：来源关闭

- 只禁用故障来源。
- 保持其它来源和报告运行。
- 记录 SourceHealth、告警和恢复条件。

### Level 3：版本回滚

- 回滚 ScoringVersion、RiskRuleVersion、PromptVersion 或连接器版本。
- 已完成历史 run 保持原版本引用。
- 新 run 使用回滚后的活跃版本。

### Level 4：应用回滚

- 回退后端、Worker 或前端应用版本。
- 队列 job schema 必须与回退版本兼容。
- 不删除新表，旧应用应忽略新表或 nullable 字段。

### Level 5：数据库回滚

仅在迁移导致严重问题且经过备份验证时执行：

- 优先应用向前修复迁移。
- 确需回滚时使用阶段 02/14 已演练的受控脚本。
- 删除新表前导出本阶段数据和审计。
- 不因功能关闭而急于删除数据。

## 十三、数据备份与恢复

发布前确认：

```text
数据库备份成功
对象存储报告可恢复
关键配置版本已导出
当前迁移版本已记录
队列状态和死信可检查
```

恢复演练至少验证：

- 数据库恢复后租户上下文和 RLS 正常。
- 报告工件 metadata 与对象存储一致。
- 重放 Outbox 不会重复创建 run 或通知。
- 重启 Worker 不会重复完成已终态阶段。

## 十四、监控看板与告警确认

发布前逐项确认：

```text
每日运行状态
阶段耗时
来源成功率和延迟
候选分池
硬门槛原因
队列等待和积压
预算和 Agent 成本
报告工件状态
风险审核任务
跨租户/权限拒绝事件
```

告警必须有真实接收人、值班渠道或明确负责人。只存在规则文件但无人接收，不算完成。

## 十五、发布文档

创建或更新：

```text
.ai-bridge/daily-product-research/release-plan.md
.ai-bridge/daily-product-research/release-checklist.md
.ai-bridge/daily-product-research/rollback-plan.md
.ai-bridge/daily-product-research/pilot-observation.md
docs/ops/daily-product-research-runbook.md  # 若仓库惯例允许
```

`release-checklist.md` 至少包含：

```text
版本和变更范围
数据库迁移
配置和 Feature Flag
启动前检查
synthetic smoke
SHADOW 结果
Pilot 工作区
监控和告警
备份和恢复
停止条件
回滚步骤
负责人
批准记录
```

## 十六、测试与演练

至少执行：

```text
[ ] 默认 DISABLED 时不创建 run
[ ] DRY_RUN 不调用真实来源或外部写操作
[ ] SHADOW 结果仅管理员可见
[ ] PILOT 只作用于 allowlist 工作区
[ ] Flag 配置不可用时默认保守关闭
[ ] 紧急关闭阻止新 run 并在阶段边界停止
[ ] 空库和当前基线迁移演练通过
[ ] 回填 dry-run 和小批量正式回填幂等
[ ] 混合应用版本能安全处理队列 schema
[ ] 应用回滚后旧 API 和旧前端继续工作
[ ] ScoringVersion 和规则版本回滚不改历史 run
[ ] 备份恢复后 RLS、Outbox 和阶段幂等正常
[ ] Pilot 外无组织获得页面或 API 权限
[ ] 对象存储报告仍需鉴权
[ ] 无外部平台写操作发生
```

建议测试和脚本：

```text
后端/test/daily-product-research-feature-flags.spec.ts
后端/test/daily-product-research-release-mode.spec.ts
后端/test/daily-product-research-mixed-version.spec.ts
后端/test/daily-product-research-rollback.spec.ts
后端/src/cli/verify-daily-product-research-release.ts
```

遵循仓库现有命名和脚本体系，避免创建重复发布框架。

## 本阶段允许修改

```text
后端/src/shared/feature-flags/**
后端/src/shared/config/**
后端/src/features/product-research/daily/**       # 仅发布模式和启动检查
后端/src/features/automation/**                   # 仅 scheduler 开关
后端/src/workers/**                               # 仅运行模式和停止边界
后端/src/cli/**
后端/test/daily-product-research-*release*.spec.ts
智能体前端/src/App.tsx                            # 仅入口 Feature Flag
智能体前端/src/features/daily-product-research/** # 仅模式/权限提示
.github/workflows/**                               # 发布验证小改
Docker/Compose/部署配置                            # 仅非敏感设置和服务注册
monitoring/**
.ai-bridge/daily-product-research/*release*.md
.ai-bridge/daily-product-research/rollback-plan.md
.ai-bridge/daily-product-research/pilot-observation.md
```

## 禁止事项

- 不要部署后自动切到 GENERAL。
- 不要在迁移中删除旧模型和旧接口。
- 不要在文档、日志或前端写入真实凭证。
- 不要让配置服务故障时默认开启真实采集。
- 不要通过工作区名称模糊匹配 Pilot。
- 不要在 Pilot 自动执行正式上架、改价、采购或广告。
- 不要在未验证队列 schema 兼容时滚动混合版本。
- 不要把单个可降级来源失败当作全系统灾难，也不要忽略跨租户和未授权写入。
- 不要在无备份和无演练时执行数据库破坏性回滚。
- 不要宣称发布成功，除非有 SHADOW/Pilot 和监控证据。

## 出口闸门

```text
[ ] DISABLED/DRY_RUN/SHADOW/PILOT/GENERAL 模式已实现并测试
[ ] 默认发布状态安全，真实采集和外部写操作未自动开启
[ ] Feature Flag、Pilot allowlist、权限和审计正确
[ ] 数据库 expand 迁移、RLS、回填和回滚已演练
[ ] 混合版本和队列 payload 兼容已验证
[ ] 启动前检查能阻止错误配置上线
[ ] synthetic DRY_RUN 和至少一个 SHADOW 周期通过
[ ] Pilot 准入、成功标准、停止条件和负责人已记录
[ ] 监控、告警、备份和恢复均有真实证据
[ ] 一键功能关闭、来源关闭、版本回滚和应用回滚可执行
[ ] 未发生任何未经审批的外部平台写入
```

最后输出 `PHASE HANDOFF`。必须包含：

- 发布版本、迁移版本和当前运行模式。
- Feature Flag 与 Pilot 作用域摘要，不含敏感值。
- SHADOW/Pilot 运行证据。
- 启动检查、迁移演练、备份恢复和回滚演练结果。
- 当前告警、预算和负责人。
- 阶段 16 可直接执行的最终验收环境和测试账号说明，账号只引用现有安全测试配置，不在文档写明凭证。
