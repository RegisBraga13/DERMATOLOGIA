"""Normalização textual usada pelos validadores clínicos."""

import re
import unicodedata


def normalize_name(value):
    """Compara nome sem acento, caixa nem pontuação."""
    texto = unicodedata.normalize("NFKD", str(value or "").lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", texto).strip()


def sources_mentioning(sources, term):
    """Retorna apenas trechos que mencionam o termo solicitado."""
    alvo = normalize_name(term)
    if not alvo:
        return list(sources)
    radicais = [alvo] + [parte for parte in alvo.split() if len(parte) >= 4]
    return [item for item in sources
            if any(radical in normalize_name(item.get("excerpt", "")) for radical in radicais)]
