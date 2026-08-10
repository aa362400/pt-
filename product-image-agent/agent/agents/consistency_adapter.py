#!/usr/bin/env python3
"""
ConsistencyAdapter — english_textconsistencydetection Agent HTTP english_text（english_text）

text：
  english_text Agent（consistencydetectiontext）english_textAPIenglish_text。
  english_textfile，english_text Registry/Pipeline，english_text。

text：
  adapter = ConsistencyAdapter()
  result = adapter.check(image_paths=["img.jpg"], profile={...}, ref_images=["ref.jpg"])

textoutputtext：
  {
    "status": "passed" | "failed" | "skipped" | "error",
    "score": 0-100,
    "issues": [],
    "recommendations": [],
    "raw": {},          # text Agent textresponse（english_text）
    "source": "external_consistency_agent"
  }
"""

from __future__ import annotations

import json
import os
import time
from typing import Optional
from urllib.parse import urljoin


# english_text
_DEFAULT_TIMEOUT = 30

# textoutputfields，english_text Agent responseenglish_text
_REQUIRED_OUTPUT_FIELDS = frozenset({
    "status", "score", "issues", "recommendations",
})

# english_text status text
_VALID_STATUSES = frozenset({"passed", "failed", "skipped", "error"})


def _env(key: str, default: str = "") -> str:
    """securityreadenglish_text，english_textconfiguration"""
    val = os.environ.get(key, default).strip()
    if not val or len(val) > 2048:
        return default
    return val


def _compute_default_score(status: str) -> float:
    """text status english_text"""
    mapping = {"passed": 100.0, "failed": 30.0, "skipped": -1.0, "error": 0.0}
    return mapping.get(status, 0.0)


def _validate_response(data: dict) -> list:
    """english_text Agent textdata，english_text（text=text）"""
    issues = []
    if not isinstance(data, dict):
        return ["text Agent responsetextyes dict"]
    for field in _REQUIRED_OUTPUT_FIELDS:
        if field not in data:
            issues.append(f"textfields: {field}")
    status = data.get("status")
    if status is not None and status not in _VALID_STATUSES:
        issues.append(f"text status: {status}")
    score = data.get("score")
    if score is not None and not isinstance(score, (int, float)):
        issues.append("score textyestext")
    return issues


class ConsistencyAdapter:
    """
    textconsistencydetection Agent HTTP english_text。
    english_textconfiguration：
      CONSISTENCY_AGENT_URL      — text Agent text（english_text）
      CONSISTENCY_AGENT_API_KEY  — textsecret（text）
      CONSISTENCY_AGENT_TIMEOUT  — requestenglish_text（text 30）
    """

    def __init__(self, endpoint: str = "", api_key: str = "", timeout: float = 0):
        self.endpoint = endpoint or _env("CONSISTENCY_AGENT_URL")
        self.api_key = api_key or _env("CONSISTENCY_AGENT_API_KEY")
        try:
            self.timeout = float(timeout or _env("CONSISTENCY_AGENT_TIMEOUT", str(_DEFAULT_TIMEOUT)))
        except (ValueError, TypeError):
            self.timeout = _DEFAULT_TIMEOUT

    def _disabled_skip(self) -> dict:
        """textconfigurationenglish_textresponse"""
        return {
            "status": "skipped",
            "score": -1.0,
            "issues": [],
            "recommendations": ["CONSISTENCY_AGENT_URL textconfiguration，textconsistencydetectiontext"],
            "raw": {},
            "source": "external_consistency_agent",
            "skipped_reason": "endpoint_not_configured",
        }

    def _build_payload(self, image_paths: list, profile: dict,
                       ref_images: list, context: Optional[dict] = None) -> dict:
        """english_text Agent textrequesttext"""
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
        """english_text Agent HTTP response，english_text dict"""
        # text JSON text
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            # text JSON → error response
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"text Agent english_text JSON: {raw[:200]}"],
                "recommendations": ["english_text Agent responsetext"],
                "raw": {"raw_text": raw[:500]},
                "source": "external_consistency_agent",
            }

        # english_textfields
        validation_issues = _validate_response(data)
        if validation_issues:
            return {
                "status": "error",
                "score": 0.0,
                "issues": validation_issues,
                "recommendations": ["english_text Agent responseyesnoenglish_text"],
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
        english_textconsistencydetection。

        text：
          image_paths — textdetectiontextgenerationenglish_text
          profile     — english_text dict
          ref_images  — english_text
          context     — english_text

        english_text report dict。
        text Agent english_text/text/english_text error，english_text。
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
                "issues": ["text requests text: pip install requests"],
                "recommendations": ["text requests english_text"],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.Timeout:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"text Agent text（{self.timeout}s）"],
                "recommendations": ["english_text/text CONSISTENCY_AGENT_TIMEOUT"],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.ConnectionError as e:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"nonetextconnectiontext Agent: {e}"],
                "recommendations": [
                    f"text {self.endpoint} yesnotext",
                    "text CONSISTENCY_AGENT_URL configuration",
                ],
                "raw": {},
                "source": "external_consistency_agent",
            }
        except requests.RequestException as e:
            return {
                "status": "error",
                "score": 0.0,
                "issues": [f"text Agent requestfailed: {e}"],
                "recommendations": ["english_text Agent textstatus"],
                "raw": {},
                "source": "external_consistency_agent",
            }

    def check_batch(self, batches: list) -> list:
        """
        textdetectiontext（image_paths, profile, ref_images）text。

        english_text，english_textinput。
        textfailedenglish_text。
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
                    "issues": [f"textdetectionenglish_text: {e}"],
                    "recommendations": [],
                    "raw": {},
                    "source": "external_consistency_agent",
                }
            results.append(result)
        return results


# ── english_text ──

def create_adapter(endpoint: str = "", api_key: str = "",
                   timeout: float = 0) -> ConsistencyAdapter:
    """text ConsistencyAdapter text（english_text）"""
    return ConsistencyAdapter(endpoint=endpoint, api_key=api_key, timeout=timeout)
