"""Recuperação estrita de notas dermatológicas locais, sem copiar o acervo ao Git."""

import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata


DEFAULT_NOTES_DIR = Path.home() / "Downloads" / "Obsidian_Medicina" / "Obsidian_Medicina" / "Dermatologia"
MAX_NOTE_CHARS = 5500
MAX_NOTES = 3
VALIDATION_MANIFEST = Path(__file__).resolve().parent / "dermatology_notes_validation.json"


def _key(value):
    plain = unicodedata.normalize("NFKD", value)
    plain = "".join(char for char in plain if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", plain.casefold()).strip()


def local_notes_dir():
    configured = os.environ.get("DERMATOLOGY_NOTES_DIR", "").strip()
    return Path(configured).expanduser() if configured else DEFAULT_NOTES_DIR


def validated_note_hashes():
    try:
        manifest = json.loads(VALIDATION_MANIFEST.read_text(encoding="utf-8"))
        if manifest.get("status") != "clinician_attested" or not manifest.get("validated_at"):
            return {}, ""
        notes = manifest.get("notes", {})
        if not isinstance(notes, dict):
            return {}, ""
        return notes, manifest["validated_at"]
    except (OSError, ValueError, AttributeError):
        return {}, ""


def saved_hypothesis_names(hypotheses):
    """Extrai somente títulos de HD, ignorando justificativas e citações."""
    names = []
    lines = hypotheses.strip().splitlines()
    for line in lines:
        pattern = r"^\s*\d+[.)]\s+([^\n:]{3,150})\s*$" if len(lines) > 1 else r"^\s*(?:\d+[.)]\s*)?([^\n:]{3,150})\s*$"
        match = re.match(pattern, line)
        if not match:
            continue
        name = re.split(r"\s*[—–(]\s*", match.group(1), maxsplit=1)[0].strip()
        if name and _key(name) not in {_key(item) for item in names}:
            names.append(name)
    return names


def retrieve_plan_notes(hypotheses):
    """Só aceita nomes de hipóteses completos; não faz busca por termos soltos."""
    directory = local_notes_dir()
    if not directory.is_dir():
        return []
    validated_hashes, validated_at = validated_note_hashes()
    if not validated_hashes:
        return []
    candidates = {}
    for path in directory.glob("*.md"):
        if path.stem == "Índice" or re.search(r"\(\d+\)$", path.stem):
            continue
        candidates[_key(path.stem)] = path
    selected = []
    for name in saved_hypothesis_names(hypotheses):
        key = _key(name)
        if key not in candidates:
            continue
        path = candidates[key]
        if path.stat().st_size > 100_000:
            continue
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if validated_hashes.get(path.name) != digest:
            continue
        body = raw.decode("utf-8-sig").strip()
        section = next((match for match in re.finditer(r"(?m)^##\s+(.+)$", body)
                        if any(term in _key(match.group(1))
                               for term in ("tratamento", "terapeutica", "conduta", "manejo"))), None)
        if not body or not section:
            continue
        # Contexto diagnóstico curto, seguido da seção terapêutica completa até o limite.
        excerpt = body[:1000].strip() + "\n\n" + body[section.start():section.start() + MAX_NOTE_CHARS - 1002].strip()
        selected.append({"title": path.stem.replace("_", " "), "hypothesis": name, "filename": path.name,
                         "sha256": digest, "validated_at": validated_at, "text": excerpt})
        if len(selected) == MAX_NOTES:
            break
    return selected
