from unittest.mock import ANY, MagicMock, patch

from common.browse_url import _cookies_for_url, _fetch_static, browse_url
from common.fetch_url import UnsafeRemoteUrl


def test_cookie_domain_matching_does_not_leak_to_suffix_confusion():
    jar = {
        "ozon.ru": [{"name": "session", "value": "secret"}],
    }

    assert _cookies_for_url("https://evil-ozon.ru/product", jar) == []
    assert _cookies_for_url("https://seller.ozon.ru/product", jar) == [
        {"name": "session", "value": "secret"}
    ]


@patch("common.browse_url._safe_get")
def test_static_browser_uses_validated_redirect_fetch(mock_safe_get):
    response = MagicMock()
    response.url = "https://www.ozon.ru/product/1"
    response.headers = {"Content-Type": "text/html; charset=utf-8"}
    response.iter_content.return_value = [b"<title>Ozon product</title>"]
    mock_safe_get.return_value = response

    final_url, html = _fetch_static("https://www.ozon.ru/product/1", 10)

    assert final_url == "https://www.ozon.ru/product/1"
    assert "Ozon product" in html
    mock_safe_get.assert_called_once_with(
        "https://www.ozon.ru/product/1",
        headers=ANY,
        cookies={},
        timeout=10,
        stream=True,
    )


@patch("common.browse_url._is_safe_remote_url", return_value=False)
def test_browser_rejects_private_target_before_any_fetch(_safe_url):
    result = browse_url("http://127.0.0.1:3000/api/v1/ready")

    assert result["error"] == "不安全的远程地址"


@patch("common.browse_url._is_safe_remote_url", return_value=True)
@patch("common.browse_url._safe_get", side_effect=UnsafeRemoteUrl("unsafe remote URL"))
def test_browser_rejects_redirect_to_private_target(_safe_get_mock, _safe_url):
    result = browse_url("https://public.example/redirect")

    assert "unsafe" in result["error"].lower()
