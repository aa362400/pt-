# 电商设计图保持产品一致性智能体 — 外部 Agent 接入文档

## 文档索引

| 文档 | 说明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构概览、组件说明、数据流、配置参考、测试矩阵、回滚方案 |
| [CONTRACT.md](./CONTRACT.md) | 接口契约：HTTP API 定义、标准化输出结构、异常映射、版本兼容性 |
| [ADR-001-外部Agent接入方式.md](./ADR-001-外部Agent接入方式.md) | 架构决策记录：三阶段渐进接入策略及被否决选项 |
| [ADR-002-标准化输出契约设计.md](./ADR-002-标准化输出契约设计.md) | 架构决策记录：输出结构、字段映射、校验规则 |
| [ADR-003-Pipeline阶段注入策略.md](./ADR-003-Pipeline阶段注入策略.md) | 架构决策记录：可选步骤的条件执行、注入位置分析 |

## 外部参考

| 文件 | 说明 |
|------|------|
| `../接入方案_2026-07-06.md` | 原始接入设计蓝图（方案 A/B/C） |
| `../patch_plan_阶段2-3.md` | Phase 2/3 执行计划 |
| `../patch_plan_阶段3.md` | Phase 3 patch 计划 |

## 架构图

```
┌──────────────┐   HTTP POST    ┌──────────────────┐
│ 外部 Agent    │ ◄──────────── │ ConsistencyAdapter│
│ 一致性检测服务  │ ────────────► │ _parse_response  │
└──────────────┘   标准化契约    │ _validate_response│
                                  └────────┬─────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │ConsistencyGuardAg.│
                                  │ BaseSubAgent 契约  │
                                  └────────┬─────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │  Pipeline (可选)  │
                                  │ enhanced_qa step  │
                                  └──────────────────┘
```

## 快速开始

```bash
# 启用外部 Agent
echo 'CONSISTENCY_AGENT_URL=https://your-agent.example.com' >> .env
echo 'CONSISTENCY_AGENT_API_KEY=your-key' >> .env

# 验证
python -m pytest agent/tests/test_consistency_adapter.py -q  # 15 passed
python -m pytest agent/tests/test_consistency_agent.py -q    # 13 passed
python -m pytest agent/tests/ -q                              # 461 passed
```

## 状态一览

| 阶段 | 交付物 | 状态 |
|------|--------|------|
| Phase 1 | ConsistencyAdapter + 测试 | ✅ 完成 |
| Phase 2 | ConsistencyGuardAgent + 测试 | ✅ 完成 |
| Phase 3 | Registry / Pipeline 集成 | ✅ 完成 |
| 文档 | ADR/架构/契约 | ✅ 完成 |
