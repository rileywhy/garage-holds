"""Exercise the deployed Python entry point, including namespaced imports."""

import json
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from serve_api import load_handler


class HostedTests(unittest.TestCase):
    def test_hosted_contract(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), load_handler())
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        def request(body=None):
            connection = HTTPConnection("127.0.0.1", server.server_port, timeout=20)
            connection.request(
                "POST" if body else "GET",
                "/api/jug",
                json.dumps(body) if body else None,
                {"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            status, data = response.status, response.read()
            connection.close()
            return status, data

        try:
            status, body = request()
            self.assertEqual(status, 200)
            schema = json.loads(body)
            self.assertEqual(
                set(schema["presets"]), {"board jug", "deep jug", "two-handed jug"}
            )
            status, body = request(
                dict(action="preview", parameters=schema["defaults"])
            )
            self.assertEqual(status, 200)
            preview = json.loads(body)
            self.assertTrue(preview["watertight"])
            self.assertEqual(preview["design"]["generator"], "garage-holds-jug")
            self.assertEqual(preview["design"]["version"], 2)
            status, data = request(
                dict(action="stl", parameters=preview["design"]["parameters"])
            )
            self.assertEqual(status, 200)
            self.assertGreater(len(data), 1000)
            self.assertEqual(request(dict(action="unknown"))[0], 400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
