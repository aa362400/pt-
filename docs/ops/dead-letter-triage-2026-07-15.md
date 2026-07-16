# 死信任务真实盘点与处置清单

更新时间：2026-07-15
范围：本地服务器当前数据库中的全部 `OPEN` 死信记录
处置原则：不删除、不批量重放、不把失败改成成功、不直接写入店铺

## 结论

历史报告中的 25 条是旧快照。本轮开始时数据库实际存在 **32 条未解决死信**。完成 1 条受控恢复验收，并逐条复核其余 9 条可重试记录后，当前剩余 **22 条未解决死信**：

| 分类 | 数量 | 是否允许恢复 | 当前动作 |
|---|---:|---|---|
| 可安全重试 | 0 | 仅允许逐条创建新的幂等恢复任务 | 1 条金丝雀已验收；其余 9 条确认已过期或被替代，均关闭且未重放 |
| 供应商失败 | 12 | 否 | 先验证模型或图片供应商额度与健康状态 |
| 数据缺失 | 9 | 否 | 补齐图片/输入或重新发起来源任务 |
| 永久失败 | 1 | 否 | 修复 DeepSeek 请求契约后重新创建任务 |
| 待分类 | 0 | 否 | 无 |

截至本报告生成时：**受控恢复 1 条、历史记录关闭 9 条、批量重放 0 条、原失败状态改写 0 条**。金丝雀死信已标记为 `REPLAYED`，但原自动化任务仍保持 `FAILED`，新恢复任务真实终态为 `PARTIAL`，未伪装成成功。其余 9 条均为 `RESOLVED / RETRYABLE / replayEligible=false`，且没有 `replayRunId`。

## 单条恢复验收证据

| 证据 | ID / 结果 |
|---|---|
| 死信记录 | `cmrigq5km00mxucrw82d7jbup` → `REPLAYED`，`replayEligible=false`，认领字段已释放 |
| 原自动化任务 | `cmrigpmsw00miucrwm6r5ly4n` → 继续保持 `FAILED` |
| 新恢复任务 | `cmrldyeul00l1p401nhud9o64` → `PARTIAL` |
| 选品 AgentRun | `cmrldyqgt00l7p40141c8wyxu` → `FAILED / RESEARCH_EVIDENCE_UNVERIFIABLE` |
| 人工审核任务 | `cmrldyqgv00l9p4011u4r6jxn` → `REWORK` |
| 恢复步骤 | `automatic-product-research` → `BLOCKED / attempt=1` |
| 后续业务写入 | ProductLaunch `0`、ExternalSubmission `0`、ProductResearchRun `0` |

失败原因是无法取得可核验的 Ozon 证据。门禁按设计阻断后续草稿、图片和发布，不把“已启动恢复”错误显示为“业务成功”。

## 审核真实性纠正

复核恢复任务时发现旧审核逻辑允许失败的 `AGENT_RUN` 被人工标记为通过。现已完成：

1. 后端对非 `COMPLETED` 的 AgentRun 返回 `AGENT_RUN_NOT_APPROVABLE`，HTTP 400。
2. 实际前端审批页不再展示失败任务的通过按钮，只保留“确认不可用”和“重新执行”。
3. 全库 24 条历史误标记录通过正常审核 API 纠正为 `REWORK`，没有直接 SQL 改状态。
4. 当前全库“AgentRun 未完成但 ReviewTask=APPROVED”数量为 `0`。
5. 24 次纠正均形成 `REVIEW_REWORK` 审计记录；四个受影响组织的审计链均 `valid=true`、断点 `0`、未上链记录 `0`。

## 安全门禁

1. `replay-all` 已禁用，不能批量重放全部死信。
2. 只有显式分类为 `RETRYABLE` 且 `replayEligible=true` 的记录才能创建恢复任务。
3. 恢复动作创建新的 AgentRun 或 AutomationRun，原失败任务继续保持 `FAILED`。
4. 同一死信使用稳定幂等键，重复点击不能重复创建恢复任务。
5. 供应商额度、缺少输入和请求契约错误不能通过重试掩盖。
6. 每次分类、恢复和归档均写入审计链。

## 可重试记录的最终处置（9 条，全部关闭且未重放）

| 死信 ID | 队列 / Job | 核验证据 | 最终处置 |
|---|---|---|---|
| `cmrie897z0069ucpsi69pj548` | agent-runs / attempt 1 | 后续已有 8 条同类型运行，最新运行 `COMPLETED` | `RESOLVED`；避免重复生成图片资产 |
| `cmrigq5sb00n2ucrwyc7vyte6` | automation-runs / 77 | 同一流程已有 12 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmripau5f03c3ucrwrne9jzai` | automation-runs / 79 | 同一流程已有 11 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmripayn403c8ucrwr9hb2nei` | automation-runs / 78 | 同一流程已有 13 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmrixvik905zlucrwcgq4iffq` | automation-runs / 80 | 同一流程已有 12 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmrixvky105zqucrw0empo25y` | automation-runs / 81 | 同一流程已有 10 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmrj840d600daucbcm1s5q812` | automation-runs / 82 | 同一流程已有 11 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmrj840fk00dfucbc1frrir4c` | automation-runs / 83 | 同一流程已有 9 条更新运行 | `RESOLVED`；旧定时点不补跑 |
| `cmrj906yv00e2ucw8xeti76tw` | agent-runs / attempt 1 | 隔离测试租户，输入仅为 `test`，无业务动作 | `RESOLVED`；测试请求不恢复 |

上述 9 条均先通过管理 API 重新分类为 `RETRYABLE / replayEligible=false`，再通过逐条 `resolve` API 关闭，并写入分类和关闭审计记录。没有直接 SQL 改状态，也没有创建恢复任务。RLS 路径已经修复只证明新任务可按当前代码执行，不构成补跑历史定时任务的理由。

处置后数据库不变式：`OPEN=22`、`OPEN RETRYABLE=0`、`OPEN replayEligible=0`、`RESOLVED=62`、`REPLAYED=1`。9 个来源 AgentRun/AutomationRun 均继续保持 `FAILED`，`replayRunId` 均为空，关联 ProductLaunch 数量为 `0`。受影响的 Codex QA、aa362400 和隔离测试组织审计链均 `valid=true`、`headMatches=true`、断点 `0`、未上链记录 `0`。

## 供应商失败（12 条，禁止重放）

| 死信 ID | 来源 | 真实原因 | 恢复前置条件 |
|---|---|---|---|
| `cmri02e8p001ruc44a1w81eyg` | jojocode chat | HTTP 503 | 连续健康检查通过后重新创建任务 |
| `cmri063in001zuc444k19vfg5` | jojocode chat | HTTP 503 | 连续健康检查通过后重新创建任务 |
| `cmribub9p0070uc4w706tyoos` | 模型接口 | HTTP 403 / 额度或权限 | 验证密钥权限和可用额度 |
| `cmric50a4005puc68lys3rl84` | 模型接口 | HTTP 403 / 额度或权限 | 验证密钥权限和可用额度 |
| `cmricdktg0072uctgw4csocd8` | 模型接口 | 额度耗尽 | 充值或切换经验证的备用供应商 |
| `cmricsiu9005vuc8gao06fox1` | 模型接口 | 额度不足 | 充值或切换经验证的备用供应商 |
| `cmricueyt0074uc3cezgwnnum` | 模型接口 | 主备供应商全部失败 | 至少一个供应商健康后再运行 |
| `cmriebyam00b0ucc81efrqpid` | 模型接口 | 主备供应商全部失败 | 至少一个供应商健康后再运行 |
| `cmrifd7dh007yucrwy0b5rna5` | 模型接口 | 主备供应商全部失败 | 至少一个供应商健康后再运行 |
| `cmriflce9009fucrwqvpyoe6a` | 模型接口 | 额度不足 | 充值或切换经验证的备用供应商 |
| `cmrifo77c0069ucnox8mcej7a` | 图片接口 | 主备图片供应商全部失败 | 图片供应商真实出图验证通过 |
| `cmrigd3hu00hsucrwueoz3r75` | 图片接口 | 主备图片供应商全部失败 | 图片供应商真实出图验证通过 |

这些记录不允许通过反复重试消耗额度。供应商恢复后应创建新任务，而不是把旧失败记录显示为成功。

## 数据缺失（9 条，禁止重放）

| 死信 ID | 来源状态 | 真实原因 | 建议动作 |
|---|---|---|---|
| `cmrei1sbh008luc6cwquvyc6t` | MISSING | 原自动化来源任务已不存在 | 保留审计；按当前 Ozon 流程重新创建任务 |
| `cmrei1sbj008muc6cmay7v714` | MISSING | 原自动化来源任务已不存在 | 保留审计；按当前 Ozon 流程重新创建任务 |
| `cmrei1sbo008nuc6c2fe31hxr` | MISSING | 原自动化来源任务已不存在 | 保留审计；按当前 Ozon 流程重新创建任务 |
| `cmrej5nu000dzuc6c2we1hsqe` | MISSING | 原自动化来源任务已不存在 | 保留审计；按当前 Ozon 流程重新创建任务 |
| `cmrem1ue000qnuc1w4syomira` | FAILED | 缺少 `imageBase64` 或 `imageUrl` | 补充真实商品图后新建任务 |
| `cmrem1uf000qouc1wamld43n1` | FAILED | 缺少 `imageBase64` 或 `imageUrl` | 补充真实商品图后新建任务 |
| `cmrem2hif00rfuc1w374r5zi6` | FAILED | 缺少 `imageBase64` 或 `imageUrl` | 补充真实商品图后新建任务 |
| `cmrjig6a900h9mb01kb312ep0` | FAILED | 缺少 `imageBase64` 或 `imageUrl` | 补充真实商品图后新建任务 |
| `cmrjiko9900kgmb0116v0wowr` | FAILED | 缺少 `imageBase64` 或 `imageUrl` | 补充真实商品图后新建任务 |

## 永久失败（1 条，禁止重放）

| 死信 ID | 来源状态 | 真实原因 | 建议动作 |
|---|---|---|---|
| `cmrjifpd700gimb018e15bzfp` | FAILED | DeepSeek `chat/completions` 返回 HTTP 400 | 修复模型名、消息结构或供应商兼容契约；通过契约测试后新建任务 |

## 下一步执行顺序

1. 在 AI Agent 中心确认中文死信面板显示 `0 / 12 / 9 / 1`，并单独显示 1 条已恢复金丝雀和 9 条未重放关闭记录。
2. 验证模型和图片供应商健康，不通过则继续阻断 12 条供应商失败记录。
3. 数据缺失记录只能补齐真实图片或来源数据后创建新任务，不能原样重放。
4. 永久失败记录必须先修复 DeepSeek 请求契约并通过契约测试，再创建新任务。
5. 保持 `open replayEligible=0` 门禁；任何新重放必须重新逐条给出业务价值、幂等范围和无重复写入证据。
