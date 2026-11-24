"""The force lab's request contract, shared by the Vercel function
(api/jug_force.py) and the local server (server.py).

GET returns the schema: every Hold Lab generator's controls and presets,
the materials and the load limits. POST takes

    {"source": {"kind": "jug", "settings": {...}, "turn": 0}
              | {"pile": {"url": signed R2 link, "orientation": "x,y,z",
                          "title": "..."}, "turn": 0},
     "load": {...}, "wall": key, "hold": key, "screw": key,
     "screw_length": mm, "mesh": true, "grid": false}

and returns the analysis. With "mesh": false the display mesh's vertices
and faces are left out (the colours per vertex are always sent), so a page
that already has this hold's mesh only downloads what changed. With
"grid": true the stress in every brick of the solve comes too, for cut-away
views.
"""

from __future__ import annotations

import json
from dataclasses import asdict

if __package__:
    from . import force, holds, materials
else:
    import force
    import holds
    import materials

MAX_BODY = 16384
FIELDS = {"source", "load", "wall", "hold", "screw", "screw_length", "mesh", "grid"}
SOURCE_FIELDS = {"kind", "settings", "pile", "turn"}


def schema() -> dict:
    return dict(
        kinds={kind: holds.schema(kind) for kind in holds.KINDS},
        default_kind="jug",
        turns=list(holds.TURNS),
        materials=materials.schema(),
        load=dict(defaults=asdict(force.Load()), limits=force.LOAD_LIMITS),
        screw_length=50.0,
        screw=materials.REFERENCE_SCREW,
    )


def mounted(source) -> holds.Mounted:
    if source is None:
        source = {"kind": "jug"}
    if not isinstance(source, dict):
        raise ValueError("The hold must be a JSON object.")
    unknown = sorted(set(source) - SOURCE_FIELDS)
    if unknown:
        raise ValueError(f"Unknown hold field: {unknown[0]}.")
    turn = source.get("turn", 0)
    if isinstance(turn, bool) or turn not in holds.TURNS:
        raise ValueError("Turn the hold in quarter turns: 0, 90, 180 or 270.")
    if "pile" in source:
        pile = source["pile"]
        if not isinstance(pile, dict) or set(pile) - {"url", "orientation", "title"}:
            raise ValueError("A pile hold needs its link and orientation.")
        return holds.pile(
            pile.get("url"), pile.get("orientation", "x,y,z"), turn, str(pile.get("title", ""))
        )
    kind = source.get("kind", "jug")
    settings = source.get("settings") or {}
    if not isinstance(settings, dict):
        raise ValueError("Settings must be a JSON object.")
    _, contract_module = holds.modules(kind)
    known = set(contract_module.Parameters.__dataclass_fields__)
    bad = sorted(set(settings) - known)
    if bad:
        raise ValueError(f"Unknown setting: {bad[0]}.")
    return holds.generated(kind, settings, turn)


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
    include_mesh = request.get("mesh", True)
    include_grid = request.get("grid", False)
    if not isinstance(include_mesh, bool) or not isinstance(include_grid, bool):
        return 400, {"error": "mesh and grid must be true or false."}
    try:
        source = mounted(request.get("source"))
        result = force.analyze(
            source,
            force.parse_load(request.get("load")),
            wall=request.get("wall", "plywood_18"),
            hold=request.get("hold", "pla"),
            screw_length=request.get("screw_length", 50.0),
            screw=request.get("screw", materials.REFERENCE_SCREW),
            grid=include_grid,
        )
    except (ValueError, TypeError, OverflowError) as error:
        return 422, {"error": str(error)}
    except OSError:
        return 502, {"error": "The model could not be downloaded. Try again."}
    if not include_mesh:
        result["mesh"].pop("vertices")
        result["mesh"].pop("faces")
    return 200, result
