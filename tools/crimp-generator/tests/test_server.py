import io
import json
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Handler, cached_model


class QuietHandler(Handler):
    def log_message(self, format, *args):
        pass


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cached_model.cache_clear()

    def request(self, path, body=None, headers=None, method=None):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=10)
        connection.request(
            method or ("POST" if body is not None else "GET"),
            path,
            body,
            {"Content-Type": "application/json"} | (headers or {}),
        )
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_schema_preview_and_export_contract(self):
        code, _, body = self.request("/api/schema")
        self.assertEqual(code, 200)
        schema = json.loads(body)
        self.assertTrue(schema["defaults"]["screws"])
        self.assertEqual(schema["defaults"]["screw_count"], 3)
        code, _, body = self.request("/api/preview", "{}")
        self.assertEqual(code, 200)
        data = json.loads(body)
        self.assertTrue(data["watertight"])
        self.assertEqual(len(data["screws"]), 3)
        self.assertEqual(data["design"]["units"], "mm")
        code, headers, body = self.request(
            "/api/stl", json.dumps(data["design"]["parameters"])
        )
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "model/stl")
        self.assertIn("attachment;", headers["Content-Disposition"])
        mesh = trimesh.load(io.BytesIO(body), file_type="stl")
        self.assertTrue(mesh.is_watertight)
        self.assertGreater(mesh.volume, 0)

    def test_invalid_requests_and_asset_allowlist(self):
        for body in ("{", "[]", '{"width":null}', '{"width":true}', "{}" * 9000):
            with self.subTest(body=body[:30]):
                self.assertEqual(self.request("/api/preview", body)[0], 400)
        self.assertEqual(
            self.request("/api/preview", "{}", {"Content-Type": "text/plain"})[0], 415
        )
        for path in ("/../parameters.py", "/parameters.py", "/api/unknown"):
            self.assertEqual(self.request(path)[0], 404)
        self.assertEqual(self.request("/")[0], 200)

    def test_other_websites_cannot_trigger_generation(self):
        self.assertEqual(
            self.request("/api/preview", "{}", {"Origin": "https://example.com"})[0],
            403,
        )
        self.assertEqual(
            self.request("/api/schema", headers={"Host": "example.com"})[0], 403
        )
        local = f"http://127.0.0.1:{self.server.server_port}"
        self.assertEqual(self.request("/api/validate", "{}", {"Origin": local})[0], 200)


if __name__ == "__main__":
    unittest.main()
