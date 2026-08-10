#!/usr/bin/env python3
import io
import os
import socket
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from common.fetch_url import (
    MAX_BYTES,
    _is_safe_remote_url,
    extract_local_image_paths,
    extract_urls,
    fetch_product_image,
    import_local_image,
    _pick_image_url,
    _safe_get,
)


def image_bytes(fmt="JPEG"):
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format=fmt)
    return buffer.getvalue()


class TestFetchUrl(unittest.TestCase):
    def test_extract_urls(self):
        text = "english_text https://example.com/item/1 textyes https://img.test/a.jpg"
        urls = extract_urls(text)
        self.assertEqual(len(urls), 2)
        self.assertIn("https://example.com/item/1", urls)

    def test_extract_local_image_paths(self):
        text = (
            r"text C:\Users\1\Downloads\product.jpg "
            "textyes file:///G:/work/ref.png"
        )
        paths = extract_local_image_paths(text)
        self.assertIn(r"C:\Users\1\Downloads\product.jpg", paths)
        self.assertTrue(any(p.endswith(os.path.join("work", "ref.png")) or p.endswith("G:\\work\\ref.png") for p in paths))

    def test_pick_og_image(self):
        html = '<html><meta property="og:image" content="https://cdn.example.com/p.jpg"></html>'
        url = _pick_image_url("https://shop.example.com/p/1", html)
        self.assertEqual(url, "https://cdn.example.com/p.jpg")

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url", return_value=True)
    def test_direct_image_url(self, _safe_url, mock_get):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Type": "image/jpeg"}
        mock_resp.url = "https://cdn.example.com/a.jpg"
        mock_resp.iter_content = lambda chunk_size: [image_bytes()]
        mock_get.return_value = mock_resp

        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            result = fetch_product_image("https://cdn.example.com/a.jpg", tmp)
            self.assertTrue(result["success"])
            self.assertTrue(os.path.isfile(result["local_path"]))

    def test_rejects_private_and_loopback_url(self):
        for url in (
            "http://localhost/image.jpg",
            "http://127.0.0.1/image.jpg",
            "http://[::1]/image.jpg",
            "http://169.254.169.254/latest/meta-data",
            "http://10.0.0.2/image.jpg",
        ):
            self.assertFalse(_is_safe_remote_url(url), url)

    @patch("common.fetch_url.socket.getaddrinfo")
    def test_rejects_hostname_resolving_to_private_address(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.10", 443)),
        ]
        self.assertFalse(_is_safe_remote_url("https://example.test/image.jpg"))

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url", return_value=True)
    def test_rejects_dns_rebinding_when_connected_peer_is_private(self, _safe_url, mock_get):
        import requests

        class FakeSocket:
            def getpeername(self):
                return ("127.0.0.1", 443)

        response = requests.Response()
        response.status_code = 200
        response.url = "https://public.example/image.jpg"
        response.raw = MagicMock()
        response.raw._connection.sock = FakeSocket()
        mock_get.return_value = response

        with self.assertRaisesRegex(ValueError, "peer"):
            _safe_get(
                "https://public.example/image.jpg",
                headers={},
                timeout=10,
                stream=True,
            )

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url")
    def test_rejects_redirect_to_private_address(self, safe_url, mock_get):
        safe_url.side_effect = [True, False]
        redirect = MagicMock()
        redirect.status_code = 302
        redirect.headers = {"Location": "http://127.0.0.1/private.jpg"}
        redirect.url = "https://cdn.example.com/redirect"
        mock_get.return_value = redirect

        with tempfile.TemporaryDirectory() as tmp:
            result = fetch_product_image("https://cdn.example.com/redirect.jpg", tmp)

        self.assertFalse(result["success"])
        self.assertIn("unsafe", result["error"].lower())

    @patch("common.fetch_url.socket.getaddrinfo")
    @patch("requests.Session.get")
    def test_https_only_fetch_rejects_redirect_downgrade_before_second_request(
        self, mock_get, mock_getaddrinfo
    ):
        mock_getaddrinfo.return_value = [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443)),
        ]
        redirect = MagicMock()
        redirect.status_code = 302
        redirect.headers = {"Location": "http://cdn.example.com/image.jpg"}
        redirect.url = "https://cdn.example.com/redirect.jpg"
        mock_get.return_value = redirect

        with tempfile.TemporaryDirectory() as tmp:
            result = fetch_product_image(
                "https://cdn.example.com/redirect.jpg",
                tmp,
                require_https=True,
            )

        self.assertFalse(result["success"])
        self.assertIn("unsafe", result["error"].lower())
        self.assertEqual(mock_get.call_count, 1)

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url", return_value=True)
    def test_rejects_cross_origin_redirect_when_cookies_are_present(self, _safe_url, mock_get):
        redirect = MagicMock()
        redirect.status_code = 302
        redirect.headers = {"Location": "https://evil.example/collect"}
        redirect.url = "https://seller.ozon.ru/product"
        mock_get.return_value = redirect

        with self.assertRaisesRegex(ValueError, "cross-origin"):
            _safe_get(
                "https://seller.ozon.ru/product",
                headers={},
                cookies={"session": "secret"},
                timeout=10,
                stream=True,
            )

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url", return_value=True)
    def test_stops_stream_when_image_exceeds_limit(self, _safe_url, mock_get):
        response = MagicMock()
        response.status_code = 200
        response.headers = {"Content-Type": "image/jpeg"}
        response.url = "https://cdn.example.com/large.jpg"
        response.iter_content = lambda chunk_size: [b"x" * (MAX_BYTES + 1)]
        mock_get.return_value = response

        with tempfile.TemporaryDirectory() as tmp:
            result = fetch_product_image("https://cdn.example.com/large.jpg", tmp)

        self.assertFalse(result["success"])
        self.assertIn("too large", result["error"].lower())

    @patch("requests.Session.get")
    @patch("common.fetch_url._is_safe_remote_url", return_value=True)
    def test_rejects_fake_image_content_type(self, _safe_url, mock_get):
        response = MagicMock()
        response.status_code = 200
        response.headers = {"Content-Type": "image/jpeg"}
        response.url = "https://cdn.example.com/not-an-image.jpg"
        response.iter_content = lambda chunk_size: [b"not an image" * 100]
        mock_get.return_value = response

        with tempfile.TemporaryDirectory() as tmp:
            result = fetch_product_image("https://cdn.example.com/not-an-image.jpg", tmp)

        self.assertFalse(result["success"])
        self.assertIn("valid image", result["error"].lower())

    def test_import_local_image_copies_to_output_dir(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "source.jpg")
            out = os.path.join(tmp, "out")
            with open(src, "wb") as f:
                f.write(b"\xff\xd8\xff" + b"x" * 600)

            result = import_local_image(src, out)

            self.assertTrue(result["success"])
            self.assertTrue(os.path.isfile(result["local_path"]))
            self.assertTrue(result["local_path"].startswith(out))


if __name__ == "__main__":
    unittest.main()
