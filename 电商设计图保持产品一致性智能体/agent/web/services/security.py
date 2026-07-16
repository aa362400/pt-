"""CSRF token and lightweight rate-limit helpers for the web app."""

from __future__ import annotations

import secrets
import threading
import time
from collections import defaultdict

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


class RateLimiter:
    """Simple in-process sliding-window limiter."""

    def __init__(self) -> None:
        self._buckets = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: int) -> bool:
        now = time.time()
        with self._lock:
            bucket = self._buckets[key]
            self._buckets[key] = [t for t in bucket if now - t < window]
            if len(self._buckets[key]) >= limit:
                return False
            self._buckets[key].append(now)
            return True


class CsrfManager:
    """Signed-token CSRF helper with lazy serializer initialization."""

    def __init__(self, secret_key: str, salt: str = "pia-csrf-v1", ttl: int = 3600) -> None:
        self.secret_key = secret_key
        self.salt = salt
        self.ttl = ttl
        self._serializer: URLSafeTimedSerializer | None = None

    @property
    def serializer(self) -> URLSafeTimedSerializer:
        if self._serializer is None:
            self._serializer = URLSafeTimedSerializer(self.secret_key, salt=self.salt)
        return self._serializer

    def issue(self) -> str:
        payload = {"n": secrets.token_urlsafe(16), "t": int(time.time())}
        return self.serializer.dumps(payload)

    def validate(self, token: str) -> bool:
        if not token:
            return False
        try:
            self.serializer.loads(token, max_age=self.ttl)
            return True
        except (BadSignature, SignatureExpired):
            return False
