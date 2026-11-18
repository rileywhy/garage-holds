"""Point-in-outline tests on the polygons a slice of a solid gives."""

from __future__ import annotations

import numpy as np


def inside(points, polygons) -> np.ndarray:
    """Even/odd containment of 2D points in a set of polygons (holes
    included), every edge against a block of points at once."""
    points = np.asarray(points, dtype=float).reshape(-1, 2)
    edges = [
        np.hstack((a, np.roll(a, 1, axis=0)))
        for a in (np.asarray(p, dtype=float) for p in polygons)
        if len(a)
    ]
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
