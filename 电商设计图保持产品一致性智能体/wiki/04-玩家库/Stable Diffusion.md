# Stable Diffusion

> 开源可控的图像生成方案（本地或 API 部署）。

## 摘要

Stable Diffusion 通过 ControlNet、IP-Adapter 等插件可实现较强的一致性控制，但部署和维护成本较高。本项目作为备选引擎保留。

## 关键能力

| 插件/技术 | 用途 |
|----------|------|
| ControlNet | 姿态/边缘/深度控制 |
| IP-Adapter | 参考图风格/主体迁移 |
| LoRA | 特定产品/风格微调 |
| img2img | 基于原图变体 |

## 本项目定位

- 需要完全本地化部署时的选项
- 可通过 LoRA 微调实现品类级一致性
- 配置见 `engine_config.yaml`

## 优势 vs 劣势

| 优势 | 劣势 |
|-----|------|
| 开源可控 | 部署复杂 |
| LoRA 可深度定制 | 默认一致性不如 Gemini reference |
| 无 API 费用（自托管） | 需 GPU 运维 |

## 相关

- [[玩家库 Index]]
- [[多引擎调度]]
- [[参考图锚定策略]]
