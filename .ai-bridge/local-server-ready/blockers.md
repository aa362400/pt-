# 外部阻塞

状态：BLOCKED_EXTERNAL

1. **Ozon 全站实时商品库**：Seller API 面向卖家自有业务，不提供“读取 Ozon 全站全部商品”的合法通用接口。当前使用公开可核验证据；本次只有一条有效 RUB 价格，未达到两条门禁。
2. **Ozon 店铺实时订单/商品/广告**：当前本机没有通过健康校验的正式店铺凭证；页面保持 `NOT_CONFIGURED`，不显示假数据。
3. **Etsy / Amazon / Temu**：正式 API 凭证与连接器未配置，因此只展示禁用或未配置状态。
4. **Stripe live**：未配置；本地测试中的 mock payment 日志不代表真实计费可用。
5. **企业评测金标**：six-family judge fixtures 仍为 provisional，`enterpriseEligible=false`，需要授权人工 reviewer。
6. **跨设备 Windows 防火墙**：本机通过 `192.168.1.8` 实测 200；其它设备若被防火墙拦截，需要管理员只为 Private profile 放行 TCP 80。
7. **机器睡眠和 Docker Desktop 开机启动**：当前用户 Startup launcher 已安装，但 Windows 进入睡眠时服务不会运行；Docker Desktop 本身需允许登录后启动。

以上阻塞不允许改写为“已接入”或“全站实时”。

