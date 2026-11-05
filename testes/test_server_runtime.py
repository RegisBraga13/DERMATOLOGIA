import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from server_runtime import PostRateLimiter, client_key, request_id


class RuntimeTests(unittest.TestCase):
    def test_request_id_rejects_values_that_would_pollute_logs(self):
        self.assertEqual(request_id("consulta-42"), "consulta-42")
        self.assertNotIn("\n", request_id("ruim\nINFO senha"))

    def test_proxy_header_is_ignored_by_default(self):
        handler = SimpleNamespace(headers={"X-Forwarded-For": "203.0.113.8"}, client_address=("192.0.2.4", 8000))
        with patch.dict(os.environ, {"TRUST_PROXY_HEADERS": "0"}, clear=False):
            self.assertEqual(client_key(handler), "192.0.2.4")

    def test_trusted_proxy_header_can_be_used(self):
        handler = SimpleNamespace(headers={"X-Forwarded-For": "203.0.113.8, 192.0.2.4"}, client_address=("127.0.0.1", 8000))
        with patch.dict(os.environ, {"TRUST_PROXY_HEADERS": "1"}, clear=False):
            self.assertEqual(client_key(handler), "203.0.113.8")

    def test_rate_limit_expires_and_is_per_client(self):
        limiter = PostRateLimiter(window_seconds=10, max_posts=2)
        first = SimpleNamespace(headers={}, client_address=("192.0.2.1", 8000))
        second = SimpleNamespace(headers={}, client_address=("192.0.2.2", 8000))
        self.assertFalse(limiter.limited(first, now=0))
        self.assertFalse(limiter.limited(first, now=1))
        self.assertTrue(limiter.limited(first, now=2))
        self.assertFalse(limiter.limited(second, now=2))
        self.assertFalse(limiter.limited(first, now=10))


if __name__ == "__main__":
    unittest.main()
