# Flask Web UI

> agent 的 Web 拖拽操作界面。

## 摘要

`agent/web/app.py` 提供 Flask 驱动的 Web UI，支持拖拽上传产品图、一键生成、预览和下载。是 [[电商产品图一致性 - 新手到专家路线]] 阶段四的推荐入口。

## 功能

| 功能 | 说明 |
|-----|------|
| 拖拽上传 | 支持多图 |
| 一键生成 | 调用 auto_pipeline |
| 预览 | 浏览器内查看 10 场景输出 |
| 下载 | 打包下载成品 |

## 启动

```bash
python agent/web/app.py --port 8080
# 浏览器打开 http://localhost:8080
```

## 依赖

- Flask
- 与 `auto_pipeline.py` 共享引擎配置

## 相关

- [[玩家库 Index]]
- [[多引擎调度]]
