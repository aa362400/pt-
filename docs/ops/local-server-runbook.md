# ShopMate 本机服务器运维手册

## 地址

- 本机：`http://127.0.0.1`
- 当前局域网：`http://192.168.1.8`
- Ready：`http://127.0.0.1/api/v1/ready`

局域网 IP 可能由路由器 DHCP 改变，以 `status.ps1` 当前输出为准。

## 首次安装

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\setup.ps1
```

全新安装会生成 `.local-server\first-login.txt`，仅当前 Windows 用户和 SYSTEM 可读。首次登录并修改密码后删除该文件。已有数据卷不会重复创建组织或覆盖账号。

## 日常命令

```powershell
# 启动现有镜像
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\start.ps1 -NoBuild

# 查看容器、HTTP、LAN、每日计划、磁盘和自启
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\status.ps1

# 严格健康与端口隔离检查
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\verify.ps1

# 停止并保留数据卷
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\stop.ps1

# 重启并保留数据卷
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\restart.ps1

# 脱敏日志入口
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\logs.ps1
```

## 每日选品

- 模式：PILOT
- 时间：每天 08:00
- 时区：Asia/Shanghai
- 上限：300 个候选，Top 10 只是上限
- 外部写：始终关闭
- 当前有效来源：CSV/人工导入；Ozon 已验证公开证据缓存只有满足门禁时才启用

没有至少两条真实 RUB 价格时，Ozon 调研会失败并创建人工审核任务；这不是服务故障，不得手工改为成功。

## 备份和恢复

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\backup.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\restore.ps1 -BackupPath .\.local-server\backups\<timestamp>
```

恢复脚本默认恢复到隔离 PostgreSQL 容器并比较行数和 artifact hash，不覆盖当前运行库。

## 开机启动

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\local-server\install-autostart.ps1
```

优先尝试 Task Scheduler；无权限时写入当前用户 Startup 目录。Docker Desktop 必须已设置为登录后启动。Windows 睡眠期间服务不可用。

## 局域网与防火墙

当前主机从 `192.168.1.8` 访问 Ready 成功。其它设备若无法访问，请以管理员身份仅对 Private profile 放行 TCP 80；不要放行 3000、5432、6379 或 8080，也不要配置公网端口转发。

## 故障处理

1. 运行 `status.ps1`。
2. 运行 `verify.ps1`，任何一个容器非 healthy 都会失败。
3. 查看对应服务日志。
4. 每日任务失败时查看运行阶段、source health 和 run log。
5. Ozon `RESEARCH_EVIDENCE_PRICES_INSUFFICIENT` 表示价格证据不足，不得绕过门禁。
6. 磁盘不足时先备份，再清理非业务 Docker build cache；不要删除命名数据卷。

