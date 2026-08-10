import os
import sys
import unittest

AGENT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if AGENT_ROOT not in sys.path:
    sys.path.insert(0, AGENT_ROOT)

import mcp_server  # noqa: E402


class TestMcpToolPolicy(unittest.TestCase):
    def test_every_advertised_tool_is_explicitly_allowlisted(self):
        advertised = {tool["name"] for tool in mcp_server.TOOLS}
        self.assertEqual(advertised, mcp_server.ALLOWED_TOOL_NAMES)
        for name in advertised:
            mcp_server.enforce_tool_policy(name, {})

    def test_unknown_tool_is_rejected_before_dispatch(self):
        with self.assertRaises(ValueError):
            mcp_server.enforce_tool_policy("unregistered_tool", {})

    def test_platform_write_tools_are_hard_blocked(self):
        for name in (
            "publish_listing",
            "change_price",
            "change_inventory",
            "buy_ads",
            "refund_order",
            "payment",
            "delete_store_data",
        ):
            with self.subTest(name=name), self.assertRaises(PermissionError):
                mcp_server.enforce_tool_policy(name, {})

    def test_tool_arguments_must_be_an_object(self):
        with self.assertRaises(TypeError):
            mcp_server.enforce_tool_policy("calc_profit", [])


if __name__ == "__main__":
    unittest.main()
