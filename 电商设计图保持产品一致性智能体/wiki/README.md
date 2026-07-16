# 电商产品图一致性 · 持久化 Wiki 知识库

> **Codex + Obsidian 模式**：LLM 增量维护结构化 Markdown 知识库，而非每次问答从零检索。

## 快速开始

1. **用 Obsidian 打开本目录**（`wiki/`）作为 Vault
2. **新资料放入** `sources/inbox/`
3. **在 Cursor 中运行增量更新**（见下方「日常 workflow」）
4. **从 [[Wiki Index]] 浏览全部知识**

## 为什么不用标准 RAG？

| 标准 RAG | Persistent Wiki（本库） |
|---------|------------------------|
| 每次问答重新检索片段 | 知识沉淀为互联实体页面 |
| 无积累、无矛盾追踪 | 增量更新、修订摘要、标注矛盾 |
| 上下文碎片化 | 阅读路线 + 研究框架 + 产业链地图 |

## 目录结构

```
wiki/
├── 00-元信息/          方法论、索引、更新日志、Inbox
├── 01-阅读路线/        按角色/深度的学习路径
├── 02-研究框架/        分析维度与问题清单
├── 03-产业链/          上下游关系图
├── 04-玩家库/          工具、平台、引擎档案
├── 05-风险地图/        风险分类与缓解策略
├── 06-季度跟踪/        版本/能力/市场变化追踪
├── 07-实体百科/        核心概念与技术实体（Karpathy Wiki 核心）
├── sources/            原始来源（inbox → processed）
├── templates/          各类页面模板
└── scripts/            自动化辅助脚本
```

## 日常 Workflow

### 1. 添加新来源

```bash
# 将 PDF、文章摘要、会议笔记等放入 inbox
cp your-article.md wiki/sources/inbox/
```

### 2. 触发 LLM 增量更新（Cursor / Codex）

在 Cursor 对话中使用：

```
请按照 wiki/scripts/wiki_update_prompt.md 的流程，
处理 wiki/sources/inbox/ 中的新来源，
增量更新 wiki 知识库。
```

或运行辅助脚本查看待处理项：

```bash
python wiki/scripts/wiki_update.py --status
python wiki/scripts/wiki_update.py --prepare
```

### 3. 人工 Review

- 检查 [[更新日志 Changelog]] 中的变更摘要
- 在 Obsidian Graph View 查看新增链接
- 矛盾条目见各实体页的「矛盾与待验证」区块

## 与 agent/ 代码库的关系

| Wiki 知识 | agent/ 代码 |
|----------|------------|
| 为什么一致性难、策略原理 | `references/consistent_generation_guide.md` |
| 引擎能力对比 | `engine_config.yaml` |
| 场景设计方法论 | `templates/scenes/` |
| 最佳实践演进 | `scripts/consistency_checker.py` 等 |

Wiki 负责**研究与决策**，agent 负责**执行与生成**。Wiki 更新后，可反哺 agent 的 prompts 和配置。

## 相关链接

- [[Wiki Index]]
- [[方法论 - Persistent Wiki vs RAG]]
- [[电商产品图一致性 - 新手到专家路线]]
