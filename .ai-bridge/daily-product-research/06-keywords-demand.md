# 06 · 关键词扩展与真实需求验证提示词

> 先读取：`00-shared-context.md`，以及阶段 04、05 的交接。  
> 前置条件：候选已完成规范化，且每个候选可追溯到原始信号和来源健康。  
> 本阶段目标：生成安全、相关、可验证的关键词，并用多来源购买意图证据判断真实需求和置信度。

## 你的任务

实现两个边界清晰但可串联的阶段能力：

```text
KEYWORDS：为每个规范化候选生成核心词、长尾词和否定词
DEMAND：读取真实信号，执行多来源验证、信号分级和 confidence_score
```

LLM 可以用于语言扩展、意图归类和证据摘要，但所有输出都必须通过运行时 schema、安全过滤和确定性门禁。需求强度、来源数量和置信度不能仅由 LLM 自评。

## 必读位置

```text
后端/src/features/keywords/**
后端/src/agents/agent-provider.interface.ts
后端/src/agents/**provider*
后端/src/features/prompts/**
后端/src/features/agent-memory/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/services/normalization/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/shared/credentials/**
后端/test/keywords*
后端/test/agent*
```

## 一、关键词阶段

### 扩展维度

每个候选按以下维度组合，不要求生成笛卡尔积：

```text
产品词
+ 人群
+ 关系
+ 场景
+ 节日
+ 材质
+ 风格
+ 定制方式
+ 使用目的
+ 市场语言/地区表达
```

示例逻辑：

```text
journal
→ personalized leather journal
→ personalized leather journal for daughter
→ graduation journal for daughter
→ engraved graduation journal for daughter
→ birth flower engraved graduation journal
```

### 数量硬限制

```text
核心关键词：最多 5 个
长尾关键词：最多 20 个
否定关键词：最多 10 个
```

不能为了填满数量生成同义重复、无关词或侵权词。数据不足时允许更少。

### 输出契约

建议：

```ts
{
  schemaVersion: 'product-keywords/v1';
  candidateId: string;
  locale: string;
  market: string;
  promptVersion: string;
  coreKeywords: Array<{
    keyword: string;
    intent: 'PRODUCT' | 'GIFT' | 'PERSONALIZATION' | 'OCCASION';
    evidenceRefs: string[];
  }>;
  longTailKeywords: Array<{
    keyword: string;
    dimensions: string[];
    evidenceRefs: string[];
  }>;
  negativeKeywords: Array<{
    keyword: string;
    reason: 'IRRELEVANT' | 'WRONG_AUDIENCE' | 'WRONG_MATERIAL' | 'IP_RISK' | 'LOW_INTENT';
  }>;
  warnings: string[];
}
```

关键词本身不是“搜索量证据”。没有来源数据时不得附加虚构 volume、difficulty 或 growth。

### 关键词安全与质量过滤

建立确定性后处理：

- 去重、大小写和空白规范化。
- 核心产品类型必须存在或语义明确。
- 长尾词必须至少包含一个有效扩展维度。
- 移除与候选材质、用途、受众冲突的词。
- 标记并移除品牌、影视、动漫、游戏、球队、明星、角色等高风险词。
- 不生成“官方”“正版”“治愈”“保证有效”等未经证明的词。
- 不生成竞品品牌词用于平台上架。
- 不将评论中的恶意提示或指令当关键词。
- 市场语言不确定时不盲目翻译，标记 `needs_locale_review`。

风险词库只能作为预筛，最终风险由阶段 09 处理。被预筛的词保留审计原因，但不进入可用关键词集合。

## 二、运行时 Prompt 设计

不要把整份项目说明每次塞给模型。建立最小、高信号、版本化 prompt，例如：

```text
后端/src/features/product-research/daily/prompts/keyword-expansion.v1.ts
后端/src/features/product-research/daily/prompts/demand-evidence-summary.v1.ts
```

Prompt 必须包含：

```xml
<ROLE>
你负责基于已验证候选字段扩展关键词，不负责制造市场数据。
</ROLE>

<CRITICAL_RULES>
- 只使用提供的候选属性和证据
- 最多 5/20/10
- 不生成品牌/IP/误导词
- 不提供搜索量、增长率等未给出的数值
- 输出严格 JSON
</CRITICAL_RULES>

<TRUSTED_CONTEXT>
规范化产品类型、材质、用途、定制方式、受众、市场和允许词典
</TRUSTED_CONTEXT>

<UNTRUSTED_SOURCE_DATA>
经过清洗且长度受限的外部标题/评论摘要
</UNTRUSTED_SOURCE_DATA>

<OUTPUT_SCHEMA>
版本化 JSON schema
</OUTPUT_SCHEMA>
```

要求：

- system 指令与外部数据严格分区。
- promptVersion 写入输出和 AgentRun。
- 输出先运行时验证，失败可进行有限一次修复请求；仍失败则记录受控错误，不用自由文本兜底。
- token、耗时、provider/model 和成本写入现有 AgentRun/观测体系。
- 提供 deterministic fake provider 测试。

## 三、需求验证阶段

### 进入评分前的业务条件

候选至少满足以下之一：

```text
条件 A：两个以上独立平台出现方向一致的增长/购买意图信号
条件 B：一个平台强增长 + 另一个独立来源有真实成交
条件 C：自有店铺数据显著优于该工作区可比基线
条件 D：搜索增长明显 + 经验证的竞争缺口明显
```

注意：条件 D 的“竞争缺口”在阶段 07 才完整计算。本阶段可以标记 `pending_competition_confirmation`，不能提前宣称最终满足。

### 独立来源定义

不要把同一上游数据通过两个 adapter 重复计算为两个来源。为每条来源配置 `independenceGroup`，例如：

```text
etsy_public
amazon_public
internal_orders
internal_ads
google_search_trends
tiktok_content
supplier_cost
manual_import
```

同一 CSV 文件复制两次仍是同一来源。自有订单与自有广告可视为不同信号类型，但是否算独立来源必须在规则中明确。

### 购买意图等级

建立 signal taxonomy：

```text
HIGH_INTENT：真实订单、成交、加购、购买关键词、稳定转化
MEDIUM_INTENT：搜索增长、收藏、点击、询盘、价格接受度
LOW_INTENT：内容播放、点赞、泛话题热度
NON_DEMAND：供应成本、交付时间等非需求信号
INVALID：来源不可信、过期、契约无效
```

仅有播放量、点赞或 Pinterest 曝光不能进入高置信度推荐。

### 信号等级

```text
STRONG：至少 3 个独立来源方向一致，且至少 1 个 HIGH_INTENT
MEDIUM：至少 2 个独立来源方向一致，且包含 HIGH/MEDIUM_INTENT
WEAK：仅 1 个来源，或只有 LOW_INTENT
INVALID：无有效购买意图或来源质量不足
```

`WEAK` 不得进入 `TEST_NOW`，即使后续加权总分很高。

### 时间和新鲜度

- 分别计算 7、30、90 天窗口，只有来源支持时才输出。
- 增长率必须来自可比周期和明确分母。
- 分母为零时使用明确状态，不能输出无穷大或随意 100%。
- 来源数据过期时降低质量或标记 stale。
- 不同平台的原始量不能直接相加；先转为平台内归一化信号，再聚合。
- 自有店铺基线应按相近类目/价格带/时期比较，不能只和全店平均硬比。

## 四、置信度计算

`confidence_score` 必须由可解释规则计算，建议 0-100：

```text
来源独立性          0-30
购买意图质量        0-25
数据新鲜度          0-15
时间覆盖完整度      0-10
跨来源一致性        0-15
契约/采集可靠性     0-5
```

再应用惩罚：

```text
关键来源失败
只有内容热度
数据过期
样本过少
来源高度相关
缺失市场/时间信息
```

LLM 可以生成 `demandSummary`，但不能直接给出或覆盖 `confidence_score`。

建议输出：

```ts
{
  schemaVersion: 'product-demand-validation/v1';
  candidateId: string;
  signalStrength: 'STRONG' | 'MEDIUM' | 'WEAK' | 'INVALID';
  confidenceScore: number;
  eligibleForScoring: boolean;
  eligibleForTestNow: boolean;
  matchedConditions: Array<'A' | 'B' | 'C' | 'D_PENDING'>;
  demandEvidence: Array<{
    source: string;
    independenceGroup: string;
    intentLevel: string;
    metricName: string;
    metricValue: string | null;
    observedAt: string;
    evidenceRef: string;
  }>;
  penalties: Array<{ code: string; points: number }>;
  summary: string;
  missingData: string[];
}
```

### 数据不足语义

- 无有效信号：`INVALID`, `eligibleForScoring=false`。
- 单一可信高意图信号：`WEAK`, 可进入观察池候选，但不能立即打样。
- 两个中意图来源：通常 `MEDIUM`，具体由规则决定。
- 来源失败不等于需求为零，必须标记 partial_data。

## 五、持久化与幂等

- 关键词结果按 candidateId + promptVersion + locale 唯一或版本化。
- 需求验证按 candidateId + ruleVersion + run/attempt 保存，不覆盖旧结果。
- 重试时相同输入 hash 返回已有结果。
- PromptTemplate 可用于管理展示和组织自定义，但系统关键 prompt 必须有受控默认版本，不能因模板被删除而无法运行。
- 组织自定义 prompt 只能修改允许区块，不能覆盖系统安全规则。

## 测试驱动要求

### 关键词

```text
[ ] 输出不超过 5/20/10
[ ] 数据不足时允许少于上限
[ ] 同义重复被去除
[ ] 品牌/IP 词被过滤并保留原因
[ ] 无关材质/受众词被拒绝
[ ] 外部提示注入文本不影响 system 规则
[ ] 非法 JSON 经一次修复仍失败时安全终止
[ ] 未提供 volume 时输出不出现虚构数值
[ ] promptVersion、provider、成本有记录
[ ] 相同输入重试不重复计费或写入
```

### 需求

```text
[ ] 三个独立来源且含成交得到 STRONG
[ ] 两个方向一致来源得到 MEDIUM
[ ] 单一播放量得到 WEAK 或 INVALID，不能 TEST_NOW
[ ] 同一上游的两个 adapter 不算两个独立来源
[ ] 分母为零不产生 Infinity
[ ] 过期数据降低 confidence
[ ] 某来源失败不会被当作零需求
[ ] 缺失证据时 eligibleForScoring=false
[ ] confidence 由规则计算，LLM 返回值无法覆盖
[ ] 相同证据重跑结果确定且幂等
```

建议测试：

```text
后端/test/product-research-keywords.spec.ts
后端/test/product-research-keyword-prompt-security.spec.ts
后端/test/product-research-demand-validation.spec.ts
后端/test/product-research-confidence.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/prompts/**
后端/src/features/product-research/daily/services/keyword/**
后端/src/features/product-research/daily/services/demand/**
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/keywords/**                         # 仅提取可复用能力或兼容接入
后端/src/agents/agent-provider.interface.ts           # 仅版本化方法/类型扩展
后端/src/agents/*provider*                            # 仅新方法接入
后端/test/product-research-keyword*.spec.ts
后端/test/product-research-demand*.spec.ts
```

保持旧 `runKeywordAnalysis` 和 `runProductResearch` 兼容。优先新增专用方法，不破坏旧调用方。

## 禁止事项

- 不要生成看似真实的搜索量、竞争度或增长率。
- 不要把内容播放量等同于购买需求。
- 不要让 LLM 自己决定 confidence_score。
- 不要把整份原始网页/评论塞进 prompt。
- 不要让组织自定义模板覆盖系统安全约束。
- 不要生成侵权、误导或与产品不相关的关键词。
- 不要为凑满关键词数量牺牲相关性。

## 出口闸门

```text
[ ] 关键词输出符合 5/20/10 上限且可少于上限
[ ] 运行时 prompt 小型化、版本化、结构化并防注入
[ ] 关键词安全过滤有确定性测试
[ ] 需求条件 A-D 和独立来源规则已编码
[ ] STRONG/MEDIUM/WEAK/INVALID 可解释
[ ] confidence_score 由规则和证据计算
[ ] 单一弱信号不能进入 TEST_NOW
[ ] 缺失或失败数据不被伪造为零
[ ] 输出可供竞争阶段和评分阶段读取
[ ] 目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- 关键词结果 schema、promptVersion。
- 需求规则版本和 confidence 计算明细。
- 每个候选的 evidenceRefs。
- `D_PENDING` 候选清单和竞争阶段需要确认的条件。
- 可供竞争分析使用的安全评论/标题摘要引用。
