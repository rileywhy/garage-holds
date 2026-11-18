"""The Jug Force Lab's request contract, shared by the Vercel function
(api/jug_force.py) and the local server (server.py).

GET returns the schema: the Jug Lab's controls and presets, the materials
and the load limits. POST takes

    {"settings": {...Jug Lab settings...}, "load": {...}, "wall": key,
     "hold": key, "screw": key, "screw_length": mm, "mesh": true}

and returns the analysis. With "mesh": false the display mesh's vertices
and faces are left out (the colours per vertex are always sent), so a page
that already has this hold's mesh only downloads what changed.
"""

from __future__ import annotations

import json
from dataclasses import asdict

if __package__:
    from . import force, materials
else:
    import force
    import materials

MAX_BODY = 16384
FIELDS = {"settings", "load", "wall", "hold", "screw", "screw_length", "mesh"}


def schema() -> dict:
    jug = force.jug_settings.schema()
    return dict(
        jug=dict(controls=jug["controls"], presets=jug.get("presets", {}), defaults=jug["defaults"]),
        materials=materials.schema(),
        load=dict(defaults=asdict(force.Load()), limits=force.LOAD_LIMITS),
        screw_length=50.0,
        screw=materials.REFERENCE_SCREW,
    )


def analyze(body: bytes) -> tuple[int, dict]:
    """Status and JSON body for one POST."""
    try:
        request = json.loads(body or b"{}")
    except ValueError:
        return 400, {"error": "The request is not valid JSON."}
    if not isinstance(request, dict):
        return 400, {"error": "The request must be a JSON object."}
    unknown = sorted(set(request) - FIELDS)
    if unknown:
        return 400, {"error": f"Unknown field: {unknown[0]}."}
    settings = request.get("settings") or {}
    if not isinstance(settings, dict):
        return 400, {"error": "Settings must be a JSON object."}
    known = set(force.jug_settings.Parameters.__dataclass_fields__)
    bad = sorted(set(settings) - known)
    if bad:
        return 400, {"error": f"Unknown setting: {bad[0]}."}
    include_mesh = request.get("mesh", True)
    if not isinstance(include_mesh, bool):
        return 400, {"error": "mesh must be true or false."}
    try:
        result = force.analyze(
            settings,
            force.parse_load(request.get("load")),
            wall=request.get("wall", "plywood_18"),
            hold=request.get("hold", "pla"),
            screw_length=request.get("screw_length", 50.0),
            screw=request.get("screw", materials.REFERENCE_SCREW),
        )
    except (ValueError, TypeError, OverflowError) as error:
        return 422, {"error": str(error)}
    if not include_mesh:
        result["mesh"].pop("vertices")
        result["mesh"].pop("faces")
    return 200, result
