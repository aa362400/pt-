# 验证日志

| 验证 | 结果 | 证据 |
|---|---|---|
| `node verify-platform-release.mjs` | passed | backend 406 passed/2 skipped；Agent 579 passed；发布门禁 passed |
| 后端生产依赖 audit | passed | 0 vulnerabilities；`uuid` 已升至 11.1.1 |
| 前端 `release:verify` | passed with warnings | build/lint 通过；存在未使用 import 等 warning，无 error |
| Agent full pytest | passed with warnings | 579 passed；33 个 Pillow deprecation warnings |
| DeepSeek 最小真实调用 | passed | `DEEPSEEK_OK`；configured `deepseek-chat`，provider `deepseek-v4-flash` |
| DeepSeek/Ozon 翻译定向测试 | passed | 23 passed |
| Compose config/build | passed | 本地镜像构建成功 |
| `scripts/local-server/verify.ps1` | passed | 六长期容器逐个 healthy；init exit 0；端口隔离通过 |
| Prisma migrate status | passed | 62 migrations；schema up to date |
| RLS | passed | 50 policies；业务角色无 superuser/bypassrls |
| 手动每日 run | passed | `cmrjfi1a200hrs801ewjnihta`，attempt 2，COMPLETED |
| 七类报告 | passed | 7 artifacts：TOP_MD/TOP_JSON/WATCHLIST/REJECTED/RISK/SOURCE_HEALTH/RUN_LOG |
| 计划 | passed | enabled、PILOT、08:00、Asia/Shanghai、nextRunAt `2026-07-14T00:00:00.000Z` |
| Ozon 中文真实研究 | blocked correctly | 5 个相关来源、1 条 869 RUB；`RESEARCH_EVIDENCE_PRICES_INSUFFICIENT` |
| 浏览器全路由 | passed | 40/40 非空，0 白屏，0 React crash；外部未配置按状态展示 |
| 局域网 | passed on host | `http://192.168.1.8/api/v1/ready` 返回 200 |
| restart persistence | passed | run/status/attempt、7 hashes、schedule 重启前后一致 |
| backup | passed | `.local-server/backups/20260714-deepseek-ready` |
| isolated restore | passed | `restore-evidence-20260714003120.json`，行数和 artifact hashes 一致 |
| Windows autostart | passed with fallback | Startup launcher 存在；Task Scheduler 因权限不足自动回退 |
