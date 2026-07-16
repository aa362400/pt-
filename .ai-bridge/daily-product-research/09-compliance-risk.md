# 09 · 侵权、合规、召回与物流风险提示词

> 先读取：`00-shared-context.md`，阶段 04-08 的交接，以及现有审核、通知、审计和权限实现。  
> 前置条件：候选、关键词、市场、材质、用途、定制方式、供应链和交付信息已结构化。  
> 本阶段目标：用版本化规则和可核验证据执行风险筛查。`HIGH` 与 `BLOCKED` 一票否决，`MEDIUM` 强制人工审核。

## 你的任务

实现 `RISK` 阶段，覆盖：

```text
商标和品牌词
影视、动漫、游戏、球队、明星、角色和音乐文化资产
外观专利/高度仿制风险
儿童用品安全
食品接触材料
电池、液体、磁铁、刀具和危险品物流
平台禁售/限售
产品召回
医疗、功效、认证和环保声明
隐私、肖像和买家上传素材
目的国标签、包装和材料限制
```

本系统提供经营风险筛查和人工审核路由，不冒充正式法律意见。没有可靠来源时，输出 `needs_manual_review`，不能用 LLM 的自信语气代替证据。

## 必读位置

```text
后端/src/features/review/**
后端/src/features/notifications/**
后端/src/features/audit-logs/** 或 shared/audit/**
后端/src/features/listings/**
后端/src/features/channels/**
后端/src/features/product-research/**
后端/src/features/product-research/daily/**
后端/src/features/files/**
后端/src/agents/**
后端/src/shared/auth/**
后端/src/shared/tenancy/**
后端/prisma/schema.prisma
后端/test/review*
后端/test/listing*compliance*
```

## 一、风险分类

建立唯一、版本化的 taxonomy。建议：

```text
TRADEMARK_TERM
BRAND_REFERENCE
COPYRIGHT_CHARACTER
CELEBRITY_OR_LIKENESS
SPORTS_TEAM_OR_LEAGUE
MUSIC_OR_LYRIC
DESIGN_PATENT_OR_LOOKALIKE
COUNTERFEIT_SIGNAL
CHILD_SAFETY
FOOD_CONTACT
BATTERY
LIQUID
MAGNET
SHARP_OBJECT
HAZARDOUS_MATERIAL
PLATFORM_PROHIBITED
PLATFORM_RESTRICTED
SHIPPING_RESTRICTED
RECALL_MATCH
MEDICAL_CLAIM
PERFORMANCE_CLAIM
CERTIFICATION_CLAIM
ENVIRONMENTAL_CLAIM
PRIVACY_OR_PERSONAL_DATA
CUSTOMER_UPLOADED_IP
LABELING_REQUIREMENT
MATERIAL_DISCLOSURE
UNKNOWN_HIGH_IMPACT
```

每条风险记录必须关联：

```text
candidateId
riskType
severity
matchedField
matchedValue（必要时脱敏）
ruleId/ruleVersion
evidenceRefs
source
sourceObservedAt
reason
recommendedAction
reviewStatus
```

## 二、风险等级

```text
LOW：当前证据未发现阻断项，可继续评分
MEDIUM：存在不确定或受限项，必须人工审核
HIGH：高概率侵权/违规/无法安全履约，自动淘汰
BLOCKED：明确禁止，不能生成上架、采购或广告任务
```

### 一票否决

以下任一成立，候选不能进入 `TEST_NOW`：

- 任意有效 `HIGH` 或 `BLOCKED` 风险。
- 平台/目的国明确禁售。
- 明确召回匹配且问题未解除。
- 无法满足儿童、食品接触、电池或危险品关键合规要求。
- 物流渠道明确拒运。
- 商品核心卖点依赖未经授权品牌/角色/明星/球队。

高利润、高需求和高增长不能覆盖一票否决。

## 三、规则来源与版本

建立 `RiskRuleProvider`/registry，规则来源至少分为：

```text
SYSTEM_CURATED
PLATFORM_POLICY
OFFICIAL_RECALL_SOURCE
OFFICIAL_TRADEMARK_SOURCE
SHIPPING_CARRIER_RULE
ORGANIZATION_BLOCKLIST
MANUAL_REVIEW_DECISION
```

要求：

- 每条规则有 `ruleId`, `version`, `effectiveFrom`, `sourceUrl/sourceRef`, `fetchedAt`, `expiresAt/refreshAfter`。
- 旧规则不删除，标记 retired/superseded。
- 平台规则、物流限制和召回列表有新鲜度阈值。
- 规则过期时不得默认为安全，应降级为 `MEDIUM` 或 `needs_rule_refresh`。
- 组织私有禁词只作用于本组织/工作区。
- 不把非官方博客或 LLM 记忆当唯一高风险来源。

如当前仓库没有自动同步正式数据库，第一版实现：

```text
版本化静态基础规则
+ 管理员导入
+ 官方来源 adapter 接口
+ fake provider 测试
+ 规则新鲜度和人工审核
```

不要声称已经完成商标、专利或召回的全球穷尽检索。

## 四、字段扫描

至少扫描：

```text
canonicalName
原始标题
核心/长尾/否定关键词
描述和卖点草稿（若已有）
定制文本模板
图片 OCR/标签（仅已有可信结果）
材质
目标受众
用途和年龄段
供应商名称/型号
包装声明
差异化建议
买家上传素材类型
```

匹配必须考虑：

- Unicode 变体、空格、标点和常见规避写法。
- 词边界，减少子串误报。
- 上下文否定，例如“compatible with”仍需平台政策判断，不能自动视为安全。
- 通用词与品牌词重名的歧义。
- 语言/市场差异。

确定性词典用于候选匹配；LLM 只可帮助解释上下文，不得把明确规则降级。

## 五、商标、版权与肖像

### 商标/品牌

- 区分 exact、phonetic、fuzzy 和 contextual match。
- 高风险 exact match 关联正式来源或组织规则。
- 模糊匹配默认 `MEDIUM`，除非有更强证据。
- 产品核心依赖品牌时，即使删除关键词也不能洗白产品本体。

### 角色/影视/游戏/球队/明星

- 角色名称、视觉特征、球队标识、球衣元素、名人肖像和签名均可能构成风险。
- 不能建议“稍微改颜色/换名字”绕过权利。
- 用户上传照片不代表用户拥有商业使用权，需在后续订单流程有声明/审核。

### 歌词和音乐

不将受保护歌词或长文本生成到产品设计、标题或描述。任何运行时 prompt 也应禁止复现长歌词。

## 六、外观/仿制风险

第一版不要求自动做法律专利结论，但必须识别：

```text
高度相似品牌轮廓
标志性结构/装饰组合
供应商标题中的 replica/dupe/inspired 等信号
外观设计明显依赖单一权利产品
```

输出 `MEDIUM/HIGH` 和人工法务/合规复核，而不是“无专利风险”。

若接入图像相似能力：

- 只使用获授权资产。
- 保存模型/方法版本和相似度证据。
- 视觉相似度不是法律结论。
- 不把图片发到未批准第三方。

## 七、儿童、食品接触和材料

根据候选属性与目标市场判定是否需要：

```text
年龄分级
小零件/窒息风险
铅、邻苯等材料要求
玩具/儿童产品测试
食品接触材质声明
耐温/迁移/涂层信息
材料标签
警告语和可追溯信息
```

缺少关键材料、年龄或测试信息时：

```text
severity = MEDIUM 或 HIGH（按风险类别）
needsManualReview = true
missingRequirements = [...]
```

不能因为产品“看起来简单”就默认为合规。

## 八、物流风险

识别：

```text
电池类型、容量、是否内置
液体/凝胶/粉末
磁铁强度和数量
刀具/尖锐边缘
易燃/腐蚀/加压
尺寸重量超限
目的国禁限运
承运商特殊文件
```

输出：

```text
shippingRisk
restrictedRoutes
requiredDocuments
allowedMethods
unknownAttributes
fulfillmentBlocked
```

物流属性未知且可能高影响时，不能标记 LOW。

## 九、召回

实现召回匹配接口：

```text
产品类型
品牌/型号
供应商 SKU
材料/危险特征
时间范围
市场
```

规则：

- exact 品牌/型号召回匹配至少 HIGH。
- 类目级相似召回为 MEDIUM，需人工核验。
- 保存正式召回来源和发布日期。
- 召回来源不可用或过期时记录来源健康，不宣称“无召回”。

## 十、声明和文案风险

识别：

```text
治愈/治疗/诊断
100% 安全/绝对有效
防过敏/无毒/食品级
官方认证/环保认证
永久不褪色/完全防水
未验证性能或材料声明
```

输出建议可包括“删除/改为可验证描述/补充证据”，但不能自动生成新的无证据替代声明。

## 十一、人工审核集成

复用现有 `ReviewTask`、通知和审批中心：

- `MEDIUM` 自动创建或复用风险审核任务。
- 同 candidate + risk snapshot 不重复创建任务。
- `HIGH/BLOCKED` 保存淘汰结果，并可创建只读复核任务，但默认不能批准为可上架。
- 如允许管理员推翻自动风险，必须要求原因、证据、权限和审计，并且某些 `BLOCKED` 规则不可覆盖。
- 审核结果回写 `reviewStatus`, `reviewedBy`, `reviewedAt`, `reason`。
- 风险规则更新后，可标记旧审核 stale，而不是静默沿用。

## 十二、运行时 Prompt

如使用 LLM 做上下文解释，建立：

```text
risk-context-classifier.v1.ts
risk-summary.v1.ts
```

Prompt 规则：

- 外部文本放入不可信数据区。
- 明确 LLM 不是法律数据库。
- 不允许模型降低 exact/official rule 的 severity。
- 输出严格 JSON，不输出最终“合法/违法”断言。
- 输出 `uncertainties` 和 `manualReviewReasons`。
- 保存 promptVersion、inputHash、ruleVersion、evidenceRefs。

## 十三、结果契约

建议：

```ts
{
  schemaVersion: 'product-risk/v1';
  candidateId: string;
  ruleSetVersion: string;
  overallSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
  hardGateBlocked: boolean;
  risks: ProductRiskItem[];
  missingAttributes: string[];
  staleRuleSources: string[];
  needsManualReview: boolean;
  reviewTaskIds: string[];
  allowedActions: Array<'VIEW' | 'SCORE' | 'CREATE_DRAFT' | 'REQUEST_REVIEW'>;
  blockedActions: Array<'TEST_NOW' | 'CREATE_LISTING_DRAFT' | 'PUBLISH' | 'PURCHASE' | 'ADVERTISE'>;
  summary: string;
}
```

`allowedActions`/`blockedActions` 应与现有能力令牌和审核边界兼容。正式发布仍由更外层安全机制拦截，本阶段结果不能成为唯一授权。

## 十四、幂等和审计

- 风险结果按 candidateId + ruleSetVersion + inputHash 版本化。
- 相同快照重试不重复写记录或审核任务。
- 新规则、新关键词、新材料或新市场触发新风险快照。
- 保留旧结果，报告引用本次 run 锁定的风险版本。
- 所有人工覆盖、规则导入、激活和回滚均写 AuditService。

## 测试驱动要求

至少覆盖：

```text
[ ] exact 高风险品牌匹配得到 HIGH/BLOCKED
[ ] 模糊歧义词默认 MEDIUM，不自动判安全
[ ] 删除品牌关键词不能洗白依赖品牌的产品
[ ] 角色/球队/明星/歌词风险被识别
[ ] 评论或标题中的提示注入不能降低 severity
[ ] 过期规则来源触发 stale/人工审核
[ ] 儿童用品缺年龄/材料信息不能 LOW
[ ] 食品接触材质缺证据触发审核
[ ] 电池/液体/磁铁/刀具属性影响物流动作
[ ] exact 召回型号匹配自动阻断
[ ] 召回来源失败不会显示“无召回”
[ ] 医疗/认证/绝对声明被标记
[ ] MEDIUM 创建一个幂等 ReviewTask
[ ] HIGH/BLOCKED 不能进入 TEST_NOW
[ ] 高利润/高需求无法覆盖硬风险
[ ] 管理员覆盖要求权限、原因、证据和审计
[ ] 跨租户看不到风险规则/记录/审核任务
[ ] 相同 inputHash 重跑幂等，新规则产生新版本
```

建议测试：

```text
后端/test/product-research-risk-engine.spec.ts
后端/test/product-research-risk-rules.spec.ts
后端/test/product-research-logistics-risk.spec.ts
后端/test/product-research-recall.spec.ts
后端/test/product-research-risk-review.spec.ts
后端/test/product-research-risk-prompt-security.spec.ts
```

## 本阶段允许修改

```text
后端/src/features/product-research/daily/services/risk/**
后端/src/features/product-research/daily/prompts/risk-*.ts
后端/src/features/product-research/daily/contracts/**
后端/src/features/product-research/daily/*repository*.ts
后端/src/features/review/**                         # 仅风险任务接入所需
后端/src/features/notifications/**                  # 仅风险通知接入所需
后端/src/shared/audit/**                            # 仅新事件类型所需
后端/prisma/schema.prisma                           # 仅阶段 02 模型补充
后端/prisma/migrations/<new-migration>/**
后端/test/product-research-risk*.spec.ts
后端/.env.example                                   # 仅真实规则来源配置
```

## 禁止事项

- 不要把 LLM 当商标、专利、召回或法律数据库。
- 不要宣称完成全球穷尽检索。
- 不要用“改一点”建议规避权利。
- 不要让高利润或高需求抵消 HIGH/BLOCKED。
- 不要把规则来源失败解释为安全。
- 不要将过期平台政策静默用于 LOW 结论。
- 不要自动批准 MEDIUM 风险外部写操作。
- 不要在日志、报告或前端暴露敏感买家素材。

## 出口闸门

```text
[ ] 风险 taxonomy、规则和结果均有版本
[ ] 每条风险都有证据、规则来源和动作建议
[ ] LOW/MEDIUM/HIGH/BLOCKED 语义可测试
[ ] HIGH/BLOCKED 一票否决不可被评分覆盖
[ ] MEDIUM 自动进入现有人工审核
[ ] 平台/物流/召回来源新鲜度可见
[ ] 数据缺失或来源失败不会被判为安全
[ ] 规则和审核均具备租户隔离、权限和审计
[ ] 输出可供评分和报告阶段直接消费
[ ] Prisma validate、目标测试、lint、后端 build 通过
```

最后输出 `PHASE HANDOFF`。`next_phase_inputs` 必须包含：

- overallSeverity、hardGateBlocked 和 blockedActions。
- 所有风险的 ruleVersion/evidenceRefs。
- MEDIUM 审核任务 ID。
- 缺失属性和 stale source 清单。
- 评分阶段必须执行的一票否决原因。
