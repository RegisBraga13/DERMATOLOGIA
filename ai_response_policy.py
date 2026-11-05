"""Filtros pequenos para respostas de pesquisa antes da geração clínica."""


def usable_web_findings(findings):
    """Considera apenas achados com texto efetivamente utilizável."""
    return [finding for finding in (findings or [])
            if isinstance(finding, dict) and str(finding.get("text") or "").strip()]
