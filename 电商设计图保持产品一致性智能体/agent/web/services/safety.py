"""事务安全层（轻量 ATP，Mnemosyne 思想落地，P5）。

核心原则：Proposal is not truth —— 生成动作先当「不可信提案」，
过约束校验、按风险分级决定执行策略，全程 append-only 日志，可关联回滚。

风险分级执行策略（与落地方案一致）：
    low       自动执行 + 日志（生成标题/prompt/关键词/利润）
    medium    自动执行 + 完整日志（生成套图/CSV/资料包/改图）
    high      返回 proposal 要求人工确认（批量重生成/批量删除/覆盖导出）
    danger    拒绝执行只给建议（付款/删店/换绑——本产品不做，防御性拦截）

日志：logs/actions.jsonl，一行一条 JSON（who/action/params/risk/status/ts），
只追加不修改；改图回滚已有 alts/ 备份，通过 proposal_id 关联。
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid

_LOCK = threading.Lock()

# 已签发、待确认的高风险提案（一次性消费；进程内即可，重启后提案自然作废）
_PENDING_PROPOSALS: dict[str, dict] = {}
PROPOSAL_TTL_SECONDS = 30 * 60

LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                        "logs", "actions.jsonl")

RISK_LEVELS = ("low", "medium", "high", "danger")

# 动作 → 风险级别注册表（新动作默认 medium）
ACTION_RISK = {
    # low：纯文本生成，错了重来零成本
    "generate_title": "low",
    "generate_keywords": "low",
    "calc_profit": "low",
    "analyze_opportunity": "low",
    "risk_check": "low",
    # medium：产生文件/花钱调用，但可重做可回退
    "generate_images": "medium",
    "inpaint_edit": "medium",
    "export_bundle": "medium",
    "export_csv": "medium",
    "regenerate_one": "medium",
    # high：批量/覆盖性动作，需人工点头
    "batch_regenerate": "high",
    "batch_delete_sessions": "high",
    "overwrite_export": "high",
    # danger：本产品不提供，防御性拦截
    "publish_listing": "danger",
    "payment": "danger",
    "delete_store_data": "danger",
}


def risk_of(action: str) -> str:
    return ACTION_RISK.get(action, "medium")


def _append_log(entry: dict) -> None:
    try:
        os.makedirs(os.path.dirname(os.path.abspath(LOG_PATH)), exist_ok=True)
        with _LOCK, open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
    except OSError:
        pass  # 日志失败不阻断业务


def log_action(action: str, params: dict | None = None, sid: str = "",
               status: str = "committed", proposal_id: str = "",
               backup: str = "", error: str = "") -> str:
    """记录一条动作日志（append-only），返回日志 id。"""
    entry_id = uuid.uuid4().hex[:10]
    _append_log({
        "id": entry_id,
        "ts": round(time.time(), 3),
        "sid": sid,
        "action": action,
        "risk": risk_of(action),
        "params": {k: str(v)[:200] for k, v in (params or {}).items()},
        "status": status,          # proposed / committed / rejected / failed / rolled_back
        "proposal_id": proposal_id,
        "backup": backup,          # 关联的回滚备份路径（如 alts/ 下的改前图）
        "error": error[:300],
    })
    return entry_id


def check_constraints(action: str, params: dict) -> list[str]:
    """确定性约束校验器：执行前挡住明显不该提交的提案。返回问题列表。"""
    issues: list[str] = []
    params = params or {}

    title = str(params.get("title", "") or "")
    if title:
        if len(title) > 200:
            issues.append(f"标题超长（{len(title)} > 200 字符）")
        try:
            from web.services.risk_check import find_trademark_hits
            hits = find_trademark_hits(title)
            if hits:
                issues.append(f"标题命中侵权词：{', '.join(hits[:4])}")
        except Exception:  # noqa: BLE001
            pass

    tags = params.get("tags")
    if isinstance(tags, list):
        long_tags = [t for t in tags if len(str(t)) > 20]
        if long_tags:
            issues.append(f"标签超长（>20 字符）：{', '.join(map(str, long_tags[:3]))}")
        if len(tags) > 13:
            issues.append(f"标签超数量（{len(tags)} > 13）")

    price = params.get("price")
    breakeven = params.get("breakeven")
    if price is not None and breakeven is not None:
        try:
            if float(price) < float(breakeven):
                issues.append(
                    f"定价 {price} 低于保本价 {breakeven}，会亏钱")
        except (TypeError, ValueError):
            pass

    count = params.get("count")
    if action.startswith("batch") and count is not None:
        try:
            if int(count) > 50:
                issues.append(f"批量数量过大（{count} > 50），请分批")
        except (TypeError, ValueError):
            pass
    return issues


def propose(action: str, params: dict | None = None, sid: str = "") -> dict:
    """提交一个动作提案，按风险分级返回执行决定。

    返回:
        {"decision": "execute"}                    低/中风险且校验通过 → 调用方直接执行
        {"decision": "confirm", "proposalId": ..}  高风险 → 前端人工确认后再执行
        {"decision": "reject", "issues": [...]}    校验不过 / danger → 拒绝
    """
    params = params or {}
    risk = risk_of(action)
    issues = check_constraints(action, params)

    if risk == "danger":
        log_action(action, params, sid, status="rejected",
                   error="danger 级动作默认禁止")
        return {"decision": "reject", "risk": risk,
                "issues": issues + ["该动作属于危险操作，本系统只给建议不执行"]}

    if issues:
        log_action(action, params, sid, status="rejected",
                   error="; ".join(issues))
        return {"decision": "reject", "risk": risk, "issues": issues}

    if risk == "high":
        proposal_id = uuid.uuid4().hex[:10]
        with _LOCK:
            _PENDING_PROPOSALS[proposal_id] = {
                "action": action, "sid": sid, "ts": time.time(),
            }
        log_action(action, params, sid, status="proposed",
                   proposal_id=proposal_id)
        return {"decision": "confirm", "risk": risk,
                "proposalId": proposal_id,
                "message": "该动作为高风险（批量/覆盖），请确认后携带 proposalId 再次提交"}

    log_action(action, params, sid, status="committed")
    return {"decision": "execute", "risk": risk}


def confirm(proposal_id: str, action: str, params: dict | None = None,
            sid: str = "") -> dict:
    """人工确认一个高风险提案（第二次提交时携带 proposalId）。

    proposalId 必须是 propose() 真实签发、未使用且未过期（30 分钟）的，
    一次性消费，防止伪造/重放绕过高风险确认。
    """
    if not proposal_id:
        return {"decision": "reject", "issues": ["缺少 proposalId"]}

    with _LOCK:
        pending = _PENDING_PROPOSALS.pop(proposal_id, None)

    if pending is None:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id,
                   error="proposalId 不存在或已被使用")
        return {"decision": "reject",
                "issues": ["proposalId 不存在或已被使用，请重新发起提案"]}

    if pending["action"] != action:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id,
                   error=f"提案动作不匹配（提案为 {pending['action']}）")
        return {"decision": "reject",
                "issues": ["proposalId 与动作不匹配，请重新发起提案"]}

    if time.time() - pending["ts"] > PROPOSAL_TTL_SECONDS:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id, error="提案已过期")
        return {"decision": "reject",
                "issues": ["提案已过期（超过 30 分钟），请重新发起"]}

    log_action(action, params, sid, status="committed",
               proposal_id=proposal_id)
    return {"decision": "execute", "risk": risk_of(action)}


def recent_logs(limit: int = 50, sid: str = "") -> list[dict]:
    """读取最近的动作日志（操作审计面板用）。"""
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return []
    out = []
    for line in reversed(lines):
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if sid and entry.get("sid") != sid:
            continue
        out.append(entry)
        if len(out) >= limit:
            break
    return out
