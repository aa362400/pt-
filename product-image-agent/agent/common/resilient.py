# ============================================================
# API textcustomertext — API Resilient Client
# ============================================================
# text:
#   - english_text
#   - english_text (english_text)
#   - english_text (Circuit Breaker)
#   - texterrortext
# ============================================================

import functools
import logging
import random
import threading
import time
from collections import deque
from datetime import datetime
from typing import Any, Callable, Optional

from .utils import setup_logger

logger = setup_logger(__name__)


# ============================================================
# english_text (Token Bucket)
# ============================================================

class RateLimiter:
    """
    english_text。
    text API Key / english_text。
    """

    def __init__(self, rate: float = 5.0, capacity: float = 10.0):
        """
        Args:
            rate: english_text（text 5.0 = 5 text/text）
            capacity: english_text（english_text）
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.time()
        self.lock = threading.Lock()

    def acquire(self, tokens: int = 1, timeout: float = 60.0) -> bool:
        """
        english_text。
        text True english_textsuccess，False english_text。
        """
        deadline = time.time() + timeout
        while True:
            with self.lock:
                now = time.time()
                elapsed = now - self.last_update
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
                self.last_update = now

                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return True

                # english_text
                wait = (tokens - self.tokens) / self.rate

            if time.time() + wait > deadline:
                return False
            time.sleep(min(wait, 1.0))

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *args):
        pass


# ============================================================
# english_text (Circuit Breaker)
# ============================================================

class CircuitBreaker:
    """
    english_text：textfailedenglish_text，english_textrequest。

    status:
        CLOSED - text
        OPEN   - english_text（textrequest）
        HALF_OPEN - text（english_text）
    """

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0,
                 name: str = "default"):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.name = name
        self.state = self.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.success_count = 0
        self.lock = threading.Lock()

    def call(self, func: Callable, *args, **kwargs) -> Any:
        """passedenglish_text"""
        with self.lock:
            if self.state == self.OPEN:
                if self.last_failure_time and (time.time() - self.last_failure_time) > self.recovery_timeout:
                    logger.info(f"[english_text {self.name}] OPEN → HALF_OPEN，english_text")
                    self.state = self.HALF_OPEN
                else:
                    raise CircuitOpenError(f"english_text {self.name} english_text，textrequest")

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise

    def _on_success(self):
        with self.lock:
            if self.state == self.HALF_OPEN:
                logger.info(f"[english_text {self.name}] HALF_OPEN → CLOSED，english_text")
                self.state = self.CLOSED
                self.failure_count = 0
            self.success_count += 1

    def _on_failure(self):
        with self.lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            if self.state == self.HALF_OPEN or self.failure_count >= self.failure_threshold:
                if self.state != self.OPEN:
                    logger.warning(
                        f"[english_text {self.name}] english_text！textfailed {self.failure_count} text，"
                        f"english_text {self.recovery_timeout}s"
                    )
                self.state = self.OPEN

    def get_state(self) -> dict:
        return {
            "name": self.name,
            "state": self.state,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time,
        }


class CircuitOpenError(Exception):
    """english_text"""
    pass


# ============================================================
# english_text
# ============================================================

def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
    retryable_exceptions: tuple = (Exception,),
    logger_name: Optional[str] = None,
):
    """
    english_text。

    Args:
        max_retries: english_text
        base_delay: english_text（text）
        max_delay: english_text（text）
        retryable_exceptions: english_text
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            _log = logging.getLogger(logger_name or func.__module__)
            last_exception = None

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except retryable_exceptions as e:
                    last_exception = e
                    if attempt == max_retries:
                        _log.error(f"text {max_retries} english_textfailed: {e}")
                        raise

                    # english_text + text
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.1)
                    sleep_time = delay + jitter

                    _log.warning(
                        f"text {attempt + 1}/{max_retries} textfailed: {type(e).__name__}: {str(e)[:100]}. "
                        f"text {sleep_time:.1f}s english_text..."
                    )
                    time.sleep(sleep_time)

            raise last_exception
        return wrapper
    return decorator


def rate_limited(limiter: RateLimiter):
    """english_text"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not limiter.acquire(timeout=120):
                raise TimeoutError(f"english_text（english_text）")
            return func(*args, **kwargs)
        return wrapper
    return decorator


# ============================================================
# english_text/english_text
# ============================================================

# english_text（text QPS configuration）
DEFAULT_RATES = {
    "gemini": 2.0,       # 2 RPS
    "minimax": 5.0,
    "midjourney": 0.5,   # MJ english_text
    "dalle": 1.0,        # OpenAI text
    "sdxl_local": 10.0,  # localnonetext
}

_limiters: dict[str, RateLimiter] = {}
_breakers: dict[str, CircuitBreaker] = {}
_registry_lock = threading.Lock()


def get_rate_limiter(engine: str) -> RateLimiter:
    """text（english_text）english_text"""
    with _registry_lock:
        if engine not in _limiters:
            rate = DEFAULT_RATES.get(engine, 5.0)
            _limiters[engine] = RateLimiter(rate=rate, capacity=rate * 2)
        return _limiters[engine]


def get_circuit_breaker(engine: str) -> CircuitBreaker:
    """text（english_text）english_text"""
    with _registry_lock:
        if engine not in _breakers:
            _breakers[engine] = CircuitBreaker(
                failure_threshold=5,
                recovery_timeout=60.0,
                name=engine,
            )
        return _breakers[engine]


def get_all_metrics() -> dict:
    """english_textyesenglish_text（textmonitoring）"""
    with _registry_lock:
        return {
            "rate_limiters": {
                name: {"tokens": lim.tokens, "capacity": lim.capacity, "rate": lim.rate}
                for name, lim in _limiters.items()
            },
            "circuit_breakers": {
                name: br.get_state()
                for name, br in _breakers.items()
            },
        }
