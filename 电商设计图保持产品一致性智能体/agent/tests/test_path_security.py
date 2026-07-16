#!/usr/bin/env python3
import json
import os
import sys

import pytest

AGENT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, AGENT_ROOT)
sys.path.insert(0, os.path.join(AGENT_ROOT, "web"))

from web.services.image_store import session_output_dir
from web.services.path_security import safe_join, validate_session_id
from web.services.session_store import session_file


@pytest.mark.parametrize("sid", ["../escape", "..\\escape", "/absolute", "org%2Fescape", "has space"])
def test_session_identifiers_reject_path_tokens(sid):
    with pytest.raises(ValueError):
        validate_session_id(sid)


def test_safe_join_rejects_parent_escape(tmp_path):
    with pytest.raises(ValueError):
        safe_join(str(tmp_path), "..", "outside")


def test_session_store_rejects_traversal(tmp_path):
    with pytest.raises(ValueError):
        session_file(str(tmp_path), "../outside")


def test_blackboard_cannot_override_output_root(tmp_path):
    sessions_dir = tmp_path / "sessions"
    output_dir = tmp_path / "outputs"
    sid = "safe-session"
    blackboard = sessions_dir / sid / "blackboard.json"
    blackboard.parent.mkdir(parents=True)
    blackboard.write_text(json.dumps({"output_dir": str(tmp_path.parent)}), encoding="utf-8")

    resolved = session_output_dir(sid, {}, str(sessions_dir), str(output_dir))

    assert resolved == str(output_dir / sid)
