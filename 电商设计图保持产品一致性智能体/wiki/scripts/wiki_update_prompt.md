# Wiki 增量更新 Prompt

> 在 Cursor / Codex 对话中粘贴此 prompt，处理 `sources/inbox/` 中的新来源。

---

## 任务

你是「电商产品图一致性」持久化 Wiki 的维护者。请按 Karpathy Persistent Wiki 方法，**增量更新** `wiki/` 知识库。

## 必读文件

1. `wiki/00-元信息/方法论 - Persistent Wiki vs RAG.md` — 维护原则
2. `wiki/00-元信息/Wiki Index.md` — 现有知识索引
3. `wiki/00-元信息/待处理来源 Inbox.md` — 待处理登记
4. `wiki/sources/inbox/` — 新来源文件

## 执行步骤

### Step 1 — 扫描 inbox

列出 `wiki/sources/inbox/` 中所有未处理文件。若无新文件，报告「无待处理来源」并结束。

### Step 2 — 阅读与提取

对每个新来源：
1. 阅读全文
2. 阅读 Wiki 中**可能相关的已有实体页**（用 Wiki Index 和 wikilink 搜索）
3. 提取：
   - **新概念** → 需创建实体页？
   - **补充信息** → 需更新哪些已有页面？
   - **矛盾** → 与已有知识冲突？
   - **过时信息** → 需删除或标注？

### Step 3 — 增量更新 Wiki

按以下优先级更新：

| 优先级 | 目录 | 动作 |
|-------|------|------|
| 1 | `07-实体百科/` | 更新/创建核心概念页 |
| 2 | `04-玩家库/` | 更新/创建工具/引擎档案 |
| 3 | `05-风险地图/` | 追加新风险 |
| 4 | `06-季度跟踪/` | 更新追踪表 |
| 5 | `02-研究框架/` | 修订分析维度 |
| 6 | `01-阅读路线/` | 必要时调整路线 |
| 7 | `03-产业链/` | 更新产业链关系 |

**更新规则**：
- 优先修订目标页面的「摘要」区块
- 使用 `[[wikilink]]` 链接相关实体
- 矛盾写入「矛盾与待验证」表格，不要 silent overwrite
- 更新相关 Index 页面的链接列表
- 遵循 `wiki/templates/` 中的模板结构

### Step 4 — 归档来源

1. 将处理完的文件移至 `wiki/sources/processed/`
2. 在文件顶部添加处理标记：
   ```markdown
   > ✅ 已于 YYYY-MM-DD 处理。更新实体：[[A]]、[[B]]
   ```
3. 更新 `wiki/00-元信息/待处理来源 Inbox.md` 表格

### Step 5 — 写 Changelog

在 `wiki/00-元信息/更新日志 Changelog.md` 追加条目，格式：

```markdown
### YYYY-MM-DD — 来源标题

- **来源**：`sources/processed/xxx.md`
- **新增实体**：[[...]]
- **更新实体**：[[...]]
- **矛盾标注**：无 / 描述
- **摘要**：一句话
```

### Step 6 — 反哺 agent（可选）

若 Wiki 更新涉及可操作的规范变更，检查是否需同步：
- `agent/references/consistent_generation_guide.md`
- `agent/prompts/product_profile.md`
- `agent/engine_config.yaml`

仅在变更是**已验证的最佳实践**时才反哺代码，否则标注「待验证」留在 Wiki。

## 输出

完成后给出：
1. 处理的来源列表
2. 新增/更新的页面列表（文件路径）
3. 发现的矛盾（如有）
4. 建议的下一步（实验、反哺代码等）

## 约束

- 全部 Markdown，Obsidian 兼容
- 中文为主，技术术语保留英文
- 不创建重复实体页 — 先搜索已有页面
- 最小必要更新 — 不要重写无关页面
