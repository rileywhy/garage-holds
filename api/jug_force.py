"""Jug Force Lab on Vercel: one Python function behind /api/jug_force.

An unlisted page (/jug-force-lab) that loads a Jug Lab hold on a wall
and shows where the force goes. GET returns the schema, POST the analysis;
the contract lives in tools/jug-force-lab/contract.py and is shared with
the local server.
"""

import importlib
import json
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Namespace import keeps this tool's modules apart from the labs'.
contract = importlib.import_module("tools.jug-force-lab.contract")


class handler(BaseHTTPRequestHandler):
    def send(self, status, body):
        body = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.send(200, contract.schema())

    def do_POST(self):
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send(415, dict(error="Send settings as JSON."))
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= contract.MAX_BODY:
            self.send(400, dict(error="Settings must be between 1 byte and 16 KB."))
            return
        try:
            self.send(*contract.analyze(self.rfile.read(length)))
        except Exception:
            import traceback

            traceback.print_exc()
            self.send(500, dict(error="The analysis failed unexpectedly."))

    def log_message(self, format, *args):
        pass
