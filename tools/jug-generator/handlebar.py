"""The handlebar jug: an oval bar arched off the wall on two flared feet.

Coordinates match the crimp engine: X across the hold, Y up the wall, Z out
from the wall, with the mounting face on Z=0. The bar's centreline is a half
ellipse in the XZ plane; a hand wraps around it through the opening between
bar and wall. Each foot carries two countersunk screws side by side up the
wall, drilled straight into the wall, so the hold never rests on one screw
per end and cannot rock about a single hole.
"""

import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent))
from tools.hold_mounting import (
    MANUAL_MIN_SEAT,
    Hole,
    automatic_seat,
    closed_mesh,
    drill,
)

# The bar is a little wider up the wall than it is thick, so the fingers
# close on a broad oval rather than a round rod.
BAR_WIDTH_SHARE = 1.15
# Feet grow this much thicker along the arch, and wider up the wall, than
# the bar at its middle; the screws can widen them further.
FOOT_THICKNESS_SHARE = 1.4
FOOT_WIDTH_SHARE = 1.5
# Plastic kept around each screw head recess at the seat, and between the
# two heads on one foot.
HEAD_MARGIN = 5.0
HEAD_GAP = 6.0
SCREWS_PER_FOOT = 2


@dataclass
class Handlebar:
    mesh: trimesh.Trimesh
    profile: np.ndarray
    screws: list[tuple[float, float]]
    seat_depth: float
    bolts: list = field(default_factory=list)


def _rings(span, clearance, thickness, foot_width, quality):
    """Cross-section rings along the half-ellipse centreline, each an
    ellipse in the plane normal to the path. The ends continue straight
    into the wall so the trim at Z=0 leaves clean, flat feet."""
    along, around = (120, 48) if quality == "preview" else (260, 96)
    a_mid = thickness / 2
    b_mid = thickness * BAR_WIDTH_SHARE / 2
    a_foot = a_mid * FOOT_THICKNESS_SHARE
    b_foot = foot_width / 2
    # Centreline semi-axes: the legs' inner faces sit `span` apart at the
    # wall and the bar's underside `clearance` off it at the middle.
    cx = span / 2 + a_foot
    cz = clearance + a_mid
    phi = np.linspace(0, 2 * math.pi, around, endpoint=False)
    rings = []

    def ring(centre, normal, a, b):
        return (
            centre[None, :]
            + np.cos(phi)[:, None] * a * normal[None, :]
            + np.sin(phi)[:, None] * b * np.array([0.0, 1.0, 0.0])[None, :]
        )

    thetas = np.linspace(0, math.pi, along)
    for index, theta in enumerate(thetas):
        centre = np.array([-cx * math.cos(theta), 0.0, cz * math.sin(theta)])
        tangent = np.array([cx * math.sin(theta), 0.0, cz * math.cos(theta)])
        tangent /= np.linalg.norm(tangent)
        # Outward in the arch plane: away from the opening.
        normal = np.array([-tangent[2], 0.0, tangent[0]])
        # Flare toward each foot, easing in over the lower part of the leg.
        w = abs(math.cos(theta)) ** 3
        a = a_mid + (a_foot - a_mid) * w
        b = b_mid + (b_foot - b_mid) * w
        if index == 0:
            rings.append(ring(centre - [0, 0, 6.0], normal, a, b))
        rings.append(ring(centre, normal, a, b))
        if index == len(thetas) - 1:
            rings.append(ring(centre - [0, 0, 6.0], normal, a, b))
    return rings, cx, a_foot, b_foot


def _tube(rings):
    count = len(rings[0])
    vertices = np.vstack(rings + [rings[0].mean(axis=0), rings[-1].mean(axis=0)])
    faces = []
    for r in range(len(rings) - 1):
        for k in range(count):
            a = r * count + k
            b = r * count + (k + 1) % count
            c = (r + 1) * count + k
            d = (r + 1) * count + (k + 1) % count
            faces += [(a, c, b), (b, c, d)]
    start, end = len(vertices) - 2, len(vertices) - 1
    last = (len(rings) - 1) * count
    for k in range(count):
        faces.append((start, k, (k + 1) % count))
        faces.append((end, last + (k + 1) % count, last + k))
    mesh = trimesh.Trimesh(vertices, np.array(faces), process=False)
    if mesh.volume < 0:
        mesh.invert()
    return mesh


def screw_spacing(head_diameter):
    """Centre to centre, up the wall, of a foot's two screws."""
    return head_diameter + HEAD_GAP


def build(
    *,
    span,
    clearance,
    thickness,
    screws=True,
    shank_diameter,
    head_diameter,
    auto_seat=True,
    seat_depth=10.0,
    quality="preview",
):
    """A closed, drilled handlebar. Lengths in millimetres, already scaled."""
    spacing = screw_spacing(head_diameter)
    foot_width = max(
        thickness * BAR_WIDTH_SHARE * FOOT_WIDTH_SHARE,
        spacing + head_diameter + 2 * HEAD_MARGIN,
    )
    rings, cx, a_foot, _ = _rings(span, clearance, thickness, foot_width, quality)
    tube = _tube(rings)
    solid = manifold.Manifold(
        manifold.Mesh(
            vert_properties=np.asarray(tube.vertices, dtype=np.float32),
            tri_verts=np.asarray(tube.faces, dtype=np.uint32),
        )
    ).trim_by_plane((0.0, 0.0, 1.0), 0.0)
    top = clearance + thickness
    # The shared rule: 40% of the depth, at most 20 mm. A foot is solid
    # plastic that deep, so the seat never has to come down to fit.
    seat = (
        automatic_seat(top) if auto_seat else max(MANUAL_MIN_SEAT, min(seat_depth, top - 2))
    )
    holes = []
    if screws:
        # Toward the outside of each foot, where the leg curves away above
        # the seat, so the head recess opens out of the shoulder soon.
        offset = max(0.0, a_foot - head_diameter / 2 - HEAD_MARGIN) * 0.6
        for side in (-1, 1):
            for y in (-spacing / 2, spacing / 2):
                holes.append(
                    Hole(
                        x=side * (cx + offset),
                        y=y,
                        shank=shank_diameter,
                        head=head_diameter,
                        seat=seat,
                        bolt=False,
                    )
                )
        solid = drill(solid, holes, top)
    mesh = closed_mesh(
        solid, "The handlebar could not form a closed solid. Try less extreme settings."
    )
    profile = _section_at_middle(solid)
    return Handlebar(
        mesh=mesh,
        profile=profile,
        screws=[(h.x, h.y) for h in sorted(holes, key=lambda h: (h.x, h.y))],
        seat_depth=seat,
    )


def _section_at_middle(solid):
    """The bar's cross-section at X=0 as (y, z) points, wall on the left
    of the lab's drawing: a solid rotated so X becomes the slicing axis."""
    turned = solid.rotate((0.0, 90.0, 0.0))
    polygons = turned.slice(0.0).to_polygons()
    if not polygons:
        return np.zeros((0, 2))
    ring = max(polygons, key=len)
    # After the turn, slice coordinates are (z, y).
    return np.column_stack([ring[:, 1], ring[:, 0]])
