# ============================================================
# API 弹性客户端 — API Resilient Client
# ============================================================
# 提供:
#   - 指数退避重试
#   - 速率限制 (令牌桶)
#   - 熔断器 (Circuit Breaker)
#   - 统一错误处理
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
# 速率限制器 (Token Bucket)
# ============================================================

class RateLimiter:
    """
    令牌桶速率限制器。
    每个 API Key / 引擎可以共享一个限流器。
    """

    def __init__(self, rate: float = 5.0, capacity: float = 10.0):
        """
        Args:
            rate: 每秒补充的令牌数（如 5.0 = 5 次/秒）
            capacity: 桶容量（最大突发量）
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.time()
        self.lock = threading.Lock()

    def acquire(self, tokens: int = 1, timeout: float = 60.0) -> bool:
        """
        阻塞直到获取到令牌。
        返回 True 表示获取成功，False 表示超时。
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

                # 等待时间
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
# 熔断器 (Circuit Breaker)
# ============================================================

class CircuitBreaker:
    """
    熔断器：连续失败达到阈值时熔断一段时间，期间直接拒绝请求。

    状态:
        CLOSED - 正常
        OPEN   - 熔断中（拒绝请求）
        HALF_OPEN - 半开（允许一次试探）
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
        """通过熔断器调用函数"""
        with self.lock:
            if self.state == self.OPEN:
                if self.last_failure_time and (time.time() - self.last_failure_time) > self.recovery_timeout:
                    logger.info(f"[熔断器 {self.name}] OPEN → HALF_OPEN，试探一次")
                    self.state = self.HALF_OPEN
                else:
                    raise CircuitOpenError(f"熔断器 {self.name} 开启中，跳过请求")

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
                logger.info(f"[熔断器 {self.name}] HALF_OPEN → CLOSED，恢复正常")
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
                        f"[熔断器 {self.name}] 触发熔断！连续失败 {self.failure_count} 次，"
                        f"恢复等待 {self.recovery_timeout}s"
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
    """熔断器开启时抛出的异常"""
    pass


# ============================================================
# 弹性装饰器
# ============================================================

def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 2.0,
    max_delay: float = 30.0,
    retryable_exceptions: tuple = (Exception,),
    logger_name: Optional[str] = None,
):
    """
    指数退避重试装饰器。

    Args:
        max_retries: 最大重试次数
        base_delay: 基础延迟（秒）
        max_delay: 最大延迟（秒）
        retryable_exceptions: 哪些异常触发重试
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
                        _log.error(f"重试 {max_retries} 次后仍失败: {e}")
                        raise

                    # 指数退避 + 抖动
                    delay = min(base_delay * (2 ** attempt), max_delay)
                    jitter = random.uniform(0, delay * 0.1)
                    sleep_time = delay + jitter

                    _log.warning(
                        f"第 {attempt + 1}/{max_retries} 次失败: {type(e).__name__}: {str(e)[:100]}. "
                        f"等待 {sleep_time:.1f}s 后重试..."
                    )
                    time.sleep(sleep_time)

            raise last_exception
        return wrapper
    return decorator


def rate_limited(limiter: RateLimiter):
    """速率限制装饰器"""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            if not limiter.acquire(timeout=120):
                raise TimeoutError(f"获取令牌超时（限流中）")
            return func(*args, **kwargs)
        return wrapper
    return decorator


# ============================================================
# 全局限流器/熔断器注册表
# ============================================================

# 各引擎的限流器（默认 QPS 配置）
DEFAULT_RATES = {
    "gemini": 2.0,       # 2 RPS
    "minimax": 5.0,
    "midjourney": 0.5,   # MJ 第三方代理更严格
    "dalle": 1.0,        # OpenAI 限流
    "sdxl_local": 10.0,  # 本地无限流
}

_limiters: dict[str, RateLimiter] = {}
_breakers: dict[str, CircuitBreaker] = {}
_registry_lock = threading.Lock()


def get_rate_limiter(engine: str) -> RateLimiter:
    """获取（或创建）指定引擎的限流器"""
    with _registry_lock:
        if engine not in _limiters:
            rate = DEFAULT_RATES.get(engine, 5.0)
            _limiters[engine] = RateLimiter(rate=rate, capacity=rate * 2)
        return _limiters[engine]


def get_circuit_breaker(engine: str) -> CircuitBreaker:
    """获取（或创建）指定引擎的熔断器"""
    with _registry_lock:
        if engine not in _breakers:
            _breakers[engine] = CircuitBreaker(
                failure_threshold=5,
                recovery_timeout=60.0,
                name=engine,
            )
        return _breakers[engine]


def get_all_metrics() -> dict:
    """获取所有限流器和熔断器的指标（用于监控）"""
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
