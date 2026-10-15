"""The decimation, and the hosted handler against a stand-in bucket."""

import io
import json
import os
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from decimate import simplify_stl
from serve_api import load_handler


def big_stl(subdivisions=6):
    """A binary STL of an icosphere: 5 subdivisions is 20k faces, 6 is 82k."""
    return trimesh.creation.icosphere(subdivisions=subdivisions).export(file_type="stl")


class DecimateTests(unittest.TestCase):
    def test_simplifies_to_the_target_and_stays_closed(self):
        source = big_stl(6)
        copy, count = simplify_stl(source, 20_000)
        self.assertLessEqual(count, 20_000)
        self.assertGreater(count, 15_000)
        mesh = trimesh.load(io.BytesIO(copy), file_type="stl")
        self.assertEqual(len(mesh.faces), count)
        self.assertTrue(mesh.is_watertight)
        # The shape survives: a unit sphere's extents stay about 2.
        for extent in mesh.extents:
            self.assertAlmostEqual(extent, 2.0, delta=0.05)
        self.assertLess(len(copy), len(source) / 3)

    def test_a_small_mesh_is_kept_and_an_empty_one_refused(self):
        source = big_stl(3)
        copy, count = simplify_stl(source, 150_000)
        self.assertEqual(count, 1280)
        self.assertEqual(len(copy), 84 + 50 * 1280)
        with self.assertRaises(ValueError):
            simplify_stl(b"solid nothing\nendsolid nothing\n")


class Bucket(BaseHTTPRequestHandler):
    """Serves one object at /source and takes one PUT at /target."""

    source = b""
    stored = {}

    def do_GET(self):
        if self.path != "/source":
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(len(self.source)))
        self.end_headers()
        self.wfile.write(self.source)

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", "0"))
        Bucket.stored[self.path] = (self.rfile.read(length), self.headers.get("Content-Type"))
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, format, *args):
        pass


class QuietHandler(load_handler()):
    def log_message(self, format, *args):
        pass


class HostedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["PREVIEW_SECRET"] = "test-secret"
        Bucket.source = big_stl(6)
        cls.bucket = ThreadingHTTPServer(("127.0.0.1", 0), Bucket)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        for server in (cls.bucket, cls.server):
            threading.Thread(target=server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        for server in (cls.bucket, cls.server):
            server.shutdown()
            server.server_close()

    def request(self, body, secret="test-secret"):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=60)
        headers = {"Content-Type": "application/json"}
        if secret is not None:
            headers["Authorization"] = f"Bearer {secret}"
        connection.request("POST", "/api/preview_mesh", body, headers)
        response = connection.getresponse()
        result = response.status, json.loads(response.read())
        connection.close()
        return result

    def bucket_url(self, path):
        return f"http://127.0.0.1:{self.bucket.server_port}{path}"

    def test_downloads_simplifies_and_uploads(self):
        status, body = self.request(
            json.dumps(
                dict(source=self.bucket_url("/source"), target=self.bucket_url("/target"), triangles=20_000)
            )
        )
        self.assertEqual(status, 200, body)
        self.assertLessEqual(body["triangles"], 20_000)
        data, content_type = Bucket.stored["/target"]
        self.assertEqual(len(data), body["bytes"])
        self.assertEqual(content_type, "application/octet-stream")
        self.assertEqual(len(trimesh.load(io.BytesIO(data), file_type="stl").faces), body["triangles"])

    def test_refusals(self):
        good = dict(source=self.bucket_url("/source"), target=self.bucket_url("/target"))
        self.assertEqual(self.request(json.dumps(good), secret="wrong")[0], 401)
        self.assertEqual(self.request(json.dumps(good), secret=None)[0], 401)
        self.assertEqual(self.request("{")[0], 400)
        self.assertEqual(self.request(json.dumps(dict(good, triangles="many")))[0], 400)
        self.assertEqual(self.request(json.dumps(dict(good, source="ftp://x/y")))[0], 400)
        self.assertEqual(self.request(json.dumps(dict(good, source=self.bucket_url("/missing"))))[0], 502)


if __name__ == "__main__":
    unittest.main()
