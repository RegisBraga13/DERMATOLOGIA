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


def diagnostic_traits(texto):
    """Extrai apenas os traços comparáveis de um nome diagnóstico."""
    t = normalize_name(texto or "")
    tracos = {}
    if "sem sintomas psicoticos" in t or "without psychotic" in t:
        tracos["psicotico"] = False
    elif "com sintomas psicoticos" in t or "with psychotic" in t:
        tracos["psicotico"] = True
    for chave, marcas in (("leve", ("leve", "mild")),
                          ("moderado", ("moderad", "moderat")),
                          ("grave", ("grave", "severe"))):
        if any(m in t for m in marcas):
            tracos["gravidade"] = chave
            break
    if "recorrente" in t or "recurrent" in t:
        tracos["curso"] = "recorrente"
    elif "episodio unico" in t or "single episode" in t:
        tracos["curso"] = "unico"
    return tracos


def contradicts(nome, titulo_oficial):
    """Retorna os traços presentes nos dois textos, mas divergentes."""
    a, b = diagnostic_traits(nome), diagnostic_traits(titulo_oficial)
    return {k for k in a.keys() & b.keys() if a[k] != b[k]}
