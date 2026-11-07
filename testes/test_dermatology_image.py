import base64
import json
import os
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from ai_dermatology_image import IMAGE_FIELDS, ImageResponseError, analyze_dermatology_image, validate_image_data_url


PNG = b"\x89PNG\r\n\x1a\n" + b"synthetic-test"
DATA_URL = "data:image/png;base64," + base64.b64encode(PNG).decode("ascii")


class DermatologyImageTests(unittest.TestCase):
    def test_rejects_mismatched_image_type_and_non_image_data(self):
        with self.assertRaises(ValueError):
            validate_image_data_url(DATA_URL.replace("image/png", "image/jpeg"))
        with self.assertRaises(ValueError):
            validate_image_data_url("data:image/svg+xml;base64," + base64.b64encode(PNG).decode("ascii"))

    def test_sends_image_without_storing_response_and_requires_structured_fields(self):
        expected = {key: "" for key in IMAGE_FIELDS}
        expected["morfologia"] = "Mácula aparente"

        def fake_response(request, **kwargs):
            body = json.loads(request.data)
            self.assertFalse(body["store"])
            self.assertEqual(body["input"][1]["content"][1]["image_url"], DATA_URL)
            self.assertIn("Não dê diagnóstico", body["input"][0]["content"])
            return {"output_text": json.dumps(expected)}

        with patch("ai_dermatology_image.read_json_response", side_effect=fake_response):
            result = analyze_dermatology_image(DATA_URL, "test-key")
        self.assertEqual(result["morfologia"], "Mácula aparente")

    def test_rejects_incomplete_model_response(self):
        with patch("ai_dermatology_image.read_json_response", return_value={"output_text": '{"morfologia":"pápula"}'}):
            with self.assertRaises(ImageResponseError):
                analyze_dermatology_image(DATA_URL, "test-key")

    def test_local_http_endpoint_returns_proposal(self):
        from server import PrototypeHandler

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key", "APP_MODE": "local", "HOST": "127.0.0.1", "SUPABASE_URL": "", "SUPABASE_PUBLISHABLE_KEY": ""}):
            with patch("server.analyze_dermatology_image", return_value={"morfologia": "Mácula aparente"}) as analyzer:
                httpd = ThreadingHTTPServer(("127.0.0.1", 0), PrototypeHandler)
                thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                thread.start()
                try:
                    url = f"http://127.0.0.1:{httpd.server_port}/api/dermatology-image"
                    request = urllib.request.Request(url, data=json.dumps({"image": DATA_URL}).encode(), headers={"Content-Type": "application/json"})
                    with urllib.request.urlopen(request, timeout=3) as response:
                        result = json.load(response)
                    self.assertEqual(result["description"]["morfologia"], "Mácula aparente")
                    self.assertEqual(analyzer.call_args.args[0], DATA_URL)
                finally:
                    httpd.shutdown()
                    httpd.server_close()
                    thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
