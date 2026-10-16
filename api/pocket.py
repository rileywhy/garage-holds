"""Pocket Lab on Vercel: one Python function behind /api/pocket.

GET returns the control schema; POST takes {"action": "preview" | "stl" |
"validate", "parameters": {...}}. The geometry and parameter contract live
in tools/pocket-generator and are shared with the local server, so a design
saved from one loads in the other.
"""

import importlib
import json
import sys
from dataclasses import asdict
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Namespace imports keep this engine separate from Crimp Lab's modules.
engine = importlib.import_module("tools.pocket-generator.geometry")
contract = importlib.import_module("tools.pocket-generator.parameters")

MAX_BODY = 16384


@lru_cache(maxsize=8)
def cached_model(parameters, quality):
    return engine.build(parameters, quality)


class handler(BaseHTTPRequestHandler):
    def send(self, status, body, content_type="application/json", filename=None):
        if isinstance(body, dict):
            body = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if filename:
            self.send_header(
                "Content-Disposition", f'attachment; filename="{filename}"'
            )
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
            if not 0 < length <= MAX_BODY:
                raise ValueError("Settings must be between 1 byte and 16 KB.")
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                raise ValueError("Send an object with action and parameters.")
            action = request.get("action")
            if action not in {"preview", "stl", "validate"}:
                raise ValueError("Unknown action.")
            p = contract.parse_parameters(request.get("parameters", {}))
            if action == "validate":
                self.send(200, dict(parameters=asdict(p)))
            elif action == "stl":
                model = cached_model(p, "export")
                self.send(
                    200,
                    model.mesh.export(file_type="stl"),
                    "model/stl",
                    f"pocket-{model.parameters.width:g}mm.stl",
                )
            else:
                model = cached_model(p, "preview")
                self.send(
                    200,
                    model.preview()
                    | dict(design=contract.design_document(model.parameters)),
                )
        except (ValueError, TypeError, OverflowError, json.JSONDecodeError) as error:
            self.send(400, dict(error=str(error)))
        except Exception:
            import traceback

            traceback.print_exc()
            self.send(500, dict(error="The build failed unexpectedly."))

    def log_message(self, format, *args):
        pass
