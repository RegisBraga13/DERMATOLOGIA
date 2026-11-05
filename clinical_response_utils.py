"""Utilidades puras para interpretar respostas de modelos.

Este módulo não conhece HTTP, banco ou regras clínicas. Ele concentra apenas
o parsing tolerante e os metadados técnicos usados na observabilidade.
"""

import json


SCHEMA_VERSION = "2026-09-26"


def parse_model_json(text):
    """Parseia JSON puro ou JSON cercado por texto incidental do modelo."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def usage_fields(response_data):
    """Extrai somente metadados de uso, status e corte da resposta."""
    response_data = response_data or {}
    usage = response_data.get("usage") or {}
    detalhe = usage.get("input_tokens_details") or {}
    return {
        "tokens_in": usage.get("input_tokens"),
        "tokens_out": usage.get("output_tokens"),
        "tokens_cache": detalhe.get("cached_tokens"),
        "status": response_data.get("status"),
        "corte": (response_data.get("incomplete_details") or {}).get("reason"),
    }


def diagnostic_group(result, group, limit=None):
    """Valida e devolve um grupo de hipóteses do diagnóstico."""
    options = result.get(group)
    if options is None:
        raise ValueError(f"O grupo {group} nao veio na resposta.")
    if not isinstance(options, list):
        raise ValueError(f"O grupo {group} deveria ser uma lista.")
    if limit is not None and len(options) > limit:
        raise ValueError(f"O grupo {group} aceita no maximo {limit} opcoes.")
    return options
