# 多引擎调度

> 5 引擎自动选择与 fallback 机制。

## 摘要

`multi_engine_bridge.py` 根据质量档位、可用性和引擎特性自动选择生成引擎，主引擎失败时 fallback 到备选。

## 引擎优先级（premium 档）

配置于 `agent/engine_config.yaml`：

1. **Gemini** — 主力，reference 能力最强
2. **Stable Diffusion** — 备选，本地/API
3. **Midjourney** — 美学备选
4. 其他引擎按配置

## 调度逻辑

```
auto-engine 模式：
  1. 读取 engine_config.yaml 优先级
  2. 检查 API key 可用性
  3. 尝试主引擎 → 失败则 fallback
  4. 记录使用的引擎到输出 metadata
```

## 与一致性的关系

- 不同引擎混用**同一批次**会降低一致性 → 单批次应锁定单一引擎
- `--auto-engine` 是「选引擎」而非「混用引擎」

## 相关

- [[Gemini Image Generation]]
- [[Stable Diffusion]]
- [[Midjourney]]
- [[产品一致性风险地图]] R07
- [[实体 Index]]
