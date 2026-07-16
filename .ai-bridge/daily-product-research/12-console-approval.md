# 12 · 控制台页面、配置管理与人工审批提示词

> 先读取：`00-shared-context.md`，阶段 10、11 的 API 交接，以及当前前端路由、侧边栏、API client、审核中心和 i18n。  
> 前置条件：后端已提供真实 run、候选、来源健康、评分版本、工件和审核动作。  
> 本阶段目标：把每日精准选品融入现有 React 控制台，不重做整站，不展示模拟数据，不绕过人工审批。

## 你的任务

在现有设计系统和导航中新增或扩展以下页面：

```text
1. 今日选品
2. 数据来源
3. 评分配置
4. 历史表现
5. 任务日志
6. 候选详情/证据抽屉
```

保留现有 `ProductResearch.tsx` 的手动研究入口和 Ozon 兼容逻辑。每日选品可以作为新路由、子标签或清晰独立页面，避免把一个 600 多行页面继续堆成巨型组件。

## 必读位置

```text
智能体前端/src/App.tsx
智能体前端/src/main.tsx
智能体前端/src/components/sidebar/**
智能体前端/src/components/ui/**
智能体前端/src/pages/ProductResearch.tsx
智能体前端/src/pages/ReviewCenter.tsx
智能体前端/src/pages/Automation.tsx 或等价页面
智能体前端/src/pages/Notifications.tsx
智能体前端/src/api/client.ts
智能体前端/src/api/productResearch.ts
智能体前端/src/api/review.ts
智能体前端/src/hooks/**
智能体前端/src/i18n/**
智能体前端/src/test/** 或现有测试目录
后端 Swagger/阶段 11 API 契约
```

## 一、页面与路由设计

建议按项目实际路由风格增加：

```text
/product-research/daily
/product-research/sources
/product-research/scoring
/product-research/history
/product-research/runs/:runId
```

若现有侧边栏层级不支持子项，可在 `/product-research` 页面内部使用标签导航。选择一种与现有控制台一致的方式，不创建第二套布局。

### 组件边界建议

```text
智能体前端/src/features/daily-product-research/
├── api/
├── components/
│   ├── RunStatusBanner.tsx
│   ├── RecommendationCard.tsx
│   ├── CandidateEvidenceDrawer.tsx
│   ├── ScoreBreakdown.tsx
│   ├── ProfitBreakdown.tsx
│   ├── RiskBadge.tsx
│   ├── SourceHealthTable.tsx
│   ├── ScoringVersionEditor.tsx
│   └── RunTimeline.tsx
├── hooks/
├── types/
└── utils/
```

也可沿用当前项目目录习惯，但每个组件职责要小，避免复制格式化和状态映射逻辑。

## 二、API 客户端

新增 `dailyProductResearchApi` 或等价模块，类型直接对应阶段 11 契约：

```text
listRuns
getRun
getReport
listCandidates
getCandidate
getSourceHealth
listArtifacts
getArtifactDownload
manualRun
cancelRun（若后端已实现）
createScoringVersion
activateScoringVersion
rollbackScoringVersion
simulateScoringVersion
approveCandidateForDevelopment
requestRiskReview
rejectCandidate
```

要求：

- 复用 `api/client.ts` 的认证、错误和 baseURL。
- 不在页面内直接散落 fetch。
- Decimal 金额作为字符串接收，使用安全格式化函数。
- 日期按 run timezone 展示，不能仅使用浏览器本地时区。
- unknown/null 与 0 区分。
- 后端 schemaVersion 不支持时显示“版本不兼容”，不能静默猜字段。
- API 类型不使用大面积 `any`。

## 三、今日选品页面

### 顶部状态

展示：

```text
业务日期（北京时间）
运行状态
开始/完成时间
是否部分数据
候选/立即打样/观察/暂缓/淘汰数量
评分版本
来源健康摘要
```

状态语义：

```text
PENDING：等待执行
RUNNING：展示阶段进度，可轮询
PARTIAL：黄色提示，列出失败来源
COMPLETED：正常完成
FAILED：红色提示和安全错误摘要
CANCELLED：明确取消
NO_TOP：运行完成但没有符合门槛产品，不显示为失败
```

轮询使用现有 `useAutoRefresh` 或 React Query 等当前项目既有模式。页面隐藏或 run 终态后停止频繁轮询。

### 分池标签

```text
立即打样
观察池
暂缓
淘汰池
```

每个标签显示真实数量。筛选和分页尽量走后端，避免一次加载 300 条完整详情。

### 推荐卡片/表格

至少展示：

```text
排名
产品名
平台/国家
总分与置信度
需求信号
广告后净利率和净利润
竞争进入机会
风险等级
决策原因
今日第一步
待验证数量
```

交互：

- 点击打开候选证据抽屉或详情页。
- 不用颜色作为唯一状态提示，配文字/图标。
- LOW/MEDIUM/HIGH/BLOCKED 使用统一 RiskBadge。
- `MEDIUM` 显示“待人工审核”，禁用开发/草稿动作直到策略允许。
- `HIGH/BLOCKED` 不出现在立即打样标签，若后端返回异常则前端也要安全隐藏动作并显示数据一致性错误。

### 零 TOP

展示：

```text
今日暂无达到“立即打样”标准的新产品。
```

同时提供：

- 主要门槛原因摘要。
- 观察池入口。
- 来源健康状态。
- 不提供“放宽门槛自动补齐”快捷按钮。

## 四、候选证据详情

候选详情需要“结论旁边就能看到证据”，避免漂亮分数悬空。

建议分区：

```text
概览
真实需求证据
关键词
竞争和市场缺口
利润与成本明细
产能与物流
风险与审核
评分拆解
历史和重复推荐
原始来源链接/时间
```

### 证据展示

每条 evidence 显示：

```text
来源
指标名称和值
观察时间/采集时间
质量 VERIFIED/ESTIMATED/MANUAL/UNKNOWN
安全外链（若允许）
```

外链：

- `target=_blank` 时使用安全 `rel`。
- 只接受后端已验证的 http/https URL。
- 不渲染第三方 HTML。

### 利润展示

明确分开：

```text
广告前毛利
广告后净利润
BASE/CONSERVATIVE/OPTIMISTIC 情景
缺失关键成本
汇率快照时间
产能瓶颈
```

unknown 不显示 `$0.00`。

### 评分拆解

显示九个组件：

```text
标准分
权重
贡献分
置信度
缺失输入
证据引用
```

同时显示硬门槛和惩罚，避免用户误解“总分为什么高却在观察池”。

## 五、数据来源页面

表格字段：

```text
来源
配置状态
本次状态
最后成功时间
今日采集量
延迟
数据新鲜度
重试次数
预算使用
安全错误摘要
可用动作
```

动作根据后端权限和状态：

```text
查看详情
手动重试当前来源
进入配置
上传 CSV
禁用/启用（管理员）
```

禁止：

- 前端直接展示/编辑完整 API Key。
- 在错误详情显示完整上游响应或凭证。
- 对 NOT_CONFIGURED 显示绿色“正常”。
- 对 CSV_ONLY 宣称实时自动采集。

CSV 上传流程：

```text
选择文件
→ dry-run 预览成功/错误行
→ 用户确认
→ 正式导入
→ 显示导入记录和来源健康
```

## 六、评分配置页面

仅管理员可编辑。展示：

```text
当前 ACTIVE 版本
九项权重
立即打样/观察/暂缓阈值
最低毛利率
最低净利率
最大退款率
竞争/置信度阈值
候选/推荐上限
近 30 天重复规则
版本历史
```

编辑规则：

- 客户端即时校验权重总和等于 100，但后端仍是权威。
- 显示修改理由必填。
- 保存只创建 DRAFT，不自动激活。
- 激活需要二次确认，显示将影响“后续新 run”，不会修改历史。
- 提供 simulate，显示历史排名和决策变化。
- 回滚需要选择目标版本、输入原因、确认影响。
- 显示创建人、激活人、时间和审计摘要。

不要把配置只保存在 localStorage。

## 七、历史表现页面

阶段 13 才完善经营反馈。本阶段先基于阶段 11 API 展示：

```text
每日运行历史
TOP 数量趋势
来源健康趋势
决策分布
主要淘汰原因
评分版本变化
候选重复/回流
```

当经营反馈未接入时，明确显示“尚无上架/订单/利润回传”，不绘制模拟转化图。

筛选：

```text
日期范围
workspace
平台
国家
决策
风险等级
评分版本
运行状态
```

图表必须有空状态、加载状态和错误状态。不要用假数据让页面“看起来完整”。

## 八、任务日志页面

展示安全的 run/stage 摘要，不展示原始服务器日志：

```text
run ID
触发方式
业务日期
阶段时间线
每阶段状态和耗时
输入/输出数量
重试
安全错误码
来源降级
报告工件
```

支持管理员：

```text
手动运行
在允许时重试失败阶段/来源
取消运行
下载安全 run-log.json
```

按钮必须遵守后端返回的 action capabilities，而不是前端自行推断权限。

## 九、人工审批与下游动作

### 立即打样不是正式上架

推荐项可提供：

```text
生成产品开发任务
生成设计提示词
生成主图方案
生成 Listing 草稿
提交风险审核
标记已打样
拒绝并记录原因
```

不直接提供或默认执行：

```text
正式发布
改价
删除商品
开启广告
自动采购
```

若平台已有这些动作，也必须继续走现有 `ReviewTask`、能力令牌、RBAC 和审计。

### 批准流程

复用已有候选审批语义，并支持稳定 candidateId：

1. 点击“生成开发任务”。
2. 前端展示将创建的内部资源，不暗示外部平台变更。
3. 后端返回 reviewTaskId/productLaunchId/listingDraftId 等真实 ID。
4. UI 链接到现有审核/项目/草稿页面。
5. 重复点击返回已有资源，按钮显示已创建。

### 拒绝

- 原因必填。
- 显示拒绝会作为后续 30 天/反馈学习上下文。
- 不允许仅前端隐藏，必须后端持久化和审计。
- 提供恢复/重新审核入口时必须有权限和明确状态。

## 十、权限与动作能力

后端响应建议包含：

```ts
{
  allowedActions: string[];
  blockedActions: Array<{ action: string; reason: string }>;
}
```

前端：

- 只显示/启用 allowedActions。
- blockedActions 可显示原因 tooltip/文案。
- 不能通过修改 DOM 绕过，后端仍做权限校验。
- 普通成员不能激活评分、force run、修改来源凭证或覆盖风险。

## 十一、可访问性与响应式

- 所有按钮、标签和输入有可访问名称。
- 键盘可操作标签、抽屉、弹窗和表格动作。
- Modal 使用现有组件并正确管理焦点。
- 风险/状态不只依赖颜色。
- 重要表格在窄屏使用卡片或可横向滚动，不让内容截断消失。
- 图表有文字摘要。
- 日期、金额和百分比格式由统一函数处理。

## 十二、i18n

沿用现有 i18next：

- 新页面业务文案进入当前翻译资源。
- 后端 errorCode 映射为本地化安全消息。
- 不把后端任意 errorMessage 直接作为富文本。
- 产品名、证据原文按来源语言展示，UI 标签本地化。
- 时区显示为“北京时间（Asia/Shanghai）”。

## 十三、状态管理和性能

- 列表只取摘要，详情按需加载。
- 300 个候选使用分页/虚拟列表，不能一次渲染全部重型图表。
- run 终态后停止轮询。
- 请求取消或忽略过期响应，避免切换 run 后旧数据覆盖。
- 对手动触发/激活/回滚按钮防重复提交。
- mutation 成功后按真实 ID 刷新相关 query，不全站刷新。
- 下载报告使用后端安全链接，不在浏览器拼 storageKey。

## 十四、测试要求

先写测试或按当前前端测试体系建立可自动验证覆盖。至少包括：

### API 和类型

```text
[ ] report/run/candidate 映射保留 null 与 Decimal 字符串
[ ] 不支持 schemaVersion 显示兼容错误
[ ] 401/403/429/5xx 使用统一错误处理
[ ] run timezone 正确格式化
[ ] 不把 unknown 显示为 0
```

### 今日选品

```text
[ ] COMPLETED/PARTIAL/FAILED/NO_TOP 状态正确
[ ] 不足 10 不补空卡
[ ] HIGH/BLOCKED 不显示开发动作
[ ] MEDIUM 显示人工审核和限制
[ ] 证据抽屉显示来源和时间
[ ] 总分高但硬门槛降级时原因可见
[ ] run 终态停止轮询
```

### 配置和审批

```text
[ ] 权重总和错误不能保存
[ ] 保存 DRAFT 不自动激活
[ ] 激活/回滚有确认和原因
[ ] simulate 显示差异但不改正式页面数据
[ ] 普通用户无管理动作
[ ] 重复批准返回已有资源
[ ] 拒绝原因必填
[ ] 不出现直接正式上架/开广告按钮
```

### 安全和可访问性

```text
[ ] 外部 URL 不可注入 javascript/data
[ ] 第三方 HTML 不被渲染
[ ] API Key 不出现在 DOM
[ ] Modal/Drawer 焦点和键盘操作正确
[ ] 状态有文字而非仅颜色
[ ] 窄屏核心字段仍可访问
```

若仓库没有成熟前端单测，至少添加关键组件/映射的 Vitest 或当前测试工具，并运行 build、lint。不要以“手动看过”为唯一证据。

## 本阶段允许修改

```text
智能体前端/src/App.tsx                              # 路由注册小改
智能体前端/src/components/sidebar/**                # 导航小改
智能体前端/src/features/daily-product-research/**
智能体前端/src/pages/DailyProductResearch.tsx
智能体前端/src/pages/ProductResearchSources.tsx
智能体前端/src/pages/ProductResearchScoring.tsx
智能体前端/src/pages/ProductResearchHistory.tsx
智能体前端/src/pages/ProductResearchRunDetail.tsx
智能体前端/src/api/dailyProductResearch.ts
智能体前端/src/i18n/**
智能体前端/src/test/** 或现有测试路径
智能体前端/package.json                             # 仅确有测试依赖缺失时
```

对 `ProductResearch.tsx` 只做必要导航/兼容接入，优先新增组件，不进行无关整页重写。

## 禁止事项

- 不要重做控制台设计系统和整站导航。
- 不要用 mock 数字填趋势、利润、来源健康或历史转化。
- 不要将 null 显示为 0。
- 不要把 API Key 放入前端状态、localStorage 或 DOM。
- 不要由前端决定最终权限和风险门槛。
- 不要提供绕过审核的正式上架、改价、删品、采购或广告动作。
- 不要把运行日志等同服务器原始日志。
- 不要把每日选品继续全部塞进现有大页面。

## 出口闸门

```text
[ ] 新页面融入现有路由、侧边栏和设计系统
[ ] 今日选品四个分池和零 TOP 状态真实可用
[ ] 候选详情能追溯需求、利润、风险和评分证据
[ ] 来源健康、CSV dry-run 和安全错误状态可见
[ ] 评分版本创建、模拟、激活、回滚按权限工作
[ ] 历史和日志不展示模拟数据
[ ] 所有下游动作继续经过人工审批
[ ] 重要交互具备 loading/empty/error/disabled 状态
[ ] 可访问性、窄屏和 URL/HTML 安全测试通过
[ ] 前端 lint、测试和 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 已实现页面和路由。
- API 契约与仍缺失的后端字段。
- 人工审批到产品/Listing 草稿的真实 ID 链路。
- 历史页面为阶段 13 预留的数据槽位。
- 前端测试/build 结果和视觉/可访问性风险。
