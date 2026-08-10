# ADR-002: 外部 Agent 标准化输出契约

## 状态

✅ 已实施（2026-07-06）

## 背景

外部一致性检测 Agent 的原始响应格式不可控（可能随服务商升级变化），
需要定义一层稳定的标准化输出契约，使系统内部不受外部格式变化影响。

## 决策

### 统一输出结构

```python
{
    "status": "passed" | "failed" | "skipped" | "error",
    "score": 0.0,              # 0-100 浮点分，-1 表示 skipped
    "issues": [...],            # 检测到的问题列表
    "recommendations": [...],   # 改进建议
    "raw": {...},               # 外部原始响应（诊断用）
    "source": "external_consistency_agent",
}
```

### 字段映射规则

| 标准化字段 | 来源 | 验证 |
|-----------|------|------|
| `status` | 外部响应 `status` | 必须在合法集合内 |
| `score` | 外部响应 `score` | 必须为数字，Clamp 0-100 |
| `issues` | 外部响应 `issues` | 拷贝为 list |
| `recommendations` | 外部响应 `recommendations` | 拷贝为 list |
| `raw` | 原始响应全文 | 直接透传 |
| `source` | 固定值 | 硬编码 |

### 响应校验（`_validate_response`）

```python
_REQUIRED_OUTPUT_FIELDS = frozenset({"status", "score", "issues", "recommendations"})
_VALID_STATUSES = frozenset({"passed", "failed", "skipped", "error"})
```

- 缺失必需字段 → `status: "error"`
- 非法 status → `status: "error"`
- score 非数字 → 按 status 推算默认分
- 非法 JSON → `status: "error"` 并截取前 200 字符

### 异常映射

| 外部异常 | 标准化 status | score |
|---------|--------------|-------|
| HTTP 超时 (`requests.Timeout`) | `error` | 0.0 |
| 连接失败 (`requests.ConnectionError`) | `error` | 0.0 |
| HTTP 4xx/5xx (`raise_for_status`) | `error` | 0.0 |
| JSON 解析失败 | `error` | 0.0 |
| 未配置 endpoint | `skipped` | -1.0 |

### 被否决选项

| 选项 | 否决理由 |
|------|---------|
| 直接透传外部 JSON | 服务商升级改字段名会静默破坏下游 |
| 使用 protobuf/Thrift | 增加部署复杂度，与 Python 项目风格不符 |
| Schema validation 库 | JsonSchema 对嵌套校验大材小用，手写足够 |

### 影响

- Adapter 层 280 行代码包含完整的解析 + 校验 + 异常映射
- 测试覆盖全部异常路径（超时/连接/非法 JSON/缺失字段/非法 status）
- 外部服务商升级格式时只需改 `_parse_response` 和 `_validate_response`
