# 每日精准选品实现与严格验收报告

日期：2026-07-13  
验收范围：`G:\平台` 的后端、智能体前端、Agent 连接与本地运行环境  
原则：不以手工夹具冒充真实市场数据，不以代码存在冒充生产验收通过。

## 1. 最终结论

| 层级 | 结论 | 说明 |
|---|---|---|
| 本地 DRY_RUN | PASS | 证据导入、10 阶段流水线、评分、报告、历史、反馈与 UI 可运行 |
| 本地 HTTP 闭环 | PASS | 临时租户经真实 HTTP 路由完成运行、幂等反馈、表现读取和汇总，随后清理 |
| SHADOW | BLOCKED | 尚无真实 Ozon 连续影子运行窗口和来源稳定性数据 |
| PILOT | BLOCKED | 尚未完成真实试点组织、人工审核 SLA 和一周经营反馈验收 |
| GENERAL | NO-GO | 不满足生产放量出口闸门，系统保持默认 DRY_RUN 和外部写入关闭 |

## 2. 已实现

- 每日选品独立队列、稳定任务 ID、幂等运行、取消和失败状态。
- 手工/CSV 证据连接器和已验证 Ozon 证据缓存连接器；来源逐项健康状态。
- 标准化、去重、关键词、需求、竞争、利润产能、合规、风险和评分流水线。
- 数据不足、硬风险或价格证据不足时阻断，不补齐虚构 Top 10。
- 评分版本 DRAFT、人工激活和回滚；外部店铺写入始终关闭。
- JSON/Markdown 报告、内容哈希验证、运行历史和前端报告预览。
- 前端 `每日精准选品` 菜单、运行/来源/评分/历史、候选证据与人工决策窗口。
- 运行模式 `DISABLED / DRY_RUN / SHADOW / PILOT / GENERAL`，试点组织白名单和 Kill Switch。
- 幂等经营反馈 API、候选表现 API、组织反馈汇总 API。
- 零分母返回 `null`；退款窗口未成熟不计算最终退款率。
- `actualKnownProfit` 仅来自 `ACTUAL_PROFIT` 事实，不用预测利润填充。
- 修复 HTTP `inputCandidates` 被 class-transformer 错误改写的问题，并增加生产配置回归测试。

## 3. 关键验收证据

### 后端

- 全量 Jest：70 suites passed，1 skipped；404 tests passed，2 skipped。
- Nest build：PASS。
- Prisma migration status：数据库迁移已是最新状态（本轮此前验证）。
- RLS：`shopmate_app` 非 superuser、非 bypass RLS；预期表均 enabled、forced、context-bound。
- `git diff --check`：选品相关范围无空白错误，仅有 Git 的 LF/CRLF 提示。

### 前端

- TypeScript + Vite build：PASS。
- Oxlint：退出码 0。
- 新增选品页面/API 无 lint 问题；旧 `figma-exact` 和 `I18nProvider` 存在未使用导入/Fast Refresh 警告，不属于本轮新增。

### Agent

- `test_integration_api.py`、`test_planner_verifier_stage_11_12.py`、`test_ozon_research_evidence.py`：36 passed。
- Agent `/api/health`：`ok`。

### HTTP 闭环

- 手工证据运行：`COMPLETED`，产出 1 个去重候选。
- 首次经营事件：`reused=false`。
- 相同 source、externalReference、eventType 再次写入：`reused=true`。
- 表现覆盖：`PARTIAL`，曝光事实为 125；没有点击时 CTR 为 0（分母曝光非零）。
- 汇总事件数：1，覆盖状态：`PARTIAL`。
- 临时用户、组织、数据库记录和报告文件已清理。

### 本地服务

- 前端：`http://127.0.0.1:5173/daily-product-research`
- 后端：`http://127.0.0.1:3000/api/v1/health`
- 就绪：`http://127.0.0.1:3000/api/v1/ready`
- Agent：`http://127.0.0.1:8080/api/health`
- 就绪检查中 database、redis、storage、agent 均为 `up`。

## 4. 未通过项

以下项目不得显示为“已通过”：

1. 真实 Ozon 连接器尚未完成连续 7 天 SHADOW 运行和来源成功率统计。
2. 未取得足够真实候选、订单、退款、广告和实际完整成本样本，不能证明评分有效。
3. 周一 09:00 周度评估、cohort 对比和受控 DRAFT 权重建议尚未完整实现。
4. candidate 到正式 Listing、订单、退款、实际利润的全链只完成反馈事实接口，真实平台关联尚未验收。
5. 未完成生产级负载、队列积压、故障注入、备份恢复和回滚演练。
6. 全后端历史 lint 基线仍有大量既有 `unsafe-any` 问题；本轮选品范围可构建和测试，但不能宣称全仓 lint 清零。
7. Stripe 仍有测试中的 mock-mode 警告，与每日选品无关，但阻止整个平台被称为完全生产就绪。

## 5. 放量顺序

1. 保持 `DAILY_PRODUCT_RESEARCH_MODE=DRY_RUN`，只允许管理员导入证据。
2. 接通真实只读 Ozon 数据后切 `SHADOW`，至少连续运行 7 天。
3. 达到来源成功率、证据覆盖和零外部写入要求后，配置单个试点组织进入 `PILOT`。
4. 收集成熟经营反馈，补齐周度评估和 DRAFT 建议审批。
5. 完成备份恢复、队列故障和回滚演练后，才能重新评估 `GENERAL`。

## 6. 安全边界

- 选品、报告、通知和人工审核可以只读运行。
- 商品发布、改价、库存、广告、订单和付款动作仍需独立人工确认。
- 本功能当前 `externalStoreMutation=false`，不得通过前端文案或状态绕过。
- 未达到真实数据出口闸门前，不得把手工 QA 运行作为 Ozon 实时选品成功率。
