"""Formatação de eventos de decisão sem dados clínicos."""


def decision_message(fields):
    """Serializa campos técnicos para uma única linha de log estável."""
    return " ".join(f"{key}={value}" for key, value in fields.items()
                    if value not in (None, ""))
