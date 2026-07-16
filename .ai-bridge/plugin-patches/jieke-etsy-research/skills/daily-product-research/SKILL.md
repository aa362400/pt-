---
name: daily-product-research
description: 在现有跨境电商平台中规划、实现、验证、灰度或验收“每日精准跨境选品 Agent”。当用户提到每日自动选品、跨境选品 Agent、TOP 10 选品、选品评分、数据来源健康、完整利润、侵权筛查、经营反馈学习、继续某个实施阶段，要求把 Windows 电脑当服务器、补齐全部页面、打开全部安全功能、交付可直接登录使用的平台，或要求把跨境选品改造融入当前平台时使用。必须复用现有 NestJS、Prisma、BullMQ、RLS、审核、通知和 React 控制台，不创建平行系统。
---

# 每日精准跨境选品 Agent

## 核心任务

将当前平台增量改造成以下可验证流水线：

```text
北京时间 08:00 调度
→ 多来源采集与证据保存
→ 标准化、指纹与去重
→ 关键词扩展与真实需求验证
→ 竞争、缺口与差异化分析
→ 完整利润、UV/激光成本与产能
→ 侵权、合规、召回与物流风险
→ 版本化评分与硬门槛
→ TEST_NOW / WATCH / HOLD / REJECT
→ Markdown + JSON 报告
→ 人工审核
→ 经营反馈与周度评估
```

## 权威上下文

在目标仓库中优先查找并按顺序读取：

```text
.ai-bridge/daily-product-research/README.md
.ai-bridge/daily-product-research/00-shared-context.md
.ai-bridge/daily-product-research/99-master-orchestrator.md
```

随后只读取当前阶段文件和上一阶段 handoff，不要一次加载所有阶段。阶段索引见 `references/stage-map.md`。

当用户要求“把电脑当服务器”“所有页面补齐”“全部安全功能打开”“完成后直接开始使用”时，额外读取：

```text
.ai-bridge/daily-product-research/100-local-server-ready-platform-goal.md
```

该任务采用验收导向执行：必须真实启动本机栈、补齐生产路由、运行每日选品、验证局域网入口、持久化、备份恢复和浏览器 E2E，不能只交付规划文档。

若仓库没有该目录，查找：

```text
跨境选品Agent每日自动运行改造说明*.md
```

根据原说明建立 `.ai-bridge/daily-product-research/` 阶段包后再实施，不要把一份巨型总提示词直接当作代码修改指令。

## 模式选择

根据用户意图选择：

```text
PLANNING_ONLY         只调查、设计和写交接文档
IMPLEMENT_SEQUENTIAL  从首个未完成阶段逐阶段实施
VERIFY_ONLY           只做测试、安全、发布或验收
PHASE_ONLY            只执行用户指定阶段
```

未指定时使用 `IMPLEMENT_SEQUENTIAL`。

## 开始前

1. 记录 Git revision、工作区状态和已有用户修改。
2. 不执行 `reset --hard`、`clean -fd`、强制 checkout 或覆盖未提交内容。
3. 读取共享上下文、当前阶段、上一阶段 handoff 和当前阶段要求的代码。
4. 先用目录树和搜索定位，再读取必要片段。
5. 明确当前阶段的新增文件、修改文件、测试、迁移、兼容策略和回滚边界。

## 实施协议

1. 一次只实施一个阶段。
2. 先写失败测试并确认失败原因正确。
3. 实现最小变更，优先复用现有认证、队列、租户、审计、通知、文件和 Prompt 管理。
4. 不继续把完整流水线塞进超大 service 或通用 Worker。
5. 外部 API 不确定时先实现统一接口、Mock、CSV、配置状态和来源健康，禁止虚构 API。
6. 运行真实测试、类型检查、构建、Prisma、RLS 或前端验证。
7. 只有出口闸门通过后才标记 `COMPLETED`。
8. 将 handoff 保存到 `.ai-bridge/daily-product-research/state/phase-handoffs/`。

## 数据真实性

- 价格、趋势、成交、评论、成本和平台规则必须带来源及时间。
- 未知值使用 `null`、`unknown` 或 `needs_verification`，不能补造数字。
- 只有播放、点赞等内容热度时，不能直接判定高购买需求。
- 不把毛利称为广告后净利润。
- `topLimit=10` 是上限，不是配额，不足时禁止凑数。
- 同 fingerprint 的产品或变体不得重复占据 TOP。
- 单个来源失败时继续其它来源，并明确 `partialData`。

## 风险与人工审批

以下任一成立时，不得进入立即打样：

```text
HIGH 或 BLOCKED 风险
平台禁售
无法履约
关键成本缺失
广告后净利率不足
退款风险超阈值
只有弱需求信号
来源不足且无法验证
```

允许自动生成：

```text
候选与报告
产品开发任务
设计提示词
主图方案
Listing 草稿
审核任务与通知
```

未经明确人工批准不得执行：

```text
正式上架
改价
删除或上下架商品
开启或调整广告
采购和补货
任何不可逆第三方写操作
```

## 评分和发布

评分必须先执行硬门槛，再计算版本化加权分。LLM 可以写摘要，不得计算或覆盖总分、风险等级和最终决策。

发布模式只能按以下顺序逐步扩大：

```text
DISABLED → DRY_RUN → SHADOW → PILOT → GENERAL
```

默认先 DRY_RUN，再 SHADOW，再指定组织/工作区 PILOT。在阶段 16 输出 `GO`、`CONDITIONAL_GO` 或 `NO_GO` 之前，不得宣称已准备全量生产。

## 统一交接

每个阶段结束必须输出并保存：

```markdown
# PHASE HANDOFF

- phase: <phase>
- status: completed | partial | blocked
- base_revision: <revision 或 dirty-worktree 基线>
- scope_completed: []
- files_added: []
- files_modified: []
- migrations_added: []
- api_contracts: []
- runtime_prompt_versions: []
- tests_added_or_updated: []
- verification:
  - command: <exact command>
    result: passed | failed | not_run
    evidence: <关键输出>
- compatibility_notes: []
- data_migration_notes: []
- security_and_tenancy_notes: []
- unresolved_risks: []
- next_phase_inputs: []
- rollback_notes: []
```

没有真实命令、测试、迁移、API、页面或运行证据时，不得写“已完成”。
