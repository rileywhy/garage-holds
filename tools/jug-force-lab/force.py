"""Force model of a hold screwed to a wall.

Coordinates: X across the hold, Y up the wall, Z out of the wall,
millimetres, the back face on Z = 0. Any hold from holds.py (a Hold Lab
generator or a pile STL) can be loaded.

Three parts are modelled:

* The mounting surface: a compression-only bed under the flat back (a
  Winkler foundation). Its stiffness and crushing strength come from the
  wall material.
* The fasteners: tension-only springs at each hole, stiffer with more
  thread in the wall. No preload, which is conservative: a snug screw in
  printed plastic relaxes. Forces along the wall are shared between the
  fasteners in shear, by direct share plus the twist about their centroid.
* The hold: rigid for that solve, which gives every load on it. Then an
  elastic solve on a voxel grid of the real shape (fea.py) gives the stress
  everywhere inside, which is checked across the print layers (parallel to
  the wall when a hold prints back-down) and along them.

Everything is linear in the force, so the force at which the first part
fails is the applied force divided by the worst utilisation. This is a
first-order model to compare set-ups. It is not a rating for a printed hold,
a screw or a wall.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np

if __package__:
    from . import fea, materials
    from .holds import Mounted
    from .outline import inside
else:
    import fea
    import materials
    from holds import Mounted
    from outline import inside

GRID_STEP = 1.5  # mm, back-face pressure elements
TARGET_BRICKS = 16000  # stress grid size: about half a second to solve
FINGER_DEPTH = 7.0  # mm, how far the finger pads spread off the contact line


@dataclass(frozen=True)
class Load:
    """How hard and where the climber pulls.

    `wall_angle` is how far the wall overhangs past vertical (0 vertical, 90
    a roof). With `pull_angle` and `side_angle` at zero the pull is straight
    down, toward the floor. `pull_angle` leans it out from the wall (the body
    hanging away below the hand); `side_angle` swings it along the hold.

    The fingers bear where a line straight down the wall, `position` across
    the hold and `height` (a share of the hold's height off the wall) out
    from it, first meets the hold, unless `point` names a spot on the
    surface. They spread `width` mm across."""

    force: float = 1000.0
    wall_angle: float = 30.0
    pull_angle: float = 10.0
    side_angle: float = 0.0
    position: float = 0.0
    height: float = 0.45
    width: float = 60.0
    point: tuple[float, float, float] | None = None

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
    height=(0.02, 0.98),
    width=(10.0, 120.0),
)


def _finite(value) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def parse_load(values) -> Load:
    if values is None:
        return Load()
    if not isinstance(values, dict):
        raise ValueError("The load must be a JSON object.")
    unknown = sorted(set(values) - set(LOAD_LIMITS) - {"point"})
    if unknown:
        raise ValueError(f"Unknown load setting: {unknown[0]}.")
    merged = asdict(Load()) | values
    for key, (low, high) in LOAD_LIMITS.items():
        value = merged[key]
        if not _finite(value):
            raise ValueError(f"Load {key.replace('_', ' ')} must be a finite number.")
        merged[key] = min(high, max(low, float(value)))
    point = merged["point"]
    if point is not None:
        if not isinstance(point, (list, tuple)) or len(point) != 3 or not all(_finite(v) for v in point):
            raise ValueError("The contact point must be three numbers.")
        merged["point"] = tuple(float(v) for v in point)
    return Load(**merged)


# ---------------------------------------------------------------- contact


def first_hit(triangles: np.ndarray, origin, direction) -> tuple[float, int] | None:
    """Distance along a ray to the nearest triangle it crosses and that
    triangle (Moller-Trumbore over every triangle at once)."""
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
    if not hit.any():
        return None
    index = int(np.flatnonzero(hit)[np.argmin(t[hit])])
    return float(t[index]), index


def contact_point(display, load: Load) -> tuple[np.ndarray, np.ndarray]:
    """Where the fingers bear, and the surface's outward normal there."""
    if load.point is not None:
        # A spot picked on the surface: the nearest vertex of the shown mesh.
        index = int(np.argmin(np.linalg.norm(display.vertices - load.point, axis=1)))
        return np.asarray(display.vertices[index], dtype=float), vertex_normal(display, index)
    lo, hi = display.bounds
    x = float(np.clip(load.position, lo[0] + 1, hi[0] - 1))
    top = hi[1] + 50
    triangles = display.triangles
    # Down the wall at the chosen height; lower if the hold is not that tall
    # at this position.
    for z in np.linspace(load.height * hi[2], 0.5, 24):
        hit = first_hit(triangles, np.array((x, top, z)), np.array((0.0, -1.0, 0.0)))
        if hit:
            t, face = hit
            return np.array((x, top - t, z)), np.asarray(display.face_normals[face])
    index = int(np.argmax(display.vertices[:, 1]))
    return np.asarray(display.vertices[index], dtype=float), vertex_normal(display, index)


def vertex_normal(mesh, index: int) -> np.ndarray:
    """The area-weighted normal of the faces around one vertex (trimesh's
    own wants scipy, which Vercel's bundle leaves out)."""
    around = np.flatnonzero((mesh.faces == index).any(axis=1))
    n = (mesh.face_normals[around] * mesh.area_faces[around, None]).sum(axis=0)
    length = np.linalg.norm(n)
    return n / length if length > 0 else np.array((0.0, 1.0, 0.0))


# ---------------------------------------------------------------- the wall


def back_grid(polygons, step: float = GRID_STEP):
    """A regular grid over the back: its cells, which lie on the back face,
    and the grid's origin, step and size."""
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


# ---------------------------------------------------------------- the plastic


def solver_for(hold: Mounted) -> fea.Solver:
    """The voxel stress solver for this hold's shape, made once."""
    if hold.solver is None:
        h = fea.spacing_for(hold.display.bounds, abs(hold.mesh.volume), TARGET_BRICKS)
        grid = fea.voxelize(hold.slice, hold.mesh.bounds, h)
        if not len(grid.elements):
            raise ValueError("This hold is too thin to analyse.")
        hold.solver = fea.Solver(grid)
    return hold.solver


def _nearest(nodes, target, count):
    return np.argsort(np.linalg.norm(nodes - target, axis=1))[:count]


def plastic_loads(grid, load, force, point, fasteners, tension, shear_vec, q, bed):
    """Nodal forces on the voxel hold that match the rigid solution, and the
    nodes that carry a concentrated load (excluded from the strength check:
    a point load's stress is the mesh's, not the plastic's)."""
    nodes = grid.nodes
    h = grid.h
    f = np.zeros((len(nodes), 3))
    loaded = np.zeros(len(nodes), dtype=bool)
    # Surface nodes: shared by fewer than eight filled bricks.
    shared = np.bincount(grid.elements.ravel(), minlength=len(nodes))
    surface = shared < 8

    # The fingers: spread across `width` and a pad's depth off the contact.
    reach = max(FINGER_DEPTH, 1.2 * h)
    half = max(load.width / 2, reach)
    d_line = np.linalg.norm(nodes[:, 1:] - point[1:], axis=1)
    q_shape = ((nodes[:, 0] - point[0]) / half) ** 2 + (d_line / reach) ** 2
    pad = surface & (q_shape <= 1)
    if pad.sum() < 4:
        pad = np.zeros(len(nodes), dtype=bool)
        pad[_nearest(nodes, point, 8)] = True
    w = np.where(pad, 1 - np.sqrt(np.minimum(q_shape, 1)) + 0.05, 0)
    f += np.outer(w / w.sum(), force)
    loaded |= pad

    # The wall pushing on the back, where it is pressed in.
    bottom = grid.element_ijk[:, 2] == 0
    corners = grid.elements[bottom][:, [0, 1, 2, 3]]  # k = 0 corners
    for column in corners.T:
        xy = nodes[column, :2]
        gap = q[0] + q[1] * xy[:, 1] + q[2] * xy[:, 0]
        f[column, 2] += np.maximum(0, -bed * gap) * h * h / 4

    # Each fastener: its head pulls the seat toward the wall; its shank
    # bears sideways near the back.
    for fast, t, s in zip(fasteners, tension, shear_vec):
        r = np.hypot(nodes[:, 0] - fast["x"], nodes[:, 1] - fast["y"])
        ring = (np.abs(nodes[:, 2] - fast["seat"]) <= h * 0.55) & (r >= fast["shank"] / 2 - h * 0.5) & (
            r <= fast["head"] / 2 + h
        )
        if ring.sum() < 3:
            ring = np.zeros(len(nodes), dtype=bool)
            ring[_nearest(nodes, (fast["x"], fast["y"], fast["seat"]), 6)] = True
        if t > 0:
            f[ring, 2] -= t / ring.sum()
            loaded |= ring
        bearing = (nodes[:, 2] <= min(fast["seat"], 3 * h)) & (r <= fast["shank"] / 2 + 1.5 * h)
        if bearing.sum() < 3:
            bearing = np.zeros(len(nodes), dtype=bool)
            bearing[_nearest(nodes, (fast["x"], fast["y"], 0.0), 6)] = True
        f[bearing, :2] -= s / bearing.sum()
        loaded |= bearing
    return fea.balance(nodes, f), loaded


def stress_use(stress: np.ndarray, hold: materials.Hold):
    """Share of strength used in each brick: across the layers (tension and
    shear combined) or along them (the largest in-plane tension)."""
    sxx, syy, szz, sxy, syz, sxz = stress.T
    across = np.hypot(np.maximum(szz, 0) / hold.layer_tension, np.hypot(sxz, syz) / hold.layer_shear)
    principal = (sxx + syy) / 2 + np.hypot((sxx - syy) / 2, sxy)
    along = np.maximum(principal, 0) / hold.in_layer
    return np.maximum(across, along), across >= along


# ---------------------------------------------------------------- analysis


def analyze(
    source: Mounted, load: Load = Load(), wall="plywood_18", hold="pla", screw_length=50.0,
    screw=materials.REFERENCE_SCREW, grid=False,
):
    if wall not in materials.WALLS:
        raise ValueError("Unknown wall material.")
    if hold not in materials.HOLDS:
        raise ValueError("Unknown hold material.")
    if screw not in materials.SCREWS:
        raise ValueError("Unknown screw type.")
    if not _finite(screw_length):
        raise ValueError("Screw length must be a finite number.")
    screw_length = float(min(120.0, max(20.0, screw_length)))
    W, H, S = materials.WALLS[wall], materials.HOLDS[hold], materials.SCREWS[screw]
    display = source.display
    notes = []

    # Fasteners: where they are, how stiff, and what each can take.
    fasteners = []
    anchor = W.anchor_pullout > 0
    ref = materials.SCREWS[materials.REFERENCE_SCREW]
    for hole in source.holes:
        if hole.bolt:
            fasteners.append(dict(
                kind="bolt", x=hole.x, y=hole.y, seat=hole.seat, head=hole.head, shank=hole.shank,
                thread=float(W.thickness), stiffness=materials.BOLT_STIFFNESS,
                capacity=dict(
                    wall=W.tnut_pullout,
                    pull_through=H.punch_shear * math.pi * hole.head * hole.seat,
                    steel=30000.0,
                    shear=min(W.lateral * 2, 15000.0),
                ),
            ))
            continue
        thread = max(0.0, min(W.thickness, screw_length - hole.seat))
        if anchor:
            grip = W.anchor_pullout * min(1.0, max(0.0, (screw_length - hole.seat) / 30.0))
            stiff = materials.ANCHOR_STIFFNESS
        else:
            grip = materials.withdrawal_per_mm(W, S) * thread
            stiff = materials.SCREW_STIFFNESS_PER_MM * max(thread, 1.0) * S.diameter / ref.diameter
        # The head bears on the seat over its own diameter (never wider
        # than the recess it sits in).
        bearing = min(S.head, hole.head)
        fasteners.append(dict(
            kind="screw", x=hole.x, y=hole.y, seat=hole.seat, head=bearing, shank=float(S.diameter),
            thread=float(thread if not anchor else min(screw_length - hole.seat, W.thickness)),
            stiffness=stiff,
            capacity=dict(
                wall=grip,
                pull_through=H.punch_shear * math.pi * bearing * hole.seat,
                steel=S.tensile,
                shear=min(materials.lateral(W, S), S.shear),
            ),
        ))
    if not fasteners:
        raise ValueError("No screw or bolt holes were found in this hold, so it cannot be mounted.")
    if any(f["kind"] == "screw" and f["capacity"]["wall"] <= 0 for f in fasteners):
        notes.append("The screws are too short to reach the wall past their seats.")
    elif not anchor and any(f["kind"] == "screw" and f["thread"] < 12 for f in fasteners):
        least = min(f["thread"] for f in fasteners if f["kind"] == "screw")
        notes.append(f"Some screws are too short: only {least:.0f} mm of thread reaches the wall.")

    point, normal = contact_point(display, load)
    direction = load.direction()
    force = direction * load.force
    pressing = float(direction @ normal) <= 0.25
    if load.force > 0 and not pressing:
        notes.append("The pull points away from the surface here: fingers would slide off rather than bear.")

    # The rigid solve: the bed and the fasteners.
    cells, mask, back = back_grid(source.back)
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

    # The plastic: an elastic solve with those loads.
    solver = solver_for(source)
    g = solver.grid
    nodal, loaded = plastic_loads(g, load, force, point, fasteners, tension, shear_vec, q, W.bed)
    if load.force > 0:
        u, _ = solver.solve(nodal.ravel())
        stress = solver.element_stress(u)
    else:
        stress = np.zeros((len(g.elements), 6))
    use, across = stress_use(stress, H)
    # Bricks touching a concentrated load show its stress but are left out of
    # the strength check.
    near_load = loaded[g.elements].any(axis=1)
    checked = np.where(near_load, 0.0, use)
    node_values = fea.node_average(g, np.column_stack((stress[:, 2], use)))
    surface = fea.interpolate(g, node_values, display.vertices)

    centres = g.origin + (g.element_ijk + 0.5) * g.h
    peak_index = int(np.argmax(checked))
    peak = dict(
        point=centres[peak_index].round(2).tolist(),
        use=round(float(checked[peak_index]), 4),
        sigma=round(float(stress[peak_index, 2]), 3),
        across=bool(across[peak_index]),
    )
    layers = []
    for k in range(g.shape[2]):
        rows = (g.element_ijk[:, 2] == k) & ~near_load
        if not rows.any():
            continue
        s = stress[rows]
        layers.append(dict(
            z=round(float(g.origin[2] + (k + 0.5) * g.h), 2),
            sigma=round(float(max(0.0, s[:, 2].max())), 3),
            tau=round(float(np.hypot(s[:, 5], s[:, 4]).max()), 3),
            use=round(float(checked[rows].max()), 4),
        ))

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
    checks.append(dict(
        part="Hold",
        mode=(
            f"Layers parting {peak['point'][2]:.0f} mm off the wall"
            if peak["across"] else f"Plastic cracking along the layers {peak['point'][2]:.0f} mm off the wall"
        ),
        use=peak["use"],
    ))
    checks.sort(key=lambda c: -c["use"])
    governing = checks[0]
    failure = load.force / governing["use"] if governing["use"] > 1e-12 else math.inf

    lifted = float(1 - (pressure[mask] > 0).mean()) if mask.any() else 1.0
    if lifted > 0.97:
        notes.append("The back has almost lifted off the wall: the screws carry everything.")
    if load.force > 0 and failure < load.force:
        notes.append("Something fails before this force is reached.")

    values = np.where(mask, pressure, -1.0).reshape(back[4], back[3])
    worst = max(layers, key=lambda item: item["use"]) if layers else dict(z=0, sigma=0, tau=0, use=0)
    result = dict(
        source=dict(
            label=source.label, kind=source.kind, holes=len(source.holes),
            dimensions=source.mesh.extents.round(2).tolist(),
        ),
        load=asdict(load) | dict(
            point=point.round(2).tolist(), direction=direction.round(4).tolist(),
            components=force.round(1).tolist(), normal=np.round(normal, 4).tolist(), pressing=pressing,
        ),
        wall=asdict(W) | dict(key=wall),
        hold=asdict(H) | dict(key=hold),
        screw_length=screw_length,
        screw=asdict(S) | dict(key=screw, pullout_per_mm=round(materials.withdrawal_per_mm(W, S), 1)),
        mesh=dict(
            vertices=display.vertices.round(2).ravel().tolist(),
            faces=display.faces.ravel().tolist(),
            sigma=np.round(surface[:, 0], 3).tolist(),
            use=np.round(surface[:, 1], 4).tolist(),
        ),
        pressure=dict(
            x0=back[0], y0=back[1], step=back[2], nx=back[3], ny=back[4],
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
            worst_layer=worst,
            peak=peak,
            total_tension=round(float(tension.sum()), 1),
        ),
        parameters=source.parameters,
        notes=notes,
    )
    if grid:
        nx, ny, nz = g.shape
        flat = (g.element_ijk[:, 0] * ny + g.element_ijk[:, 1]) * nz + g.element_ijk[:, 2]
        result["grid"] = dict(
            origin=g.origin.round(3).tolist(), h=round(g.h, 4), shape=[nx, ny, nz],
            index=flat.tolist(),
            sigma=np.round(stress[:, 2], 3).tolist(),
            use=np.round(use, 4).tolist(),
        )
    return result
