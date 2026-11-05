"""Adaptador TypeSafe/Jev.

O provedor é mantido separado do handler HTTP e do domínio clínico. O módulo
recebe perguntas estruturadas e devolve somente a resposta JSON do provedor.
"""

import json
import urllib.request

from ai_transport import read_json_response


TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone"
TYPESAFE_MODEL = "jev-latest"


def call_typesafe_noul_batch(api_key, state, questions):
    payload_questions = {
        key: {
            "type": "noul",
            "instructions": question["instructions"],
            **({"criteria": question["criteria"]} if question.get("criteria") else {}),
        }
        for key, question in questions.items()
    }
    request_body = {"state": state, "model": TYPESAFE_MODEL, "questions": payload_questions}
    request = urllib.request.Request(
        TYPESAFE_API_URL,
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    return read_json_response(request, timeout=30, rotulo="TypeSafe")


def call_typesafe_risk_screen(api_key, text, indicators):
    questions = {
        key: {"instructions": indicator["instructions"], "criteria": indicator["criteria"]}
        for key, indicator in indicators.items()
    }
    return call_typesafe_noul_batch(api_key, text, questions)
