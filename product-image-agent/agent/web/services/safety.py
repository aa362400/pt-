"""textsecuritytext（text ATP，Mnemosyne english_text，P5）。

english_text：Proposal is not truth —— generationenglish_text「english_text」，
english_text、textriskenglish_text，text append-only text，english_textrollback。

riskenglish_text（english_textplantext）：
    low       automatictext + text（generationtitle/prompt/keywords/profit）
    medium    automatictext + english_text（generationtext/CSV/english_text/text）
    high      text proposal texthumantext（english_textgeneration/english_text/english_text）
    danger    english_text（text/text/text——english_text，english_text）

text：logs/actions.jsonl，english_text JSON（who/action/params/risk/status/ts），
english_text；textrollbacktextyes alts/ text，passed proposal_id text。
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid

_LOCK = threading.Lock()

# english_text、english_textrisktext（english_text；english_text，english_text）
_PENDING_PROPOSALS: dict[str, dict] = {}
PROPOSAL_TTL_SECONDS = 30 * 60

LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..",
                        "logs", "actions.jsonl")

RISK_LEVELS = ("low", "medium", "high", "danger")

# text → riskenglish_text（english_text medium）
ACTION_RISK = {
    # low：english_textgeneration，english_textcost
    "generate_title": "low",
    "generate_keywords": "low",
    "calc_profit": "low",
    "analyze_opportunity": "low",
    "risk_check": "low",
    # medium：textfile/english_text，english_text
    "generate_images": "medium",
    "inpaint_edit": "medium",
    "export_bundle": "medium",
    "export_csv": "medium",
    "regenerate_one": "medium",
    # high：text/english_text，texthumantext
    "batch_regenerate": "high",
    "batch_delete_sessions": "high",
    "overwrite_export": "high",
    # danger：english_text，english_text
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
        pass  # textfailedenglish_text


def log_action(action: str, params: dict | None = None, sid: str = "",
               status: str = "committed", proposal_id: str = "",
               backup: str = "", error: str = "") -> str:
    """english_text（append-only），english_text id。"""
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
        "backup": backup,          # english_textrollbackenglish_text（text alts/ english_text）
        "error": error[:300],
    })
    return entry_id


def check_constraints(action: str, params: dict) -> list[str]:
    """english_text：english_text。english_text。"""
    issues: list[str] = []
    params = params or {}

    title = str(params.get("title", "") or "")
    if title:
        if len(title) > 200:
            issues.append(f"titletext（{len(title)} > 200 text）")
        try:
            from web.services.risk_check import find_trademark_hits
            hits = find_trademark_hits(title)
            if hits:
                issues.append(f"titleenglish_text：{', '.join(hits[:4])}")
        except Exception:  # noqa: BLE001
            pass

    tags = params.get("tags")
    if isinstance(tags, list):
        long_tags = [t for t in tags if len(str(t)) > 20]
        if long_tags:
            issues.append(f"english_text（>20 text）：{', '.join(map(str, long_tags[:3]))}")
        if len(tags) > 13:
            issues.append(f"english_text（{len(tags)} > 13）")

    price = params.get("price")
    breakeven = params.get("breakeven")
    if price is not None and breakeven is not None:
        try:
            if float(price) < float(breakeven):
                issues.append(
                    f"text {price} english_text {breakeven}，english_text")
        except (TypeError, ValueError):
            pass

    count = params.get("count")
    if action.startswith("batch") and count is not None:
        try:
            if int(count) > 50:
                issues.append(f"english_text（{count} > 50），english_text")
        except (TypeError, ValueError):
            pass
    return issues


def propose(action: str, params: dict | None = None, sid: str = "") -> dict:
    """english_text，textriskenglish_text。

    text:
        {"decision": "execute"}                    text/textriskenglish_textpassed → english_text
        {"decision": "confirm", "proposalId": ..}  textrisk → frontendhumanenglish_text
        {"decision": "reject", "issues": [...]}    english_text / danger → text
    """
    params = params or {}
    risk = risk_of(action)
    issues = check_constraints(action, params)

    if risk == "danger":
        log_action(action, params, sid, status="rejected",
                   error="danger english_text")
        return {"decision": "reject", "risk": risk,
                "issues": issues + ["english_text，english_text"]}

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
                "message": "english_textrisk（text/text），english_text proposalId english_text"}

    log_action(action, params, sid, status="committed")
    return {"decision": "execute", "risk": risk}


def confirm(proposal_id: str, action: str, params: dict | None = None,
            sid: str = "") -> dict:
    """humanenglish_textrisktext（english_text proposalId）。

    proposalId textyes propose() realtext、english_text（30 text）text，
    english_text，english_text/english_textrisktext。
    """
    if not proposal_id:
        return {"decision": "reject", "issues": ["text proposalId"]}

    with _LOCK:
        pending = _PENDING_PROPOSALS.pop(proposal_id, None)

    if pending is None:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id,
                   error="proposalId english_text")
        return {"decision": "reject",
                "issues": ["proposalId english_text，english_text"]}

    if pending["action"] != action:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id,
                   error=f"english_text（english_text {pending['action']}）")
        return {"decision": "reject",
                "issues": ["proposalId english_text，english_text"]}

    if time.time() - pending["ts"] > PROPOSAL_TTL_SECONDS:
        log_action(action, params, sid, status="rejected",
                   proposal_id=proposal_id, error="english_text")
        return {"decision": "reject",
                "issues": ["english_text（text 30 text），english_text"]}

    log_action(action, params, sid, status="committed",
               proposal_id=proposal_id)
    return {"decision": "execute", "risk": risk_of(action)}


def recent_logs(limit: int = 50, sid: str = "") -> list[dict]:
    """readenglish_text（english_text）。"""
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
