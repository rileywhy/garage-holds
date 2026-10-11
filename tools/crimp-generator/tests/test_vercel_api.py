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
from serve_api import load_handler


class QuietHandler(load_handler()):
    def log_message(self, format, *args):
        pass


class VercelApiTests(unittest.TestCase):
    """The hosted entrypoint in api/crimp.py, served the way serve_api.py does."""

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

    def request(self, method, body=None, content_type="application/json"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=30)
        connection.request(method, "/api/crimp", body, {"Content-Type": content_type})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_schema_preview_validate_and_stl(self):
        code, _, body = self.request("GET")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["defaults"]["screw_count"], 3)
        count = next(
            control
            for control in json.loads(body)["controls"]
            if control["key"] == "screw_count"
        )
        self.assertEqual(count["min"], 2)

        code, _, body = self.request(
            "POST", json.dumps({"action": "preview", "parameters": {}})
        )
        self.assertEqual(code, 200)
        data = json.loads(body)
        self.assertTrue(data["watertight"])
        self.assertEqual(len(data["material_grams"]), 2)
        self.assertLess(data["material_grams"][0], data["material_grams"][1])
        self.assertEqual(data["design"]["generator"], "garage-holds-crimp")

        code, _, body = self.request(
            "POST", json.dumps({"action": "validate", "parameters": {"width": 90}})
        )
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["parameters"]["width"], 90)

        code, headers, body = self.request(
            "POST",
            json.dumps({"action": "stl", "parameters": data["design"]["parameters"]}),
        )
        self.assertEqual(code, 200)
        self.assertEqual(headers["Content-Type"], "model/stl")
        mesh = trimesh.load(io.BytesIO(body), file_type="stl")
        self.assertTrue(mesh.is_watertight)

    def test_bad_requests(self):
        self.assertEqual(self.request("POST", "{}", "text/plain")[0], 415)
        for body in (
            "{",
            "[]",
            '{"action":"nope"}',
            '{"action":"preview","parameters":{"width":1}}',
            '{"action":"validate","parameters":{"screw_count":1}}',
        ):
            with self.subTest(body=body):
                self.assertEqual(self.request("POST", body)[0], 400)


if __name__ == "__main__":
    unittest.main()
