"""Shared bolt + anti-rotation screw fitting for the three hold generators,
and the closed-solid check every generator finishes with."""

from dataclasses import dataclass

import manifold3d as manifold
import numpy as np
import trimesh


def closed_mesh(solid: manifold.Manifold, message: str) -> trimesh.Trimesh:
    """A drilled solid as a trimesh, after confirming it is a closed body.

    Manifold is the authority on whether a solid is closed. Its output
    already shares vertices by index, so the trimesh keeps that topology as
    is (process=False). Merging nearly coincident vertices and then dropping
    the zero-area triangles that creates used to open pinholes in valid
    meshes, and the export was refused for nothing."""
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError(message)
    result = solid.to_mesh()
    mesh = trimesh.Trimesh(
        result.vert_properties[:, :3], result.tri_verts, process=False
    )
    assert_closed(mesh, message)
    return mesh


def assert_closed(mesh: trimesh.Trimesh, message: str) -> None:
    """The same closed-body check for a mesh that was never drilled, kept
    exactly as the loft built it. A zero-area triangle between distinct
    vertices is harmless here and must not be removed: that opens a hole."""
    if not mesh.is_watertight or not mesh.is_winding_consistent or mesh.volume <= 0:
        raise ValueError(message)


@dataclass(frozen=True)
class Hole:
    x: float
    y: float
    shank: float
    head: float
    seat: float
    bolt: bool


def _inside(points, contours):
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    for contour in contours:
        a = np.asarray(contour)
        for (ax, ay), (bx, by) in zip(a, np.roll(a, 1, axis=0)):
            crosses = (ay > y) != (by > y)
            inside[crosses] ^= (
                x[crosses] < (bx - ax) * (y[crosses] - ay) / (by - ay) + ax
            )
    return inside


def _room(solid, shank, head, seat, bolt, edge_clearance=None):
    cone = 0 if bolt else (head - shank) / 2
    region = None
    for z, margin in (
        (0.5, shank / 2 + (2 if edge_clearance is None else edge_clearance)),
        (seat / 2, shank / 2 + (2 if edge_clearance is None else edge_clearance)),
        (seat + 0.5, head / 2 + (1.5 if edge_clearance is None else edge_clearance)),
        (seat + cone + 2, head / 2 + (1.5 if edge_clearance is None else edge_clearance)),
    ):
        section = solid.slice(z).offset(-margin, manifold.JoinType.Round, 2, 32)
        region = section if region is None else region ^ section
    return region.to_polygons()


def fit_bolt_and_screw(
    p, solid, bounds, target, *, edge_clearance=None, layout_target=None,
    enclose_requested=True,
):
    """Require a centreline M10 counterbore and a separated anti-rotation screw.

    Every recess and shank is checked in inset slices before drilling. Manual
    seats can lower to fit, matching the existing lab fitting behavior.
    """
    lo, hi = bounds
    xs = np.unique(np.append(np.linspace(lo[0], hi[0], 41), 0))
    xx, yy = np.meshgrid(xs, np.linspace(lo[1], hi[1], 45))
    points = np.column_stack((xx.ravel(), yy.ravel()))
    requested_seat = target
    if layout_target is not None:
        target = layout_target
    seats = np.arange(max(2, min(target, hi[2] - 3)), 1.9, -0.5)
    for seat in seats:
        bolts = points[
            _inside(
                points, _room(solid, p.bolt_diameter, p.bolt_head_diameter, seat, True, edge_clearance)
            )
        ]
        bolts = bolts[np.abs(bolts[:, 0]) < 1e-8]
        screws = points[
            _inside(
                points, _room(solid, p.shank_diameter, p.head_diameter, seat, False, edge_clearance)
            )
        ]
        if not len(bolts) or not len(screws):
            continue
        center_y = (lo[1] + hi[1]) / 2
        order = np.argsort(abs(bolts[:, 0]) * 3 + abs(bolts[:, 1] - center_y))
        separation = (p.bolt_head_diameter + p.head_diameter) / 2 + 3
        for bolt in bolts[order[:30]]:
            distances = np.linalg.norm(screws - bolt, axis=1)
            eligible = screws[distances >= separation]
            if not len(eligible):
                continue
            # Favor a right-hand screw and a long lever arm, below the bolt
            # when the body has room. This is a layout, not a strength rating.
            score = (
                np.linalg.norm(eligible - bolt, axis=1)
                + (eligible[:, 0] > bolt[0]) * 5
                - np.maximum(0, eligible[:, 1] - bolt[1]) * 0.5
            )
            screw = eligible[np.argmax(score)]
            if layout_target is not None and not p.auto_seat:
                # The layout was found at the automatic seat; the requested
                # seat is used only as high as both recesses stay enclosed,
                # unless the caller lets a seat run above the body (jug).
                seat = (
                    _highest_enclosed_seat(
                        p, solid, bolt, screw, requested_seat, float(seat), edge_clearance
                    )
                    if enclose_requested
                    else requested_seat
                )
            return [
                Hole(
                    *map(float, bolt),
                    p.bolt_diameter,
                    p.bolt_head_diameter,
                    float(seat),
                    True,
                ),
                Hole(
                    *map(float, screw),
                    p.shank_diameter,
                    p.head_diameter,
                    float(seat),
                    False,
                ),
            ]
    return []


def _highest_enclosed_seat(p, solid, bolt, screw, requested, fitted, edge_clearance=None):
    """From the requested seat down to the fitted one, the first height at
    which the bolt counterbore and the screw recess both sit inside the
    body. A request at or below the fitted seat is used as is."""
    if requested <= fitted + 1e-9:
        return float(requested)
    for candidate in np.arange(requested, fitted - 1e-9, -0.5):
        bolt_room = _room(
            solid, p.bolt_diameter, p.bolt_head_diameter, float(candidate), True, edge_clearance
        )
        screw_room = _room(
            solid, p.shank_diameter, p.head_diameter, float(candidate), False, edge_clearance
        )
        if (
            bolt_room
            and screw_room
            and _inside(np.array([bolt]), bolt_room)[0]
            and _inside(np.array([screw]), screw_room)[0]
        ):
            return float(candidate)
    return float(fitted)


def drill(solid, holes, top):
    for hole in holes:
        shank = manifold.Manifold.cylinder(
            hole.seat + 1, hole.shank / 2, circular_segments=64
        ).translate((hole.x, hole.y, -1))
        cone_height = 0 if hole.bolt else (hole.head - hole.shank) / 2
        cutter = shank
        if cone_height:
            cutter += manifold.Manifold.cylinder(
                cone_height, hole.shank / 2, hole.head / 2, 64
            ).translate((hole.x, hole.y, hole.seat))
        cutter += manifold.Manifold.cylinder(
            top + 1, hole.head / 2, circular_segments=64
        ).translate((hole.x, hole.y, hole.seat + cone_height))
        solid -= cutter
    return solid
