import json
import os
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from ai_dermatology_workflow import WorkflowResponseError, propose_dermatology_stage


class DermatologyWorkflowTests(unittest.TestCase):
    def test_hd_receives_only_saved_history_as_user_input(self):
        history = "História clínica revisada e salva pelo médico."

        def fake_response(request, **kwargs):
            body = json.loads(request.data)
            self.assertFalse(body["store"])
            self.assertIn(history, body["input"][1]["content"])
            self.assertIn("[caso-001]", body["input"][1]["content"])
            return {"output_text": json.dumps({"hypotheses": [{
                "name": "Hipótese em avaliação",
                "supporting_evidence_ids": ["caso-001"],
                "unassessed_evidence_ids": [],
            }]})}

        with patch("ai_dermatology_workflow.read_json_response", side_effect=fake_response):
            result = propose_dermatology_stage("hypotheses", history, "test-key")
        self.assertIn("Hipótese em avaliação", result["text"])

    def test_hd_rejects_evidence_ids_not_present_in_the_received_material(self):
        payload = {"hypotheses": [{
            "name": "Hipótese sem apoio",
            "supporting_evidence_ids": ["caso-999"],
            "unassessed_evidence_ids": [],
        }]}
        with patch("ai_dermatology_workflow.read_json_response", return_value={"output_text": json.dumps(payload)}):
            with self.assertRaises(WorkflowResponseError):
                propose_dermatology_stage("hypotheses", "História salva", "test-key")

    def test_plan_receives_only_saved_hd_as_user_input(self):
        hd = "HD revisada com incertezas e dados de segurança."

        def fake_response(request, **kwargs):
            self.assertEqual(json.loads(request.data)["input"][1]["content"], hd)
            return {"output_text": json.dumps({"text": "Confirmar hipótese antes de tratar", "uncertainties": ""})}

        with patch("ai_dermatology_workflow.read_json_response", side_effect=fake_response):
            result = propose_dermatology_stage("plan", hd, "test-key")
        self.assertIn("Confirmar", result["text"])

    def test_rejects_invalid_question_list(self):
        payload = {"questions": [{"question": "?", "reason": "", "red_flag": False}] * 9}
        with patch("ai_dermatology_workflow.read_json_response", return_value={"output_text": json.dumps(payload)}):
            with self.assertRaises(WorkflowResponseError):
                propose_dermatology_stage("lesion_questions", "Lesão", "test-key")

    def test_rejects_unknown_stage_and_empty_source(self):
        with self.assertRaises(ValueError):
            propose_dermatology_stage("psychiatry", "Lesão", "test-key")
        with self.assertRaises(ValueError):
            propose_dermatology_stage("history", "", "test-key")

    def test_local_http_route_validates_and_returns_proposal(self):
        from server import PrototypeHandler

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "APP_MODE": "local", "HOST": "127.0.0.1", "SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": ""}):
            with patch("server.propose_dermatology_stage", return_value={"text": "História revisável", "uncertainties": ""}) as proposer:
                httpd = ThreadingHTTPServer(("127.0.0.1", 0), PrototypeHandler)
                thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                thread.start()
                try:
                    url = f"http://127.0.0.1:{httpd.server_port}/api/dermatology-workflow"
                    request = urllib.request.Request(url, data=json.dumps({"kind": "history", "source": "Fonte aprovada"}).encode(),
                        headers={"Content-Type": "application/json"})
                    with urllib.request.urlopen(request, timeout=3) as response:
                        result = json.load(response)
                    self.assertEqual(result["proposal"]["text"], "História revisável")
                    self.assertEqual(proposer.call_args.args[:2], ("history", "Fonte aprovada"))
                finally:
                    httpd.shutdown()
                    httpd.server_close()
                    thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
