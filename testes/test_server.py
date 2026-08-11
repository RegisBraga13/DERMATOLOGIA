"""Testes unitarios basicos do server.py.

Cobrem o comportamento que foi corrigido/adicionado nas revisoes recentes
(exposicao de .env, CSRF, multipart de audio, parsing de JSON do modelo,
validacao de schema) para garantir que ele nao regrida em mudancas futuras.

Usa so a biblioteca padrao (unittest) -- nao precisa instalar nada.

Rodar a partir da raiz do projeto:
    python3 -m unittest discover -s testes -v
ou so este arquivo:
    python3 -m unittest testes.test_server -v
"""
import json
import logging
import sys
import unittest
import urllib.error
import urllib.request
from http.client import HTTPConnection
from pathlib import Path
from threading import Thread
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402  (precisa do sys.path acima)


class FakeHandler:
    """Confere so o que is_same_origin le: self.headers."""

    def __init__(self, headers):
        self.headers = headers


class IsBlockedPathTests(unittest.TestCase):
    """GET /.env vazava a OPENAI_API_KEY antes da correcao -- estes testes
    travam esse comportamento no lugar."""

    def test_blocks_env_file(self):
        self.assertTrue(server.is_blocked_path((".env",)))

    def test_blocks_env_variants_by_prefix(self):
        self.assertTrue(server.is_blocked_path((".env.local",)))
        self.assertTrue(server.is_blocked_path((".env.production",)))

    def test_blocks_git_directory_contents(self):
        self.assertTrue(server.is_blocked_path((".git", "config")))

    def test_blocks_python_source_and_secrets(self):
        self.assertTrue(server.is_blocked_path(("server.py",)))
        self.assertTrue(server.is_blocked_path(("chave.pem",)))
        self.assertTrue(server.is_blocked_path(("chave.key",)))

    def test_blocks_rag_sources_local(self):
        self.assertTrue(server.is_blocked_path(("rag_sources.local.json",)))

    def test_blocks_patient_audio(self):
        self.assertTrue(server.is_blocked_path(("testes", "gravacao.m4a")))

    def test_allows_normal_static_assets(self):
        self.assertFalse(server.is_blocked_path(("index.html",)))
        self.assertFalse(server.is_blocked_path(("src", "App.js")))
        self.assertFalse(server.is_blocked_path(("src", "styles", "theme.css")))
        self.assertFalse(server.is_blocked_path(("fonts", "Outfit-Variable.woff2")))

    def test_case_insensitive(self):
        self.assertTrue(server.is_blocked_path((".ENV",)))
        self.assertTrue(server.is_blocked_path(("SERVER.PY",)))


class IsSameOriginTests(unittest.TestCase):
    """POST /api/clinical-ai sem esta checagem aceitava CSRF de qualquer site
    aberto no navegador do medico."""

    def test_same_origin_passes(self):
        handler = FakeHandler({"Origin": "http://127.0.0.1:8000", "Host": "127.0.0.1:8000"})
        self.assertTrue(server.is_same_origin(handler))

    def test_cross_origin_blocked(self):
        handler = FakeHandler({"Origin": "https://site-malicioso.example", "Host": "127.0.0.1:8000"})
        self.assertFalse(server.is_same_origin(handler))

    def test_missing_origin_allowed(self):
        # curl, healthcheck local, alguns navegadores antigos em same-origin.
        handler = FakeHandler({"Host": "127.0.0.1:8000"})
        self.assertTrue(server.is_same_origin(handler))

    def test_malformed_origin_blocked(self):
        handler = FakeHandler({"Origin": "://invalido", "Host": "127.0.0.1:8000"})
        self.assertFalse(server.is_same_origin(handler))


class OpenAIMultipartTests(unittest.TestCase):
    """Monta o corpo multipart enviado para a API de transcricao de audio."""

    def test_includes_fields_and_file_part(self):
        body, boundary = server.openai_multipart(
            {"model": "gpt-4o-transcribe-diarize", "language": "pt"},
            "file",
            "consulta.webm",
            "audio/webm",
            b"\x00\x01dados-de-audio",
        )
        text = body.decode("latin-1")
        self.assertIn(boundary, text)
        self.assertIn('name="model"', text)
        self.assertIn("gpt-4o-transcribe-diarize", text)
        self.assertIn('name="file"; filename="consulta.webm"', text)
        self.assertIn("Content-Type: audio/webm", text)
        self.assertTrue(body.endswith(f"--{boundary}--\r\n".encode()))

    def test_sanitizes_path_traversal_in_filename(self):
        _, _ = server.openai_multipart({}, "file", "x", "audio/webm", b"")  # smoke
        body, _ = server.openai_multipart(
            {}, "file", "../../etc/passwd", "audio/webm", b"a",
        )
        text = body.decode("latin-1")
        self.assertIn('filename="passwd"', text)
        self.assertNotIn("..", text)

    def test_falls_back_to_default_filename_when_empty(self):
        body, _ = server.openai_multipart({}, "file", "", "audio/webm", b"a")
        self.assertIn('filename="consulta.webm"', body.decode("latin-1"))

    def test_strips_quotes_from_filename(self):
        body, _ = server.openai_multipart({}, "file", 'mal"icioso.webm', "audio/webm", b"a")
        text = body.decode("latin-1")
        self.assertIn('filename="malicioso.webm"', text)


class DiarizedTranscriptionTests(unittest.TestCase):
    """Parsing da resposta da API de transcricao -- sem chamada de rede real."""

    def _mock_response(self, payload):
        response = MagicMock()
        response.read.return_value = json.dumps(payload).encode("utf-8")
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        return response

    def test_parses_segments_with_speakers(self):
        payload = {
            "text": "ola doutor. como vai.",
            "duration": 5.4321,
            "segments": [
                {"speaker": "medico", "start": 0, "end": 1.999, "text": " ola doutor "},
                {"speaker": "paciente", "start": 2, "end": 4, "text": "como vai"},
                {"speaker": "medico", "start": 4, "end": 4, "text": "   "},  # vazio -> descartado
            ],
        }
        with patch.object(server.urllib.request, "urlopen", return_value=self._mock_response(payload)):
            result = server.diarized_transcription(b"audio", "c.webm", "audio/webm", "fake-key")

        self.assertEqual(result["text"], "ola doutor. como vai.")
        self.assertEqual(result["duration"], 5.43)
        self.assertEqual(len(result["segments"]), 2)
        self.assertEqual(result["segments"][0]["speaker"], "medico")
        self.assertEqual(result["segments"][0]["text"], "ola doutor")
        self.assertEqual(result["segments"][1]["speaker"], "paciente")

    def test_falls_back_to_full_text_when_no_segments(self):
        payload = {"text": "transcricao unica sem diarizacao", "duration": 3, "segments": []}
        with patch.object(server.urllib.request, "urlopen", return_value=self._mock_response(payload)):
            result = server.diarized_transcription(b"audio", "c.webm", "audio/webm", "fake-key")

        self.assertEqual(len(result["segments"]), 1)
        self.assertEqual(result["segments"][0]["speaker"], "?")
        self.assertEqual(result["segments"][0]["text"], "transcricao unica sem diarizacao")


class ParseModelJsonTests(unittest.TestCase):

    def test_parses_plain_json(self):
        self.assertEqual(server.parse_model_json('{"a": 1}'), {"a": 1})

    def test_parses_json_with_surrounding_prose_or_fences(self):
        text = 'Aqui esta:\n```json\n{"a": 1, "b": [2, 3]}\n```\nFim.'
        self.assertEqual(server.parse_model_json(text), {"a": 1, "b": [2, 3]})

    def test_raises_on_no_json_present(self):
        with self.assertRaises(json.JSONDecodeError):
            server.parse_model_json("nao ha json nenhum aqui")


class ValidateResultTests(unittest.TestCase):

    def test_anamnesis_valid(self):
        result = {"chief_complaint": "texto", "hda": "texto", "medical_history": "texto", "symptoms": ["a"]}
        self.assertEqual(server.validate_result("anamnesis", result), result)

    def test_anamnesis_rejects_wrong_type_on_narrative_field(self):
        with self.assertRaises(ValueError):
            server.validate_result("anamnesis", {"chief_complaint": ["nao deveria ser lista"]})

    def test_diagnosis_requires_exact_option_counts(self):
        good_option = {"name": "x", "cid11": "y", "dsm5tr": "z"}
        result = {
            "syndromic_options": [good_option] * 3,
            "nosological_options": [good_option] * 3,
            "etiological_options": [good_option] * 2,
        }
        self.assertEqual(server.validate_result("diagnosis", result), result)

    def test_diagnosis_rejects_wrong_option_count(self):
        with self.assertRaises(ValueError):
            server.validate_result("diagnosis", {
                "syndromic_options": [{"name": "x", "cid11": "y", "dsm5tr": "z"}],  # deveria ter 3
                "nosological_options": [],
                "etiological_options": [],
            })

    def test_refinement_requires_three_to_eight_questions(self):
        with self.assertRaises(ValueError):
            server.validate_result("refinement", {
                "questions": [{"prompt": "p", "options": ["a", "b"]}],  # so 1, precisa 3-8
                "red_flags": [], "observations": [], "important_points": [],
            })


class PlainTextFromResultTests(unittest.TestCase):

    def test_anamnesis_format(self):
        text = server.plain_text_from_result("anamnesis", {"chief_complaint": "tristeza", "hda": "dois meses"})
        self.assertEqual(text, "QP: tristeza\nHDA: dois meses")

    def test_medication_format_includes_all_sections(self):
        result = {
            "medication": "Sertralina",
            "dose_progression": "50mg -> 100mg",
            "side_effects": "nausea",
            "notes": "acompanhar em 4 semanas",
        }
        text = server.plain_text_from_result("medication", result)
        for expected in ("Sertralina", "50mg -> 100mg", "nausea", "acompanhar em 4 semanas"):
            self.assertIn(expected, text)


class ServerIntegrationTests(unittest.TestCase):
    """Sobe o servidor real numa porta livre e bate nos endpoints -- confere
    de ponta a ponta que a blindagem de arquivos e o CSRF continuam no ar."""

    @classmethod
    def setUpClass(cls):
        logging.disable(logging.CRITICAL)
        cls._original_cwd = Path.cwd()
        import os
        os.chdir(server.ROOT)
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.PrototypeHandler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        import os
        os.chdir(cls._original_cwd)
        logging.disable(logging.NOTSET)

    def _get(self, path):
        return urllib.request.urlopen(f"http://127.0.0.1:{self.port}{path}", timeout=5)

    def test_env_file_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/.env")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_git_config_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/.git/config")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_server_py_is_blocked(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self._get("/server.py")
        self.addCleanup(ctx.exception.close)
        self.assertEqual(ctx.exception.code, 404)

    def test_index_html_is_served(self):
        response = self._get("/index.html")
        self.assertEqual(response.status, 200)

    def test_health_endpoint(self):
        response = self._get("/api/health")
        payload = json.loads(response.read().decode("utf-8"))
        self.assertTrue(payload["ok"])
        self.assertIn("hasApiKey", payload)

    def test_cross_origin_post_is_rejected_with_403(self):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request(
                "POST",
                "/api/clinical-ai",
                body=json.dumps({"kind": "anamnesis"}),
                headers={
                    "Content-Type": "application/json",
                    "Origin": "https://site-malicioso.example",
                },
            )
            response = conn.getresponse()
            self.assertEqual(response.status, 403)
        finally:
            conn.close()

    def test_unknown_api_path_is_404(self):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            conn.request("POST", "/api/rota-inexistente", body="{}", headers={"Content-Type": "application/json"})
            response = conn.getresponse()
            self.assertEqual(response.status, 404)
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
