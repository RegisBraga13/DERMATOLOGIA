"""Recuperação estrita de notas dermatológicas locais, sem copiar o acervo ao Git."""

import hashlib
import os
from pathlib import Path
import re
import unicodedata


DEFAULT_NOTES_DIR = Path.home() / "Downloads" / "Obsidian_Medicina" / "Obsidian_Medicina" / "Dermatologia"
MAX_NOTE_CHARS = 5500
MAX_NOTES = 3


def _key(value):
    plain = unicodedata.normalize("NFKD", value)
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", plain.casefold()).strip()


def local_notes_dir():
    configured = os.environ.get("DERMATOLOGY_NOTES_DIR", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_NOTES_DIR


def retrieve_plan_notes(hypotheses):
    """Só aceita nomes de hipóteses completos; não faz busca por termos soltos."""
    directory = local_notes_dir()
    if not directory.is_dir():
        return []
    candidates = {}
    for path in directory.glob("*.md"):
        if path.stem == "Índice" or re.search(r"\(\d+\)$", path.stem):
            continue
        candidates[_key(path.stem)] = path
    names = []
    lines = hypotheses.strip().splitlines()
    for line in lines:
        pattern = r"^\s*\d+[.)]\s+([^\n:]{3,150})\s*$" if len(lines) > 1 else r"^\s*(?:\d+[.)]\s*)?([^\n:]{3,150})\s*$"
        match = re.match(pattern, line)
        if not match:
            continue
        name = re.split(r"\s*[—–(]\s*", match.group(1), maxsplit=1)[0].strip()
        if _key(name) in candidates and _key(name) not in names:
            names.append(_key(name))
    selected = []
    for name in names[:MAX_NOTES]:
        path = candidates[name]
        if path.stat().st_size > 100_000:
            continue
        body = path.read_text(encoding="utf-8-sig").strip()
        section = re.search(r"(?mi)^## Tratamento\b", body)
        if not body or not section:
            continue
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        # Contexto diagnóstico curto, seguido da seção terapêutica completa até o limite.
        excerpt = body[:1000].strip() + "\n\n" + body[section.start():section.start() + MAX_NOTE_CHARS - 1002].strip()
        selected.append({"title": path.stem.replace("_", " "), "filename": path.name,
                         "sha256": digest, "text": excerpt})
    return selected
