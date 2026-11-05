"""Primitivas de runtime do servidor HTTP.

Este módulo não conhece rotas clínicas, Supabase ou provedores de IA. Mantém
as preocupações operacionais isoladas para que o handler principal possa ser
dividido em módulos sem levar junto estado de negócio.
"""

from collections import defaultdict, deque
import os
import re
import secrets
import threading
import time


RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_MAX_POSTS = 60


def request_id(received=""):
    """Aceita apenas IDs curtos e seguros para log; caso contrário gera um."""
    value = str(received or "").strip()
    return value[:64] if re.fullmatch(r"[A-Za-z0-9._:-]{1,64}", value) else secrets.token_hex(8)


def client_key(handler):
    """Obtém uma chave de limite sem confiar em proxy por padrão."""
    if os.environ.get("TRUST_PROXY_HEADERS", "0").strip().lower() in {"1", "true", "yes"}:
        forwarded = handler.headers.get("X-Forwarded-For", "").split(",", 1)[0].strip()
        if forwarded:
            return forwarded
    return handler.client_address[0]


class PostRateLimiter:
    """Limite simples por processo para reduzir abuso e loops acidentais."""

    def __init__(self, window_seconds=RATE_LIMIT_WINDOW_SECONDS, max_posts=RATE_LIMIT_MAX_POSTS):
        self.window_seconds = window_seconds
        self.max_posts = max_posts
        self._lock = threading.Lock()
        self._hits = defaultdict(deque)

    def limited(self, handler, now=None):
        agora = time.monotonic() if now is None else now
        chave = client_key(handler)
        with self._lock:
            hits = self._hits[chave]
            while hits and agora - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_posts:
                return True
            hits.append(agora)
            if len(self._hits) > 2048:
                for item, fila in list(self._hits.items()):
                    if not fila or agora - fila[-1] >= self.window_seconds:
                        self._hits.pop(item, None)
        return False
