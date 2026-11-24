"""The holds the force lab can load, in one shape: a closed mesh with its
flat back on Z = 0 (X across, Y up the wall) and the mounting holes
through it.

Two sources:

* A Hold Lab generator (crimp, sloper, jug, foot, pocket, round pinch), built
  from its own settings by the same code as the lab.
* An STL from the pile, downloaded from a signed R2 link the site made. It
  is turned onto its mounting face the way the site's previews turn it
  (src/features/holds/stl-orientation.ts) and then by the creator's chosen
  orientation; its screw and bolt holes are found by slicing up from the
  back.

Either can be turned on the wall in quarter turns.
"""

from __future__ import annotations

import importlib
import io
import json
import math
import re
import sys
import urllib.request
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

if __package__:
    from .outline import inside
else:
    from outline import inside

DISPLAY_EDGE = 4.0  # mm, longest edge of the coloured display mesh
DISPLAY_FACES = 40000  # a denser upload is simplified for display
DISPLAY_SUBDIVIDED = 30000  # most faces refining a generated hold may add
MAX_STL_BYTES = 40 * 1024 * 1024
FETCH_TIMEOUT_S = 20
# Only signed links to the site's own R2 bucket are fetched.
# A hole has reached its head recess once it is this much wider (mm).
WIDENS = 0.6
R2_HOST = re.compile(r"^[0-9a-f]{32}\.r2\.cloudflarestorage\.com$")

KINDS = {
    "crimp": "Crimp",
    "sloper": "Sloper",
    "jug": "Jug",
    "foot": "Foot",
    "pocket": "Pocket",
    "pinch": "Pinch",
    "roundpinch": "Round Pinch",
}
TURNS = (0, 90, 180, 270)


@dataclass(frozen=True)
class Hole:
    x: float
    y: float
    shank: float  # mm, hole diameter
    head: float  # mm, recess diameter
    seat: float  # mm of plastic under the head
    bolt: bool = False


@dataclass
class Mounted:
    """A hold ready to load."""

    label: str
    kind: str  # a generator key, or "pile"
    mesh: trimesh.Trimesh
    solid: manifold.Manifold
    back: list  # outline polygons of the back face
    display: trimesh.Trimesh
    holes: list[Hole]
    parameters: dict = field(default_factory=dict)
    # The stress solver for this shape, made on first use (see force.py).
    solver: object = None

    def slice(self, z: float) -> list[np.ndarray]:
        return [np.asarray(p, dtype=float) for p in self.solid.slice(float(z)).to_polygons()]


def modules(kind: str):
    if kind not in KINDS:
        raise ValueError("Unknown hold type.")
    directory = "round-pinch" if kind == "roundpinch" else kind
    root = f"tools.{directory}-generator"
    return importlib.import_module(root + ".geometry"), importlib.import_module(root + ".parameters")


def schema(kind: str) -> dict:
    _, contract = modules(kind)
    s = contract.schema()
    return dict(
        label=KINDS[kind],
        controls=s["controls"],
        presets=s.get("presets", {}),
        defaults=s["defaults"],
        shapes=s.get("shapes"),
        shapeLabel=s.get("shapeLabel"),
        toggles=s.get("toggles", []),
    )


def _generated_holes(model, p) -> list[Hole]:
    """The mounting holes a generator made, whichever way it reports them."""
    if getattr(model, "holes", None) is not None:
        return [
            Hole(float(h.x), float(h.y), float(h.shank), float(h.head), float(h.seat), bool(h.bolt))
            for h in model.holes
        ]
    seat = float(getattr(model, "seat_depth", None) or p.seat_depth)
    screw_seats = getattr(model, "screw_seats", None)
    bolt_seats = getattr(model, "bolt_seats", None)
    holes = []
    for i, (x, y) in enumerate(model.screws or []):
        s = screw_seats[i] if screw_seats is not None and i < len(screw_seats) else seat
        holes.append(Hole(float(x), float(y), float(p.shank_diameter), float(p.head_diameter), float(s)))
    for i, (x, y) in enumerate(getattr(model, "bolts", None) or []):
        s = bolt_seats[i] if bolt_seats is not None and i < len(bolt_seats) else seat
        holes.append(
            Hole(float(x), float(y), float(p.bolt_diameter), float(p.bolt_head_diameter), float(s), True)
        )
    return holes


def _turn(mesh: trimesh.Trimesh, holes: list[Hole], turn: int):
    if turn % 360 == 0:
        return mesh, holes
    a = math.radians(turn)
    c, s = round(math.cos(a)), round(math.sin(a))
    R = np.array(((c, -s, 0), (s, c, 0), (0, 0, 1)), dtype=float)
    mesh = trimesh.Trimesh(np.asarray(mesh.vertices) @ R.T, mesh.faces, process=False)
    holes = [Hole(c * h.x - s * h.y, s * h.x + c * h.y, h.shank, h.head, h.seat, h.bolt) for h in holes]
    return mesh, holes


def _solid(mesh: trimesh.Trimesh) -> manifold.Manifold:
    solid = manifold.Manifold(
        manifold.Mesh(
            vert_properties=np.asarray(mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError("This hold is not a closed solid, so it cannot be analysed.")
    return solid


def _display(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    vertices, faces = np.asarray(mesh.vertices), np.asarray(mesh.faces)
    if len(faces) > DISPLAY_FACES:
        import fast_simplification

        vertices, faces = fast_simplification.simplify(
            vertices.astype(np.float32), faces.astype(np.int64), 1 - DISPLAY_FACES / len(faces)
        )
    else:
        # Fine enough to show the stress, coarse enough for a small answer:
        # a bigger hold gets longer edges.
        for edge in (DISPLAY_EDGE, DISPLAY_EDGE * 1.5, DISPLAY_EDGE * 2.25):
            v, f = trimesh.remesh.subdivide_to_size(vertices, faces, max_edge=edge, max_iter=10)
            if len(f) <= DISPLAY_SUBDIVIDED:
                break
        if len(f) <= DISPLAY_SUBDIVIDED:
            vertices, faces = v, f
    return trimesh.Trimesh(vertices, faces, process=True)


def _mount(label, kind, mesh, holes, parameters, turn) -> Mounted:
    if turn not in TURNS:
        raise ValueError("Turn the hold in quarter turns: 0, 90, 180 or 270.")
    mesh, holes = _turn(mesh, holes, turn)
    solid = _solid(mesh)
    back = [np.asarray(p, dtype=float) for p in solid.slice(0.05).to_polygons()]
    if not back:
        raise ValueError("The hold has no flat back on the wall.")
    return Mounted(label, kind, mesh, solid, back, _display(mesh), holes, parameters)


@lru_cache(maxsize=12)
def _generated(kind: str, settings_json: str, turn: int) -> Mounted:
    engine, contract = modules(kind)
    p = contract.parse_parameters(json.loads(settings_json))
    model = engine.build(p, "preview")
    final = getattr(model, "parameters", p)
    holes = _generated_holes(model, final)
    return _mount(f"{KINDS[kind]} Lab hold", kind, model.mesh, holes, asdict(final), turn)


def generated(kind: str, settings: dict | None = None, turn: int = 0) -> Mounted:
    modules(kind)
    if settings is not None and not isinstance(settings, dict):
        raise ValueError("Settings must be a JSON object.")
    return _generated(kind, json.dumps(settings or {}, sort_keys=True), int(turn))


# ---------------------------------------------------------------- the pile


def check_url(url) -> str:
    if not isinstance(url, str):
        raise ValueError("The model link is missing.")
    parts = urlsplit(url)
    if parts.scheme != "https" or not R2_HOST.match(parts.hostname or ""):
        raise ValueError("Only the site's own model links can be loaded.")
    return url


def download(url: str) -> bytes:
    with urllib.request.urlopen(check_url(url), timeout=FETCH_TIMEOUT_S) as response:
        data = response.read(MAX_STL_BYTES + 1)
    if len(data) > MAX_STL_BYTES:
        raise ValueError("This model is too large to analyse.")
    return data


AXES = {
    "x": (1, 0, 0), "y": (0, 1, 0), "z": (0, 0, 1),
    "-x": (-1, 0, 0), "-y": (0, -1, 0), "-z": (0, 0, -1),
}


def orientation_matrix(text: str) -> np.ndarray:
    """The creator's quarter-turn orientation (src/features/holds/orientation.ts):
    three axes naming where the hold's own X, Y and Z land."""
    parts = text.split(",") if isinstance(text, str) else []
    if len(parts) != 3 or any(p not in AXES for p in parts):
        raise ValueError("Unknown model orientation.")
    M = np.array([AXES[p] for p in parts], dtype=float).T  # columns
    if len({p.lstrip("-") for p in parts}) != 3 or round(np.linalg.det(M)) != 1:
        raise ValueError("Unknown model orientation.")
    return M


def view_frame(vertices: np.ndarray, faces: np.ndarray):
    """The mounting face and footprint axes the site's previews use
    (getStlViewFrame in stl-orientation.ts), on a mesh normalised to a unit
    sphere: returns (across, depth, up)."""
    tri = vertices[faces]
    normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(normal, axis=1) / 2
    keep = area > 1e-10
    tri, normal, area = tri[keep], normal[keep], area[keep]
    total = area.sum()
    normal /= (2 * area)[:, None]
    dominant = np.abs(normal).argmax(axis=1)
    flip = normal[np.arange(len(normal)), dominant] < 0
    normal[flip] *= -1
    offset = np.einsum("ij,ij->i", normal, tri[:, 0])
    largest = int(area.argmax())
    keys = np.round(np.column_stack((normal, offset)) * 100).astype(np.int64)
    _, group = np.unique(keys, axis=0, return_inverse=True)
    group = group.ravel()
    sums = np.zeros((group.max() + 1, 4))
    np.add.at(sums, group, np.column_stack((normal * area[:, None], offset * area)))
    areas = np.bincount(group, area)
    order = np.argsort(-areas)[:8]
    candidates = [
        (sums[g, :3] / np.linalg.norm(sums[g, :3]), sums[g, 3] / areas[g], areas[g]) for g in order
    ]
    candidates.append((normal[largest], offset[largest], area[largest]))
    up = np.array((0.0, 0.0, 1.0))
    for n, off, a in candidates:
        if a < total * 0.05:
            continue
        projection = vertices @ n
        lo, hi = projection.min(), projection.max()
        if hi - lo < 0.02:
            continue
        if abs(off - lo) < 0.01:
            up = n.copy()
            break
        if abs(off - hi) < 0.01:
            up = -n
            break
    across = np.array((1.0, 0, 0)) if abs(up[0]) < 0.9 else np.array((0, 1.0, 0))
    across = across - up * (across @ up)
    across /= np.linalg.norm(across)
    depth = np.cross(up, across)
    depth /= np.linalg.norm(depth)
    sample = vertices[:: max(1, math.ceil(len(vertices) / 20000))]
    x, y = sample @ across, sample @ depth
    xx, yy, xy = x.var(), y.var(), ((x - x.mean()) * (y - y.mean())).mean()
    if math.hypot(xx - yy, 2 * xy) > (xx + yy) * 0.1:
        angle = math.atan2(2 * xy, xx - yy) / 2
        across = across * math.cos(angle) + depth * math.sin(angle)
        across /= np.linalg.norm(across)
        depth = np.cross(up, across)
        depth /= np.linalg.norm(depth)
    return across, depth, up


def place_stl(data: bytes, orientation: str = "x,y,z") -> trimesh.Trimesh:
    """An uploaded STL in hold coordinates, as the site's previews show it."""
    try:
        mesh = trimesh.load(io.BytesIO(data), file_type="stl", force="mesh", process=True)
    except Exception as error:  # trimesh raises many kinds
        raise ValueError("This file could not be read as an STL.") from error
    if not isinstance(mesh, trimesh.Trimesh) or len(mesh.faces) == 0:
        raise ValueError("This file could not be read as an STL.")
    vertices = np.asarray(mesh.vertices, dtype=float)
    lo, hi = vertices.min(axis=0), vertices.max(axis=0)
    centre = (lo + hi) / 2
    radius = float(np.linalg.norm(vertices - centre, axis=1).max())
    if not math.isfinite(radius) or radius <= 0:
        raise ValueError("This model has no size.")
    unit = (vertices - centre) / radius
    across, depth, up = view_frame(unit, np.asarray(mesh.faces))
    placed = unit @ np.column_stack((across, depth, up))
    placed = placed @ orientation_matrix(orientation).T
    placed *= radius
    lo, hi = placed.min(axis=0), placed.max(axis=0)
    placed -= ((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2])
    placed = trimesh.Trimesh(placed, mesh.faces, process=True)
    if placed.volume < 0:
        placed.invert()
    return placed


def _signed_area(poly: np.ndarray) -> float:
    x, y = poly[:, 0], poly[:, 1]
    return float((x * np.roll(y, -1) - np.roll(x, -1) * y).sum() / 2)


def _diameter(polygons, cx, cy, outer_sign) -> float:
    """The diameter of the hole around (cx, cy) in one slice, 0 if none."""
    for p in polygons:
        a = _signed_area(p)
        if math.copysign(1, a) != outer_sign and inside([(cx, cy)], [p])[0]:
            return 2 * math.sqrt(abs(a) / math.pi)
    return 0.0


def find_holes(solid: manifold.Manifold, top: float, step: float = 0.5) -> list[Hole]:
    """Screw and bolt holes through the back: openings in the back face 3 to
    14 mm across, followed up until they widen into a head recess (the
    seat) or come out through the top."""
    def rings(z):
        return [np.asarray(p, dtype=float) for p in solid.slice(float(z)).to_polygons()]

    back = rings(0.3)
    if not back:
        return []
    areas = [_signed_area(p) for p in back]
    outer_sign = math.copysign(1, areas[int(np.argmax(np.abs(areas)))])
    holes = []
    for poly, area in zip(back, areas):
        if math.copysign(1, area) == outer_sign:
            continue
        d0 = 2 * math.sqrt(abs(area) / math.pi)
        if not 3.0 <= d0 <= 14.0:
            continue
        cx, cy = poly.mean(axis=0)
        seat, head, z = None, d0, 0.3 + step
        while z < top:
            here = rings(z)
            ring = None
            for p in here:
                a = _signed_area(p)
                if math.copysign(1, a) != outer_sign and inside([(cx, cy)], [p])[0]:
                    ring = (p, a)
                    break
            if ring is None:
                # Closed over (a blind hole: not a fastener from the front)
                # or out through the top (the head sits on the surface).
                if inside([(cx, cy)], here)[0]:
                    seat = None
                    break
                seat = z
                break
            d = 2 * math.sqrt(abs(ring[1]) / math.pi)
            if d > d0 + WIDENS:
                # The floor lies between the last narrow slice and this one.
                lo, hi = z - step, z
                for _ in range(5):
                    mid = (lo + hi) / 2
                    if _diameter(rings(mid), cx, cy, outer_sign) > d0 + WIDENS:
                        hi = mid
                    else:
                        lo = mid
                seat = (lo + hi) / 2
                above = [
                    p for p in rings(min(top - 0.1, z + 2))
                    if math.copysign(1, _signed_area(p)) != outer_sign and inside([(cx, cy)], [p])[0]
                ]
                head = 2 * math.sqrt(abs(_signed_area(above[0])) / math.pi) if above else d
                break
            z += step
        if seat is not None:
            holes.append(Hole(float(cx), float(cy), d0, float(head), float(seat), d0 >= 8.0))
    return holes


_PILES: dict[tuple, Mounted] = {}


def pile(url: str, orientation: str = "x,y,z", turn: int = 0, title: str = "") -> Mounted:
    """A pile hold from its signed link. Cached by the stored object, not the
    signature, so a re-signed link reuses the work."""
    check_url(url)
    orientation_matrix(orientation)
    key = (urlsplit(url).path, orientation, int(turn))
    if key not in _PILES:
        mesh = place_stl(download(url), orientation)
        solid = _solid(mesh)
        holes = find_holes(solid, float(mesh.bounds[1][2]))
        _PILES[key] = _mount(str(title)[:120] or "Pile hold", "pile", mesh, holes, {}, int(turn))
        while len(_PILES) > 6:
            _PILES.pop(next(iter(_PILES)))
    return _PILES[key]
