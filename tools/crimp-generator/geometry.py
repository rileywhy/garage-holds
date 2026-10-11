"""Rounded profiles lofted into a crimp; exact Boolean screw cutters.

Coordinates: X across the hold, Y up the wall, Z out from the wall.
The mounting/print face stays on Z=0. No GUI, filesystem, or server state.
"""

import math
from dataclasses import asdict, dataclass

import manifold3d as manifold
import numpy as np
import trimesh

from parameters import Parameters, parse_parameters


@dataclass
class Model:
    mesh: trimesh.Trimesh
    profile: np.ndarray
    screws: list[tuple[float, float]]
    grip_inner: tuple[float, float]
    grip_outer: tuple[float, float]
    lip_radius: float

    def preview(self) -> dict:
        return dict(
            lip_radius=self.lip_radius,
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
            0 if radii[index] == 0 or abs(turn) < 1e-8 else radii[index] * math.tan(abs(turn) / 2)
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
            angles = angle + np.linspace(0, turn, segments + 1)
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
    if inner[0] <= -p.body_height / 2:
        raise ValueError(
            "This depth and incut fold the grip below the body. Increase body height, or reduce depth or incut."
        )
    points = np.array(
        [
            (-p.body_height / 2, 0),
            (-p.body_height * 0.34, projection * 0.53),
            outer,
            inner,
            (inner[0], 0),
        ]
    )
    profile, used = _rounded_outline(
        points, [0, p.body_rounding, p.lip_radius, 1.5, 0], segments
    )
    # The lip rounds as far as the edge and body allow. A radius larger than
    # the grip face can hold is reported back rather than refused, so very
    # rounded, slopey edges are reachable from any starting point.
    return profile, inner, outer, round(used[2], 2)


def _loft(
    p: Parameters, quality: str
) -> tuple[trimesh.Trimesh, np.ndarray, tuple, tuple, float]:
    if quality not in {"preview", "export"}:
        raise ValueError("Unknown mesh quality.")
    segments, along = (6, 40) if quality == "preview" else (16, 100)
    profile, inner, outer, lip_radius = cross_section(p, segments)
    half, rounding = p.width / 2, p.end_rounding
    core = half - rounding
    cap_angles = np.linspace(0, math.pi / 2, segments + 2)[1:-1]
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
        yz[:, 0] *= cap
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
    vertices = np.vstack(([[-half, 0, 0]], *rings, [[half, 0, 0]]))
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


def build(p: Parameters, quality: str = "preview") -> Model:
    p = parse_parameters(asdict(p))
    mesh, profile, inner, outer, lip_radius = _loft(p, quality)
    solid = _solid(mesh)
    if mesh.bounds[0, 2] < -1e-6:
        raise ValueError(
            "Body character crosses the flat back. Reduce body character or taper, or deepen the edge."
        )
    screws = []
    if p.screws:
        cone_height = (p.head_diameter - p.shank_diameter) / 2
        seat_top = p.seat_depth + cone_height
        # Resolve mounting on the same mesh for both qualities. Otherwise a
        # finer rounded end can shift automatic spacing between preview/STL.
        mounting_solid = (
            _solid(_loft(p, "preview")[0]) if quality == "export" else solid
        )
        screws = _screw_positions(p, mounting_solid, seat_top)
        for x, hole_y in screws:
            shank = manifold.Manifold.cylinder(
                p.seat_depth + 1, p.shank_diameter / 2, circular_segments=48
            ).translate((x, hole_y, -1))
            cone = manifold.Manifold.cylinder(
                cone_height, p.shank_diameter / 2, p.head_diameter / 2, 48
            ).translate((x, hole_y, p.seat_depth))
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
    return Model(mesh, profile, screws, inner, outer, lip_radius)


def _screw_positions(
    p: Parameters, solid: manifold.Manifold, seat_top: float
) -> list[tuple[float, float]]:
    """Fit a centred row, respecting both the recesses and adjacent gaps."""
    contours = solid.slice(seat_top + 0.5).to_polygons()
    angles = np.linspace(0, 2 * math.pi, 32, endpoint=False)
    radius = p.head_diameter / 2 + 0.75
    offsets = radius * np.column_stack((np.cos(angles), np.sin(angles)))
    minimum_span = (p.screw_count - 1) * (p.head_diameter + 1.5)
    preferred_span = max(p.width * 0.6, minimum_span)
    spans = (
        [0]
        if p.screw_count == 1
        else (
            np.arange(preferred_span, minimum_span - 1e-9, -1)
            if p.auto_spacing
            else [p.screw_spacing]
        )
    )
    for span in spans:
        positions = [
            (x, -p.body_height * 0.02 + p.bow * (1 - (x / (p.width / 2)) ** 2))
            for x in np.linspace(-span / 2, span / 2, p.screw_count)
        ]
        if all(
            _inside_contours(x + dx, y + dy, contours)
            for x, y in positions
            for dx, dy in offsets
        ):
            return positions
    raise ValueError(
        "The screw recess does not fit inside this body. Use fewer holes or smaller recesses, lower the seat, adjust the span, widen or deepen the body, or turn holes off."
    )


def _inside_contours(x: float, y: float, contours) -> bool:
    """Even/odd point containment for Manifold's planar slice polygons."""
    inside = False
    for contour in contours:
        for i, a in enumerate(contour):
            b = contour[i - 1]
            if (a[1] > y) != (b[1] > y):
                crossing = (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]
                if x < crossing:
                    inside = not inside
    return inside
