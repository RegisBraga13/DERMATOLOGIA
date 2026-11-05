"""Configuração, autenticação e superfície HTTP do servidor.

As funções deste módulo não conhecem o fluxo clínico. Elas definem os limites
de segurança para o modo local/remoto, arquivos estáticos e sessão Supabase.
"""

from pathlib import Path
import logging
import os
import urllib.error
import urllib.parse
import urllib.request


logger = logging.getLogger("prontuario")

BLOCKED_NAMES = {".env", ".git", ".gitignore", ".venv", "__pycache__", ".DS_Store", "node_modules"}
BLOCKED_SUFFIXES = {".py", ".pyc", ".sql", ".log", ".command", ".m4a", ".pem", ".key"}
BLOCKED_PREFIXES = (".env",)
BLOCKED_STEMS = ("rag_sources", "book_chapters", "dsm_criteria")
CACHEABLE_SUFFIXES = {".woff2", ".woff", ".ttf", ".eot", ".svg", ".png", ".jpg", ".webp", ".ico"}


def is_blocked_path(relative_parts):
    for part in relative_parts:
        lowered = part.lower()
        if lowered in BLOCKED_NAMES or lowered.startswith(BLOCKED_PREFIXES) or lowered.startswith(BLOCKED_STEMS):
            return True
    if relative_parts and Path(relative_parts[-1]).suffix.lower() in BLOCKED_SUFFIXES:
        return True
    return False


def is_public_asset(relative_parts):
    if not relative_parts:
        return True
    if len(relative_parts) == 1:
        return relative_parts[0] in {"index.html", "sw.js"}
    if relative_parts[0] == "src":
        return relative_parts[-1].lower().endswith((".js", ".css", ".json"))
    if relative_parts[0] == "fonts":
        return len(relative_parts) == 2 and relative_parts[-1].lower().endswith((".woff2", ".woff"))
    return False


def is_remote_mode():
    mode = os.environ.get("APP_MODE", "").strip().lower()
    if mode not in {"", "local", "remote"}:
        raise ValueError("APP_MODE deve ser local ou remote.")
    host = os.environ.get("HOST", "127.0.0.1")
    if mode == "local" and host not in {"127.0.0.1", "::1", "localhost"}:
        raise ValueError("APP_MODE=local só permite escutar no próprio computador.")
    return mode == "remote" or host not in {"127.0.0.1", "::1", "localhost"}


def validate_server_config():
    if os.environ.get("SUPABASE_STORAGE_VERSION", "1") not in {"1", "2"}:
        raise ValueError("SUPABASE_STORAGE_VERSION deve ser 1 ou 2.")
    if is_remote_mode() and not (
        os.environ.get("SUPABASE_URL", "").startswith("https://")
        and os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
    ):
        raise RuntimeError("Servidor remoto exige SUPABASE_URL HTTPS e SUPABASE_PUBLISHABLE_KEY.")


def is_same_origin(handler):
    origin = handler.headers.get("Origin")
    host = handler.headers.get("Host", "")
    if origin is None:
        return True
    try:
        parsed = urllib.parse.urlparse(origin)
    except ValueError:
        return False
    return parsed.netloc == host


def verify_supabase_user(handler):
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not supabase_key:
        return not is_remote_mode()
    auth_header = handler.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.lower().startswith("bearer ") else ""
    if not token:
        return False
    request = urllib.request.Request(
        f"{supabase_url}/auth/v1/user",
        headers={"apikey": supabase_key, "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status == 200
    except urllib.error.HTTPError:
        return False
    except urllib.error.URLError:
        logger.warning("Nao foi possivel validar a sessao no Supabase (rede).")
        return False
