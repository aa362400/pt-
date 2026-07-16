# 跨境 Agent 能力升级 — 完整落地方案

> 版本：2026-07-03
> 依据：《agent_papers_top3_with_suggestions_2026-07-03.md》（AutoMem / OpenAgent / Mnemosyne 三篇论文建议）
> 　　　《cross_border_agent_useful_modules_2026-07-03.md》（TOP 8 能力清单与 V1-V4 路线图）
> 对象：本仓库 `agent/`（Observer/Executor 双智能体 + Flask Web + 22 个 services + 20 个 scripts，346 项测试）

---

## 一、先说结论：文档要的东西，一半已经有了

对照两份文档逐项盘点代码库，**TOP 8 能力中 6 项已有地基**，真正要新建的是「选品雷达 + 机会评分卡」「事务安全层」「记忆升级」三块：

| 文档要求 | 现状 | 位置 | 差距 |
|---|---|---|---|
| 1 爆品选品雷达 | ❌ 无 | （有 web_search/researcher 可复用） | **全新模块** |
| 2 关键词分析 | 🟡 基础版 | `web/services/biz_tools.py::suggest_keywords` | 缺 Etsy 13 标签、搜索意图/转化强度/侵权风险三判断 |
| 3 上架图 Prompt | ✅ 强 | `commerce_strategy.py` + `commerce_llm.py`（9 槽位套图+平台风格包+场景导演） | 基本达标 |
| 4 利润计算 | 🟡 基础版 | `biz_tools.py::calc_profit` | 缺 保守/正常/冲量 三模式、退款率、支付手续费、包装成本 |
| 5 Listing 文案 | ✅ 有 | `listing_pack.py`（标题/五点/关键词/CSV）+ `listing_rules.py`（7 平台标题优化） | 缺 How to Order / FAQ / 定制说明段落 |
| 6 风险检测 | 🟡 分散 | 反侵权负向词（strategy）、图片合规（compliance_checker） | 缺**文本级**商标词/敏感词/物流/同质化统一检测器 |
| 7 上架资料导出 | 🟡 有 | listing-pack zip / CSV / 分辨率包 / 平台包 | 缺「一键完整资料包」（MD+CSV+Prompt+风险报告 合一） |
| 8 长期记忆 | 🟡 基础版 | `common/user_memory.py`（偏好）+ `knowledge_base.py`（笔记）+ `observer.post_task_reflect`（复盘） | 缺 AutoMem 式**分层记忆文件 + 经验卡片 + 记忆审核器** |
| 事务安全（Mnemosyne） | 🟡 部分 | CSRF、生成前人工确认、alts/ 备份回退 | 缺 Proposal→校验→提交→日志→回滚 统一层 |
| 开放环境鲁棒（OpenAgent） | 🟡 部分 | 346 项测试 + mock 模式 + 各处降级兜底 | 缺**扰动测试集**与鲁棒性评分 |

> 文档里「不建议现在做」的（全自动登录/付款/删商品/浏览器全自动），本方案一律不做，与文档判断一致。

---

## 二、总体架构（在现有架构上加三层，不推翻）

```text
用户聊天框（现有 Web UI）
  ↓
Observer（意图理解，现有）——— 新增意图: research_product / profit_query / risk_check
  ↓
业务 Skill 层（现有 services/，扩展）
  ├─ ✅ 图片 Prompt（commerce_strategy/commerce_llm）
  ├─ ✅ Listing 文案（listing_pack/listing_rules）
  ├─ 🔧 关键词（biz_tools 增强）
  ├─ 🔧 利润（biz_tools 增强）
  ├─ 🆕 选品雷达 opportunity.py
  ├─ 🆕 风险检测 risk_check.py
  └─ 🆕 资料包导出 listing_bundle.py
  ↓
🆕 Memory System v2（common/memory_store.py）        ← AutoMem
  ├─ profiles/memory/product_memory.md    产品/爆款记忆
  ├─ profiles/memory/keyword_memory.md    关键词有效性记忆
  ├─ profiles/memory/style_memory.md      图片风格记忆
  ├─ profiles/memory/risk_memory.md       风险与禁词记忆
  ├─ profiles/memory/store_strategy.md    店铺策略记忆
  └─ 经验卡片 + Memory Reviewer（LLM 审核后才入库）
  ↓
🆕 Runtime Safety Layer（web/services/safety.py）    ← Mnemosyne
  ├─ Proposal 生成（高风险动作先提案不执行）
  ├─ Constraint Checker（标题字数/标签/利润线/禁词/尺寸）
  ├─ 风险分级（低=自动 / 中=自动+日志 / 高=人工确认 / 危险=只建议）
  ├─ append-only 操作日志 logs/actions.jsonl
  └─ 回滚（复用现有 alts/ 备份机制）
  ↓
执行层（现有：生图/改图/导出/MCP Server）
🆕 鲁棒性测试集 tests/test_open_world.py             ← OpenAgent
```

---

## 三、分阶段实施（P1→P5，每阶段可独立交付验收）

### P1 记忆系统 v2（文档「第一步先做记忆」，最优先）

**新文件 `agent/common/memory_store.py`**
- 五类 Markdown 记忆文件（见上），append + 去重 + 上限截断（每文件 ≤100 条）
- `write_card(card: dict)`：经验卡片固定格式（任务/成功点/风险点/下次优先/禁止重复）
- `review(candidate) -> bool`：Memory Reviewer——LLM 判「长期有效？业务相关？会影响未来决策？需覆盖旧记忆？」，不过审不入库；无 Key 时按规则（长度/含平台词/含数字结论）兜底
- `recall(query, k=4)`：复用 knowledge_base 的 2-gram 重合度检索，五文件统一召回

**改造点**
- `observer.post_task_reflect()`（已有复盘钩子）→ 复盘结论生成经验卡片 → review → 写入对应记忆文件
- `orchestrator.py` 构建上下文时注入 `memory_store.recall(用户消息)`（与现有 user_memory.summary() 并列）
- 记忆分四层（文档建议 4）：用户偏好层=现有 user_memory；平台规则层=knowledge/*.md（已有）；任务经验层=经验卡片（新）；执行流程层=SOP 笔记（「记住：」已有，归入 store_strategy）

**验收**：跑一次生成任务后 `profiles/memory/` 出现经验卡片；下次同品类对话的 LLM 上下文里能看到召回内容；单测覆盖 写入/审核拒绝/召回/截断。

### P2 选品雷达 + 机会评分卡（TOP 1，最靠近钱）

**新文件 `agent/web/services/opportunity.py`**
- `analyze_idea(idea, profile=None) -> 机会卡`：LLM 按文档 9 字段产出——机会评分 0-100、竞争难度、制作难度、利润空间、适合平台、可定制元素、礼物场景、改款建议、风险提醒；无 Key 用规则模板兜底
- 可选联网增强：有 SERPER/TAVILY Key 时先 `common/web_search.py` 搜 Etsy/Trends 信号，摘要注入 LLM（复用 researcher 能力，不新写爬虫）
- 机会卡 JSON 结构照抄文档第 9 节 `产品机会卡`

**改造点**
- `product_pool.py`：条目增加 `opportunityScore/competitionLevel/riskLevel/giftScenes/customElements` 字段（向后兼容，旧条目默认空）；`add_item` 支持直接从机会卡入池
- 新接口 `POST /api/commerce-agent/opportunity`（sessionId, idea）→ 机会卡 + 「一键入新品池」
- Observer 新增 `research_product` 意图（正则：`(能不能做|值不值得做|帮我分析.*产品|选品)`），回传机会卡给前端渲染
- MCP Server 增加第 5 个工具 `analyze_opportunity`（跨境团队在 Cursor 里直接用）

**验收**：输入文档示例「宠物出生花亚克力挂件，适合 Etsy，能不能做」→ 返回完整机会卡；入池后 CSV 导出含新字段。

### P3 利润计算 & 关键词增强（TOP 2/4 补齐）

**`biz_tools.py::calc_profit` 增强**
- 新增参数：`packaging`（包装）、`payment_pct`（支付手续费，默认 2.9%）、`refund_pct`（退款率）、`mode`（conservative/normal/aggressive 三模式——保守模式广告费与退款率按高位算，冲量模式压利润率）
- 输出补：`建议售价`（按目标利润率反推）、`建议广告预算区间`、`结论`（可以测试/不建议/建议提价，按文档输出格式）

**`biz_tools.py::suggest_keywords` 增强**
- 每个词附三判断：`intent`（买礼物/找纪念品/找装饰/找定制）、`conversion`（高/中/低）、`risk`（安全/可疑/高风险——过 P4 商标词库）
- 新增 `etsy_tags(profile) -> 13 个 ≤20 字符标签`（复用 listing_rules 的截断逻辑）
- `/api/commerce-agent/profit` 与 `/keywords` 接口透传新参数；MCP 工具同步

**验收**：三模式对同一产品给出不同建议售价；13 个标签全部 ≤20 字符且无侵权词；现有 70 项 commerce 测试不回归。

### P4 风险检测 Agent（TOP 6，避免封店）

**新文件 `agent/web/services/risk_check.py`**
- 规则层（离线可用）：
  - 商标/版权词库 `agent/knowledge/trademark_words.txt`（迪士尼/漫威/球队/明星/大牌等 ~200 词，现有 strategy 反侵权词表搬入并扩充）
  - 平台敏感词（医疗宣称/最高级用语/夸大宣传）
  - 物流风险规则（材质关键词→易碎/带电/液体/超重提示）
  - 同质化提示（机会卡竞争度 high 时触发）
- LLM 层（有 Key 时）：对标题+描述+产品档案做整体风险审读
- 输出照文档格式：风险等级/主要风险/侵权/物流/修改建议/是否建议上架

**接入点**
- `plan` 接口生成套图规划后自动跑一次（结果挂 `plan.riskReport`，前端黄条提示）
- `listing_pack` 生成文案后校验标题/标签，命中即改写
- 新接口 `POST /api/commerce-agent/risk-check`；MCP 工具 `check_risk`

**验收**：标题含 "disney" → 高风险+替换建议；亚克力产品 → 物流提示加保护膜；全部离线可跑（规则层不依赖 LLM）。

### P5 一键上架资料包 + 事务安全层（TOP 7 + Mnemosyne）

**新文件 `agent/web/services/listing_bundle.py`**
- `build_bundle(sid)` 把该会话现有产出打成一个 zip：
  `listing.md`（标题/标签/描述/How to Order/FAQ——文案段落在 listing_pack 上补齐）+ `listing.csv` + `image_prompts.md`（9 张图 prompt）+ `risk_report.md` + `profit.md` + 全部成品图
- 新接口 `POST /api/commerce-agent/export-bundle`，前端「📦 一键资料包」按钮

**新文件 `agent/web/services/safety.py`（轻量 ATP，不过度设计）**
- `propose(action, params, risk) -> proposal_id`：写入 `logs/actions.jsonl`（append-only：who/why/what/before/after/status）
- `check(proposal) -> issues[]`：约束校验器——标题超长？标签>18字符？利润<保本线？含禁词？图片尺寸不合规？（全部复用 P3/P4 的校验函数）
- 风险分级执行策略（按文档表格）：低=直接执行+日志；中=执行+完整日志；高（批量重生成、批量删除会话、覆盖导出）=返回 proposal 让前端弹确认；危险=拒绝并说明
- 回滚：改图已有 alts/ 机制，纳入日志关联（proposal_id ↔ backup 路径）

**验收**：资料包 zip 解压即含 5 类文件；`logs/actions.jsonl` 记录每次生成/改图/导出；批量删除类接口未确认时返回 needConfirm。

### P6（可选加分）开放环境鲁棒测试集（OpenAgent）

**新文件 `agent/tests/test_open_world.py`** —— 扰动测试：
- LLM 返回字段缺失/多余/非 JSON → 各链路正确降级
- 生图接口 5xx/超时 → 重试与友好报错（本轮已修，补测试固化）
- 上传非图片文件、超大文件、消息含 emoji/HTML 注入
- 会话记录 JSON 损坏 → 自动重建不崩
- 输出鲁棒性评分表（成功率/异常恢复率/降级触发率）进 CI

---

## 四、开发顺序与工作量（沿文档「第一周~第四周」节奏压缩）

| 阶段 | 内容 | 预估 | 交付物 |
|---|---|---|---|
| P1 | 记忆 v2 | 0.5 天 | memory_store.py + 复盘接入 + 单测 |
| P2 | 选品雷达 | 1 天 | opportunity.py + 接口 + 新品池扩展 + MCP 工具 + 单测 |
| P3 | 利润/关键词增强 | 0.5 天 | biz_tools 增强 + 接口透传 + 单测 |
| P4 | 风险检测 | 1 天 | risk_check.py + 词库 + 三处接入 + 单测 |
| P5 | 资料包 + 安全层 | 1 天 | listing_bundle.py + safety.py + 前端按钮 + 单测 |
| P6 | 鲁棒测试集 | 0.5 天 | test_open_world.py |

每阶段完成即全量回归 + 提交一次，随时可停可验收。

---

## 五、明确不做（与两份文档的「不建议」一致）

- 全自动登录平台 / 全自动付款 / 全自动删除商品 / 换绑账户
- 浏览器全自动控制（V3 再议，先做草稿优先）
- 复杂多 Agent 会议、企业级权限系统、大型知识图谱（V4 再议）

---

## 六、一句话总结

> 本仓库已经是「懂图片」的 Agent；这套方案补上「懂选品、懂利润、懂风险、会记事、敢生成但不乱执行」，
> 正好把 AutoMem（记忆）、OpenAgent（鲁棒）、Mnemosyne（事务安全）三篇论文的思想落进现有架构，
> 不推翻任何现有代码，六个阶段每步可独立交付。
