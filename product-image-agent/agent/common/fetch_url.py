#!/usr/bin/env python3
"""Fetch product images without allowing network or filesystem escapes."""

import ipaddress
import os
import re
import shutil
import socket
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urljoin, urlparse

from PIL import Image, UnidentifiedImageError

URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
FILE_URL_RE = re.compile(r"file:///[^\s<>\"']+", re.I)
WINDOWS_IMAGE_PATH_RE = re.compile(
    r"([A-Za-z]:[\\/](?:[^<>:\"|?*\r\n]*?[\\/])*[^<>:\"|?*\r\n]*?\.(?:jpg|jpeg|png|webp|gif))",
    re.I,
)
OG_IMAGE_RES = [
    re.compile(r'<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url)?["\']', re.I),
    re.compile(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    re.compile(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']', re.I),
]
IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")
USER_AGENT = "Mozilla/5.0 (compatible; ProductImageAgent/1.0)"
MAX_BYTES = 15 * 1024 * 1024
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


class UnsafeRemoteUrl(ValueError):
    """The requested URL is not a public HTTP(S) destination."""


def extract_urls(text: str) -> list[str]:
    return [url.rstrip(".,;:!?)") for url in URL_RE.findall(text or "")]


def extract_local_image_paths(text: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    text = text or ""

    for match in FILE_URL_RE.findall(text):
        parsed = urlparse(match.rstrip(".,;:!?)"))
        path = unquote(parsed.path or "")
        if re.match(r"^/[A-Za-z]:/", path):
            path = path[1:]
        path = path.replace("/", os.sep)
        if path and path not in seen:
            seen.add(path)
            found.append(path)

    for match in WINDOWS_IMAGE_PATH_RE.findall(text):
        path = match.rstrip(".,;:!?)").strip()
        if path and path not in seen:
            seen.add(path)
            found.append(path)
    return found


def _is_image_url(url: str) -> bool:
    return urlparse(url).path.lower().endswith(IMAGE_EXT)


def _allowed_import_roots() -> list[str]:
    configured = os.environ.get("LOCAL_IMAGE_IMPORT_ROOTS", "").strip()
    roots = [part.strip() for part in configured.split(";") if part.strip()] if configured else [os.path.expanduser("~")]
    return [os.path.realpath(os.path.abspath(root)) for root in roots]


def _is_under_allowed_root(src: str) -> bool:
    source = os.path.realpath(src)
    for root in _allowed_import_roots():
        try:
            if os.path.commonpath([source, root]) == root:
                return True
        except ValueError:
            continue
    return False


def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def _is_safe_remote_url(url: str, *, require_https: bool = False) -> bool:
    """Only allow HTTP(S) origins resolving exclusively to public addresses."""
    parsed = urlparse(url)
    allowed_schemes = ("https",) if require_https else ("http", "https")
    if parsed.scheme not in allowed_schemes or not parsed.hostname:
        return False
    if parsed.username is not None or parsed.password is not None:
        return False

    try:
        addresses = socket.getaddrinfo(
            parsed.hostname,
            parsed.port or (443 if parsed.scheme == "https" else 80),
            type=socket.SOCK_STREAM,
        )
    except (socket.gaierror, ValueError):
        return False
    return bool(addresses) and all(_is_public_ip(item[4][0]) for item in addresses)


def _connected_peer_ip(response) -> str | None:
    """Best-effort extraction of the socket peer used by urllib3/requests."""
    candidates = (
        ("_connection", "sock"),
        ("connection", "sock"),
    )
    raw = getattr(response, "raw", None)
    for connection_name, socket_name in candidates:
        connection = getattr(raw, connection_name, None)
        peer_socket = getattr(connection, socket_name, None)
        if peer_socket is None:
            continue
        try:
            return str(peer_socket.getpeername()[0])
        except (AttributeError, OSError, TypeError, IndexError):
            continue

    try:
        peer_socket = raw._fp.fp.raw._sock
        return str(peer_socket.getpeername()[0])
    except (AttributeError, OSError, TypeError, IndexError):
        return None


def _verify_connected_peer(response) -> None:
    """Reject DNS rebinding when the actual connected peer is not public."""
    import requests

    if not isinstance(response, requests.Response):
        return
    peer_ip = _connected_peer_ip(response)
    if not peer_ip or not _is_public_ip(peer_ip):
        response.close()
        raise UnsafeRemoteUrl("unsafe connected peer address")


def _safe_get(
    url: str,
    *,
    headers: dict[str, str],
    timeout: int,
    stream: bool,
    cookies: dict[str, str] | None = None,
    require_https: bool = False,
):
    """Fetch with explicit, separately validated redirect handling."""
    import requests

    current_url = url
    session = requests.Session()
    session.trust_env = False
    try:
        for _ in range(MAX_REDIRECTS + 1):
            if not _is_safe_remote_url(current_url, require_https=require_https):
                raise UnsafeRemoteUrl("unsafe remote URL")
            response = session.get(
                current_url,
                headers=headers,
                cookies=cookies,
                timeout=timeout,
                allow_redirects=False,
                stream=stream,
            )
            _verify_connected_peer(response)
            if 300 <= response.status_code < 400:
                location = response.headers.get("Location")
                response.close()
                if not location:
                    raise ValueError("redirect response has no Location header")
                next_url = urljoin(current_url, location)
                if cookies:
                    current_origin = urlparse(current_url)
                    next_origin = urlparse(next_url)
                    if (
                        current_origin.scheme.lower(),
                        (current_origin.hostname or "").lower(),
                        current_origin.port,
                    ) != (
                        next_origin.scheme.lower(),
                        (next_origin.hostname or "").lower(),
                        next_origin.port,
                    ):
                        raise UnsafeRemoteUrl(
                            "cross-origin redirect with credentials is blocked"
                        )
                current_url = next_url
                continue
            response.raise_for_status()
            response._safe_fetch_session = session
            return response
        raise UnsafeRemoteUrl("too many redirects")
    except Exception:
        session.close()
        raise


def _read_limited(response, limit: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    try:
        for chunk in response.iter_content(64 * 1024):
            if not chunk:
                continue
            total += len(chunk)
            if total > limit:
                raise ValueError("download too large")
            chunks.append(chunk)
        return b"".join(chunks)
    finally:
        response.close()
        session = getattr(response, "_safe_fetch_session", None)
        if session is not None:
            session.close()


def _validate_image(content: bytes, content_type: str) -> None:
    if not content_type.lower().split(";", 1)[0].strip().startswith("image/"):
        raise ValueError("remote content is not an image")
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            image_format = (image.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("remote content is not a valid image") from exc
    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise ValueError("remote image format is not allowed")


def import_local_image(path: str, output_dir: str) -> dict:
    if not path:
        return {"success": False, "error": "local image path is empty"}
    source = os.path.realpath(os.path.expanduser(path.strip().strip('"').strip("'")))
    if not _is_under_allowed_root(source):
        return {"success": False, "error": "local image path is outside allowed import roots"}
    if not os.path.isfile(source):
        return {"success": False, "error": "local image does not exist"}

    extension = Path(source).suffix.lower()
    if extension not in IMAGE_EXT:
        return {"success": False, "error": "local file extension is not an allowed image type"}
    if os.path.getsize(source) > MAX_BYTES:
        return {"success": False, "error": "local image is too large"}

    os.makedirs(output_dir, exist_ok=True)
    destination = os.path.join(output_dir, f"local_{uuid.uuid4().hex[:8]}{extension}")
    shutil.copy2(source, destination)
    return {"success": True, "local_path": destination, "source_path": source}


def _pick_image_url(page_url: str, html: str) -> Optional[str]:
    for pattern in OG_IMAGE_RES:
        match = pattern.search(html)
        if match:
            return urljoin(page_url, match.group(1).strip())
    return None


def fetch_product_image(
    url: str,
    output_dir: str,
    timeout: int = 20,
    *,
    require_https: bool = False,
) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return {"success": False, "error": "only http and https URLs are supported"}

    os.makedirs(output_dir, exist_ok=True)
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,image/*,*/*;q=0.8",
    }

    try:
        image_url = url
        if _is_image_url(url):
            response = _safe_get(
                url,
                headers=headers,
                timeout=timeout,
                stream=True,
                require_https=require_https,
            )
            image_url = response.url
            content_type = response.headers.get("Content-Type") or ""
            content = _read_limited(response, MAX_BYTES)
        else:
            page_response = _safe_get(
                url,
                headers=headers,
                timeout=timeout,
                stream=True,
                require_https=require_https,
            )
            page_type = page_response.headers.get("Content-Type") or ""
            if page_type.lower().split(";", 1)[0].strip().startswith("image/"):
                image_url = page_response.url
                content_type = page_type
                content = _read_limited(page_response, MAX_BYTES)
            else:
                page = _read_limited(page_response, MAX_PAGE_BYTES)
                if page_type.lower().split(";", 1)[0].strip() not in {"text/html", "application/xhtml+xml"}:
                    return {"success": False, "error": "remote content is not an image or HTML page"}
                image_url = _pick_image_url(page_response.url, page.decode("utf-8", errors="replace"))
                if not image_url:
                    return {"success": False, "error": "unable to find an og:image on the page"}
                response = _safe_get(
                    image_url,
                    headers=headers,
                    timeout=timeout,
                    stream=True,
                    require_https=require_https,
                )
                image_url = response.url
                content_type = response.headers.get("Content-Type") or ""
                content = _read_limited(response, MAX_BYTES)

        if len(content) < 512:
            return {"success": False, "error": "remote content is not a valid image"}
        _validate_image(content, content_type)
    except (UnsafeRemoteUrl, ValueError) as exc:
        return {"success": False, "error": str(exc)}
    except Exception as exc:
        return {"success": False, "error": f"image download failed: {exc}"}

    extension = Path(urlparse(image_url).path).suffix.lower()
    if extension not in IMAGE_EXT:
        extension = ".jpg"
    local_path = os.path.join(output_dir, f"url_{uuid.uuid4().hex[:8]}{extension}")
    with open(local_path, "wb") as output:
        output.write(content)
    return {
        "success": True,
        "local_path": local_path,
        "source_url": url,
        "image_url": image_url,
    }
