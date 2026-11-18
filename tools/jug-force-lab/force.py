"""Force model of a Jug Lab hold screwed to a wall.

Coordinates are the jug engine's: X across the hold, Y up the wall, Z out
of the wall, millimetres, the back face on Z = 0.

Three parts are modelled:

* The mounting surface: a compression-only bed under the flat back (a
  Winkler foundation). Its stiffness and crushing strength come from the
  wall material.
* The screws (or bolt): tension-only springs at each hole, stiffer with more
  thread in the wall. No preload, which is conservative: a snug screw in
  printed plastic relaxes. Forces along the wall are shared between the
  fasteners in shear, by direct share plus the twist about their centroid.
* The hold: treated as rigid for the solve, then cut into slices parallel to
  the wall, which are its print layers when it prints back-down. Each slice
  carries what acts on the part above it (the pull, and the screw heads
  bearing on their seats). From the slice's real outline it gets a normal
  stress that varies linearly across the slice, and a shear from the sliding
  force and twist.

Everything is linear in the force, so the force at which the first part
fails is the applied force divided by the worst utilisation. This is a
first-order model to compare set-ups. It is not a rating for a printed hold,
a screw or a wall.
"""

from __future__ import annotations

import importlib
import json
import math
import sys
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
jug = importlib.import_module("tools.jug-generator.geometry")
jug_settings = importlib.import_module("tools.jug-generator.parameters")

if __package__:
    from . import materials
else:
    import materials

GRID_STEP = 1.5  # mm, back-face pressure elements
LAYER_STEP = 1.2  # mm between analysed slices
DISPLAY_EDGE = 4.0  # mm, longest edge of the coloured display mesh


@dataclass(frozen=True)
class Load:
    """How hard and where the climber pulls.

    `wall_angle` is how far the wall overhangs past vertical (0 vertical, 90
    a roof). With `pull_angle` and `side_angle` at zero the pull is straight
    down, toward the floor. `pull_angle` leans it out from the wall (the body
    hanging away below the hand); `side_angle` swings it along the hold.
    `position` is across the hold from its centre, and `depth` is how far
    down the grip the fingers bear: 0 on top of the lip, 1 deep in the incut
    at the wall."""

    force: float = 1000.0
    wall_angle: float = 30.0
    pull_angle: float = 10.0
    side_angle: float = 0.0
    position: float = 0.0
    depth: float = 0.4

    def direction(self) -> np.ndarray:
        phi = math.radians(self.wall_angle + self.pull_angle)
        s = math.radians(self.side_angle)
        return np.array(
            (math.sin(s), -math.cos(s) * math.cos(phi), math.cos(s) * math.sin(phi))
        )


LOAD_LIMITS = dict(
    force=(0.0, 5000.0),
    wall_angle=(-15.0, 90.0),
    pull_angle=(-30.0, 60.0),
    side_angle=(-60.0, 60.0),
    position=(-200.0, 200.0),
    depth=(0.0, 0.95),
)


def parse_load(values) -> Load:
    if values is None:
        return Load()
    if not isinstance(values, dict):
        raise ValueError("The load must be a JSON object.")
    unknown = sorted(set(values) - set(LOAD_LIMITS))
    if unknown:
        raise ValueError(f"Unknown load setting: {unknown[0]}.")
    merged = asdict(Load()) | values
    for key, (low, high) in LOAD_LIMITS.items():
        value = merged[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"Load {key.replace('_', ' ')} must be a finite number.")
        merged[key] = min(high, max(low, float(value)))
    return Load(**merged)


# ---------------------------------------------------------------- the hold


@lru_cache(maxsize=8)
def _built(settings_json: str):
    p = jug_settings.parse_parameters(json.loads(settings_json))
    model = jug.build(p)
    mesh = model.mesh
    solid = manifold.Manifold(
        manifold.Mesh(
            vert_properties=np.asarray(mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError("The hold did not form a closed solid; try less extreme settings.")
    back = [np.asarray(poly, dtype=float) for poly in solid.slice(0.05).to_polygons()]
    if not back:
        raise ValueError("The hold has no flat back on the wall.")
    vertices, faces = trimesh.remesh.subdivide_to_size(
        mesh.vertices, mesh.faces, max_edge=DISPLAY_EDGE, max_iter=10
    )
    display = trimesh.Trimesh(vertices, faces, process=True)
    return model, solid, back, display


def build(settings: dict | None = None):
    """The jug model, its solid, back outline and a fine display mesh. Built
    once per distinct set of shape settings."""
    settings = settings or {}
    return _built(json.dumps(settings, sort_keys=True))


def grip_line(profile: np.ndarray) -> np.ndarray:
    """The centre section's grip, (y, z) points from the top of the lip down
    the incut floor to the wall."""
    profile = np.asarray(profile, dtype=float)
    tip = int(np.argmax(profile[:, 0]))
    order = np.r_[tip : len(profile), 0:tip]
    points = [profile[tip]]
    for index in order[1:]:
        points.append(profile[index])
        if profile[index, 1] <= 0.5:
            break
    return np.asarray(points)


def _outward(profile: np.ndarray) -> float:
    """+1 if the section runs counter-clockwise in (y, z)."""
    y, z = profile[:, 0], profile[:, 1]
    return 1.0 if np.sum(y * np.roll(z, -1) - np.roll(y, -1) * z) > 0 else -1.0


def contact_point(model, display: trimesh.Trimesh, load: Load) -> tuple[np.ndarray, np.ndarray]:
    """Where the fingers bear for this load, and the grip's outward normal
    there: found on the centre section, then dropped onto the real surface
    at the chosen position across the hold."""
    line = grip_line(model.profile)
    seg = np.diff(line, axis=0)
    lengths = np.hypot(seg[:, 0], seg[:, 1])
    run = np.r_[0.0, np.cumsum(lengths)]
    target = load.depth * run[-1]
    i = int(min(len(seg) - 1, np.searchsorted(run, target, side="right") - 1))
    t = (target - run[i]) / lengths[i] if lengths[i] > 0 else 0.0
    y, z = line[i] + seg[i] * t
    dy, dz = seg[i] / (lengths[i] or 1.0)
    sign = _outward(np.asarray(model.profile))
    normal = np.array((0.0, dz, -dy)) * sign
    half = display.bounds[1][0]
    x = float(np.clip(load.position, -half + 2, half - 2))
    origin = np.array((x, y, z)) + normal * 60
    distance = first_hit(display.triangles, origin, -normal)
    if distance is not None:
        point = origin - normal * distance
    else:
        nearest = np.argmin(np.linalg.norm(display.vertices - (x, y, z), axis=1))
        point = display.vertices[nearest]
    return np.asarray(point, dtype=float), normal


def first_hit(triangles: np.ndarray, origin, direction) -> float | None:
    """Distance along a ray to the nearest triangle it crosses
    (Moller-Trumbore over every triangle at once)."""
    v0, v1, v2 = triangles[:, 0], triangles[:, 1], triangles[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    h = np.cross(direction, e2)
    a = np.einsum("ij,ij->i", e1, h)
    ok = np.abs(a) > 1e-12
    f = np.where(ok, 1.0 / np.where(ok, a, 1.0), 0.0)
    s = origin - v0
    u = f * np.einsum("ij,ij->i", s, h)
    qv = np.cross(s, e1)
    v = f * (qv @ direction)
    t = f * np.einsum("ij,ij->i", e2, qv)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    return float(t[hit].min()) if hit.any() else None


# ---------------------------------------------------------------- the wall


def inside(points: np.ndarray, polygons) -> np.ndarray:
    """Even/odd containment of points in polygons."""
    points = np.asarray(points, dtype=float).reshape(-1, 2)
    edges = [np.hstack((a, np.roll(a, 1, axis=0))) for a in polygons if len(a)]
    result = np.zeros(len(points), dtype=bool)
    if not edges or not len(points):
        return result
    ax, ay, bx, by = np.concatenate(edges).T[:, :, None]
    for start in range(0, len(points), 2048):
        px = points[start : start + 2048, 0][None, :]
        py = points[start : start + 2048, 1][None, :]
        crosses = (ay > py) != (by > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            hit = px < (bx - ax) * (py - ay) / (by - ay) + ax
        result[start : start + 2048] = ((crosses & hit).sum(axis=0) & 1).astype(bool)
    return result


def back_grid(polygons, step: float = GRID_STEP):
    """A regular grid over the back: its origin, size, and which cells lie
    on the back face."""
    points = np.concatenate(polygons)
    (x0, y0), (x1, y1) = points.min(axis=0), points.max(axis=0)
    xs = np.arange(x0 + step / 2, x1, step)
    ys = np.arange(y0 + step / 2, y1, step)
    gx, gy = np.meshgrid(xs, ys)
    cells = np.column_stack((gx.ravel(), gy.ravel()))
    return cells, inside(cells, polygons), (float(xs[0]), float(ys[0]), step, len(xs), len(ys))


def solve(cells, mask, area, fasteners, stiffness, force, point, bed):
    """The rigid hold on its bed and fasteners. Returns the gap function
    g = w + a*y + b*x (positive lifts off the wall)."""
    elements = cells[mask]
    fasteners = np.asarray(fasteners, dtype=float).reshape(-1, 2)
    stiffness = np.asarray(stiffness, dtype=float)
    fx, fy, fz = force
    cx, cy, cz = point
    rhs = np.array((fz, cy * fz - cz * fy, cx * fz - cz * fx))

    def block(points, weight):
        basis = np.column_stack((np.ones(len(points)), points[:, 1], points[:, 0]))
        return basis.T @ (basis * np.reshape(weight, (-1, 1)))

    pressed = np.ones(len(elements), dtype=bool)
    pulling = np.ones(len(fasteners), dtype=bool)
    q = np.zeros(3)
    for _ in range(200):
        K = np.eye(3) * 1e-9
        if pressed.any():
            K += block(elements[pressed], bed * area)
        if pulling.any():
            K += block(fasteners[pulling], stiffness[pulling])
        q = np.linalg.solve(K, rhs)
        now_pressed = q[0] + q[1] * elements[:, 1] + q[2] * elements[:, 0] < 0
        now_pulling = q[0] + q[1] * fasteners[:, 1] + q[2] * fasteners[:, 0] > 0
        if (now_pressed == pressed).all() and (now_pulling == pulling).all():
            break
        pressed, pulling = now_pressed, now_pulling
    return q


# ---------------------------------------------------------------- the layers


def section(polygons):
    """Area, centroid and second moments (about the centroid) of a slice."""
    A = Sx = Sy = Ixx = Iyy = Ixy = 0.0
    for poly in polygons:
        x, y = poly[:, 0], poly[:, 1]
        xn, yn = np.roll(x, -1), np.roll(y, -1)
        c = x * yn - xn * y
        A += c.sum() / 2
        Sx += ((x + xn) * c).sum() / 6  # integral of x
        Sy += ((y + yn) * c).sum() / 6  # integral of y
        Iyy += ((x * x + x * xn + xn * xn) * c).sum() / 12  # integral of x^2
        Ixx += ((y * y + y * yn + yn * yn) * c).sum() / 12  # integral of y^2
        Ixy += ((x * yn + 2 * x * y + 2 * xn * yn + xn * y) * c).sum() / 24
    if A < 0:
        A, Sx, Sy, Ixx, Iyy, Ixy = -A, -Sx, -Sy, -Ixx, -Iyy, -Ixy
    if A < 1e-6:
        return None
    cx, cy = Sx / A, Sy / A
    return A, cx, cy, Ixx - A * cy * cy, Iyy - A * cx * cx, Ixy - A * cx * cy


def layer_fields(solid, top, force, point, heads):
    """Stress across each slice parallel to the wall. `heads` are the
    fastener heads: (x, y, seat height, tension). Returns, per slice, the
    height and the coefficients of its stress field."""
    levels = np.arange(LAYER_STEP / 2, top, LAYER_STEP)
    rows = []
    force = np.asarray(force, dtype=float)
    for z in levels:
        props = section([np.asarray(p, dtype=float) for p in solid.slice(float(z)).to_polygons()])
        if props is None:
            continue
        A, cx, cy, Ixx, Iyy, Ixy = props
        # What acts on the part of the hold above this slice.
        loads = []
        if point[2] > z:
            loads.append((point, force))
        for hx, hy, seat, tension in heads:
            if seat > z and tension > 0:
                loads.append(((hx, hy, seat), np.array((0.0, 0.0, -tension))))
        N = Mx = My = Mz = Vx = Vy = 0.0
        for (px, py, pz), (fx, fy, fz) in loads:
            rx, ry, rz = px - cx, py - cy, pz - z
            N += fz
            Vx += fx
            Vy += fy
            Mx += ry * fz - rz * fy
            My += rz * fx - rx * fz
            Mz += rx * fy - ry * fx
        # sigma = N/A + a*x' + b*y', balancing the moments on the slice.
        det = Ixy * Ixy - Ixx * Iyy
        if abs(det) > 1e-9:
            a = (Ixy * Mx + Ixx * My) / det
            b = (-Iyy * Mx - Ixy * My) / det
        else:
            a = b = 0.0
        J = Ixx + Iyy
        rows.append((z, A, cx, cy, N / A, a, b, Vx / A, Vy / A, Mz / J if J > 1e-9 else 0.0))
    return np.array(rows).reshape(-1, 10)


def layer_stress(fields, xyz):
    """Normal (tension positive) and shear stress, MPa, at points, read from
    the slices either side of each point."""
    xyz = np.asarray(xyz, dtype=float).reshape(-1, 3)
    sigma = np.zeros(len(xyz))
    tau = np.zeros(len(xyz))
    if not len(fields):
        return sigma, tau
    z = fields[:, 0]
    hi = np.clip(np.searchsorted(z, xyz[:, 2]), 0, len(z) - 1)
    lo = np.clip(hi - 1, 0, len(z) - 1)
    span = np.where(hi > lo, z[hi] - z[lo], 1.0)
    w = np.clip((xyz[:, 2] - z[lo]) / span, 0, 1)
    w = np.where(hi > lo, w, 0.0)

    def at(rows):
        f = fields[rows]
        dx, dy = xyz[:, 0] - f[:, 2], xyz[:, 1] - f[:, 3]
        s = f[:, 4] + f[:, 5] * dx + f[:, 6] * dy
        t = np.hypot(f[:, 7] - f[:, 9] * dy, f[:, 8] + f[:, 9] * dx)
        return s, t

    s_lo, t_lo = at(lo)
    s_hi, t_hi = at(hi)
    sigma = s_lo * (1 - w) + s_hi * w
    tau = t_lo * (1 - w) + t_hi * w
    above = xyz[:, 2] > z[-1] + LAYER_STEP
    sigma[above] = 0
    tau[above] = 0
    return sigma, tau


def layer_use(sigma, tau, hold: materials.Hold):
    """Share of the layer strength used: tension and shear combined."""
    return np.hypot(np.maximum(sigma, 0) / hold.layer_tension, tau / hold.layer_shear)


# ---------------------------------------------------------------- analysis


def seats(model, count: int, name: str) -> list[float]:
    """The plastic under each head: per hole where the generator reports it,
    otherwise the hold's one seat depth."""
    per_hole = getattr(model, name, None)
    if per_hole is not None and len(per_hole) == count:
        return [float(s) for s in per_hole]
    return [float(model.parameters.seat_depth)] * count



def analyze(
    settings=None, load: Load = Load(), wall="plywood_18", hold="pla", screw_length=50.0,
    screw=materials.REFERENCE_SCREW,
):
    if wall not in materials.WALLS:
        raise ValueError("Unknown wall material.")
    if hold not in materials.HOLDS:
        raise ValueError("Unknown hold material.")
    if screw not in materials.SCREWS:
        raise ValueError("Unknown screw type.")
    if isinstance(screw_length, bool) or not isinstance(screw_length, (int, float)) or not math.isfinite(screw_length):
        raise ValueError("Screw length must be a finite number.")
    screw_length = float(min(120.0, max(20.0, screw_length)))
    W, H, S = materials.WALLS[wall], materials.HOLDS[hold], materials.SCREWS[screw]
    model, solid, back, display = build(settings)
    p = model.parameters
    notes = []

    # Fasteners: where they are, how stiff, and what each can take.
    fasteners = []
    anchor = W.anchor_pullout > 0
    for (x, y), seat in zip(model.screws, seats(model, len(model.screws), "screw_seats")):
        thread = max(0.0, min(W.thickness, screw_length - seat))
        if anchor:
            grip = W.anchor_pullout * min(1.0, max(0.0, (screw_length - seat) / 30.0))
            stiff = materials.ANCHOR_STIFFNESS
        else:
            grip = materials.withdrawal_per_mm(W, S) * thread
            stiff = (
                materials.SCREW_STIFFNESS_PER_MM * max(thread, 1.0)
                * S.diameter / materials.SCREWS[materials.REFERENCE_SCREW].diameter
            )
        # The head bears on the seat over its own diameter (never wider
        # than the recess it sits in).
        bearing = min(S.head, float(p.head_diameter))
        fasteners.append(dict(
            kind="screw", x=float(x), y=float(y), seat=float(seat),
            head=bearing, shank=float(S.diameter),
            thread=float(thread if not anchor else min(screw_length - seat, W.thickness)),
            stiffness=stiff,
            capacity=dict(
                wall=grip,
                pull_through=H.punch_shear * math.pi * bearing * seat,
                steel=S.tensile,
                shear=min(materials.lateral(W, S), S.shear),
            ),
        ))
    for (x, y), seat in zip(model.bolts, seats(model, len(model.bolts), "bolt_seats")):
        fasteners.append(dict(
            kind="bolt", x=float(x), y=float(y), seat=float(seat),
            head=float(p.bolt_head_diameter), shank=float(p.bolt_diameter),
            thread=float(W.thickness), stiffness=materials.BOLT_STIFFNESS,
            capacity=dict(
                wall=W.tnut_pullout,
                pull_through=H.punch_shear * math.pi * p.bolt_head_diameter * seat,
                steel=30000.0,
                shear=min(W.lateral * 2, 15000.0),
            ),
        ))
    if not fasteners:
        raise ValueError("This hold has no screws or bolt to analyse.")
    if any(f["kind"] == "screw" and f["capacity"]["wall"] <= 0 for f in fasteners):
        notes.append("The screws are too short to reach the wall past their seats.")
    elif not anchor and any(f["kind"] == "screw" and f["thread"] < 12 for f in fasteners):
        least = min(f["thread"] for f in fasteners if f["kind"] == "screw")
        notes.append(f"Some screws are too short: only {least:.0f} mm of thread reaches the wall.")

    point, normal = contact_point(model, display, load)
    direction = load.direction()
    force = direction * load.force

    cells, mask, grid = back_grid(back)
    area = GRID_STEP * GRID_STEP
    xy = np.array([(f["x"], f["y"]) for f in fasteners])
    q = solve(cells, mask, area, xy, [f["stiffness"] for f in fasteners], force, point, W.bed)

    gap_cells = q[0] + q[1] * cells[:, 1] + q[2] * cells[:, 0]
    pressure = np.where(mask & (gap_cells < 0), -W.bed * gap_cells, 0.0)
    gap_f = q[0] + q[1] * xy[:, 1] + q[2] * xy[:, 0]
    tension = np.array([max(0.0, f["stiffness"] * g) for f, g in zip(fasteners, gap_f)])

    # Shear along the wall: direct share plus twist about the group centre.
    n = len(fasteners)
    centre = xy.mean(axis=0)
    r = xy - centre
    mz = (point[0] - centre[0]) * force[1] - (point[1] - centre[1]) * force[0]
    polar = float((r**2).sum())
    twist = (mz / polar) * np.column_stack((-r[:, 1], r[:, 0])) if polar > 1e-9 else np.zeros((n, 2))
    shear_vec = force[:2] / n + twist
    shear = np.hypot(shear_vec[:, 0], shear_vec[:, 1])

    # The hold's layers.
    heads = [(f["x"], f["y"], f["seat"], t) for f, t in zip(fasteners, tension)]
    fields = layer_fields(solid, float(display.bounds[1][2]), force, point, heads)
    sigma, tau = layer_stress(fields, display.vertices)
    use = layer_use(sigma, tau, H)
    layers = []
    for row in fields:
        # The slice's outline is where its stress peaks (the field is linear).
        z = row[0]
        polys = [np.asarray(pp, dtype=float) for pp in solid.slice(float(z)).to_polygons()]
        pts = np.concatenate(polys) if polys else np.zeros((0, 2))
        if len(pts):
            s, t = layer_stress(row[None, :], np.column_stack((pts, np.full(len(pts), z))))
            u = layer_use(s, t, H)
            layers.append(dict(z=round(float(z), 2), sigma=round(float(s.max()), 3),
                               tau=round(float(t.max()), 3), use=round(float(u.max()), 4)))
    worst_layer = max(layers, key=lambda item: item["use"]) if layers else dict(z=0, sigma=0, tau=0, use=0)

    # Checks.
    checks = []
    for i, (f, t, v) in enumerate(zip(fasteners, tension, shear)):
        cap = f["capacity"]
        name = f"{'Bolt' if f['kind'] == 'bolt' else 'Screw'} {i + 1}"
        wall_label = "T-nut pull-through" if f["kind"] == "bolt" else (
            "Anchor pull-out" if anchor else "Thread pull-out from the wall")
        uses = dict(
            wall=t / cap["wall"] if cap["wall"] > 0 else (math.inf if t > 0 else 0.0),
            pull_through=t / cap["pull_through"] if cap["pull_through"] > 0 else math.inf,
            steel=t / cap["steel"],
            shear=v / cap["shear"],
        )
        # Pull-out and sideways load together on the same thread.
        combined = math.hypot(min(uses["wall"], 1e6), uses["shear"])
        f.update(
            name=name, tension=float(t), shear=float(v),
            use={k: float(min(val, 1e6)) for k, val in uses.items()} | dict(combined=float(min(combined, 1e6))),
        )
        f["governing"] = float(max(f["use"].values()))
        labels = dict(
            wall=wall_label,
            pull_through="Head pulling through its seat",
            steel="Screw snapping" if f["kind"] == "screw" else "Bolt snapping",
            shear="Sideways load into the wall",
            combined="Pull-out and sideways load together",
        )
        for key, value in f["use"].items():
            checks.append(dict(part=name, mode=labels[key], use=value))
    max_pressure = float(pressure.max())
    checks.append(dict(part="Wall", mode="Face crushing under the back", use=max_pressure / W.crush))
    checks.append(dict(part="Hold", mode=f"Layers parting at {worst_layer['z']:.1f} mm off the wall",
                       use=float(worst_layer["use"])))
    checks.sort(key=lambda c: -c["use"])
    governing = checks[0]
    failure = load.force / governing["use"] if governing["use"] > 1e-12 else math.inf

    lifted = float(1 - (pressure[mask] > 0).mean()) if mask.any() else 1.0
    if lifted > 0.97:
        notes.append("The back has almost lifted off the wall: the screws carry everything.")
    if load.force > 0 and failure < load.force:
        notes.append("Something fails before this force is reached.")

    values = np.where(mask, pressure, -1.0).reshape(grid[4], grid[3])
    return dict(
        load=asdict(load) | dict(
            point=point.round(2).tolist(), direction=direction.round(4).tolist(),
            components=force.round(1).tolist(), normal=normal.round(4).tolist(),
        ),
        wall=asdict(W) | dict(key=wall),
        hold=asdict(H) | dict(key=hold),
        screw_length=screw_length,
        screw=asdict(S) | dict(key=screw, pullout_per_mm=round(materials.withdrawal_per_mm(W, S), 1)),
        mesh=dict(
            vertices=display.vertices.round(2).ravel().tolist(),
            faces=display.faces.ravel().tolist(),
            use=np.round(use, 4).tolist(),
            sigma=np.round(sigma, 3).tolist(),
        ),
        pressure=dict(
            x0=grid[0], y0=grid[1], step=grid[2], nx=grid[3], ny=grid[4],
            values=np.round(values, 4).ravel().tolist(), max=round(max_pressure, 4),
        ),
        fasteners=fasteners,
        layers=layers,
        checks=checks[:12],
        summary=dict(
            governing=governing,
            failure_force=None if math.isinf(failure) else round(failure, 1),
            safety=None if load.force <= 0 or math.isinf(failure) else round(failure / load.force, 3),
            contact_force=round(float(pressure.sum() * area), 1),
            lifted=round(lifted, 4),
            max_pressure=round(max_pressure, 4),
            worst_layer=worst_layer,
            total_tension=round(float(tension.sum()), 1),
        ),
        parameters=asdict(p),
        notes=notes,
    )
