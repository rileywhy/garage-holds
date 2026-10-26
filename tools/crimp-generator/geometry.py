"""Rounded profiles lofted into a crimp; exact Boolean screw cutters.

Coordinates: X across the hold, Y up the wall, Z out from the wall.
The mounting/print face stays on Z=0. No GUI, filesystem, or server state.
"""

import math

# Standalone GUI entry points also need the repository's shared hardware code.
import sys
import time
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.hold_mounting import (
    assert_closed,
    closed_mesh,
    drill,
    fit_bolt_and_screw,
    lowest_seat,
)

if __package__:
    from .parameters import Parameters, parse_parameters, seat_height
else:
    from parameters import Parameters, parse_parameters, seat_height


@dataclass
class Model:
    mesh: trimesh.Trimesh
    profile: np.ndarray
    screws: list[tuple[float, float]]
    grip_inner: tuple[float, float]
    grip_outer: tuple[float, float]
    lip_radius: float
    seat_depth: float
    # The settings actually built, and the ones the generator changed to
    # make the shape work (see build): the exported design carries these.
    parameters: Parameters
    adjusted: dict = field(default_factory=dict)
    bolts: list[tuple[float, float]] = field(default_factory=list)
    screw_arc_limit: float | None = None
    seat_depth_limit: float | None = None
    screw_spacing_limit: float | None = None
    screw_spacing_minimum: float | None = None

    def preview(self) -> dict:
        return dict(
            material_grams=estimate_material(self.mesh),
            lip_radius=self.lip_radius,
            seat_depth=self.seat_depth,
            adjusted=self.adjusted,
            vertices=np.round(self.mesh.vertices, 5).tolist(),
            faces=self.mesh.faces.tolist(),
            profile=np.round(self.profile, 5).tolist(),
            screws=self.screws,
            bolts=self.bolts,
            screw_arc_limit=self.screw_arc_limit,
            seat_depth_limit=self.seat_depth_limit,
            control_limits={
                key: value
                for key, value in {
                    "screw_arc": self.screw_arc_limit,
                    "seat_depth": self.seat_depth_limit,
                    "screw_spacing": self.screw_spacing_limit,
                }.items()
                if value is not None
            },
            control_ranges={
                "screw_spacing": {
                    "min": self.screw_spacing_minimum,
                    "max": self.screw_spacing_limit,
                }
            }
            if self.screw_spacing_minimum is not None
            else {},
            grip_inner=self.grip_inner,
            grip_outer=self.grip_outer,
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            volume_cm3=round(self.mesh.volume / 1000, 2),
            triangles=len(self.mesh.faces),
            # The outer span, first screw to last: the same quantity as the
            # screw_spacing setting, so the lab can show it on the slider.
            screw_spacing=round(self.screws[-1][0] - self.screws[0][0], 2)
            if len(self.screws) > 1
            else None,
            watertight=bool(self.mesh.is_watertight),
        )


def estimate_material(mesh: trimesh.Trimesh) -> list[int]:
    """Rough PETG mass: 1.6 mm solid shell plus 25–40% of the remaining core.

    Area × thickness is a first-order shell allowance, capped at solid volume
    for thin models. This is not slicing; no supports, brim or purge is included.
    PETG density: Prusament TDS, 1.27 g/cm³.
    """
    volume = float(mesh.volume)
    shell = min(volume, float(mesh.area) * 1.6)
    core = volume - shell
    return [round((shell + core * infill) / 1000 * 1.27) for infill in (0.25, 0.4)]


def _rounded_outline(
    points: np.ndarray, radii: list[float], segments: int
) -> tuple[np.ndarray, list[float]]:
    """Circular corner fillets and subdivided connecting lines, in Y/Z.

    Fillets that would overrun a side shrink to fit: each side keeps a sliver
    of straight line, shared in proportion by the two corners on it, so a
    big lip fillet can use nearly the whole grip face when the shelf fillet
    beside it is small. The radii actually used are returned.
    """
    count = len(points)
    incomings, outgoings, turns, wanted = [], [], [], []
    for index, point in enumerate(points):
        before, after = points[index - 1], points[(index + 1) % count]
        incoming, outgoing = point - before, after - point
        incoming = incoming / np.linalg.norm(incoming)
        outgoing = outgoing / np.linalg.norm(outgoing)
        turn = math.atan2(
            incoming[0] * outgoing[1] - incoming[1] * outgoing[0], incoming @ outgoing
        )
        incomings.append(incoming)
        outgoings.append(outgoing)
        turns.append(turn)
        wanted.append(
            0
            if radii[index] == 0 or abs(turn) < 1e-8
            else radii[index] * math.tan(abs(turn) / 2)
        )
    scale = [1.0] * count
    for index in range(count):
        following = (index + 1) % count
        room = 0.96 * np.linalg.norm(points[following] - points[index])
        total = wanted[index] + wanted[following]
        if total > room:
            scale[index] = min(scale[index], room / total)
            scale[following] = min(scale[following], room / total)
    starts, ends, arcs, used = [], [], [], []
    for index, point in enumerate(points):
        incoming, outgoing, turn = incomings[index], outgoings[index], turns[index]
        radius, distance = radii[index] * scale[index], wanted[index] * scale[index]
        if distance == 0:
            start = end = point
            arc = point[None, :]
        else:
            start, end = point - incoming * distance, point + outgoing * distance
            normal = np.array([-incoming[1], incoming[0]]) * np.sign(turn)
            center = start + normal * radius
            angle = math.atan2(*(start - center)[::-1])
            # A broad lip needs more samples than a small body fillet. Bound
            # angular steps as well as keeping the minimum sample count.
            arc_segments = max(
                segments, math.ceil(abs(turn) / (math.pi / (6 * segments)))
            )
            angles = angle + np.linspace(0, turn, arc_segments + 1)
            arc = center + radius * np.column_stack((np.cos(angles), np.sin(angles)))
        starts.append(start)
        ends.append(end)
        arcs.append(arc)
        used.append(radius)
    contour = []
    for index, arc in enumerate(arcs):
        contour.extend(arc)
        end, following = ends[index], starts[(index + 1) % count]
        if np.linalg.norm(end - following) > 1e-8:
            contour.extend(
                end + (following - end) * t
                for t in np.linspace(0, 1, segments + 1)[1:-1]
            )
    return np.asarray(contour), used


def cross_section(
    p: Parameters, segments: int = 12
) -> tuple[np.ndarray, tuple, tuple, float]:
    """The centre outline plus the grip corners and the lip radius that fit."""
    support = 6.0
    projection = p.edge_depth + support
    outer = (p.body_height / 2, projection)
    inner = (outer[0] - p.edge_depth * math.tan(math.radians(p.incut)), support)
    shelf_at_wall = inner[0] - support * math.tan(math.radians(p.incut))
    if shelf_at_wall <= -p.body_height / 2:
        raise ValueError(
            "This depth and incut fold the grip below the body. Increase body height, or reduce depth or incut."
        )
    points = np.array(
        [
            (-p.body_height / 2, 0),
            (-p.body_height * 0.34, projection * 0.53),
            outer,
            (shelf_at_wall, 0),
        ]
    )
    # One continuous shelf plane reaches the wall. The former bend/fillet at
    # the 6 mm root made a second raised edge behind a heavily rounded lip.
    profile, used = _rounded_outline(
        points, [0, p.body_rounding, p.lip_radius, 0], segments
    )
    # The lip rounds as far as the edge and body allow. A radius larger than
    # the grip face can hold is reported back rather than refused, so very
    # rounded, slopey edges are reachable from any starting point.
    return profile, inner, outer, round(used[2], 2)


def _end_center_y(p: Parameters) -> float:
    """Round each end towards the midpoint of the actual mounting face.

    With a deep incut, the shelf reaches the wall below Y=0. Collapsing the
    ends to the origin then pulls them above the shelf into pointed wings.
    The back-face midpoint stays inside the body for every valid profile.
    """
    return -(p.edge_depth + 6) * math.tan(math.radians(p.incut)) / 2


def _loft(
    p: Parameters, quality: str, end_wrap: float = 0, arc_rise: float = 0
) -> tuple[trimesh.Trimesh, np.ndarray, tuple, tuple, float]:
    if quality not in {"preview", "export"}:
        raise ValueError("Unknown mesh quality.")
    segments, along = (6, 40) if quality == "preview" else (16, 100)
    profile, inner, outer, lip_radius = cross_section(p, segments)
    half, rounding = p.width / 2, p.end_rounding
    end_center = _end_center_y(p)
    core = half - rounding
    cap_angles = np.linspace(0, math.pi / 2, 2 * segments + 2)[1:-1]
    x_values = np.concatenate(
        (
            -core - rounding * np.sin(cap_angles[::-1]),
            np.linspace(-core, core, along + 1),
            core + rounding * np.sin(cap_angles),
        )
    )
    random = np.random.default_rng(p.seed)
    phase = random.uniform(0, 2 * math.pi, 2)
    frequency = random.uniform([2.5, 7], [6.5, 12])
    secondary = random.uniform(0.2, 0.6)
    # Fade out before the contact face/rounded lip, including extreme incuts.
    # Multiplicative depth changes keep the back flat at every character level.
    angle = math.radians(p.incut)
    below_grip = (outer[0] - profile[:, 0]) * math.cos(angle) + (
        profile[:, 1] - outer[1]
    ) * math.sin(angle)
    weight = np.clip((below_grip - 2 * p.lip_radius) / (p.body_height * 0.3), 0, 1)
    weight *= np.sin(np.pi * np.clip(profile[:, 1] / (p.edge_depth + 6), 0, 1))
    rings = []
    for x in x_values:
        u = x / half
        cap = math.sqrt(max(0, 1 - (max(0, abs(x) - core) / rounding) ** 2))
        yz = profile.copy()
        yz[:, 0] = end_center + (yz[:, 0] - end_center) * cap
        yz[:, 1] *= cap * (1 - p.taper / 100 * u)
        yz[:, 0] += p.bow * (1 - u * u)
        # Seeds vary the number, position and balance of broad body folds.
        fold = (
            math.sin(frequency[0] * u + phase[0])
            + secondary * math.sin(frequency[1] * u + phase[1])
        ) / (1 + secondary)
        # Recessed folds are shallower than raised ones, retaining body depth
        # for screw seats even with strong character.
        strength = 0.3 if fold >= 0 else 0.15
        yz[:, 1] *= 1 + p.character * strength * fold * weight
        # Sweep the entire grip toward the board without squeezing or
        # changing its incut. The wall cuts the curved body at its ends.
        yz[:, 1] *= 1 + arc_rise * (1 - u * u) / max(profile[:, 1])
        yz[:, 1] -= end_wrap * (p.edge_depth + 6) * u * u
        rings.append(np.column_stack((np.full(len(profile), x), yz)))
    tip_z = -end_wrap * (p.edge_depth + 6)
    vertices = np.vstack(
        ([[-half, end_center, tip_z]], *rings, [[half, end_center, tip_z]])
    )
    count, ring_count = len(profile), len(rings)
    faces = []
    for j in range(count):
        next_j = (j + 1) % count
        faces.append((0, 1 + next_j, 1 + j))
        for i in range(ring_count - 1):
            a, b = 1 + i * count + j, 1 + i * count + next_j
            faces.extend(((a, b, b + count), (a, b + count, a + count)))
        a, b = 1 + (ring_count - 1) * count + j, 1 + (ring_count - 1) * count + next_j
        faces.append((a, b, len(vertices) - 1))
    mesh = trimesh.Trimesh(vertices, faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    if end_wrap:
        # Plane trim makes a broad, coplanar mounting face rather than a
        # collapsed pole or a separately added foot.
        solid = _solid(mesh).trim_by_plane((0, 0, 1), 0)
        result = solid.to_mesh()
        mesh = trimesh.Trimesh(
            result.vert_properties[:, :3], result.tri_verts, process=True
        )
    # The displayed section must include the same bow and seeded folds as
    # the centre ring of the mesh, rather than showing its unmodified profile.
    profile = rings[len(rings) // 2][:, 1:]
    return (
        mesh,
        profile,
        (inner[0] + p.bow, inner[1]),
        (outer[0] + p.bow, outer[1]),
        lip_radius,
    )


def _solid(mesh: trimesh.Trimesh) -> manifold.Manifold:
    solid = manifold.Manifold(
        manifold.Mesh(
            vert_properties=np.asarray(mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError(
            "The shape could not form a closed solid. Try less extreme shape settings."
        )
    return solid


# Body height grows by this much per attempt when the screws need room,
# by at most BODY_GROWTH before the seat is allowed to drop further.
BODY_STEP = 3.0
BODY_GROWTH = 30.0
BODY_MAX = 150.0


# The least height of flat back a hold keeps against the wall, so a steep
# incut still mounts on a real face rather than a sliver. The screw check
# grows the body further when the shanks need more.
MIN_BACK_FACE = 15.0


def minimum_body_height(p: Parameters) -> float:
    """The least body height that keeps a MIN_BACK_FACE tall back below
    where the shelf meets the wall, for this depth and incut."""
    if p.incut <= 0:
        return 0.0
    # The shelf runs on to the wall, 6 mm behind the inner grip corner.
    return math.ceil(
        (p.edge_depth + 6) * math.tan(math.radians(p.incut)) + MIN_BACK_FACE
    )


class _NoRoomForScrews(ValueError):
    pass


# The screw fit searches seats, body heights and rows. A few in-range
# shapes used to run past Vercel's 30 s function limit; the search now
# gives up in words well inside it, leaving time for the mesh itself.
FIT_BUDGET_S = 15.0
TOO_SLOW = (
    "Fitting the screws is taking too long for this shape. Use fewer screw "
    "holes, a smaller head recess or a less extreme body, or turn holes off."
)


def _check_deadline(deadline: float | None) -> None:
    if deadline is not None and time.monotonic() > deadline:
        raise ValueError(TOO_SLOW)


# The Jug Lab sizes its body once, test-fitting the hardware at the seat it
# has always used there, so the seat rule (RIL-136) leaves every jug's
# outside, and the time it takes to find, as it was.
JUG_BODY_SEAT = 12.0


def automatic_seat(p: Parameters) -> float:
    """The automatic seat on this body, the Jug Lab's included (RIL-136)."""
    return seat_height(replace(p, auto_seat=True))


def build(
    p: Parameters,
    quality: str = "preview",
    *,
    end_wrap: float = 0,
    arc_rise: float = 0,
    jug: bool = False,
    screw_arc: float = 6.0,
    budget_s: float | None = FIT_BUDGET_S,
) -> Model:
    """Builds the shape, growing the body height when that is what it takes:
    first to keep the shelf above the body, then until the screw recesses
    fit. The settings used come back on the model, with what changed. The
    whole fit has budget_s seconds, after which it fails in words."""
    deadline = time.monotonic() + budget_s if budget_s is not None else None
    p = parse_parameters(asdict(p), jug=jug or end_wrap > 0)
    requested = p.body_height
    body_max = 300 if jug or end_wrap > 0 else BODY_MAX
    start = max(p.body_height, min(body_max, minimum_body_height(p)))
    heights = np.arange(start, min(body_max, start + BODY_GROWTH) + 1e-9, BODY_STEP)
    if jug:
        # Resolve the body from shape and hardware clearance once. Changing
        # a recess depth must never grow the outside of the hold.
        mounting_base = math.ceil(
            (p.edge_depth + 6) * max(0, math.tan(math.radians(p.incut)))
            + max(MIN_BACK_FACE, p.shank_diameter + 16, p.bolt_head_diameter + 10)
        )
        start = max(start, mounting_base)
        # Complex arches can need more base than the center profile alone
        # predicts. Resolve that using a standard automatic mount, without
        # consulting the requested recess depth or screw span.
        reference = replace(p, auto_seat=True, auto_spacing=True)
        for height in np.arange(start, min(body_max, start + BODY_GROWTH) + 1e-9, BODY_STEP):
            reference = replace(reference, body_height=float(height))
            reference_mesh = _loft(reference, "preview", end_wrap, arc_rise)[0]
            if fit_bolt_and_screw(
                reference, _solid(reference_mesh), reference_mesh.bounds,
                JUG_BODY_SEAT, edge_clearance=5.0,
            ):
                start = float(height)
                break
        heights = np.array([start])
    # A taller body is preferred to a shallow seat: the seat may drop to
    # its floor first, and only once the body has grown as far as it will
    # may it go lower still, so unusually compact profiles stay printable.
    floors = [lowest_seat(automatic_seat(p)), 0.5] if p.auto_seat else [0.5]
    model = None
    # A later, lower floor revisits every height; the seats above the
    # earlier floor failed there already and are not tried again.
    tried: dict[float, float] = {}
    for floor in floors:
        for height in heights:
            _check_deadline(deadline)
            p = replace(p, body_height=float(height))
            try:
                model = _build(
                    p, quality, floor, end_wrap, arc_rise, jug, screw_arc, deadline,
                    tried.get(float(height)),
                )
                break
            except _NoRoomForScrews:
                tried[float(height)] = floor
                continue
        if model:
            break
    if model is None:
        raise ValueError(
            "The screw recess does not fit inside this body. Use fewer holes or smaller recesses, lower the seat, adjust the span, widen or deepen the body, or turn holes off."
        )
    if p.body_height != requested:
        model.adjusted["body_height"] = p.body_height
    # A manual seat that had to come down (to the body's limit, or to keep
    # the recesses inside the body) is reported like any other change.
    if not p.auto_seat and model.seat_depth < p.seat_depth - 1e-9:
        model.adjusted["seat_depth"] = model.seat_depth
    # So is a manual span the fit had to change.
    if not p.auto_spacing and not math.isclose(
        model.parameters.screw_spacing, p.screw_spacing
    ):
        model.adjusted["screw_spacing"] = model.parameters.screw_spacing
    return model


def _build(
    p: Parameters,
    quality: str,
    seat_floor: float = 0.5,
    end_wrap: float = 0,
    arc_rise: float = 0,
    jug: bool = False,
    screw_arc: float = 6.0,
    deadline: float | None = None,
    tried_down_to: float | None = None,
) -> Model:
    mesh, profile, inner, outer, lip_radius = _loft(p, quality, end_wrap, arc_rise)
    solid = _solid(mesh)
    if mesh.bounds[0, 2] < -1e-6:
        raise ValueError(
            "Body character crosses the flat back. Reduce body character or taper, or deepen the edge."
        )
    screws = []
    bolts = []
    arc_limit = None
    spacing_limit = None
    spacing_minimum = (
        (p.screw_count - 1) * (p.head_diameter + 1.5)
        if p.screws and not p.bolt_mount
        else None
    )
    seat_limit = (
        max(0.5, float(mesh.bounds[1, 2]) - p.head_diameter)
        if p.screws
        else None
    )
    seat = automatic_seat(p) if p.auto_seat else seat_height(p)
    # With mounting holes off there is no limit to clamp to; the seat slider
    # may still have turned auto_seat off before the holes were removed.
    if not p.auto_seat and seat_limit is not None:
        seat = min(seat, seat_limit)
    if p.screws and p.bolt_mount:
        mounting_mesh = (
            _loft(p, "preview", end_wrap, arc_rise)[0] if quality == "export" else mesh
        )
        mounting_solid = _solid(mounting_mesh) if quality == "export" else solid
        holes = fit_bolt_and_screw(
            p, mounting_solid, mounting_mesh.bounds, seat,
            edge_clearance=5.0 if jug else None,
            enclose_requested=not jug,
            layout_target=(
                min(automatic_seat(p), seat_limit)
                if not p.auto_seat
                else None
            ),
        )
        if not holes:
            raise _NoRoomForScrews()
        seat = holes[0].seat
        # The design carries the seat actually drilled, as the screw branch
        # does, so the slider and a reopened file show the real recess.
        p = replace(p, seat_depth=seat)
        bolts = [(h.x, h.y) for h in holes if h.bolt]
        screws = [(h.x, h.y) for h in holes if not h.bolt]
        solid = drill(solid, holes, float(mesh.bounds[1, 2]))
    elif p.screws:
        requested_seat = seat
        if jug or not p.auto_seat:
            seat = min(automatic_seat(p), seat_limit)
        cone_height = (p.head_diameter - p.shank_diameter) / 2
        # Resolve mounting on the same mesh for both qualities. Otherwise a
        # finer rounded end can shift automatic spacing between preview/STL.
        mounting_solid = (
            _solid(_loft(p, "preview", end_wrap, arc_rise)[0])
            if quality == "export"
            else solid
        )
        mounting_width = float(
            (_loft(p, "preview", end_wrap, arc_rise)[0] if quality == "export" else mesh).extents[0]
        )
        maximum_span = math.floor(min(mounting_width, 360.0 if jug else 260.0))
        minimum_span = max(0.0, (p.screw_count - 1) * (p.head_diameter + 1.5))
        # Search broadly in 8 mm increments, then refine the first fitting
        # interval to the slider's 1 mm precision.
        limit_spans = np.unique(
            np.append(
                np.arange(maximum_span, minimum_span - 1e-9, -8.0),
                math.ceil(minimum_span),
            )
        )[::-1]
        limit_candidates = _screw_candidates(
            p, jug=jug or end_wrap > 0, mounting_width=mounting_width,
            spans=limit_spans,
        )
        candidates = _screw_candidates(p, jug=jug or end_wrap > 0, mounting_width=mounting_width)
        # An automatic seat is as high as the recesses allow: start at the
        # share of the depth and come down until the row fits. A manual
        # seat below the automatic target is searched the same way, down
        # to the request, so a low seat is drilled where it was asked for
        # instead of the body growing or the shape being refused.
        seats = (
            np.arange(seat, seat_floor - 1e-9, -0.5)
            if p.auto_seat or jug
            else np.arange(seat, min(seat, requested_seat) - 1e-9, -0.5)
        )
        arc_passes = (True, False) if jug else (False,)
        selected_room = None
        rooms: dict[float, list] = {}

        def room_at(seat: float) -> list:
            key = round(float(seat), 6)
            if key not in rooms:
                rooms[key] = _screw_room(
                    p, mounting_solid, float(seat),
                    edge_clearance=5.0 if jug else None,
                )
            return rooms[key]

        def widest_span(seat: float) -> float | None:
            """The widest span with a row that fits at this seat, to the
            slider's 1 mm: a coarse search in 8 mm steps, then the first
            fitting interval refined."""
            room_polygons = room_at(seat)
            widest = _screw_positions(
                p, mounting_solid, float(seat), limit_candidates,
                edge_clearance=5.0 if jug else None,
                arc_bias=screw_arc if jug else 6.0,
                room_polygons=room_polygons,
            )
            if not widest:
                return None
            coarse_span = round(widest[-1][0] - widest[0][0], 6)
            refine_spans = np.arange(
                min(maximum_span, coarse_span + 7), coarse_span - 1e-9, -1.0
            )
            refined = _screw_positions(
                p, mounting_solid, float(seat),
                _screw_candidates(
                    p, jug=jug or end_wrap > 0,
                    mounting_width=mounting_width, spans=refine_spans,
                ),
                edge_clearance=5.0 if jug else None,
                arc_bias=screw_arc if jug else 6.0,
                room_polygons=room_polygons,
            )
            return round(
                refined[-1][0] - refined[0][0] if refined else coarse_span, 6
            )

        def fit_row(rows: np.ndarray, seats: np.ndarray = seats):
            """The first seat, from the top down, with a row from `rows`
            that fits: the row, the seat and the room it was fitted in."""
            for require_arc in arc_passes:
                for seat in seats:
                    _check_deadline(deadline)
                    room_polygons = room_at(seat)
                    screws = _screw_positions(
                        p, mounting_solid, float(seat), rows,
                        edge_clearance=5.0 if jug else None,
                        arc_bias=6.0 if jug else screw_arc,
                        require_arc=require_arc,
                        room_polygons=room_polygons,
                    )
                    if screws:
                        return screws, float(seat), room_polygons
            return [], None, None

        # Seats an earlier pass at this height already found no row at
        # (see build) would fail the same way, so only the new ones are
        # tried; the span fallback below is new to this pass and keeps
        # every seat.
        untried = (
            seats[seats < tried_down_to - 1e-9] if tried_down_to is not None else seats
        )
        screws, seat, selected_room = fit_row(candidates, untried)
        if not screws and not p.auto_spacing:
            # The manual span may be wider than the body allows at any
            # seat. The widest span that does fit, at the lowest seat, is
            # then searched from the top seat down, like a request for that
            # span, so the design that comes back builds the same hold when
            # it is reopened.
            spacing_limit = widest_span(seats[-1])
            if spacing_limit is not None and p.screw_spacing > spacing_limit:
                fitted_candidates = _screw_candidates(
                    replace(p, screw_spacing=spacing_limit),
                    jug=jug or end_wrap > 0,
                    mounting_width=mounting_width,
                )
                screws, seat, selected_room = fit_row(fitted_candidates)
                if screws:
                    candidates = fitted_candidates
        if not screws:
            raise _NoRoomForScrews()
        # The span the slider may reach is found once, at the seat used,
        # rather than at every seat visited on the way down.
        spacing_limit = widest_span(seat)
        if not p.auto_spacing:
            spacing_limit = max(
                spacing_limit or 0.0, round(screws[-1][0] - screws[0][0], 6)
            )
        if jug:
            # Resolve one mounting section for every arc setting, then apply
            # the requested inner-hole offset without moving outer holes.
            neutral = _screw_positions(
                p, mounting_solid, seat, candidates,
                edge_clearance=5.0, arc_bias=0,
                room_polygons=selected_room,
            )
            deepest = _screw_positions(
                p, mounting_solid, seat, candidates,
                edge_clearance=5.0, arc_bias=1e6,
                room_polygons=selected_room,
            )
            half_span = max(abs(neutral[0][0]), 1)
            limits = []
            for a, b in zip(neutral, deepest):
                weight = max(0, 1 - (a[0] / half_span) ** 2)
                if weight > 1e-8:
                    limits.append((a[1] - b[1]) / weight)
            arc_limit = math.floor((min(limits, default=0) + 1e-6) * 2) / 2
            screws = _screw_positions(
                p, mounting_solid, seat, candidates,
                edge_clearance=5.0, arc_bias=min(screw_arc, arc_limit),
                room_polygons=selected_room,
            )
        if not p.auto_seat and jug:
            # Jug Lab lets the seat climb to the top of the body on purpose:
            # a seat above the profile simply removes the recess.
            seat = requested_seat
        elif not p.auto_seat:
            # The row was fitted at the automatic seat. A manual seat above
            # it is only drilled where every recess still sits inside the
            # body; otherwise the seat comes down to the highest height that
            # does. Before this check a high seat on a steep rail could put
            # the countersink rim outside the body (RIL-37).
            seat = _highest_enclosed_seat(
                p, mounting_solid, screws, requested_seat, seat
            )
        p = replace(p, seat_depth=seat)
        seat_top = seat + cone_height
        for x, hole_y in screws:
            shank = manifold.Manifold.cylinder(
                seat + 1, p.shank_diameter / 2, circular_segments=48
            ).translate((x, hole_y, -1))
            cone = manifold.Manifold.cylinder(
                cone_height, p.shank_diameter / 2, p.head_diameter / 2, 48
            ).translate((x, hole_y, seat))
            bore = manifold.Manifold.cylinder(
                float(mesh.bounds[1, 2]) + 1, p.head_diameter / 2, circular_segments=48
            ).translate((x, hole_y, seat_top))
            solid = solid - (shank + cone + bore)
    # A drilled hold is read back from Manifold as is; an undrilled one
    # keeps the loft mesh exactly as built. Either way the closed-solid
    # check no longer removes zero-area triangles first, which opened
    # pinholes in valid meshes (see closed_mesh).
    message = "The generated mesh did not pass the closed-solid checks."
    if screws or bolts:
        mesh = closed_mesh(solid, message)
    else:
        assert_closed(mesh, message)
    # A manual span is replaced by the span actually drilled. A bolt mount
    # has one anti-rotation screw, so its "span" is 0 and the setting is
    # left alone; otherwise the exported design could not be reopened.
    if len(screws) > 1 and not p.auto_spacing and not p.bolt_mount:
        actual_span = round(screws[-1][0] - screws[0][0], 6)
        if not math.isclose(p.screw_spacing, actual_span):
            p = replace(p, screw_spacing=actual_span)
    return Model(mesh, profile, screws, inner, outer, lip_radius, seat, p, bolts=bolts, screw_arc_limit=arc_limit, seat_depth_limit=seat_limit, screw_spacing_limit=spacing_limit, screw_spacing_minimum=spacing_minimum)


def _highest_enclosed_seat(
    p: Parameters, solid: manifold.Manifold, screws, requested: float,
    fitted: float, *, edge_clearance=None,
) -> float:
    """The highest seat, from the requested one down to the fitted one in
    half-millimetre steps, at which every chosen hole still has body around
    its shank and head recess. A request below the fitted seat is used as
    is: a lower recess only has more body around it."""
    if requested <= fitted + 1e-9:
        return float(requested)
    for candidate in np.arange(requested, fitted - 1e-9, -0.5):
        try:
            room = _screw_room(p, solid, float(candidate), edge_clearance=edge_clearance)
        except ValueError:
            continue  # the seat is above the body here
        if room and all(_inside_contours(x, y, room) for x, y in screws):
            return float(candidate)
    return float(fitted)


def _screw_candidates(
    p: Parameters,
    jug: bool = False,
    mounting_width: float | None = None,
    spans: np.ndarray | None = None,
) -> np.ndarray:
    """Every row worth trying, in order of preference: wider spans first,
    then the smallest drop below the lip-limited height. Shape (rows,
    holes, 2) of x and y centres."""
    radius = p.head_diameter / 2 + 0.75
    # Large lip fillets reach lower down the front. Keep the entire head
    # recess below the fillet tangent, rather than cutting into the grip.
    _, _, outer, lip_radius = cross_section(p)
    incoming = np.array([p.body_height * 0.84, (p.edge_depth + 6) * 0.47])
    incoming /= np.linalg.norm(incoming)
    outgoing = np.array([-math.tan(math.radians(p.incut)), -1.0])
    outgoing /= np.linalg.norm(outgoing)
    turn = math.atan2(
        incoming[0] * outgoing[1] - incoming[1] * outgoing[0], incoming @ outgoing
    )
    lip_start = outer[0] - incoming[0] * lip_radius * math.tan(abs(turn) / 2)
    end_center = _end_center_y(p)

    def hole_height(x):
        """The highest the row may sit at this x, following bow and ends."""
        half = p.width / 2
        # Check the head's full horizontal span, including the rounded ends.
        edge_x = abs(x) + radius if lip_start >= end_center else max(0, abs(x) - radius)
        cap = math.sqrt(
            max(0, 1 - (max(0, edge_x - (half - p.end_rounding)) / p.end_rounding) ** 2)
        )
        bow = p.bow * (1 - (x / half) ** 2)
        lip_y = end_center + (lip_start - end_center) * cap
        return min(-p.body_height * 0.02, lip_y - radius) + bow

    minimum_span = (p.screw_count - 1) * (p.head_diameter + 1.5)
    if jug and p.auto_spacing:
        minimum_span = max(minimum_span, p.width * (0.20 + 0.06 * (p.screw_count - 2)))
    preferred_span = max(p.width * 0.6, minimum_span)
    if jug and p.auto_spacing:
        preferred_span = max((mounting_width or p.width) * (0.60 + 0.02 * (p.screw_count - 2)), minimum_span)
    supplied_spans = spans is not None
    if spans is None:
        spans = (
            np.arange(preferred_span, minimum_span - 1e-9, -1)
            if p.auto_spacing
            else np.array([float(p.screw_spacing)])
        )
    if jug and p.auto_spacing and not supplied_spans:
        # Fit the count-dependent span by lowering the seat first, rather
        # than silently packing extra holes into a narrower row.
        spans = np.array([preferred_span])
    drops = np.arange(0, p.body_height + 1e-9, 0.5)
    rows = []
    for span in spans:
        xs = np.linspace(-span / 2, span / 2, p.screw_count)
        tops = np.array([hole_height(x) for x in xs])
        ys = tops[None, :] - drops[:, None]
        rows.append(np.stack((np.broadcast_to(xs, ys.shape), ys), axis=2))
    return np.concatenate(rows) if rows else np.zeros((0, p.screw_count, 2))


def _screw_positions(
    p: Parameters, solid: manifold.Manifold, seat: float, candidates: np.ndarray,
    *, edge_clearance: float | None = None, arc_bias: float = 6.0,
    require_arc: bool = False,
    room_polygons=None,
) -> list[tuple[float, float]]:
    """Fit holes within inset body slices, or return an empty list.

    Crimps use the first valid row. Jug mounting follows the usable sections
    with an additional rearward arc, strongest at the center.
    """
    polygons = (
        room_polygons
        if room_polygons is not None
        else _screw_room(p, solid, seat, edge_clearance=edge_clearance)
    )
    if not polygons or not len(candidates):
        return []
    if edge_clearance is None:
        # A crimp row fits only whole, so rows with a hole outside the
        # room's bounding box are out before any edge is tested. (Jug
        # holes pick their options one by one, so every row stays there.)
        low = np.min([np.min(contour, axis=0) for contour in polygons], axis=0)
        high = np.max([np.max(contour, axis=0) for contour in polygons], axis=0)
        possible = np.flatnonzero(
            ((candidates >= low) & (candidates <= high)).all(axis=(1, 2))
        )
        if not len(possible):
            return []
        fits = _inside_mask(candidates[possible].reshape(-1, 2), polygons)
        fits = fits.reshape(len(possible), -1).all(axis=1)
        if not fits.any():
            return []
        row = candidates[possible[int(np.argmax(fits))]]
        return [(float(x), float(y)) for x, y in row]
    centres = candidates.reshape(-1, 2)
    inside = _inside_mask(centres, polygons).reshape(len(candidates), -1)
    if edge_clearance is not None:
        # Jug shoulders sweep back into the wall. Fit each screw in its
        # own usable section, then deepen the mounting arc toward the base.
        # Keep the widest span that fits every hole; all centers still pass
        # the same shank and head clearance checks.
        starts = np.r_[0, np.flatnonzero(np.diff(candidates[:, 0, 0])) + 1]
        ends = np.r_[starts[1:], len(candidates)]
        for start, end in zip(starts, ends):
            allowed = inside[start:end]
            if not allowed.any(axis=0).all():
                continue
            row = []
            half_span = max(abs(float(candidates[start, 0, 0])), 1.0)
            for index in range(p.screw_count):
                options = candidates[start:end, index][allowed[:, index]]
                # Use the midpoint of the sampled interval (not one grid
                # endpoint), keeping symmetric sections symmetric.
                midpoint = (options[0] + options[-1]) / 2
                if not _inside_mask(midpoint[None, :], polygons)[0]:
                    midpoint = options[len(options) // 2]
                # Outer holes stay put; inner holes move progressively
                # away from the lip. Even counts get a matched inner pair.
                weight = max(0.0, 1.0 - (midpoint[0] / half_span) ** 2)
                if require_arc and midpoint[1] - options[-1, 1] < min(3.0, arc_bias * weight):
                    return []
                target = midpoint.copy()
                target[1] = max(options[-1, 1], midpoint[1] - arc_bias * weight)
                if not _inside_mask(target[None, :], polygons)[0]:
                    rear = options[options[:, 1] <= midpoint[1]]
                    target = rear[np.argmin(abs(rear[:, 1] - target[1]))]
                midpoint = target
                row.append(tuple(map(float, midpoint)))
            if len(row) == p.screw_count:
                return row
        return []
    fits = inside.all(axis=1)
    if not fits.any():
        return []
    row = candidates[int(np.argmax(fits))]
    return [(float(x), float(y)) for x, y in row]


def _screw_room(p: Parameters, solid: manifold.Manifold, seat: float, *, edge_clearance=None):
    cone_height = (p.head_diameter - p.shank_diameter) / 2
    head = p.head_diameter / 2 + (0.75 if edge_clearance is None else edge_clearance)
    # Where a hole centre may sit: the body's slices, each inset by what
    # the hole needs there, intersected. The shank must come out through
    # the flat back with material around it (a steep shelf leaves only a
    # strip of back face), and the head recess must fit from the seat up.
    checks = [
        (0.5, p.shank_diameter / 2 + (2.0 if edge_clearance is None else edge_clearance)),
        (seat + 0.5, head),
        (seat + cone_height + 0.5, head),
    ]
    if edge_clearance is not None:
        checks.insert(1, (seat / 2, p.shank_diameter / 2 + edge_clearance))
    room = None
    for height, inset in checks:
        section = solid.slice(height)
        if section.is_empty():
            raise ValueError(
                "The screw seat is above the top of the body. Lower the seat or deepen the edge."
            )
        region = section.offset(-inset, manifold.JoinType.Round, 2.0, 32)
        room = region if room is None else room ^ region
    return room.to_polygons() if room is not None else []


def _inside_mask(points: np.ndarray, contours) -> np.ndarray:
    """Even/odd containment of many points in Manifold's slice polygons.

    Every edge is tested against a block of points at once; a loop over
    edges in Python took 85% of a slow build. Points outside the contours'
    bounding box are outside without a test, which drops most candidate
    rows below the body."""
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    edges = [
        np.hstack((a, np.roll(a, 1, axis=0)))
        for a in (np.asarray(contour, dtype=float) for contour in contours)
        if len(a)
    ]
    if not edges or not len(points):
        return inside
    ax, ay, bx, by = np.concatenate(edges).T[:, :, None]
    low, high = np.minimum(ax, bx).min(), np.maximum(ax, bx).max()
    bottom, top = np.minimum(ay, by).min(), np.maximum(ay, by).max()
    within = np.flatnonzero((x >= low) & (x <= high) & (y >= bottom) & (y <= top))
    # Blocks keep the edges × points work arrays to a few megabytes.
    for start in range(0, len(within), 2048):
        block = within[start : start + 2048]
        px, py = x[block][None, :], y[block][None, :]
        crosses = (ay > py) != (by > py)
        with np.errstate(divide="ignore", invalid="ignore"):
            crossing = (bx - ax) * (py - ay) / (by - ay) + ax
        hits = crosses & (px < crossing)
        inside[block] = (hits.sum(axis=0) & 1).astype(bool)
    return inside


def _inside_contours(x: float, y: float, contours) -> bool:
    """One point; see _inside_mask."""
    return bool(_inside_mask(np.array([[x, y]], dtype=float), contours)[0])
