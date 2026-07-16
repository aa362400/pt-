# L2 自主模式：主动建议 + 自动调研 + 自动生成 Listing 草稿

Updated: 2026-07-12T11:47:20.457Z
Workspace: G:\平台
Target agent: Codex (codex)

## Plan

在现有 G:\平台 工作区实现 L2 安全自主模式，目标是：商品创建或更新后，系统主动推送建议；当当前组织已开启 `agent-autonomy` 时，自动执行真实商品调研并生成 Listing 草稿；任何外部发布、调价、库存、广告、退款或付费动作仍禁止自动执行。不要回滚或覆盖仓库现有未提交改动。

必须按 TDD 小步实现，先写失败测试并运行确认 RED，再写最小实现，最后运行定向测试和 build。记录实际命令和结果到 `.ai-bridge/agent-status.md`，未执行的检查不得写成通过。

## 已确认的现状

1. `ProductsService` 会通过 `EventBusService.emit()` 发送 `product.created` / `product.updated`。
2. `EventBusService` 同时执行进程内 `EventEmitter2.emit()` 和投递 `platform-events` BullMQ。
3. `AgentAutonomyService` 当前带 `@OnEvent` 监听器，而 `PlatformEventWorker` 又会调用同一 Service，因此同一商品事件可能被处理两次，产生重复任务与通知。实现自主草稿前必须先消除这个双处理链。
4. `AutomationWorker` 已真实支持 `product.research` 和 `listing.draft`，并且 `listing.publish` 已进入人工确认。
5. `ProductResearchService.runAutomaticSelection()` 会生成真实研究报告和人工审核记录；当前真实证据链主要是 Ozon。非 Ozon 失败时必须明确进入待审核/失败说明，不能伪造调研成功。
6. `AgentAutonomyService.prepareListingBatch()` 目前是完整上架准备流程。本任务不要自动调用完整流程，只自动执行“调研 + Listing 草稿”。

## 期望行为

商品创建或更新后：

```text
PlatformEventWorker
  -> 创建/更新幂等的 awareness task
  -> 创建/更新主动建议通知
  -> 检查当前组织 `agent-autonomy` feature flag
  -> 校验 actor、product、workspace 均属于当前组织
  -> 若未开启：仅建议，不执行
  -> 若已开启：创建一次性 AutomationFlow + AutomationRun
  -> 只执行 product.research
  -> 再执行 listing.draft
  -> 创建研究报告、ListingDraft 和 ReviewTask
  -> 推送完成通知
  -> 外部店铺写入始终为 not_executed
```

## 1. 修复平台事件双处理

目标文件：
- `后端/src/features/agent-autonomy/agent-autonomy.service.ts`
- `后端/src/workers/platform-event.worker.ts`
- 对应测试

采用单一事实执行入口：可靠副作用只由 `PlatformEventWorker` 调用 `AgentAutonomyService`。移除 AgentAutonomyService 上 `@OnEvent('platform.product.created')` 和 `@OnEvent('platform.product.updated')` 的副作用监听装饰器，但保留公开方法供 Worker、测试和 Roadmap Acceptance 直接调用。EventEmitter 仍可留给无副作用本地订阅者。

新增回归测试证明一个平台事件只创建一套 awareness/suggestion/auto-draft 记录。

## 2. 事件级幂等

同一平台事件可能因 BullMQ retry 重放。为事件生成稳定指纹：

```text
sha256(orgId | event.type | resourceType | resourceId | timestamp)
```

使用稳定 ID，例如：

```text
autonomy-task-{fingerprint}
autonomy-suggestion-{fingerprint}
autonomy-flow-{fingerprint}
autonomy-run-{fingerprint}
```

使用 Prisma `upsert` 或等价原子方式，避免重试重复创建 TeamTask、Notification、AutomationFlow 和 AutomationRun。不要通过吞掉所有数据库错误实现幂等。

BullMQ jobId 使用：

```text
autonomy-draft:{automationRunId}
```

相同事件重复投递不得生成第二个 Job。不同 product.updated 事件因 timestamp 不同可生成新的草稿版本。

## 3. L2 自动草稿开关

复用现有 `agent-autonomy` FeatureFlag：

- flag 未开启或组织不在 allowlist：`autoDraft.status = suggestion_only`
- flag 已开启且 workspace 合法：`autoDraft.status = queued`
- workspace 缺失或不属于组织：不得自动执行，通知中给出安全原因
- automation queue 不可用：不得伪装 queued

主动建议本身仍可生成；自动执行必须受 flag 控制。

## 4. 自动创建两步 AutomationFlow

在 `AgentAutonomyService` 新增私有方法，例如 `startAutomaticResearchAndDraft()`。

只允许以下两步：

```ts
[
  {
    key: 'research',
    action: 'product.research',
    mode: 'automatic',
    productIds: [productId],
    query: productTitle,
    workspaceId,
  },
  {
    key: 'listing',
    action: 'listing.draft',
    mode: 'automatic',
    productId,
    productName: productTitle,
    workspaceId,
    platform,
    tone: 'professional',
  },
]
```

严禁加入：

- `listing.publish`
- `image.generate`
- `profit.analyze`
- 调价、库存、广告、订单、退款、支付

Flow 建议：

```text
name: [智能体自动草稿] {productTitle}
status: ACTIVE
triggerType: MANUAL
triggerConfig.source: agent_autonomy_draft
triggerConfig.eventType
triggerConfig.productId
triggerConfig.eventTimestamp
triggerConfig.externalStoreMutation: not_executed
```

创建 AutomationRun 后投递 `automation-runs` 队列，使用稳定 jobId 和 priority 1。

## 5. 主动建议通知

现有 `agent_suggestion` 通知继续保留，并在 metadata 中加入：

```json
{
  "autoDraft": {
    "status": "queued | suggestion_only | missing_workspace | unsupported_marketplace | queue_unavailable",
    "flowId": "...",
    "automationRunId": "...",
    "externalStoreMutation": "not_executed"
  }
}
```

当 queued 时，正文明确写：

```text
智能体已自动开始商品调研和 Listing 草稿生成；发布、调价和其他真实店铺写入仍需人工确认。
```

建议卡片原有 `operator.prepare_listing_batch` 动作可继续用于用户主动扩展为图片、利润和完整上架准备，但不得重复创建已经完成的研究/草稿。若保留该动作，请明确 UI/metadata 它是“继续完整准备”，不是再次执行同一草稿。

## 6. 研究结果传给 Listing 草稿

目标文件：`后端/src/workers/automation.worker.ts`

当前 Worker 顺序执行步骤，但 `executeListingStep()` 不使用前一步研究结果。修改循环，将已完成 results 作为只读上下文传给后续步骤。

Listing 步骤在没有显式 description/context 时：

1. 从前序 `product.research` 结果取得 `reportIds`。
2. 按当前 organizationId 查询对应 `ProductResearchReport`。
3. 使用报告 `summary` 作为 Listing generation 的 description/context。
4. 返回结果中记录 `researchReportId`，便于审计和前端展示。

不得把其他组织的 report 当作上下文，也不得把完整 sourceEvidence、凭证或大 JSON 无限制注入模型。

## 7. 完成与失败通知

AutomationWorker 检测 `triggerConfig.source === 'agent_autonomy_draft'`：

成功后创建 SYSTEM 通知：

```text
智能体已完成调研和 Listing 草稿：{productTitle}
```

metadata 至少包含：

```text
kind: agent_autonomy_draft_completed
flowId
automationRunId
productId
reportIds
listingDraftIds
reviewTaskIds
externalStoreMutation: not_executed
targetRoute: /listing-generator 或相应现有页面
```

最终失败后创建 ALERT 通知，明确没有执行外部店铺写入，并提供现有 `automation.recover` 恢复动作。通知创建失败不应把已成功的主任务重新标记为失败；应受控记录日志。

## 8. 租户与产品校验

自动创建 Flow 前必须验证：

- actor 是 org 下 ACTIVE Membership，沿用现有安全解析但不得冒用其他成员处理外部写操作
- workspace 的 `id + organizationId` 匹配
- product 的 `id + workspace.organizationId` 匹配
- event.data.workspaceId 与真实 product.workspaceId 不一致时，以数据库事实为准并记录警告

自动流程只创建内部研究报告与草稿，不执行外部店铺写入。

## 9. 测试要求

### AgentAutonomyService

新增测试：

1. flag 开启时创建两步 Flow，只含 `product.research` 和 `listing.draft`。
2. 投递 automation-runs，jobId 稳定。
3. flag 关闭时只创建建议，不创建 Flow/Run/Job。
4. workspace 缺失或跨组织时不自动执行。
5. 同一事件调用两次时 TeamTask、Notification、Flow、Run 均只有一条，Job 不重复。
6. 通知 metadata 正确声明 `externalStoreMutation=not_executed`。
7. product.updated 可生成新的事件级草稿，但同一 timestamp 重放不重复。

### AutomationWorker

新增测试：

1. 两步 flow 先生成研究报告，再生成 ListingDraft。
2. ListingService.generate 收到研究报告 summary 作为 description。
3. Listing step 结果包含 researchReportId、listingDraftId、reviewTaskId。
4. 完成通知包含报告和草稿 ID。
5. 调研失败时不得伪造 completed；Listing 是否继续应按明确策略测试并记录。建议：研究进入 pending_review 时仍可生成低风险草稿，但通知标记 researchNeedsReview=true。
6. 自动草稿 Flow 中永远没有 publish 外部动作。

### PlatformEventWorker

新增测试：

- 同一个 event job 只调用一次 AutonomyService。
- terminal tenant error 安全忽略，临时队列/数据库错误继续抛出以触发 BullMQ retry。

## 10. 验证命令

至少执行：

```text
pnpm test -- agent-autonomy.spec.ts --runInBand
pnpm test -- automation-worker.spec.ts --runInBand
pnpm test -- platform-event-worker.spec.ts --runInBand
pnpm build
```

若项目测试脚本语法不同，使用现有 Jest 配置等价执行。记录 RED 与 GREEN 结果。

## 11. 验收标准

- 新建或更新商品后出现主动建议。
- flag 开启时自动产生真实 ProductResearchReport。
- 自动产生 ListingDraft 和对应 ReviewTask。
- Listing 草稿使用研究摘要作为上下文。
- 同一事件重放不会重复执行。
- 全流程不包含真实店铺写入。
- 发布、调价、库存、广告、退款和支付仍必须人工确认。
- 后端定向测试和 build 通过。
- 在 `.ai-bridge/agent-status.md` 写明修改文件、测试、结果、剩余限制，特别注明真实自动调研当前主要受 Ozon 证据链支持。

## Implementation contract

- Work from this plan in small, reviewable steps.
- Keep edits scoped to the requested task and existing project conventions.
- Run focused verification before handing work back.
- Update .ai-bridge/agent-status.md with files touched, checks run, results, blockers, and review notes.
- Save the final review diff to .ai-bridge/implementation-diff.patch when practical.
- Append notable execution events to .ai-bridge/execution-log.jsonl when the implementation agent supports logging.

---

# 将每日精准跨境选品 Skill 合并进 JIEKE Etsy Research 插件

Updated: 2026-07-13T11:42:43.619Z
Workspace: G:\平台
Target agent: Codex (codex)

## Plan

## 插件增量补丁

目标插件记录：`JIEKE Etsy Research`，规范化名称 `jieke-etsy-research`。

补丁目录：

```text
.ai-bridge/plugin-patches/jieke-etsy-research/
├── patch-manifest.json
├── install-skill.ps1
└── skills/daily-product-research/
    ├── SKILL.md
    └── references/stage-map.md
```

执行要求：

1. 先根据 `.codex-plugin/plugin.json` 的 `name === "jieke-etsy-research"` 定位现有插件，不能根据目录名猜测，也不能创建第二个同名插件。
2. 不覆盖现有 `.codex-plugin/plugin.json`、marketplace 条目或其它技能。
3. 在 PowerShell 中从 `G:\平台` 执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\.ai-bridge\plugin-patches\jieke-etsy-research\install-skill.ps1
```

如果自动定位发现多个插件副本，读取报错列出的路径并以正在安装的 marketplace 对应插件根目录重新执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\.ai-bridge\plugin-patches\jieke-etsy-research\install-skill.ps1 -PluginRoot '<实际插件根目录>'
```

4. 安装脚本遇到旧版 `daily-product-research` 时会先复制到插件根目录 `.plugin-backups/`，再替换该单一技能；不得删除备份。
5. 使用官方脚本验证：

```text
skill-creator/scripts/quick_validate.py <plugin>/skills/daily-product-research
plugin-creator/scripts/validate_plugin.py <plugin>
plugin-creator/scripts/update_plugin_cachebuster.py <plugin>
```

6. 不手改 marketplace.json。按现有插件更新/重装流程刷新缓存。
7. 新开 Codex 线程做触发 smoke test：

```text
使用 daily-product-research，从当前 G:\平台 首个未完成阶段继续实施，但先只输出识别到的当前阶段和入口闸门。
```

预期：技能会读取 `.ai-bridge/daily-product-research/README.md`、`00-shared-context.md`、`99-master-orchestrator.md`，不会一次性加载所有阶段，也不会执行生产部署或外部写操作。
8. 将实际插件根目录、备份路径、验证命令输出、cachebuster 结果和 smoke test 结果追加到 `.ai-bridge/agent-status.md`。未运行的检查不得写成通过。

## Implementation contract

- Work from this plan in small, reviewable steps.
- Keep edits scoped to the requested task and existing project conventions.
- Run focused verification before handing work back.
- Update .ai-bridge/agent-status.md with files touched, checks run, results, blockers, and review notes.
- Save the final review diff to .ai-bridge/implementation-diff.patch when practical.
- Append notable execution events to .ai-bridge/execution-log.jsonl when the implementation agent supports logging.

---

# 把 Windows 电脑交付为可直接使用的全功能 ShopMate AI 本机服务器

Updated: 2026-07-13T14:25:09.091Z
Workspace: G:\平台
Target agent: Codex (codex)

## Plan

## 最高优先级交付目标

使用 `daily-product-research` Skill，并完整读取：

```text
.ai-bridge/daily-product-research/100-local-server-ready-platform-goal.md
```

把该文件视为本次实施和验收的最高优先级目标。不要只输出建议或计划，要在当前 `G:\平台` 工作区中实际完成代码、页面、Docker 本机服务器、Windows 管理脚本、测试、每日选品真实运行和最终验收。

核心结果：

```text
Windows 开机/一键启动
→ Nginx 单入口
→ 浏览器和局域网可登录
→ 所有生产导航页面可打开且无假数据/假成功
→ 可由本机实现的缺失页面和 API 全部补齐
→ 外部未配置能力提供真实连接/CSV/状态页面
→ PILOT 或验收通过后的 GENERAL 模式启用全部安全功能
→ 每天 Asia/Shanghai 08:00 自动选品
→ 手动 run 真实完成
→ 候选、来源健康、评分、风险、利润和七类报告可见
→ 人工批准创建内部开发任务或 Listing 草稿
→ externalStoreMutation 始终为 false
→ 重启后数据、调度和报告持久
→ 备份恢复和全路由浏览器 E2E 通过
```

执行纪律：

1. 记录现有 dirty worktree，禁止清理或覆盖用户修改。
2. 先生成 `.ai-bridge/local-server-ready/page-capability-matrix.md`，再按缺口 TDD 小步实现。
3. 对 `PlaceholderPage`、永久禁用按钮、mock 文案、假成功和“暂无后端”逐项落实为 IMPLEMENTED、CONNECTED、EXTERNAL_NOT_CONFIGURED 或有证据的 REMOVED_FROM_PRODUCTION_NAVIGATION。
4. 创建并实际验证 `docker-compose.local-server.yml` 以及 setup/start/stop/status/logs/backup/restore/verify/autostart PowerShell 脚本。
5. 数据库和 Redis 不得暴露到局域网，Nginx 是唯一入口；不要自动开放公网。
6. 为实际 OWNER 组织启用通过测试的 scheduler、只读 connectors、CSV、Agent 摘要、内部开发动作和反馈学习；未经凭证验证不伪装平台已接入。
7. 每日选品必须真实创建一次 run，完成或合理 PARTIAL，生成七类报告，并证明 TOP 不重复、不凑数、风险硬门槛生效。
8. 运行后端、前端、Agent、Prisma/RLS、平台 release gate、Docker、API、队列恢复、全路由浏览器和备份恢复验证。失败项继续修复，未运行不得写通过。
9. 最终生成 `.ai-bridge/local-server-ready/final-acceptance.md` 和 `docs/ops/local-server-runbook.md`。
10. 只有具备实际访问 URL、登录方式、真实 runId、报告、nextRunAt、重启持久化、浏览器验证和测试证据时，才能判定 READY。

不自动 commit、push 或部署公网。真正缺少平台凭证、管理员权限或人工法务判断的事项记录为 BLOCKED_EXTERNAL，但不得以此逃避本机可实现功能。

## Implementation contract

- Work from this plan in small, reviewable steps.
- Keep edits scoped to the requested task and existing project conventions.
- Run focused verification before handing work back.
- Update .ai-bridge/agent-status.md with files touched, checks run, results, blockers, and review notes.
- Save the final review diff to .ai-bridge/implementation-diff.patch when practical.
- Append notable execution events to .ai-bridge/execution-log.jsonl when the implementation agent supports logging.
