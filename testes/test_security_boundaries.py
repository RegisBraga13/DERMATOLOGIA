"""Regressões de isolamento entre o modo local e o servidor remoto."""
import os
import re
import unittest
import urllib.error
import urllib.request
from threading import Thread
from unittest.mock import patch

import server


class StaticAssetsTests(unittest.TestCase):
    def test_public_shell_and_modules(self):
        for parts in ((), ("index.html",), ("sw.js",), ("src", "App.js"),
                      ("src", "data", "protocol", "entrevista.json"),
                      ("fonts", "Outfit-Variable-latin.woff2")):
            self.assertTrue(server.is_public_asset(parts), parts)

    def test_private_project_files_and_directories(self):
        for parts in (("RAG.md",), ("scripts", "ingest_rag.py"), ("testes", "test_server.py"),
                      ("src",), ("src", "data"), ("supabase", "migrations", "prontuarios.sql"),
                      ("book_chapters.local.json",)):
            self.assertFalse(server.is_public_asset(parts), parts)

    def test_all_app_module_imports_are_served(self):
        """A allowlist precisa servir também os módulos importados em cascata."""
        pending = [server.ROOT / "src" / "App.js"]
        visited = set()
        while pending:
            source = pending.pop().resolve()
            if source in visited:
                continue
            visited.add(source)
            self.assertTrue(source.is_file(), source)
            self.assertTrue(server.is_public_asset(source.relative_to(server.ROOT).parts), source)
            text = source.read_text(encoding="utf-8")
            for path in re.findall(r'(?:\bfrom\s*|\bimport\s*)[\"\'](\.[^\"\']+)[\"\']', text):
                pending.append((source.parent / path).resolve())
        self.assertGreater(len(visited), 40)


class RemoteModeTests(unittest.TestCase):
    def test_public_bind_requires_auth_configuration(self):
        with patch.dict(os.environ, {"HOST": "0.0.0.0", "APP_MODE": "remote",
                                      "SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": ""}):
            with self.assertRaises(RuntimeError):
                server.validate_server_config()
            self.assertFalse(server.verify_supabase_user(type("Handler", (), {"headers": {}})()))

    def test_local_mode_cannot_bind_to_network(self):
        with patch.dict(os.environ, {"HOST": "0.0.0.0", "APP_MODE": "local"}):
            with self.assertRaises(ValueError):
                server.validate_server_config()

    def test_loopback_mode_keeps_local_operation(self):
        with patch.dict(os.environ, {"HOST": "127.0.0.1", "APP_MODE": "local",
                                      "SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": ""}):
            server.validate_server_config()
            self.assertTrue(server.verify_supabase_user(type("Handler", (), {"headers": {}})()))


class HttpBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.PrototypeHandler)
        cls.thread = Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def request_status(self, path):
        url = f"http://127.0.0.1:{self.httpd.server_port}{path}"
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                response.read()
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    def test_public_files_are_allowlisted(self):
        self.assertEqual(self.request_status("/src/App.js"), 200)
        self.assertEqual(self.request_status("/RAG.md"), 404)
        self.assertEqual(self.request_status("/scripts/"), 404)

    def test_book_chapter_requires_login_when_configured(self):
        with patch.dict(os.environ, {"SUPABASE_URL": "https://example.supabase.co",
                                      "SUPABASE_PUBLISHABLE_KEY": "public-test-key"}):
            self.assertEqual(self.request_status("/api/book-chapter?medicamento=teste"), 401)

    def test_http_log_omits_query_containing_clinical_text(self):
        with patch.object(server.logger, "info") as logged:
            self.assertEqual(self.request_status("/api/health?nome=SEGREDO_CLINICO"), 200)
        self.assertTrue(logged.called)
        self.assertNotIn("SEGREDO_CLINICO", str(logged.call_args_list))

    def test_browser_blocks_inline_scripts(self):
        url = f"http://127.0.0.1:{self.httpd.server_port}/index.html"
        with urllib.request.urlopen(url, timeout=3) as response:
            policy = response.headers["Content-Security-Policy"]
            html = response.read().decode("utf-8")
        self.assertIn("script-src 'self'", policy)
        self.assertIn("object-src 'none'", policy)
        self.assertNotIn("'unsafe-inline'", policy.split("script-src", 1)[1].split(";", 1)[0])
        self.assertNotIn("<script>", html)


if __name__ == "__main__":
    unittest.main()
