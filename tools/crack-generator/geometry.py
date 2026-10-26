"""A crack: a section across the block lofted up the wall, the crack open
at its front and at both ends, then drilled.

X runs across the crack, Y up the wall along it, Z out of the wall, and the
back sits on Z=0. The section is a polygon with filleted corners, as the
Pinch Lab builds its own: square outer sides, rounded front corners, the
crack's two faces at the flare angle with rounded lips, and a floor with
rounded corners where the back joins the two sides. One side of a crack is
the left half of that, its face running to the wall. The section is lofted
along Y; the constriction moves both faces in over a short stretch, the
wander moves the whole crack sideways, the jam angle turns both so they
dive down the wall as they go in, and toward each end every surface but
the back moves into the body along a quarter circle, so the ends round
off with the edges. Screws go only where a vertical line from the wall
leaves through a side's front face, clear of the crack, and the bolt only
where one leaves through the crack's floor, so no recess can open into the
crack. Hardware fitting uses the preview body for both output qualities,
so exports agree with previews.
"""

import math
from dataclasses import asdict, replace

import manifold3d as manifold
import numpy as np
import trimesh

if __package__:
    from .crimp_engine import geometry as crimp
    from .parameters import (
        CONTROLS,
        SCREW_LENGTH,
        SCREW_STEP,
        SEAT_MAX,
        SEAT_SHARE,
        parse_parameters,
    )
else:
    from crimp_engine import geometry as crimp
    from parameters import (
        CONTROLS,
        SCREW_LENGTH,
        SCREW_STEP,
        SEAT_MAX,
        SEAT_SHARE,
        parse_parameters,
    )

from tools.hold_mounting import closed_mesh, drill, fit_bolt_and_screw, screw_layout

# The least the crack stays open anywhere, so it prints as a slot and not a
# seam. Printability, not a strength rating.
GAP = 6.0
# Lying on its back, a block stays within a 256 mm printer bed with 5% to
# spare, as the Jug Lab fits its widest.
BED = 0.95 * 256
# The floor's corners are rounded this much, or less in a narrow crack.
FLOOR_RADIUS = 6.0
# The wander's sway, as a share of the side thickness and at most this many
# millimetres, so a side never thins by more than that.
WANDER = 0.15
WANDER_MAX = 4.0
# A side's screw column keeps this much more than a recess across, which
# the shared fitter's 1.5 mm clearance each side needs and a little over.
ROOM = 3.5
# The constriction narrows the crack over this many crack widths either
# side of its middle, within these bounds in millimetres.
NECK_REACH = 1.2
NECK_BOUNDS = (20.0, 60.0)
QUALITY = {
    "preview": dict(segments=6, along=40, cap=8),
    "export": dict(segments=12, along=100, cap=16),
}
LIMITS = {control["key"]: (control["min"], control["max"]) for control in CONTROLS}


def _unit(v):
    return v / np.linalg.norm(v)


def _turn(before, point, after):
    """The signed angle the outline turns through at a corner."""
    a, b = _unit(point - before), _unit(after - point)
    return math.atan2(a[0] * b[1] - a[1] * b[0], a @ b)


def body_depth(p):
    """How far the block stands off the wall."""
    return p.depth + (p.back if p.shape == "block" else 0)


def sway(p):
    """The wander's largest sideways shift."""
    return p.character * min(WANDER_MAX, WANDER * p.side)


def lean(p):
    """How much further out a side's outside stands than its thickness, so
    a crack flared in keeps the side as thick at its floor as asked: the
    side thickness is the side at its thinnest."""
    return max(0.0, -p.depth * math.tan(math.radians(p.flare)))


def corners(p):
    """The section's corners in (x, z), clockwise from the left side's foot
    on the wall, before rounding, with each corner's kind. One side of a
    crack is the left of the two, its face toward +X; its hardware column
    is centred on X=0 (see centre_half), so a bolt can sit there."""
    tan = math.tan(math.radians(p.flare))
    depth = body_depth(p)
    if p.shape == "block":
        outer = p.width / 2 + p.side + lean(p)
        mouth = p.width / 2
        floor = mouth - p.depth * tan
        points = [
            (-outer, 0),
            (-outer, depth),
            (-mouth, depth),
            (-floor, p.back),
            (floor, p.back),
            (mouth, depth),
            (outer, depth),
            (outer, 0),
        ]
        kinds = ["wall", "corner", "lip", "floor", "floor", "lip", "corner", "wall"]
    else:
        face = p.side / 2
        outer = -p.side / 2 - lean(p)
        points = [
            (outer, 0),
            (outer, depth),
            (face, depth),
            (face + p.depth * tan, 0),
        ]
        kinds = ["wall", "corner", "lip", "wall"]
    return np.array(points, dtype=float), kinds


def screw_room(p, radius):
    """How wide a side's screw column is with the given edge rounding: the
    side, less the wander's sway, the outer corner's rounding, and the lip's
    rounding or the face leaning over it, whichever reaches further in."""
    lip = math.tan((math.pi / 2 - math.radians(p.flare)) / 2)
    return p.side + lean(p) - sway(p) - radius - max(radius * lip, lean(p))


def radii(p):
    """The edge rounding and floor rounding the section has room for at its
    tightest, and the largest edge rounding that fits. The lip turns
    through 90 degrees less the flare; every fillet keeps to 90% of the
    sides it shares. With holes on, the rounding also leaves each side's
    column room for its screw recess (or one side's bolt), so rounding
    the edges never turns the screws away."""
    flare = math.radians(p.flare)
    lip = math.tan((math.pi / 2 - flare) / 2)
    depth = body_depth(p)
    face = p.depth / math.cos(flare)
    front = p.side - sway(p) + lean(p)
    floor = 0.0
    if p.shape == "block":
        gap = p.width - 2 * p.depth * math.tan(flare) - p.constriction
        floor = min(FLOOR_RADIUS, 0.45 * gap / lip, 0.3 * face / lip)
    cap = min(0.9 * depth, 0.9 * front / (1 + lip), (0.9 * face - floor * lip) / lip)
    if p.screws:
        head = (
            p.bolt_head_diameter
            if p.bolt_mount and p.shape == "half"
            else p.head_diameter
        )
        least = LIMITS["edge_radius"][0]
        fits = [
            r
            for r in np.arange(least, cap + 1e-9, 0.5)
            if screw_room(p, r) >= head + ROOM
        ]
        if fits:
            cap = min(cap, float(fits[-1]))
    return min(p.edge_radius, cap), floor, cap


def end_radius(p, radius):
    """How far each end rounds off. Every surface but the back moves in by
    up to this much, so it must leave the lips and front corners some
    rounding, each side some thickness, and the back behind the floor."""
    limit = [0.9 * radius, (p.side - sway(p) - 4) / 2, p.length / 4]
    if p.shape == "block":
        limit.append(p.back - 3)
    return max(0.0, min(limit))


def rounded(points, kinds, radius, floor, arcs, runs):
    """The corners filleted, each arc sampled with its given count and each
    straight run between them with its given steps, so sections of one
    crack line up point for point in the loft. The run along the wall is
    left whole. Returns the outline and where each corner's points start
    and end in it."""
    sizes = {"wall": 0.0, "corner": radius, "lip": radius, "floor": floor}
    n = len(points)
    pieces = []
    for i in range(n):
        before, point, after = points[i - 1], points[i], points[(i + 1) % n]
        r = sizes[kinds[i]]
        if r == 0:
            pieces.append(point[None, :])
            continue
        incoming = _unit(point - before)
        turn = _turn(before, point, after)
        distance = r * math.tan(abs(turn) / 2)
        start = point - incoming * distance
        normal = np.array([-incoming[1], incoming[0]]) * np.sign(turn)
        centre = start + normal * r
        angle = math.atan2(*(start - centre)[::-1])
        angles = angle + np.linspace(0, turn, arcs[i] + 1)
        pieces.append(centre + r * np.column_stack((np.cos(angles), np.sin(angles))))
    contour, spans = [], []
    for i, piece in enumerate(pieces):
        spans.append((len(contour), len(contour) + len(piece) - 1))
        contour.extend(piece)
        if i == n - 1:
            break
        end, following = piece[-1], pieces[i + 1][0]
        contour.extend(
            end + (following - end) * t for t in np.linspace(0, 1, runs[i] + 1)[1:-1]
        )
    return np.asarray(contour), spans


def arc_counts(p, segments):
    """Each corner's arc steps: at least segments, and no step wider than
    a quarter of 180 degrees over segments."""
    points, _ = corners(p)
    n = len(points)
    return [
        max(
            segments,
            math.ceil(
                abs(_turn(points[i - 1], points[i], points[(i + 1) % n]))
                / (math.pi / (4 * segments))
            ),
        )
        for i in range(n)
    ]


def run_counts(p, segments, spacing):
    """Each straight run's steps, from each corner to the next: segments,
    and across the crack's faces, once the jam angle turns a lock across
    them, as many as keep each step within spacing, as the loft steps
    along the crack."""
    points, _ = corners(p)
    turns = p.jam_angle > 0 and (p.constriction > 0 or p.character > 0)
    faces = (2, 4) if p.shape == "block" else (2,)
    return [
        max(segments, math.ceil(np.linalg.norm(points[i + 1] - points[i]) / spacing))
        if turns and i in faces
        else segments
        for i in range(len(points) - 1)
    ]


def follows(p, spans, size):
    """How far each point of a section moves with the crack's left face and
    with its right, as (left, right): the lips, the faces and the floor's
    corners all the way, the outsides not at all, and the straight runs
    between two corners in proportion along them, as they were sampled.
    One side's face is a left face."""
    owners = [0, 0, 1, 1, 2, 2, 0, 0] if p.shape == "block" else [0, 0, 1, 1]
    corner = np.eye(3)[owners][:, 1:]
    share = np.zeros((size, 2))
    for i, (start, end) in enumerate(spans):
        share[start : end + 1] = corner[i]
        if i + 1 < len(spans):
            following = spans[i + 1][0]
            t = np.linspace(0, 1, following - end + 1)[1:-1, None]
            share[end + 1 : following] = corner[i] + (corner[i + 1] - corner[i]) * t
    return share


def section(p, segments, arcs=None, runs=None, y=None, wander=None, delta=0.0):
    """The section in (x, z) with where each corner's points sit in it: at
    y up the wall, moved delta into the body toward an end, the
    constriction narrows the crack and the wander moves it across, each
    point of its faces by as much as there is at that point's own height
    (see turned). Without y, none of these. The outline moves in before
    the faces do: a lip rounded nearly away at an end stays a clean arc."""
    radius, floor, _ = radii(p)
    points, kinds = corners(p)
    if arcs is None:
        arcs = arc_counts(p, segments)
    if runs is None:
        runs = [segments] * (len(points) - 1)
    contour, spans = rounded(points, kinds, radius, floor, arcs, runs)
    if y is None:
        return contour, spans
    contour = inset(contour, delta)
    z = contour[:, 1]
    across, narrow = wander(turned(p, y, z)), neck(p, y, z)
    share = follows(p, spans, len(contour))
    contour[:, 0] += share[:, 0] * (across + narrow / 2)
    contour[:, 0] += share[:, 1] * (across - narrow / 2)
    return contour, spans


def inset(contour, delta):
    """The outline moved delta into the body, each point along its normal;
    the two points on the wall slide along it, so the back stays on the
    wall. A clockwise outline has the body on the right of its travel."""
    if delta <= 0:
        return contour
    travel = np.roll(contour, -1, axis=0) - np.roll(contour, 1, axis=0)
    normal = np.column_stack((travel[:, 1], -travel[:, 0]))
    moved = contour + delta * normal / np.linalg.norm(normal, axis=1)[:, None]
    for index, neighbour in ((0, 1), (-1, -2)):
        along = _unit(
            contour[neighbour] - contour[index]
            if index == 0
            else contour[index] - contour[neighbour]
        )
        n = np.array([along[1], -along[0]])
        point = contour[index] + delta * n
        moved[index] = point - point[1] / along[1] * along
    return moved


def turned(p, y, z):
    """Where a point y up the wall and z out from it falls along the
    crack's locks, which the jam angle turns about the middle of the
    crack's depth. At 0 the constriction and the wander run straight in
    from the mouth, as on a vertical wall; turned, they dive down the wall
    as they go in, so on a wall that steep your weight pulls square into
    them; at 90, for a roof, they lie along the wall and vary only with
    the depth."""
    angle = math.radians(p.jam_angle)
    middle = body_depth(p) - p.depth / 2
    return y * math.cos(angle) + (middle - z) * math.sin(angle)


def neck(p, y, z):
    """How much the constriction narrows the crack at y up the wall from
    the middle of the block and z out from the wall."""
    if p.constriction <= 0:
        return np.zeros(np.shape(z))
    reach = float(np.clip(NECK_REACH * p.width, *NECK_BOUNDS))
    middle = p.length * (p.constriction_height / 100 - 0.5)
    u = turned(p, y - middle, z) / reach
    return np.where(np.abs(u) < 1, p.constriction * np.cos(np.pi * u / 2) ** 2, 0)


def wanders(p):
    """The wander: the crack's sideways shift as a function of where a
    point falls along the crack from the middle of the block (see turned)."""
    amplitude = sway(p)
    rng = np.random.default_rng(p.seed)
    phase = rng.uniform(0, 2 * math.pi, 2)
    frequency = rng.uniform([1.5, 4], [3, 7])

    def shift(along):
        u = along / (p.length / 2)
        return (
            amplitude
            * (
                np.sin(frequency[0] * u + phase[0])
                + 0.4 * np.sin(frequency[1] * u + phase[1])
            )
            / 1.4
        )

    return shift


def centre_half(p, segments):
    """How far one side of a crack moves across so its hardware column is
    centred on X=0, where the shared fitter puts a bolt."""
    if p.shape == "block":
        return 0.0
    contour, spans = section(p, segments)
    left, right = column_bounds(contour, spans, p)[0]
    return -(left + right) / 2


def column_bounds(contour, spans, p):
    """Where a vertical line from the wall leaves through a side's front
    face and touches nothing else, in x: for each side, between its outer
    front corner and its lip, clear of its face all the way down; and in a
    block the crack's floor, between its rounded corners and clear of both
    faces. Sides first, then the floor."""
    x = contour[:, 0]
    if p.shape == "half":
        return [(x[: spans[1][1] + 1].max(), x[spans[2][0] :].min())]
    return [
        (x[: spans[1][1] + 1].max(), x[spans[2][0] : spans[3][1] + 1].min()),
        (x[spans[4][0] : spans[5][1] + 1].max(), x[spans[6][0] :].min()),
        (
            x[spans[2][0] : spans[3][1] + 1].max(),
            x[spans[4][0] : spans[5][1] + 1].min(),
        ),
    ]


def loft(p, quality):
    """The crack body; its centre section in (x, z); for each side of the
    crack and the floor, the plan region a vertical line can cross from
    the wall out through the front or the floor without touching anything
    else, with its bounds at each place along the crack; and the largest
    edge rounding that fits."""
    q = QUALITY[quality]
    arcs = arc_counts(p, q["segments"])
    runs = run_counts(p, q["segments"], p.length / q["along"])
    radius, _, cap = radii(p)
    end = end_radius(p, radius)
    length = p.length
    across = centre_half(p, q["segments"])
    shift = wanders(p)
    # Each end rounds off along a quarter circle, sampled at even steps of
    # its angle: alpha 0 is the end itself, inset the whole radius.
    if end > 0.05:
        alpha = np.linspace(0, math.pi / 2, q["cap"] + 1)[:-1]
        from_end, insets = end * (1 - np.cos(alpha)), end * (1 - np.sin(alpha))
    else:
        from_end, insets = np.zeros(0), np.zeros(0)
    core = length / 2 - (end if len(from_end) else 0.0)
    steps = max(2, round(q["along"] * core / (length / 2)))
    ys = np.concatenate(
        (
            -length / 2 + from_end,
            np.linspace(-core, core, steps + 1),
            (length / 2 - from_end)[::-1],
        )
    )
    deltas = np.concatenate((insets, np.zeros(steps + 1), insets[::-1]))
    rings, columns, centre = [], None, None
    for y, delta in zip(ys, deltas):
        contour, spans = section(p, q["segments"], arcs, runs, y, shift, delta)
        contour = contour + [across, 0]
        if delta == 0:
            bounds = column_bounds(contour, spans, p)
            if columns is None:
                columns = [[] for _ in bounds]
            for column, (left, right) in zip(columns, bounds):
                column.append((y, left, right))
            if centre is None or abs(y) < abs(centre[0]):
                centre = (y, contour)
        rings.append(
            np.column_stack((contour[:, 0], np.full(len(contour), y), contour[:, 1]))
        )
    vertices = np.vstack(rings)
    n, count = len(rings[0]), len(rings)
    faces = []
    for j in range(n):
        k = (j + 1) % n
        for i in range(count - 1):
            a, b = i * n + j, i * n + k
            faces.extend(((a, b, b + n), (a, b + n, a + n)))
    # The ends are flat and the section is not convex: triangulate each,
    # counter-clockwise in (x, z), which faces the bottom end down the wall.
    for i, flip in ((0, False), (count - 1, True)):
        triangles = n - 1 - manifold.triangulate([rings[i][::-1, [0, 2]]])
        faces.extend((triangles[:, ::-1] if flip else triangles) + i * n)
    mesh = trimesh.Trimesh(vertices, faces, process=False)
    if mesh.volume < 0:
        mesh.invert()
    solid = manifold.Manifold(
        manifold.Mesh(
            np.asarray(mesh.vertices, dtype=np.float32),
            np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError(
            "The crack could not form a closed solid. Try less extreme shape settings."
        )
    return solid, centre[1], columns, cap


def region(column):
    """A column's plan outline, counter-clockwise: up its right edge and
    back down its left, where it has any width."""
    kept = [(y, a, b) for y, a, b in column if b - a > 1e-3]
    if len(kept) < 2:
        return None
    return [(b, y) for y, _, b in kept] + [(a, y) for y, a, _ in kept[::-1]]


def mounting_proxy(solid, outlines):
    """The body cut down to the given plan regions: the shared fitters then
    keep every recess, its shank and its bore clear of the crack."""
    top = solid.bounding_box()[5]
    area = None
    for outline in outlines:
        piece = manifold.CrossSection([np.asarray(outline, dtype=float)])
        area = piece if area is None else area + piece
    column = manifold.Manifold.extrude(area, top + 2).translate((0, 0, -1))
    return solid ^ column


def at(column, y):
    """A column's bounds at the place along the crack nearest y."""
    return min(column, key=lambda c: abs(c[0] - y))[1:]


def width_of(column):
    """A column's narrowest width along the crack."""
    return min(b - a for _, a, b in column)


def screw_targets(p, columns, count):
    """Screws in a line up the middle of each side, spread evenly along
    most of the crack's length where they lever, clear of the rounded
    ends: one per side in the middle, or from one end of the line to the
    other."""
    end = end_radius(p, radii(p)[0])
    reach = min(0.35 * p.length, p.length / 2 - end - p.head_diameter / 2 - 3)
    ys = [0.0] if count == 1 else np.linspace(-reach, reach, count)
    targets = []
    for column in columns:
        for y in ys:
            left, right = at(column, y)
            targets.append(((left + right) / 2, float(y)))
    return targets, reach


def inside(hole, column):
    """Whether a hole sits within its column, where it was fitted."""
    left, right = at(column, hole.y)
    return left < hole.x < right


class Model:
    def __init__(self, mesh, p, requested, profile, holes, cap):
        self.mesh, self.parameters, self.profile = mesh, p, profile
        self.holes, self.cap = holes, cap
        # Only report changes the person did not ask for: an automatic seat
        # or screw count landing somewhere is the feature, not an adjustment.
        skipped = {"seat_depth"} if p.auto_seat else set()
        if p.auto_screw_count:
            skipped.add("screw_count")
        self.adjusted = {
            k: v
            for k, v in asdict(p).items()
            if k not in skipped and v != asdict(requested)[k]
        }

    def preview(self):
        return dict(
            vertices=np.round(self.mesh.vertices, 5).tolist(),
            faces=self.mesh.faces.tolist(),
            profile=np.round(self.profile, 5).tolist(),
            parameters=asdict(self.parameters),
            adjusted=self.adjusted,
            screws=[(h.x, h.y) for h in self.holes if not h.bolt],
            bolts=[(h.x, h.y) for h in self.holes if h.bolt],
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            material_grams=crimp.estimate_material(self.mesh),
            triangles=len(self.mesh.faces),
            watertight=bool(self.mesh.is_watertight),
            # Thin sides or a shallow crack cap the edge rounding; the lab
            # limits the slider to what was built.
            control_limits=(
                {
                    "edge_radius": max(
                        LIMITS["edge_radius"][0], math.floor(self.cap * 2) / 2
                    )
                }
                if self.cap < LIMITS["edge_radius"][1]
                else {}
            ),
        )


def fit_crack(requested):
    """Ease the flare, then the constriction, until the crack stays GAP
    open at its floor and a block fits the bed. A flare out closes the
    floor; a flare in widens the block, so each side keeps its thickness
    where the crack is widest."""
    p = requested
    for _ in range(80):
        tan = math.tan(math.radians(p.flare))
        closed = p.shape == "block" and p.width - 2 * p.depth * tan < GAP - 1e-9
        wide = p.shape == "block" and p.width + 2 * (p.side + lean(p)) > BED + 1e-9
        if not closed and not wide:
            break
        p = replace(p, flare=p.flare - 0.5 if p.flare > 0 else p.flare + 0.5)
    if p.shape == "block":
        floor = p.width - 2 * p.depth * math.tan(math.radians(p.flare))
        room = math.floor(max(0.0, min(floor, p.width) - GAP) * 2) / 2
        if p.constriction > room:
            p = replace(p, constriction=room)
    return p


def build(requested, quality="preview"):
    if quality not in QUALITY:
        raise ValueError("Unknown mesh quality.")
    requested = parse_parameters(asdict(requested))
    p = fit_crack(requested)
    # A longer crack levers harder on the wall: chosen from the size, each
    # side takes one more screw for every SCREW_STEP its length runs past
    # SCREW_LENGTH.
    automatic = p.auto_screw_count and not p.bolt_mount
    if automatic:
        count = 2 + max(0, math.ceil((p.length - SCREW_LENGTH) / SCREW_STEP))
        p = replace(p, screw_count=min(LIMITS["screw_count"][1], count))
    # One side alone must not turn on a single screw.
    fewest = 1 if p.shape == "block" else 2
    solid, profile, columns, cap = loft(p, "preview")
    sides = columns[:2] if p.shape == "block" else columns[:1]
    holes = []
    if p.screws:
        target = (
            min(SEAT_MAX, round(SEAT_SHARE * body_depth(p) * 2) / 2)
            if p.auto_seat
            else p.seat_depth
        )
        if min(width_of(c) for c in sides) < max(
            p.head_diameter + 3, p.shank_diameter + 4
        ):
            raise ValueError(
                "The screw recesses do not fit in the sides of this crack. Thicken the sides, lower the edge rounding, ease an inward flare, use a smaller screw head, or turn holes off."
            )
        if p.bolt_mount:
            # The bolt goes through the floor of a block's crack, or the
            # middle of one side; its anti-rotation screw sits in a side,
            # down the crack from it.
            floor = columns[2] if p.shape == "block" else columns[0]
            if width_of(floor) < p.bolt_head_diameter + 3:
                raise ValueError(
                    "The bolt recess does not fit the floor of this crack. Widen the crack, ease its flare, or use screws instead."
                    if p.shape == "block"
                    else "The bolt recess does not fit this side. Thicken the side, lower the edge rounding, or use screws instead."
                )
            outlines = [
                region(c) for c in ([*sides, floor] if p.shape == "block" else sides)
            ]
            proxy = mounting_proxy(solid, [o for o in outlines if o])
            targets, reach = screw_targets(p, sides[-1:], 1)
            screw_at = np.array([targets[0][0], -reach])
            holes = fit_bolt_and_screw(
                p,
                proxy,
                np.array(proxy.bounding_box()).reshape(2, 3),
                target,
                screw_target=screw_at,
            )
            if not holes:
                raise ValueError(
                    "The bolt and its screw do not fit this crack. Deepen the back, widen the crack, or use screws instead."
                )
        else:
            proxy = mounting_proxy(solid, [o for o in map(region, sides) if o])
            while True:
                targets, _ = screw_targets(p, sides, p.screw_count)
                fitted = screw_layout(
                    replace(p, screw_count=len(targets)), proxy, target, targets=targets
                )
                # Each screw belongs in its own side; the shared layout
                # takes the nearest spot that fits, which may be across the
                # crack.
                per_side = p.screw_count
                if fitted and all(
                    inside(hole, sides[i // per_side]) for i, hole in enumerate(fitted)
                ):
                    holes = fitted
                    break
                if automatic and p.screw_count > fewest:
                    p = replace(p, screw_count=p.screw_count - 1)
                    continue
                raise ValueError(
                    "The screws do not fit along this crack. Use fewer or smaller screws, lengthen the crack, thicken the sides, or turn holes off."
                )
        p = replace(p, seat_depth=holes[0].seat)
    if quality == "export":
        solid, profile, columns, cap = loft(p, quality)
    if holes:
        solid = drill(solid, holes, solid.bounding_box()[5])
    # Every crack body is a Manifold solid, so the shared check reads it
    # back as is: no vertex merge, no triangle removal (see RIL-31).
    message = "The crack must remain one closed body."
    if len(solid.decompose()) != 1:
        raise ValueError(message)
    mesh = closed_mesh(solid, message)
    return Model(mesh, p, requested, profile, holes, cap)
