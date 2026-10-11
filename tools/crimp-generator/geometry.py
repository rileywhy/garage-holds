"""Rounded profiles lofted into a crimp; exact Boolean screw cutters.

Coordinates: X across the hold, Y up the wall, Z out from the wall.
The mounting/print face stays on Z=0. No GUI, filesystem, or server state.
"""

import math
from dataclasses import asdict, dataclass, field, replace

import manifold3d as manifold
import numpy as np
import trimesh

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
            grip_inner=self.grip_inner,
            grip_outer=self.grip_outer,
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            volume_cm3=round(self.mesh.volume / 1000, 2),
            triangles=len(self.mesh.faces),
            screw_spacing=round(self.screws[1][0] - self.screws[0][0], 2)
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
    p: Parameters, quality: str
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
        rings.append(np.column_stack((np.full(len(profile), x), yz)))
    vertices = np.vstack(([[-half, end_center, 0]], *rings, [[half, end_center, 0]]))
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


def minimum_body_height(p: Parameters) -> float:
    """The least body height that keeps the shelf above the lower body
    with a few millimetres to spare, for this depth and incut."""
    if p.incut <= 0:
        return 0.0
    # The shelf runs on to the wall, 6 mm behind the inner grip corner.
    return math.ceil((p.edge_depth + 6) * math.tan(math.radians(p.incut)) + 8)


class _NoRoomForScrews(ValueError):
    pass


def build(p: Parameters, quality: str = "preview") -> Model:
    """Builds the shape, growing the body height when that is what it takes:
    first to keep the shelf above the body, then until the screw recesses
    fit. The settings used come back on the model, with what changed."""
    p = parse_parameters(asdict(p))
    requested = p.body_height
    start = max(p.body_height, min(BODY_MAX, minimum_body_height(p)))
    heights = np.arange(start, min(BODY_MAX, start + BODY_GROWTH) + 1e-9, BODY_STEP)
    # A taller body is preferred to a shallow seat: the seat may drop to
    # half its target first, and only once the body has grown as far as it
    # will may it go lower still.
    floors = [max(3.0, seat_height(p) / 2), 0.5] if p.auto_seat else [0.5]
    model = None
    for floor in floors:
        for height in heights:
            p = replace(p, body_height=float(height))
            try:
                model = _build(p, quality, floor)
                break
            except _NoRoomForScrews:
                continue
        if model:
            break
    if model is None:
        raise ValueError(
            "The screw recess does not fit inside this body. Use fewer holes or smaller recesses, lower the seat, adjust the span, widen or deepen the body, or turn holes off."
        )
    if p.body_height != requested:
        model.adjusted["body_height"] = p.body_height
    return model


def _build(p: Parameters, quality: str, seat_floor: float = 0.5) -> Model:
    mesh, profile, inner, outer, lip_radius = _loft(p, quality)
    solid = _solid(mesh)
    if mesh.bounds[0, 2] < -1e-6:
        raise ValueError(
            "Body character crosses the flat back. Reduce body character or taper, or deepen the edge."
        )
    screws = []
    seat = seat_height(p)
    if p.screws:
        cone_height = (p.head_diameter - p.shank_diameter) / 2
        # Resolve mounting on the same mesh for both qualities. Otherwise a
        # finer rounded end can shift automatic spacing between preview/STL.
        mounting_solid = (
            _solid(_loft(p, "preview")[0]) if quality == "export" else solid
        )
        candidates = _screw_candidates(p)
        # An automatic seat is as high as the recesses allow: start at the
        # share of the depth and come down until the row fits.
        seats = (
            np.arange(seat, seat_floor - 1e-9, -0.5)
            if p.auto_seat
            else np.array([seat])
        )
        for seat in seats:
            screws = _screw_positions(
                p, mounting_solid, seat + cone_height, candidates
            )
            if screws:
                break
        else:
            raise _NoRoomForScrews()
        seat = float(seat)
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
        result = solid.to_mesh()
        mesh = trimesh.Trimesh(
            result.vert_properties[:, :3], result.tri_verts, process=True
        )
    if not mesh.is_watertight or not mesh.is_winding_consistent or mesh.volume <= 0:
        raise ValueError("The generated mesh did not pass the closed-solid checks.")
    return Model(mesh, profile, screws, inner, outer, lip_radius, seat, p)


def _screw_candidates(p: Parameters) -> np.ndarray:
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
    preferred_span = max(p.width * 0.6, minimum_span)
    spans = (
        np.arange(preferred_span, minimum_span - 1e-9, -1)
        if p.auto_spacing
        else np.array([float(p.screw_spacing)])
    )
    drops = np.arange(0, p.body_height + 1e-9, 0.5)
    rows = []
    for span in spans:
        xs = np.linspace(-span / 2, span / 2, p.screw_count)
        tops = np.array([hole_height(x) for x in xs])
        ys = tops[None, :] - drops[:, None]
        rows.append(np.stack((np.broadcast_to(xs, ys.shape), ys), axis=2))
    return np.concatenate(rows) if rows else np.zeros((0, p.screw_count, 2))


def _screw_positions(
    p: Parameters, solid: manifold.Manifold, seat_top: float, candidates: np.ndarray
) -> list[tuple[float, float]]:
    """The first candidate row whose recesses all sit inside the body at
    the seat, or an empty list. The row drops as far as it must when a
    deep edge or incut thins the top of the body."""
    radius = p.head_diameter / 2 + 0.75
    # Where a recess centre may sit: the body's slice at the seat, inset by
    # the recess radius, so a centre inside it has a full margin of material.
    section = solid.slice(seat_top + 0.5)
    if section.is_empty():
        raise ValueError(
            "The screw seat is above the top of the body. Lower the seat or deepen the edge."
        )
    room = section.offset(-radius, manifold.JoinType.Round, 2.0, 32).to_polygons()
    if not room or not len(candidates):
        return []
    centres = candidates.reshape(-1, 2)
    fits = _inside_mask(centres, room).reshape(len(candidates), -1).all(axis=1)
    if not fits.any():
        return []
    row = candidates[int(np.argmax(fits))]
    return [(float(x), float(y)) for x, y in row]


def _inside_mask(points: np.ndarray, contours) -> np.ndarray:
    """Even/odd containment of many points in Manifold's slice polygons."""
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    for contour in contours:
        a = np.asarray(contour, dtype=float)
        b = np.roll(a, 1, axis=0)
        for (ax, ay), (bx, by) in zip(a, b):
            crosses = (ay > y) != (by > y)
            if not crosses.any():
                continue
            crossing = (bx - ax) * (y[crosses] - ay) / (by - ay) + ax
            hits = np.zeros(len(points), dtype=bool)
            hits[crosses] = x[crosses] < crossing
            inside ^= hits
    return inside


def _inside_contours(x: float, y: float, contours) -> bool:
    """One point; see _inside_mask."""
    return bool(_inside_mask(np.array([[x, y]], dtype=float), contours)[0])
