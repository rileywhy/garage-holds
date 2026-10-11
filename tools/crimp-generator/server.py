"""Loopback-only GUI server. Run `python server.py`; no web framework needed."""

import argparse
import json
import threading
import webbrowser
from dataclasses import asdict
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from geometry import build
from parameters import design_document, parse_parameters, schema

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
ASSETS = {
    "/": (ROOT / "web/index.html", "text/html; charset=utf-8"),
    "/app.js": (ROOT / "web/app.js", "text/javascript; charset=utf-8"),
    "/viewer.js": (ROOT / "web/viewer.js", "text/javascript; charset=utf-8"),
    "/style.css": (ROOT / "web/style.css", "text/css; charset=utf-8"),
    "/vendor/three.module.js": (
        PROJECT / "node_modules/three/build/three.module.js",
        "text/javascript",
    ),
    "/vendor/three.core.js": (
        PROJECT / "node_modules/three/build/three.core.js",
        "text/javascript",
    ),
    "/vendor/OrbitControls.js": (
        PROJECT / "node_modules/three/examples/jsm/controls/OrbitControls.js",
        "text/javascript",
    ),
    "/vendor/BufferGeometryUtils.js": (
        PROJECT / "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
        "text/javascript",
    ),
}
BUILD_LOCK = threading.Lock()


@lru_cache(maxsize=8)
def cached_model(parameters, quality):
    return build(parameters, quality)


class Handler(BaseHTTPRequestHandler):
    server_version = "CrimpLab/1"

    def send(self, status, body, content_type="application/json", filename=None):
        if isinstance(body, dict):
            body = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        if filename:
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"'
            )
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A superseded slider request can be cancelled by the GUI.

    def trusted_request(self):
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if self.headers.get("Host") not in hosts:
            self.send(403, dict(error="This tool only accepts local requests."))
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://{host}" for host in hosts}:
            self.send(403, dict(error="Requests from another website are not allowed."))
            return False
        return True

    def do_GET(self):
        if not self.trusted_request():
            return
        if self.path == "/api/schema":
            self.send(200, schema())
        elif self.path in ASSETS:
            path, content_type = ASSETS[self.path]
            if not path.is_file():
                self.send(
                    503,
                    dict(
                        error="Preview assets are missing. Run npm ci in the project folder."
                    ),
                )
            else:
                self.send(200, path.read_bytes(), content_type)
        elif self.path == "/favicon.ico":
            self.send(204, b"")
        else:
            self.send(404, dict(error="Not found."))

    def do_POST(self):
        if not self.trusted_request():
            return
        if self.path not in {"/api/preview", "/api/stl", "/api/validate"}:
            self.send(404, dict(error="Not found."))
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send(415, dict(error="Send settings as JSON."))
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
                raise ValueError("Settings must be between 1 byte and 16 KB.")
            p = parse_parameters(json.loads(self.rfile.read(length)))
            if self.path == "/api/validate":
                self.send(200, dict(parameters=asdict(p)))
                return
            with BUILD_LOCK:
                model = cached_model(
                    p, "export" if self.path == "/api/stl" else "preview"
                )
                body = (
                    model.mesh.export(file_type="stl")
                    if self.path == "/api/stl"
                    else model.preview() | dict(design=design_document(p))
                )
            if self.path == "/api/stl":
                filename = f"crimp-{p.edge_depth:g}mm-{p.incut:g}deg.stl"
                self.send(200, body, "model/stl", filename)
            else:
                self.send(200, body)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send(400, dict(error=str(error)))
        except Exception:
            # Unexpected faults are visible in the terminal, not hidden as a
            # successful preview or exposed with local paths in the browser.
            import traceback

            traceback.print_exc()
            self.send(
                500,
                dict(
                    error="The build failed unexpectedly. Details are in the Python terminal."
                ),
            )

    def log_message(self, format, *args):
        if str(args[1]) not in {"200", "204"}:
            super().log_message(format, *args)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    if not ASSETS["/vendor/three.module.js"][0].is_file():
        parser.error(
            "Run npm ci in the Garage Holds project first; the viewer uses its Three.js dependency."
        )
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    except OSError as error:
        parser.error(f"Could not start local server: {error}. Try --port 8766.")
    url = f"http://127.0.0.1:{args.port}"
    print(f"Garage Holds / Crimp Lab: {url}\nPress Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
