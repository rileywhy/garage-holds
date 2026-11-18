"""Jug Force Lab API for local development. Loopback only.

On Vercel, api/jug_force.py answers /api/jug_force. Locally, run

    python tools/jug-force-lab/server.py

and start the site with JUG_FORCE_API_URL=http://127.0.0.1:8799 to get the
same route at /jug-force-lab.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import contract

ROUTE = "/api/jug_force"


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] != ROUTE:
            return self._send(404, {"error": "Not found."})
        self._send(200, contract.schema())

    def do_POST(self):
        if self.path.split("?")[0] != ROUTE:
            return self._send(404, {"error": "Not found."})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= contract.MAX_BODY:
            return self._send(413, {"error": "Settings must be between 1 byte and 16 KB."})
        self._send(*contract.analyze(self.rfile.read(length)))

    def log_message(self, *args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8799)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Jug Force Lab API: http://127.0.0.1:{args.port}{ROUTE}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
