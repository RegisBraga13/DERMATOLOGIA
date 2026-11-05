"""Política declarativa de fontes e escopos clínicos."""


GUIDELINES_ENV_KEY = "OPENAI_GUIDELINES_VECTOR_STORE_ID"

RAG_SCOPE_BY_KIND = {
    "anamnesis": ("psicopatologia", "entrevista"),
    "refinement": ("psicopatologia", "entrevista"),
    "return_assessment": ("psicopatologia", "entrevista"),
    "diagnosis": ("psicopatologia", "sindromes", "criterios"),
    "treatment": ("terapeutica",),
    "return_plan": ("terapeutica",),
    "diagnosis_review": ("tratado",),
    "treatment_review": ("tratado",),
    "medication": ("prescricao",),
    "medication_review": ("psicofarmacologia",),
    "medication_tips": ("psicofarmacologia",),
    "evolution": ("terapeutica", "tratado"),
    "symptomatic": ("psicofarmacologia",),
}

RAG_ALWAYS_SCOPE_BY_KIND = {"diagnosis": ("criterios",)}
RAG_ALWAYS_MAX_RESULTS = 4
RAG_PATIENT_SCOPES = {"infantojuvenil", "saude-mulher"}
KINDS_ACCEPTING_PATIENT_SCOPE = {
    "anamnesis", "refinement", "diagnosis", "diagnosis_review",
    "treatment", "treatment_review", "symptomatic", "return_plan", "return_assessment",
}
KINDS_REQUIRING_MENTION = {"medication", "medication_review", "medication_tips"}


def build_source_registry(allowed_kinds, web_contract, no_web_contract, guidelines_contract):
    return {
        "current": {
            "label": "IA Nuvem", "kinds": frozenset(allowed_kinds),
            "contract": web_contract, "contract_without_findings": no_web_contract,
            "no_evidence": None,
        },
        "rag": {
            "label": "RAG com literatura", "kinds": frozenset(allowed_kinds),
            "store_env": "OPENAI_RAG_VECTOR_STORE_ID",
            "scopes_by_kind": RAG_SCOPE_BY_KIND,
            "always_scopes_by_kind": RAG_ALWAYS_SCOPE_BY_KIND,
            "patient_scopes": frozenset(RAG_PATIENT_SCOPES),
            "patient_scope_kinds": frozenset(KINDS_ACCEPTING_PATIENT_SCOPE),
            "must_mention_kinds": frozenset(KINDS_REQUIRING_MENTION),
            "contract": "No modo RAG, use exclusivamente os excertos identificados como FONTES. "
                        "Nao complete lacunas com conhecimento proprio e nao atribua uma afirmacao a fonte que nao a sustente.",
            "fallback_with_web_findings": "current",
            "no_evidence": {
                "error": "A base RAG nao encontrou evidencia suficientemente relevante para responder com seguranca.",
                "code": "rag_insufficient_evidence",
            },
        },
        "guidelines": {
            "label": "Guidelines", "kinds": frozenset({"treatment", "return_plan"}),
            "store_env": GUIDELINES_ENV_KEY, "contract": guidelines_contract,
            "not_configured": {
                "error": "As diretrizes ainda nao foram indexadas. Rode scripts/ingest_guidelines.py e preencha "
                         f"{GUIDELINES_ENV_KEY} no .env.",
                "code": "guidelines_not_configured",
            },
            "outside_scope": {
                "error": "As diretrizes nao cobrem esta hipotese. O acervo e de psiquiatria, e responde a partir do "
                         "diagnostico assinalado -- confira se ha hipotese marcada.",
                "code": "guidelines_sem_cobertura",
            },
            "no_evidence": {
                "error": "As diretrizes nao cobrem este caso com relevancia suficiente para responder com seguranca.",
                "code": "guidelines_insufficient_evidence",
            },
        },
    }


def public_ai_sources(registry):
    return [{"id": source_id, "label": source["label"], "kinds": sorted(source["kinds"])}
            for source_id, source in registry.items()]
