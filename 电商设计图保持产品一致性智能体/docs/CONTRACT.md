# 外部 Agent 接口契约文档

> 定义 ConsistencyAdapter ↔ 外部 Agent 之间的通信契约

---

## 一、HTTP 接口

### 端点

`POST {CONSISTENCY_AGENT_URL}/check`

### 请求头

| 头 | 值 |
|----|-----|
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer {CONSISTENCY_AGENT_API_KEY}`（如配置） |

### 请求体

```json
{
  "images": {
    "generated": ["/path/to/gen_01.jpg", "/path/to/gen_02.jpg"],
    "references": ["/path/to/ref_01.jpg"]
  },
  "profile": {
    "product_name": "便携式搅拌机",
    "category": "kitchen_appliance",
    "category_cn": "厨房电器",
    "style": "minimalist",
    "style_cn": "极简",
    "colors": {
      "primary": "#FFFFFF",
      "accents": ["#6C63FF"]
    },
    "materials": ["ABS塑料", "不锈钢"],
    "features": ["便携", "大容量"],
    "description": "一款便携式搅拌机"
  },
  "context": {
    "session_id": "sess_abc123",
    "product_name": "便携式搅拌机",
    "scene_ids": ["scene_01", "scene_02"]
  },
  "options": {
    "mode": "consistency_check",
    "dimensions": ["shape", "color", "material", "structure", "proportion", "logo", "detail"]
  }
}
```

### 成功响应 (200)

```json
{
  "status": "passed",
  "score": 95.0,
  "issues": [],
  "recommendations": ["整体一致性良好"]
}
```

```json
{
  "status": "failed",
  "score": 35.0,
  "issues": ["产品外形不匹配", "颜色偏差过大"],
  "recommendations": ["调整生成角度", "修正产品颜色"]
}
```

---

## 二、标准化契约（Adapter 输出）

```python
{
    "status": str,          # "passed" | "failed" | "skipped" | "error"
    "score": float,         # 0.0 - 100.0（-1.0 表示 skipped）
    "issues": list[str],    # 问题描述列表
    "recommendations": list[str],  # 改进建议列表
    "raw": dict,            # 外部原始响应全文
    "source": str,          # 固定 "external_consistency_agent"
}
```

### status 含义

| 值 | 含义 | score |
|-----|------|-------|
| `passed` | 外部检测通过 | ≥60 |
| `failed` | 外部检测发现不一致 | <60 |
| `skipped` | 未配置外部 Agent | -1.0 |
| `error` | 外部调用失败/异常 | 0.0 |

---

## 三、ConsistencyGuardAgent 输出契约

ConsistencyGuardAgent 执行后通过 `_wrap_report` 输出标准子 Agent 报告，
检测结果写入 `data.external_consistency_*` 字段。

### 输出示例

```python
{
    "task_id": "task_001",
    "type": "enhanced_qa",
    "agent": "ConsistencyGuard",
    "status": "success",               # 子 Agent 执行状态
    "data": {
        "external_consistency_score": 95.0,        # 外部评分
        "external_consistency_status": "passed",   # 外部检测状态
        "external_consistency_issues": [],          # 外部问题列表
        "external_consistency_recommendations": ["整体一致性良好"],
        "external_consistency_report": {            # adapter 完整输出
            "status": "passed",
            "score": 95.0,
            "issues": [],
            "recommendations": ["整体一致性良好"],
            "raw": {...},
            "source": "external_consistency_agent"
        }
    },
    "self_check": {"passed": True, "issues": []},
    "error": "",
    "execution_time": 1.23
}
```

### data 字段命名规范

| 字段 | 类型 | 说明 |
|------|------|------|
| `external_consistency_score` | float | 外部评分（0-100） |
| `external_consistency_status` | str | passed/failed/skipped/error |
| `external_consistency_issues` | list[str] | 检测到的问题 |
| `external_consistency_recommendations` | list[str] | 改进建议 |
| `external_consistency_report` | dict | adapter 完整输出 |

> 所有字段以 `external_consistency_` 前缀命名，确保与现有 `data` 字段不冲突。

---

## 四、Adapter 异常映射表

| 外部行为 | Adapter 输出 |
|----------|-------------|
| HTTP 200 + 合法 JSON | 正常解析 |
| HTTP 200 + 非法 JSON | `{status:"error", issues:["外部 Agent 返回非法 JSON: ..."]}` |
| HTTP 4xx/5xx | `{status:"error", issues:["..."]}` |
| 超时 (timeout > 30s) | `{status:"error", issues:["外部 Agent 超时（30s）"]}` |
| 连接拒绝 | `{status:"error", issues:["无法连接外部 Agent"]}` |
| 缺少 requests 库 | `{status:"error", issues:["缺少 requests 库"]}` |
| endpoint 为空 | `{status:"skipped", score:-1.0}` |

---

## 五、版本兼容性

| 组件 | 版本 | 契约稳定性 |
|------|------|-----------|
| Adapter 输出 | v1 | 稳定（冻结） |
| Agent 输出 | v1 | 稳定（冻结） |
| 外部 Agent 期望输入 | v1 | 如需修改需评估向后兼容 |
| Pipeline 集成 | v1 | 稳定（冻结） |

> 契约 v1 冻结时间：2026-07-06
> 任何契约变更需更新此文档并发送到 ADR。
