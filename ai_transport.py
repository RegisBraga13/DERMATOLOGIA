"""Transporte HTTP comum aos adaptadores de IA.

Não conhece prontuário, prompts ou provedores específicos. Centraliza retry,
limite de tempo e extração da resposta para que OpenAI, RAG e TypeSafe usem a
mesma política de rede.
"""

import json
import logging
import time
import urllib.error
import urllib.request


logger = logging.getLogger("prontuario")
TENTATIVAS_DE_REDE = 3
ESPERA_ENTRE_TENTATIVAS = (2, 6)
CODIGOS_QUE_VALE_REPETIR = {408, 409, 429, 500, 502, 503, 504}


def read_json_response(request, timeout=60, tentativas=TENTATIVAS_DE_REDE, rotulo="", max_total_seconds=None):
    """POST que repete falhas transitórias dentro de um orçamento total."""
    deadline = time.monotonic() + max_total_seconds if max_total_seconds is not None else None

    def remaining():
        if deadline is None:
            return None
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError("Tempo limite da consulta a API esgotado.")
        return left

    def wait_before_retry(seconds):
        left = remaining()
        if left is not None and seconds >= left:
            raise TimeoutError("Tempo limite da consulta a API esgotado.")
        time.sleep(seconds)

    for tentativa in range(tentativas):
        try:
            left = remaining()
            with urllib.request.urlopen(request, timeout=min(timeout, left) if left is not None else timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            ultima = tentativa == tentativas - 1
            if ultima or error.code not in CODIGOS_QUE_VALE_REPETIR:
                raise
            espera = ESPERA_ENTRE_TENTATIVAS[min(tentativa, len(ESPERA_ENTRE_TENTATIVAS) - 1)]
            try:
                pedido = int(error.headers.get("Retry-After", "0"))
                if 0 < pedido <= 30:
                    espera = pedido
            except (TypeError, ValueError):
                pass
            logger.warning("%s %s: repetindo em %ss (tentativa %d de %d)",
                           rotulo or "chamada", error.code, espera, tentativa + 2, tentativas)
            wait_before_retry(espera)
        except (urllib.error.URLError, TimeoutError) as error:
            if tentativa == tentativas - 1:
                raise
            espera = ESPERA_ENTRE_TENTATIVAS[min(tentativa, len(ESPERA_ENTRE_TENTATIVAS) - 1)]
            logger.warning("%s sem resposta (%s): repetindo em %ss", rotulo or "chamada", type(error).__name__, espera)
            wait_before_retry(espera)
    raise RuntimeError("tentativas de rede esgotadas")


def extract_response_text(data):
    if data.get("output_text"):
        return data["output_text"]
    parts = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                parts.append(text)
    return "\n\n".join(parts).strip()
