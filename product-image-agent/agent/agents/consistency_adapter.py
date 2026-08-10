#!/usr/bin/env python3
"""
ConsistencyAdapter — 外部产品一致性检测 Agent HTTP 适配器（最小侵入层）

职责：
  将外部 Agent（一致性检测服务）以标准化接口接入当前系统。
  不修改任何核心文件，不进入 Registry/Pipeline，仅作为可手动调用的工具层。

用法：
  adapter = ConsistencyAdapter()
  result = adapter.check(image_paths=["img.jpg"], profile={...}, ref_images=["ref.jpg"])

统一输出结构：
  {
    "status": "passed" | "failed" | "skipped" | "error",
    "score": 0-100,
    "issues": [],
    "recommendations": [],
    "raw": {},          # 外部 Agent 原始响应（诊断用）
    "source": "external_consistency_agent"
  }
"""

from __future__ import annotations

import json
import os
import time
from typing import Optional
from urllib.parse import urljoin


# 默认超时秒数
_DEFAULT_TIMEOUT = 30

# 标准输出字段，任何外部 Agent 响应都必须映射为此结构
_REQUIRED_OUTPUT_FIELDS = frozenset({
    "status", "score", "issues", "recommendations",
})

# 合法的 status 值
_VALID_STATUSES = frozenset({"passed", "failed", "skipped", "error"})


def _env(key: str, default: str = "") -> str:
    """安全读取环境变量，超长或空值视为未配置"""
    val = os.environ.get(key, default).strip()
    if not val or len(val) > 2048:
        return default
    return val


def _compute_default_score(status: str) -> float:
    """基于 status 推算默认分数"""
    mapping = {"passed": 100.0, "failed": 30.0, "skipped": -1.0, "error": 0.0}
    return mapping.get(status, 0.0)


def _validate_response(data: dict) -> list:
    """校验外部 Agent 返回数据，返回问题列表（空=合规）"""
    issues = []
    if not isinstance(data, dict):
        return ["外部 Agent 响应不是 dict"]
    for field in _REQUIRED_OUTPUT_FIELDS:
        if field not in data:
            issues.append(f"缺少字段: {field}")
    status = data.get("status")
    if status is not None and status not in _VALID_STATUSES:
        issues.append(f"非法 status: {status}")
    score = data.get("score")
    if score is not None and not isinstance(score, (int, float)):
        issues.append("score 必须是数字")
    return issues


class ConsistencyAdapter:
    """
    外部一致性检测 Agent HTTP 适配器。
    环境变量配置：
      CONSISTENCY_AGENT_URL      — 外部 Agent 端点（必填以启用）
      CONSISTENCY_AGENT_API_KEY  — 认证密钥（可选）
      CONSISTENCY_AGENT_TIMEOUT  — 请求超时秒数（默认 30）
    """

    def __init__(self, endpoint: str = "", api_key: str = "", timeout: float = 0):
        self.endpoint = endpoint or _env("CONSISTENCY_AGENT_URL")
        self.api_key = api_key or _env("CONSISTENCY_AGENT_API_KEY")
        try:
            self.timeout = float(timeout or _env("CONSISTENCY_AGENT_TIMEOUT", str(_DEFAULT_TIMEOUT)))
        except (ValueError, TypeError):
            self.timeout = _DEFAULT_TIMEOUT

    def _disabled_skip(self) -> dict:
        """未配置端点时的跳过响应"""
        return {
            "status": "skipped",
            "score": -1.0,
            "issues": [],
            "recommendations": ["CONSISTENCY_AGENT_URL 未配置，外部一致性检测跳过"],
            "raw": {},
            "source": "external_consistency_agent",
            "skipped_reason": "endpoint_not_configured",
        }

    def _build_payload(self, image_paths: list, profile: dict,
                       ref_images: list, context: Optional[dict] = None) -> dict:
        """构建发送给外部 Agent 的请求体"""
        profile_safe = {
            k: profile.get(k)
            for k in ("product_name", "category", "category_cn",
                       "style", "style_cn", "colors", "materials",
                       "features", "description")
            if profile.get(k) is not None
        } if isinstance(profile, dict) else {}

        return {
            "images": {
                "generated": image_paths or [],
                "references": ref_images or [],
            },
            "profile": profile_safe,
            "context": context or {},
            "options": {
                "mode": "consistency_check",
                "dimensions": ["shape", "color", "material", "structure",
                               "proportion", "logo", "detail"],
            },
        }

    def _parse_response(self, raw: str) -> dict:
        """解析外部 Agent HTTP 响应，返回标准化 dict"""
        # 尝试 JSON 解析
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            # 非法 JSON → error 响应
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"外部 Agent 返回非法 JSON: {raw[:200]}"],
                "recommendations": ["检查外部 Agent 响应格式"],
                "raw": {"raw_text": raw[:500]},
                "source": "external_consistency_agent",
            }

        # 校验必需字段
        validation_issues = _validate_response(data)
        if validation_issues:
            return {
                "status": "error",
                "score": 0.0,
                "issues": validation_issues,
                "recommendations": ["检查外部 Agent 响应是否符合契约"],
                "raw": data,
                "source": "external_consistency_agent",
            }

        score = data.get("score")
        if not isinstance(score, (int, float)):
            score = _compute_default_score(data.get("status", "error"))

        return {
            "status": data.get("status", "error"),
            "score": max(0.0, min(100.0, float(score))),
            "issues": list(data.get("issues", [])),
            "recommendations": list(data.get("recommendations", [])),
            "raw": data,
            "source": "external_consistency_agent",
        }

    def check(self, image_paths: list, profile: dict,
              ref_images: list, context: Optional[dict] = None) -> dict:
        """
        执行外部一致性检测。

        参数：
          image_paths — 待检测的生成图路径列表
          profile     — 产品档案 dict
          ref_images  — 参考产品图路径列表
          context     — 可选上下文

        返回标准化 report dict。
        外部 Agent 不可用/超时/异常时返回 error，不抛异常。
        """
        if not self.endpoint:
            return self._disabled_skip()

        payload = self._build_payload(image_paths, profile, ref_images, context)
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            import requests

            resp = requests.post(
                urljoin(self.endpoint, "/check"),
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            return self._parse_response(resp.text)

        except ImportError:
            return {
                "status": "error",
                "score": 0.0,
                "issues": ["缺少 requests 库: pip install requests"],
                "recommendations": ["安装 requests 库后重试"],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.Timeout:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"外部 Agent 超时（{self.timeout}s）"],
                "recommendations": ["检查网络/增大 CONSISTENCY_AGENT_TIMEOUT"],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.ConnectionError as e:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"无法连接外部 Agent: {e}"],
                "recommendations": [
                    f"检查 {self.endpoint} 是否可达",
                    "检查 CONSISTENCY_AGENT_URL 配置",
                ],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.RequestException as e:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"外部 Agent 请求失败: {e}"],
                "recommendations": ["检查外部 Agent 服务状态"],
                "raw": {},
                "source": "external_consistency_agent",
            }

    def check_batch(self, batches: list) -> list:
        """
        批量检测多个（image_paths, profile, ref_images）元组。

        返回结果列表，每个结果对应一个输入。
        单批失败不影响其他批次。
        """
        results = []
        for batch in batches:
            paths = batch.get("image_paths", [])
            prof = batch.get("profile", {})
            refs = batch.get("ref_images", [])
            ctx = batch.get("context")
            try:
                result = self.check(paths, prof, refs, ctx)
            except Exception as e:
                result = {
                    "status": "error",
                    "score": 0.0,
                    "issues": [f"批量检测意外异常: {e}"],
                    "recommendations": [],
                    "raw": {},
                    "source": "external_consistency_agent",
                }
            results.append(result)
        return results


# ── 便捷单例工厂 ──

def create_adapter(endpoint: str = "", api_key: str = "",
                   timeout: float = 0) -> ConsistencyAdapter:
    """创建 ConsistencyAdapter 实例（工厂函数）"""
    return ConsistencyAdapter(endpoint=endpoint, api_key=api_key, timeout=timeout)
