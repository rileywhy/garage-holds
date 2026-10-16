"""Preview copies of big STLs on Vercel: one Python function behind
/api/preview_mesh (RIL-87).

The app calls it after a design publishes, and from the nightly sweep,
with two signed R2 URLs: a GET for the original and a PUT for the copy.
The bytes never pass through the call (Vercel caps request and response
bodies at 4.5 MB): the function downloads, simplifies, and uploads.

POST {"source": url, "target": url, "triangles": n} with
`Authorization: Bearer <PREVIEW_SECRET>`; answers {"triangles", "bytes"}.
"""

import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools/mesh-preview"))

from decimate import DEFAULT_TARGET_TRIANGLES, simplify_stl  # noqa: E402

MAX_BODY = 4096
MAX_SOURCE_BYTES = 100 * 1024 * 1024
FETCH_TIMEOUT_S = 25


def authorized(header, secret):
    if not secret or not header or not header.startswith("Bearer "):
        return False
    return hmac.compare_digest(header[len("Bearer ") :].encode(), secret.encode())


def signed_url(value):
    """A URL the app signed: https anywhere, or http on loopback for `next dev`."""
    if not isinstance(value, str):
        raise ValueError("source and target must be URLs.")
    parts = urlsplit(value)
    local = parts.hostname in ("127.0.0.1", "localhost")
    if parts.scheme != "https" and not (parts.scheme == "http" and local):
        raise ValueError("source and target must be https URLs.")
    return value


def download(url):
    with urllib.request.urlopen(url, timeout=FETCH_TIMEOUT_S) as response:
        data = response.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError("The model is too large to simplify.")
    return data


def upload(url, data):
    request = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(data)),
        },
    )
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_S) as response:
        if response.status // 100 != 2:
            raise urllib.error.HTTPError(url, response.status, "upload refused", {}, None)


class handler(BaseHTTPRequestHandler):  # noqa: N801 (Vercel's expected name)
    def send(self, status, body):
        payload = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.send(405, dict(error="POST a source URL, a target URL and a triangle count."))

    def do_POST(self):
        if not authorized(self.headers.get("Authorization"), os.environ.get("PREVIEW_SECRET")):
            self.send(401, dict(error="Unauthorized"))
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                raise ValueError("The request must be between 1 byte and 4 KB.")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Send an object with source, target and triangles.")
            source = signed_url(request.get("source"))
            target = signed_url(request.get("target"))
            triangles = request.get("triangles", DEFAULT_TARGET_TRIANGLES)
            if isinstance(triangles, bool) or not isinstance(triangles, int):
                raise ValueError("triangles must be a whole number.")
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send(400, dict(error=str(error)))
            return
        try:
            data = download(source)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            self.send(502, dict(error=f"Could not fetch the model: {error}"))
            return
        try:
            copy, count = simplify_stl(data, triangles)
        except ValueError as error:
            self.send(400, dict(error=str(error)))
            return
        except Exception:
            import traceback

            traceback.print_exc()
            self.send(500, dict(error="Simplifying the model failed unexpectedly."))
            return
        try:
            upload(target, copy)
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            self.send(502, dict(error=f"Could not store the preview: {error}"))
            return
        self.send(200, dict(triangles=count, bytes=len(copy)))

    def log_message(self, format, *args):
        pass
