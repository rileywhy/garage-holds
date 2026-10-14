"""Shared bolt + anti-rotation screw fitting for the three hold generators."""

from dataclasses import dataclass

import manifold3d as manifold
import numpy as np


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


def _room(solid, shank, head, seat, bolt):
    cone = 0 if bolt else (head - shank) / 2
    region = None
    for z, margin in (
        (0.5, shank / 2 + 2),
        (seat / 2, shank / 2 + 2),
        (seat + 0.5, head / 2 + 1.5),
        (seat + cone + 2, head / 2 + 1.5),
    ):
        section = solid.slice(z).offset(-margin, manifold.JoinType.Round, 2, 32)
        region = section if region is None else region ^ section
    return region.to_polygons()


def fit_bolt_and_screw(p, solid, bounds, target):
    """Require a centreline M10 counterbore and a separated anti-rotation screw.

    Every recess and shank is checked in inset slices before drilling. Manual
    seats can lower to fit, matching the existing lab fitting behavior.
    """
    lo, hi = bounds
    xs = np.unique(np.append(np.linspace(lo[0], hi[0], 41), 0))
    xx, yy = np.meshgrid(xs, np.linspace(lo[1], hi[1], 45))
    points = np.column_stack((xx.ravel(), yy.ravel()))
    for seat in np.arange(max(2, min(target, hi[2] - 3)), 1.9, -0.5):
        bolts = points[
            _inside(
                points, _room(solid, p.bolt_diameter, p.bolt_head_diameter, seat, True)
            )
        ]
        bolts = bolts[np.abs(bolts[:, 0]) < 1e-8]
        screws = points[
            _inside(
                points, _room(solid, p.shank_diameter, p.head_diameter, seat, False)
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
