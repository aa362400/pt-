---
name: product-image-agent
description: 电商产品图智能体（顶级版）— 全自动产品摄影工作室 | 拖拽上传 → AI生成 → 排版布局 → 多平台输出 → 反馈学习
---

# 电商产品图智能体 v5（顶级版·加固版）

## 一句话说明

> 输入产品图 → 全自动生成 10 张情绪化上架图 + 排版 + 多平台尺寸 + A/B 测试 + 反馈学习

---

## Multi-Agent v3: 协议 + 注册表 + 声明式管线图 + 全链路追踪

```
用户 ←→ ObserverAgent（对话·规划·派发·监督·复盘）
              ↓ AgentMessage（trace_id 贯穿）
        ExecutorAgent（CapabilityRegistry 路由，能力清单同步给 LLM 编排器）
              ↓ Pipeline（声明式管线图）
   prepare → analyze? → localize_scenes? → localize_copy? → generate
        → subject_lock? → layout → qa → compliance?
                              ▲            │
                              └ LoopEdge: QA 不合格自动回跳重生成 ┘
              ↓
        Telemetry（span 树 → report.trace）
```

| 智能体 | 文件 | 职责 |
|--------|------|------|
| 👁 Observer | `agents/observer.py` | 理解意图、派发任务、监督验证、任务复盘 |
| 🔍 Analyst | `agents/analyst.py` | 产品分析 + 场景匹配 |
| 🎨 Generator | `agents/generator.py` | 批量生成 + 多引擎调度 |
| 📐 Layout | `agents/layout.py` | 后处理 → 排版 → 多平台 |
| ✅ QA | `agents/qa.py` | 一致性检测 + 情绪评分 hook |
| ⚙️ Orchestrator | `agents/executor.py` | 注册表路由 + 管线图执行 |

### 架构层（Multi-Agent 3.0）

| 组件 | 文件 | 说明 |
|------|------|------|
| 通信协议 | `agents/protocol.py` | `AgentMessage`、`make_task/make_report`、`validate_report`；trace_id 贯穿任务链路 |
| 能力注册表 | `agents/registry.py` | 任务类型 → 处理器路由（含别名/能力枚举），新能力一行 `register()` 接入 |
| 声明式管线图 | `agents/pipeline.py` | `Step`（条件边 when）+ `LoopEdge`（受控回跳，如 QA 不合格→重生成）+ 取消检查；循环轮失败自动保留上一轮成功结果 |
| 全链路追踪 | `agents/telemetry.py` | span 树（任务→管线→步骤→子智能体），附在 `report["trace"]`，失败定位与耗时分析 |
| 架构测试 | `tests/test_multi_agent_architecture.py` | 协议校验 / 注册表路由 / 管线条件与循环 / 追踪 span / executor 集成 |

### LLM 编排器（OrchestratorBrain）

观察者不再仅用正则猜意图，而是优先调用 Gemini 做 **意图识别 + 多步任务分解 + 子 Agent 路由**。

```
用户消息
   ↓
ObserverAgent.understand()
   ↓
OrchestratorBrain.understand_with_llm()  ← GEMINI_API_KEY + 3s 超时
   │  输出: intent / extracted / task_plan / target_agent
   ↓ (失败或无 Key)
_understand_regex()  ← 正则回退，保证离线可用
   ↓
dispatch() → ExecutorAgent（含 target_agent 元数据）
   ↓
pending_task_plan 链式派发（如 analyze → generate）
```

| 组件 | 路径 | 说明 |
|------|------|------|
| LLM 编排脑 | `agents/orchestrator.py` | `OrchestratorBrain.understand_with_llm()` |
| 集成点 | `agents/observer.py` | `understand()` / `dispatch()` / `dispatch_chained_task()` |
| 测试 | `tests/test_orchestrator_llm.py` | mock Gemini、JSON 解析、regex 回退 |
| UI | `web/app.py` | 顶栏「LLM 编排器 + 专业子 Agent」；回复中 🧠 LLM 规划 chip |

**环境变量：** `GEMINI_API_KEY`（与 `analyze_product.py` 相同 HTTP 模式，`gemini-2.0-flash`，3 秒超时）

**task_plan 示例：**
- 「帮我分析这款包，然后生成淘宝和小红书用的图」→ `[analyze→analyst, generate→generator]`
- 「第三张氛围图不要，其他的重新生成」→ `[adjust→executor, regenerate→generator]`

共享工具：`agents/toolkit.py`（子智能体调用同一套脚本，不重复逻辑）

### Multi-Agent 2.0: Shared Blackboard

会话级共享内存，所有智能体可读可写，持久化至 `agent/web/sessions/<session_id>/blackboard.json`。

```
┌─────────────── SharedBlackboard ───────────────┐
│ profile · scene_plan · preferences             │
│ raw_images · layout_images · platform_outputs  │
│ consistency_score · event_log · revision       │
└────────▲───────────▲───────────▲───────────────┘
         │           │           │
    Observer    Executor    Analyst/Generator/Layout/QA
    (读+写偏好)  (编排写入)   (各阶段 _bb_persist)
```

| 组件 | 路径 | 读写 |
|------|------|------|
| 黑板实现 | `agents/blackboard.py` | `load` / `save` / `set` / `update` / `merge_feedback` |
| 引擎绑定 | `web/app.py` → `DualAgentEngine.blackboard` | 启动时 load；任务完成后 sync |
| LLM 上下文 | `ObserverAgent.orchestrator_context()` | `blackboard.to_context_dict()` |
| UI 面板 | Web 顶栏「📋 共享状态」 | `GET /api/session/<sid>/blackboard` 或 poll 的 `blackboard_summary` |
| 测试 | `tests/test_blackboard.py` | roundtrip / feedback / revision |

**写入约定：** Analyst → `profile`+`scene_plan`；Generator → `raw_images`；Layout → `layout_images`+`platform_outputs`；QA → `consistency_score`；Observer → `preferences`+`merge_feedback`。每次写入递增 `revision` 并追加 `event_log`。

**向后兼容：** `DualAgentEngine.context` 属性委托 `blackboard.to_legacy_context()`，现有 API 字段不变。

---

## 上网研究能力

Observer 可识别「搜竞品」「找参考图」「粘贴商品链接」等意图，派发给 **ResearcherAgent** 执行联网搜索与页面抓取。

```
用户：「帮我搜一下 etsy 上木质笔袋的参考图」
   ↓
Observer → intent: web_search / research
   ↓
Executor → ResearcherAgent
   ↓ tools
web_search (Serper/Tavily/Bing) → browse_url → fetch_url
   ↓
SharedBlackboard: research_report, reference_urls
   ↓
Web UI：Markdown 搜索结果 + 参考图网格
```

| 组件 | 路径 | 说明 |
|------|------|------|
| 搜索 | `common/web_search.py` | `search_web()` — Serper → Tavily → Bing |
| 浏览 | `common/browse_url.py` | `browse_url()` — requests + 可选 Playwright |
| 研究 Agent | `agents/researcher.py` | 综合搜索、抓取、下载参考图 |
| 测试 | `tests/test_web_research.py` | mock API、HTML 解析、意图识别 |

### 用法示例

- **搜竞品：** `帮我搜一下 etsy 上木质笔袋的参考图`
- **粘贴链接：** `抓取这个链接 https://www.etsy.com/listing/...`
- **综合研究：** `搜竞品并分析 https://amazon.com/dp/... 类似产品`

### 环境变量（至少配置一个搜索 Key）

```bash
SERPER_API_KEY=          # 推荐，Google 搜索 JSON API
TAVILY_API_KEY=          # 备选
BING_SEARCH_API_KEY=     # 备选

PLAYWRIGHT_ENABLED=0     # 设为 1 启用 JS 渲染（需 pip install playwright && playwright install chromium）
COOKIE_JAR_PATH=         # 可选，淘宝/Amazon 登录 Cookie JSON（见 templates/cookie_jar.example.json）
```

### 快捷 Chip

聊天中可点击 **「搜索竞品」**、**「抓取链接」** 触发研究流程。

---

## v5 升级点

| 升级 | 说明 |
|------|------|
| 🔒 **依赖管理** | 新增 `requirements.txt` 锁定依赖版本 |
| 📐 **场景 ID 一致性** | 修复 `01_white_bg` vs `scene_01_white_bg` BUG |
| 🧩 **公共工具模块** | 新增 `common/utils.py`，消除 5 处 `_guess_mime` 重复 |
| 📋 **Logging 基础设施** | 替换所有 `print()`，支持文件日志 + 日志轮转 |
| 🔑 **API Key 安全** | 新增 `.env.example` + `get_api_key()` 统一入口 |
| 🔄 **反馈闭环** | 用户偏好自动注入 `scene_matcher`，动态调整场景排序 |
| 🤖 **AI 视觉一致性** | 一致性检测增加 Gemini 视觉维度（双维度加权） |
| 🐳 **Docker 部署** | 新增 `Dockerfile` + `docker-compose.yml` |
| 🇨🇳 **中文字体** | 排版引擎自动检测系统中文字体（Windows/macOS/Linux） |
| 🧪 **测试覆盖** | 6+ 测试文件，含 `test_orchestrator_llm.py` LLM 编排用例 |
| 📦 **完整目录** | 补齐 `templates/`、`outputs/`、`web/uploads/` 等所有声明目录 |

## 快速启动

```bash
# 1. 安装依赖
pip install -r agent/requirements.txt

# 2. 配置环境
cp agent/.env.example agent/.env
# 编辑 agent/.env 填入 GEMINI_API_KEY

# 3. 启动 Web UI
python agent/web/app.py --port 8080

# 或用 Docker
docker compose up -d

# 4. 运行测试（CI 同款命令，见 .github/workflows/ci.yml）
pip install pytest && pytest agent/tests -q
```

## 核心能力全景

```
                    ┌──────────────────────────────────┐
                    │   📸 全自动产品摄影工作室 v5       │
                    ├──────────────────────────────────┤
  用户上传产品图 ──→ │  1. auto_pipeline.py 全流程总控   │
                    │  2. layout_engine.py 排版+品牌    │
                    │  3. platform_adapter.py 多平台    │
                    │  4. emotion_scorer.py 情绪评分    │
                    │  5. ab_test_runner.py A/B测试     │
                    │  6. feedback_learner.py 反馈学习   │
                    │  7. common/utils.py 公共工具      │
                    │  8. app.py Web UI 拖拽操作       │
                    ├──────────────────────────────────┤
                    └─────→ 10 张成品图 + 多平台包 ────→
```

## 文件结构

```
agent/
├── SKILL.md v4                        ← 顶级版主入口
├── engine_config.yaml                  ← 多引擎配置（5引擎×30规则）
│
├── scripts/
│   ├── auto_pipeline.py       [🆕]    ← 全自动管线总控（6步串联）
│   ├── layout_engine.py       [🆕]    ← 自动排版引擎（10种布局模板，含 4 种 A+ 详情页）
│   ├── platform_adapter.py    [🆕]    ← 多平台适配器（22个平台）
│   ├── subject_lock.py        [🆕]    ← 产品主体锁定（抠图+像素级合成回生成图）
│   ├── visual_similarity.py   [🆕]    ← 参考图保真度度量（pHash+直方图+主体区域）
│   ├── compliance_checker.py  [🆕]    ← 平台合规校验（Amazon白底/占比/分辨率）
│   ├── localization.py        [🆕]    ← 跨境本地化文案（10市场）+ 多语种字体
│   ├── region_scenes.py       [🆕]    ← 地区风格包（6地区）+ 节日场景（8节点）+ 营销日历
│   ├── emotion_scorer.py      [🆕]    ← 情绪价值评分器
│   ├── ab_test_runner.py      [🆕]    ← A/B 测试 + 反馈学习系统
│   ├── multi_engine_bridge.py         ← 多引擎调度器
│   ├── scene_creator.py               ← LLM 场景创意器
│   ├── style_pipeline.py              ← 风格后处理管线
│   ├── consistency_checker.py         ← 一致性检测器（含嵌入级保真度+自动重生成）
│   ├── generate_batch.py              ← 批量生成（v3 auto-engine）
│   ├── analyze_product.py             ← 产品分析
│   └── scene_matcher.py               ← 场景匹配
│
├── web/
│   ├── app.py                [🆕]    ← Web UI 服务器（Flask）
│   └── uploads/                       ← 上传临时文件
│
├── templates/
│   ├── scenes/                        ← 10 套场景 + 6类目模板
│   ├── layouts/                       ← 排版模板配置
│   └── platforms/                     ← 平台模板配置
│
├── profiles/                          ← 用户偏好存档
├── outputs/
│   ├── raw/                           ← AI 原始输出
│   ├── final/                         ← 后处理成品
│   └── platforms/                     ← 多平台输出
├── reports/                           ← 检测报告
└── references/
    └── consistent_generation_guide.md ← 一致性最佳实践
```

---

## 工作流程（顶级版）

### 方式一：Web UI（推荐）— 跨境电商 AI 出图 Agent

```bash
# 启动 Web 界面
python agent/web/app.py --port 8080

# 浏览器打开 http://localhost:8080
# ChatGPT 式单聊天框：上传产品图 → 一句话说需求 → 逐张出图
# 例如：「帮我出 5 张宠物纪念礼物上架图，适合 Etsy」
```

前端交互全部走 `/api/commerce-agent/*` 五个接口：

| 接口 | 方法 | 作用 |
|------|------|------|
| `/api/commerce-agent/parse` | POST | 解析一句话需求（平台/数量/人群/礼物场景/图型/风险提示） |
| `/api/commerce-agent/plan` | POST | 规划 1-9 张上架套图（每张图用途 + 英文提示词 + 比例） |
| `/api/commerce-agent/generate` | POST | 派发生成（有生图 Key + 产品图走真实引擎，否则 mock 占位图） |
| `/api/commerce-agent/tasks/:id` | GET | 查询逐张状态与图片 URL |
| `/api/commerce-agent/regenerate` | POST | 只重做某一张（可带「更温馨一点」等自然语言指令） |

策略引擎在 `agent/web/services/commerce_strategy.py`：
数量识别（说几张出几张，上架图默认 5、套图默认 9、主图默认 1、没说默认 3）、
9 槽位上架套图结构（主图/情绪场景/人群/定制/细节/尺寸/使用/包装/卖点总结）、
平台风格包（Etsy/Temu/Amazon/TikTok/eBay/独立站）与反侵权负向提示词。

### 方式二：一键命令行

```bash
# 最简模式
python agent/scripts/auto_pipeline.py --images product.jpg

# 完整模式
python agent/scripts/auto_pipeline.py \
  --images front.jpg side.jpg detail.jpg \
  --name "手工皮质双肩包" \
  --quality premium \
  --auto-engine \
  --platforms taobao_main amazon_main xiaohongshu \
  --watermark brand_logo.png \
  --brand-name "我的品牌"
```

### 方式三：分步高级控制

```bash
# 1. 产品分析
python agent/scripts/analyze_product.py --images product.jpg --output profile.json

# 2. LLM 场景创意
python agent/scripts/scene_creator.py --profile profile.json --output scenes.json

# 3. 批量生成（多引擎自动选）
python agent/scripts/generate_batch.py \
  --product-profile profile.json --reference-images product.jpg \
  --scene-plan scenes.json --auto-engine --quality premium

# 4. 后处理排版
python agent/scripts/style_pipeline.py \
  --input outputs/raw/ --output outputs/final/ \
  --color-correct --watermark logo.png

# 5. 平台适配
python agent/scripts/platform_adapter.py \
  --input outputs/final/ --output outputs/platforms/

# 6. 一致性检测
python agent/scripts/consistency_checker.py \
  --input-dir outputs/final/ --profile profile.json --report report.md

# 7. 情绪评分
python agent/scripts/emotion_scorer.py \
  --batch-dir outputs/final/ --use-ai

# 8. A/B 测试（对比多个变体）
python agent/scripts/ab_test_runner.py ab-test \
  --profile profile.json --images product.jpg --variants 2
```

---

## 覆盖的平台

**国内电商：** 淘宝 / 京东 / 拼多多 / 微信 / 小红书 / 抖音

**跨境电商：** Amazon / Shopify / Lazada / Shopline / Etsy / Alibaba / TikTok Shop / Temu / Shein / eBay / Walmart / 美客多（Mercado Libre）/ Coupang

**输出规格：**
| 平台 | 尺寸 | 比例 |
|------|------|------|
| 淘宝主图 | 800×800 | 1:1 |
| 京东主图 | 800×800 | 1:1 |
| Amazon 主图 | 1000×1000 | 1:1 |
| Shopify | 2048×2048 | 1:1 |
| 小红书 | 1242×1660 | 3:4 |
| 抖音 | 1080×1920 | 9:16 |
| 微信朋友圈 | 1080×1080 | 1:1 |

---

## 排版模板

| 模板 | 适用场景 |
|------|---------|
| `product_main` | 标准主图（产品+品牌名） |
| `product_detail_top` | 详情页头部（图+标题+价格） |
| `promo_banner` | 促销横幅（左图右文） |
| `collage_2` | 双图对比 |
| `collage_4` | 四宫格排列 |
| `social_square` | 社交媒体正方形图 |
| `aplus_banner` | A+ 详情页全幅横幅（左标题右产品图） |
| `aplus_callouts` | A+ 卖点标注图（引线指向产品的 3 个卖点） |
| `aplus_specs` | A+ 规格参数表（左图右表格，`--specs` 传参数） |
| `aplus_dimensions` | A+ 尺寸标注图（宽/高标注线） |

```bash
# 使用排版模板
python agent/scripts/layout_engine.py \
  --input outputs/final/ --output outputs/layout/ \
  --template product_detail_top \
  --product-name "手工双肩包" --price-text "¥299" --brand-name "品牌名"
```

---

## 跨境本地化与一致性保障

### 多语言文案（localization.py）

10 个目标市场（us/uk/de/fr/es/jp/kr/sa/cn/sea）的本地化标题、卖点、CTA。LLM 优先（Gemini→OpenAI），无 Key 或失败时自动回退离线模板；按文案书写系统（拉丁/中日韩/韩文/阿拉伯）自动匹配系统字体，排版引擎渲染多语种文字不再显示方块。

```bash
# 为三个市场生成本地化文案
python agent/scripts/localization.py --profile outputs/product_profile.json \
  --markets us jp de --output outputs/localized_copy.json

# 查看支持的市场与字体命中情况
python agent/scripts/localization.py --list-markets
```

### 地区风格包 + 节日场景（region_scenes.py）

6 大地区风格包（北美/欧洲/日本/韩国/东南亚/中东）把任意场景 prompt 按目标市场审美改写；8 个节日场景模板（黑五/圣诞/Prime Day/斋月/新春/情人节/夏促/返校季）；营销日历按市场查询未来 N 天营销节点。

```bash
# 把场景计划改写成日本市场审美
python agent/scripts/region_scenes.py --scene-plan outputs/scene_plan.json \
  --region jp --output outputs/scene_plan_jp.json

# 查看美国市场未来 60 天营销节点
python agent/scripts/region_scenes.py --calendar us --days 60
```

### 在对话里直接启用跨境本地化

生成时在消息里带上参数，管线自动接入本地化步骤：

```
生成，平台: amazon shopify 市场: us jp de 地区: jp 节日: christmas
```

- `市场:` → 生成多市场本地化文案（`localized_copy.json` 挂到结果）
- `地区:` → 场景 prompt 按目标市场审美改写（可与 `节日:` 组合插入节日场景）
- 生成完成后自动对支持的平台跑合规校验（`compliance_report.json`）

### 平台合规校验（compliance_checker.py）

按平台规则校验成品图：白底纯度（Amazon 主图）、产品占比、最低分辨率、文件体积，输出 JSON 报告。

```bash
python agent/scripts/compliance_checker.py --input outputs/platforms/ \
  --platforms amazon_main walmart --output outputs/compliance_report.json
```

### 产品主体锁定（subject_lock.py）

从参考图抠出产品主体（rembg 优先，缺省回退色差抠图），亮度匹配后像素级合成回生成图，从根上保证「产品长得一模一样」。开关：`SUBJECT_LOCK_ENABLED=1`。

### 参考图保真度（visual_similarity.py）

pHash + 直方图 + 主体区域三路比对，作为一致性检测的保真度维度（权重 25%）接入 `consistency_checker.py`。

### QA 自动重生成闭环

QA 分数不达标时 executor 自动挑出低分场景重新生成（`QA_AUTO_REGEN_ROUNDS` 控制轮数，默认 1）。

---

## 反馈学习系统

记录用户偏好并在后续生成中优化场景排序：

```bash
# 记录反馈
python agent/scripts/ab_test_runner.py feedback \
  --liked scene_02_lifestyle.jpg scene_05_detail.jpg \
  --disliked scene_07_atmospheric.jpg

# 查看学习结果
python agent/scripts/ab_test_runner.py show
```

---

## 四阶段发展路径总览

| 阶段 | 核心 | 文件数 | 代码量 | 关键能力 |
|------|------|--------|--------|---------|
| **① 初级** | 跑通流程 | 15 | 1,086 行 | 10场景模板+批量生图+双引擎 |
| **② 中级** | 智能匹配 | 23 | 2,428 行 | +自动分析+场景匹配+类目模板 |
| **③ 高级** | 多引擎+管线 | 28 | 4,367 行 | +多引擎调度+后处理+检测+LLM创意 |
| **④ 顶级** | 全自动工作室 | 34 | **6,100+ 行** | +全自动管线+排版+平台适配+WebUI+反馈学习 |

---

## 快速启动

```bash
# 1. 安装依赖
pip install flask pillow requests pyyaml

# 2. 设置 API Key
export GEMINI_API_KEY=your_key_here

# 3. 启动 Web UI
python agent/web/app.py

# 或一行命令
python agent/scripts/auto_pipeline.py --images product.jpg --name "产品名"
```

---

## 在 Cursor 中导入本 Skill

本仓库提供两个 Skill 入口，按需选用：

| 文件 | 用途 |
|------|------|
| `agent/SKILL.md` | **产品图智能体** — 生成、Web UI、脚本管线 |
| `wiki/SKILL.md` | **一致性 Wiki** — 知识库增量更新 |

### 1. 文件位置

- 智能体 Skill：`agent/SKILL.md`（本文件）
- Wiki Skill：`wiki/SKILL.md`
- 建议将整个项目文件夹作为 Cursor 工作区打开：`G:\电商设计图保持产品一致性智能体`

### 2. 添加到 Cursor

**方式 A — 项目 Skill（推荐）**

1. 在 Cursor 中打开本项目根目录
2. Cursor 会自动发现项目内的 `SKILL.md`（含 `agent/`、`wiki/`）
3. 在 Agent 对话中用 `@` 引用：
   - `@agent/SKILL.md` — 跑产品图流程
   - `@wiki/SKILL.md` — 更新 Wiki 知识库

**方式 B — 用户级 Skill**

1. 打开 Cursor Settings → Rules / Skills
2. 将 `agent/SKILL.md` 复制到用户 Skills 目录，或添加指向本文件的路径
3. 之后在任意项目中可通过 `@product-image-agent` 或文件名唤起

**方式 C — Rules 片段**

将 `agent/SKILL.md` 中「快速启动」「工作流程」章节复制到 `.cursor/rules` 或 User Rules，作为常驻上下文。

### 3. 快速开始对话示例

```
@agent/SKILL.md 启动 Web UI，并说明如何上传产品图生成 10 张上架图
```

```
@agent/SKILL.md 用 auto_pipeline 对 product.jpg 跑完整管线，平台淘宝+亚马逊
```

```
@wiki/SKILL.md 处理 wiki/sources/inbox/ 中的新资料，增量更新知识库
```

### 4. Web UI 消息记录

启动 `python agent/web/app.py --port 8080` 后：

- **左侧「消息记录」栏**：会话列表 + 当前会话时间线（用户 / 观察者 / 执行者 / 系统）
- **浏览器 localStorage**：刷新页面后仍可恢复当前会话
- **服务端 JSON**：`agent/web/sessions/<session_id>.json`（服务重启后仍可拉取历史）

注意：内存中的智能体状态在服务重启后会丢失，但 **SharedBlackboard**（`sessions/<id>/blackboard.json`）会持久化 profile、场景计划、偏好与生成元数据；用 localStorage 中的同一 `session_id` 恢复会话即可 reload 黑板。聊天记录在 `sessions/<id>.json`。
