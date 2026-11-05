import unittest

from ai_response_policy import usable_web_findings
from clinical_response_utils import diagnostic_group, parse_model_json, usage_fields
from clinical_text_utils import contradicts, normalize_name, sources_mentioning
from observability import decision_message


class PureModuleTests(unittest.TestCase):
    def test_model_json_accepts_incidental_text(self):
        self.assertEqual(parse_model_json('resposta: {"ok": true}'), {"ok": True})

    def test_usage_fields_is_metadata_only(self):
        self.assertEqual(
            usage_fields({
                "usage": {"input_tokens": 10, "output_tokens": 4,
                           "input_tokens_details": {"cached_tokens": 2}},
                "status": "completed",
                "incomplete_details": None,
            }),
            {"tokens_in": 10, "tokens_out": 4, "tokens_cache": 2,
             "status": "completed", "corte": None},
        )

    def test_diagnostic_group_rejects_non_list(self):
        with self.assertRaises(ValueError):
            diagnostic_group({"hypotheses": {}}, "hypotheses")

    def test_normalization_and_source_filter(self):
        self.assertEqual(normalize_name("Ácido valpróico"), "acido valproico")
        sources = [{"excerpt": "Bula de ácido valpróico"}, {"excerpt": "Guia de sertralina"}]
        self.assertEqual(sources_mentioning(sources, "valproico"), [sources[0]])

    def test_contradiction_detects_only_shared_trait(self):
        self.assertEqual(contradicts("episódio único grave", "episódio recorrente grave"), {"curso"})

    def test_web_findings_drop_empty_entries(self):
        self.assertEqual(usable_web_findings([{"text": "  "}, {"text": "fonte"}, "x"]), [{"text": "fonte"}])

    def test_decision_message_omits_empty_fields(self):
        self.assertEqual(decision_message({"id": "abc", "status": "", "tokens": 3}), "id=abc tokens=3")


if __name__ == "__main__":
    unittest.main()
