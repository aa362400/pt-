"""english_text — textplatformtext/categorytext，english_text LLM english_text。

sourcetext：
1. agent/knowledge/*.md english_text（text ## english_text）
2. profiles/knowledge_notes.json english_text（userenglish_text「text：xxx」text）

search() english_text，english_text，english_text、textoutputtext。
"""

from __future__ import annotations

import json
import os
import re
import threading
import time

from common.runtime_paths import get_runtime_paths

_LOCK = threading.Lock()

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "..", "knowledge")
_RUNTIME_PATHS = get_runtime_paths()
ORG_KNOWLEDGE_DIR = os.path.join(_RUNTIME_PATHS.memory, "knowledge", "orgs")
NOTES_PATH = os.path.join(_RUNTIME_PATHS.memory, "knowledge_notes.json")

_NOTE_RE = re.compile(r"^\s*(?:text|english_text|text)\s*[:：]\s*(.+)$", re.S)


def _safe_org_id(org_id: str | None) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", (org_id or "").strip())[:80]


def _iter_markdown_paths(org_id: str | None = None) -> list[str]:
    paths: list[str] = []
    try:
        for fname in sorted(os.listdir(KNOWLEDGE_DIR)):
            if fname.endswith(".md"):
                paths.append(os.path.join(KNOWLEDGE_DIR, fname))
    except OSError:
        pass

    safe_org = _safe_org_id(org_id)
    if safe_org:
        org_dir = os.path.join(ORG_KNOWLEDGE_DIR, safe_org)
        try:
            for fname in sorted(os.listdir(org_dir)):
                if fname.endswith(".md"):
                    paths.append(os.path.join(org_dir, fname))
        except OSError:
            pass
    return paths


def _load_chunks(org_id: str | None = None) -> list:
    """text md text ## english_text + english_text，english_text {"title", "text"}。"""
    chunks = []
    for path in _iter_markdown_paths(org_id):
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read()
            for part in re.split(r"\n(?=## )", content):
                part = part.strip()
                if not part:
                    continue
                title = part.splitlines()[0].lstrip("# ").strip()
                chunks.append({"title": title, "text": part[:800]})
        except OSError:
            pass

    for note in load_notes():
        chunks.append({"title": "english_text", "text": str(note.get("text", ""))[:400]})
    return chunks


def load_notes() -> list:
    try:
        with open(NOTES_PATH, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return []


def add_note(text: str) -> dict:
    text = (text or "").strip()
    if len(text) < 4:
        raise ValueError("english_text")
    with _LOCK:
        notes = load_notes()
        note = {"text": text[:400], "ts": time.time()}
        notes.append(note)
        notes = notes[-100:]
        os.makedirs(os.path.dirname(os.path.abspath(NOTES_PATH)), exist_ok=True)
        tmp = NOTES_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(notes, f, ensure_ascii=False, indent=2)
        os.replace(tmp, NOTES_PATH)
    return note


def maybe_capture_note(message: str) -> str | None:
    """messagetext「text：xxx」english_text，english_text；notext None。"""
    match = _NOTE_RE.match(message or "")
    if not match:
        return None
    try:
        return add_note(match.group(1))["text"]
    except ValueError:
        return None


def _tokenize(text: str) -> set:
    tokens = set(re.findall(r"[a-zA-Z]{3,}", text.lower()))
    # Englishtext 2-gram text
    han = re.sub(r"[^\u4e00-\u9fff]", "", text)
    tokens.update(han[i:i + 2] for i in range(len(han) - 1))
    return tokens


def search(query: str, k: int = 3, org_id: str | None = None) -> list:
    """english_text k english_text（noneenglish_text）。"""
    q_tokens = _tokenize(query or "")
    if not q_tokens:
        return []
    scored = []
    for chunk in _load_chunks(org_id):
        overlap = len(q_tokens & _tokenize(chunk["title"] + chunk["text"]))
        if overlap >= 2:
            scored.append((overlap, chunk))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:k]]
