"""Adaptador genérico para busca e montagem de fontes do Vector Store."""

import json
import os
import urllib.parse
import urllib.request

from ai_transport import read_json_response


VECTOR_STORE_API_URL = "https://api.openai.com/v1/vector_stores/{vector_store_id}/search"
RAG_MAX_RESULTS = 8
RAG_SCORE_THRESHOLD = 0.55
MAX_SOURCES_CHARS = 48000


def vector_store_search(vector_store_id, query, api_key, filtros=None):
    request_body = {
        "query": query,
        "max_num_results": int(os.environ.get("OPENAI_RAG_MAX_RESULTS", str(RAG_MAX_RESULTS))),
        "rewrite_query": False,
    }
    if filtros:
        request_body["filters"] = filtros
    request = urllib.request.Request(
        VECTOR_STORE_API_URL.format(vector_store_id=urllib.parse.quote(vector_store_id, safe="")),
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    payload = read_json_response(request, timeout=60, rotulo="busca vetorial")
    threshold = float(os.environ.get("OPENAI_RAG_SCORE_THRESHOLD", str(RAG_SCORE_THRESHOLD)))
    sources = []
    for item in payload.get("data", []):
        score = float(item.get("score") or 0)
        if score < threshold:
            continue
        excerpts = [part.get("text", "").strip() for part in item.get("content", []) if part.get("text")]
        if not excerpts:
            continue
        sources.append({"file_id": item.get("file_id", ""), "filename": item.get("filename", "Fonte sem titulo"),
                        "score": round(score, 4), "excerpt": "\n".join(excerpts),
                        "attributes": item.get("attributes") or {}})
    return sources


def rag_context(sources):
    blocks = []
    for index, source in enumerate(sources, 1):
        attributes = source.get("attributes") or {}
        details = ", ".join(f"{key}: {value}" for key, value in attributes.items() if value)
        label = source["filename"] + (f" ({details})" if details else "")
        blocks.append(f"[FONTE {index}: {label}; relevancia={source['score']}]\n{source['excerpt']}")
    return "\n\n---\n\n".join(blocks)


def fit_sources(sources, limite=MAX_SOURCES_CHARS):
    cabem = []
    total = 0
    for source in sources:
        tamanho = len(source.get("excerpt") or "") + len(source.get("filename") or "") + 64
        if cabem and total + tamanho > limite:
            break
        cabem.append(source)
        total += tamanho
    return cabem, len(sources) - len(cabem), total
