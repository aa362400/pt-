# ADR-001: 外部产品一致性检测 Agent 接入方式

## 状态

✅ 已实施（2026-07-06）

## 背景

系统已有内部 QA Agent（`QAAgent`）执行产品一致性检测，但需要接入一个外部第三方
一致性检测服务作为增强检查层。外部 Agent 以 HTTP 服务形式提供，需要：
- 安全的网络隔离
- 标准化接口契约
- 不干扰现有 QA 流程
- 可配置启用/禁用

## 决策

采用 **三阶段渐进接入策略**：

### Phase 1: 适配器层（ConsistencyAdapter）

新增 `agents/consistency_adapter.py`，作为纯 HTTP 适配器：
- 封装外部 Agent 的 HTTP 调用
- 标准化输出 `{status, score, issues, recommendations, raw, source}`
- 内置超时/连接异常/JSON 解析异常处理
- 未配置端点时自动 skip（不报错）
- 零依赖核心文件

### Phase 2: 子 Agent 封装层（ConsistencyGuardAgent）

新增 `agents/consistency_agent.py`，继承 `BaseSubAgent` 契约：
- 遵循 `receive_task → execute → self_check → _wrap_report` 生命周期
- 包装 `ConsistencyAdapter` 为标准子 Agent
- 输出 `data.external_consistency_*` 字段（不覆盖现有 data）
- 网络异常时 agent 上报 `status: error`

### Phase 3: Registry/Pipeline 集成

修改 `agents/executor.py`（仅增量，零删改）：
- 注册 `enhanced_qa` 能力到 `CapabilityRegistry`
- 在 generate pipeline 的 QA → compliance 之间插入可选 step
- 条件 `when=CONSISTENCY_AGENT_URL` 控制是否激活
- 未配置时零开销跳过

## 被否决的选项

| 选项 | 否决理由 |
|------|---------|
| 直接修改 Observer dispatch | 侵入核心意图识别，风险高 |
| 替换现有 QAAgent | 外部 Agent 不可用时降级困难 |
| 通过 MCP Server 接入 | 外部 Agent 是 HTTP 服务，非 MCP 协议 |
| 作为一个独立工具（不上 pipeline）| 方案 A 即可满足，但无法享受自动管线 |

## 关键约束

- **不改核心文件**（executor.py 仅增量追加，不删不改现有行）
- **外部 Agent 失败不阻断主流程**（adapter 返回 error，不抛异常）
- **未配置跳过**（CONSISTENCY_AGENT_URL 空时 pipeline step 透明跳过）
- **字段隔离**（external_consistency_* 不覆盖现有 data 字段）

## 影响

- 新增 3 个文件（adapter + agent + test），修改 1 个文件（executor.py +18 行）
- 测试：461 全量通过
- 回滚：删除新增文件 + `git checkout executor.py`
