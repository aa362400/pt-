---
name: ecommerce-visual-wiki
description: 电商产品图一致性持久化 Wiki 知识库 — 增量更新、实体维护、Obsidian 兼容。当用户要更新 wiki、处理 inbox 来源、或查询一致性研究知识时使用。
---

# 电商产品图一致性 Wiki

## Vault 位置

`wiki/`（项目根目录下）

用 Obsidian 打开 `wiki/` 文件夹即可。

## 快速指令

```bash
# 查看待处理来源
python wiki/scripts/wiki_update.py --status

# 生成 Cursor 更新上下文
python wiki/scripts/wiki_update.py --prepare

# 列出所有页面
python wiki/scripts/wiki_update.py --index
```

## 增量更新

1. 新资料放入 `wiki/sources/inbox/`
2. 在 Cursor 中说：

```
请按照 wiki/scripts/wiki_update_prompt.md 的流程，
处理 wiki/sources/inbox/ 中的新来源，增量更新 wiki 知识库。
```

3. Review Changelog 和 Obsidian Graph

## 命名与链接

- 页面名用 **Title Case 中文**（如 `UPS 统一产品描述锚.md`）
- 链接用 `[[wikilink]]`
- Index 页聚合同目录链接
- 新实体从 `wiki/templates/实体页面模板.md` 创建

## 与 agent 的关系

| Wiki | agent/ |
|------|--------|
| 研究、决策、追踪 | 执行、生成 |
| 更新 prompts 的依据 | prompts、scripts、templates |

## 主入口

- [[Wiki Index]] → `wiki/00-元信息/Wiki Index.md`
- 方法论 → `wiki/00-元信息/方法论 - Persistent Wiki vs RAG.md`
