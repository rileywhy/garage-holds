"""Stress inside the hold: a linear elastic solve on a voxel grid.

The hold is filled with cubes of side `h` (eight-node bricks), loaded by
the climber's pull at the finger contact and held by what the rigid model
found: the wall's push under the back, each screw head pulling its seat
toward the wall, and each shank taking its share of the sliding force.
Those loads balance, so the solve needs no supports beyond a vanishing
spring that removes rigid motion; the stress it finds is what the plastic
carries between the loads.

Numpy only (no sparse solver on Vercel): the stiffness is never assembled.
Every brick has the same 24x24 matrix, so a product with the global
stiffness is one gather, one matrix product and one scatter, and a
Jacobi-preconditioned conjugate gradient solves the system.

The plastic is treated as isotropic for stiffness; strength across and
along the print layers is checked separately (see force.py).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

if __package__:
    from .outline import inside
else:
    from outline import inside

# Brick corners in (i, j, k) order, natural coordinates -1 / +1.
CORNERS = np.array([(i, j, k) for k in (0, 1) for j in (0, 1) for i in (0, 1)])
SIGNS = CORNERS * 2 - 1


def _b_matrix(xi, eta, zeta):
    """Strain-displacement matrix of a unit brick at a natural point."""
    s = SIGNS
    dn = np.empty((8, 3))
    dn[:, 0] = s[:, 0] * (1 + s[:, 1] * eta) * (1 + s[:, 2] * zeta) / 8
    dn[:, 1] = s[:, 1] * (1 + s[:, 0] * xi) * (1 + s[:, 2] * zeta) / 8
    dn[:, 2] = s[:, 2] * (1 + s[:, 0] * xi) * (1 + s[:, 1] * eta) / 8
    # The unit brick spans 1 mm, natural coordinates span 2: d/dx = 2 d/dxi.
    dn *= 2
    B = np.zeros((6, 24))
    for a in range(8):
        x, y, z = dn[a]
        c = 3 * a
        B[0, c] = x
        B[1, c + 1] = y
        B[2, c + 2] = z
        B[3, c], B[3, c + 1] = y, x  # gamma_xy
        B[4, c + 1], B[4, c + 2] = z, y  # gamma_yz
        B[5, c], B[5, c + 2] = z, x  # gamma_xz
    return B


def _elasticity(E, nu):
    lam = E * nu / ((1 + nu) * (1 - 2 * nu))
    mu = E / (2 * (1 + nu))
    D = np.zeros((6, 6))
    D[:3, :3] = lam
    D[np.arange(3), np.arange(3)] += 2 * mu
    D[3, 3] = D[4, 4] = D[5, 5] = mu
    return D


def unit_brick(E=1.0, nu=0.35):
    """Stiffness of a 1 mm brick (it scales with h) and the centre B."""
    D = _elasticity(E, nu)
    g = 1 / math.sqrt(3)
    K = np.zeros((24, 24))
    for xi in (-g, g):
        for eta in (-g, g):
            for zeta in (-g, g):
                B = _b_matrix(xi, eta, zeta)
                # Jacobian determinant of the 1 mm brick: (1/2)^3.
                K += B.T @ D @ B / 8
    return K, D, _b_matrix(0, 0, 0)


@dataclass
class Grid:
    """Occupied bricks of a voxel grid and their corner nodes."""

    origin: np.ndarray  # (x, y, z) of the grid's first corner
    h: float
    shape: tuple[int, int, int]  # bricks along x, y, z
    occupied: np.ndarray  # bool, shape
    nodes: np.ndarray  # (n, 3) corner positions
    node_index: np.ndarray  # int, shape + 1, -1 where unused
    elements: np.ndarray  # (m, 8) node ids
    element_ijk: np.ndarray  # (m, 3)


def voxelize(slicer, bounds, h) -> Grid:
    """Bricks whose centres lie inside the solid. `slicer(z)` returns the
    solid's outline polygons at height z; `bounds` is ((x0,y0,z0),(x1,y1,z1))."""
    (x0, y0, z0), (x1, y1, z1) = np.asarray(bounds, dtype=float)
    nx = max(1, int(math.ceil((x1 - x0) / h)))
    ny = max(1, int(math.ceil((y1 - y0) / h)))
    nz = max(1, int(math.ceil((z1 - z0) / h)))
    origin = np.array((x0, y0, z0))
    xs = x0 + (np.arange(nx) + 0.5) * h
    ys = y0 + (np.arange(ny) + 0.5) * h
    gx, gy = np.meshgrid(xs, ys, indexing="ij")
    centres = np.column_stack((gx.ravel(), gy.ravel()))
    occupied = np.zeros((nx, ny, nz), dtype=bool)
    for k in range(nz):
        polygons = slicer(z0 + (k + 0.5) * h)
        if polygons:
            occupied[:, :, k] = inside(centres, polygons).reshape(nx, ny)
    ijk = np.argwhere(occupied)
    used = np.zeros((nx + 1, ny + 1, nz + 1), dtype=bool)
    for c in CORNERS:
        used[ijk[:, 0] + c[0], ijk[:, 1] + c[1], ijk[:, 2] + c[2]] = True
    node_index = np.full(used.shape, -1, dtype=np.int64)
    node_ijk = np.argwhere(used)
    node_index[tuple(node_ijk.T)] = np.arange(len(node_ijk))
    nodes = origin + node_ijk * h
    elements = np.column_stack(
        [node_index[ijk[:, 0] + c[0], ijk[:, 1] + c[1], ijk[:, 2] + c[2]] for c in CORNERS]
    )
    return Grid(origin, h, (nx, ny, nz), occupied, nodes, node_index, elements, ijk)


def spacing_for(bounds, volume, target_bricks=16000, least=1.6, most=4.0):
    """A brick size that fills this hold with about `target_bricks`."""
    h = (volume / target_bricks) ** (1 / 3)
    return float(min(most, max(least, h)))


class Solver:
    """The stiffness of one voxelised hold, reused for every load."""

    def __init__(self, grid: Grid, E=3500.0, nu=0.35):
        self.grid = grid
        K1, self.D, self.B0 = unit_brick(E, nu)
        self.Ke = K1 * grid.h
        self.B0 = self.B0 / grid.h
        e = grid.elements
        self.edofs = (3 * e[:, :, None] + np.arange(3)).reshape(len(e), 24)
        self.ndof = 3 * len(grid.nodes)
        diag = np.bincount(
            self.edofs.ravel(), np.tile(np.diag(self.Ke), len(e)), minlength=self.ndof
        )
        # A vanishing spring on every node removes rigid motion; the loads
        # balance, so it carries (almost) nothing.
        self.eps = 1e-7 * float(diag.mean())
        self.diag = diag + self.eps
        self.last = None

    def multiply(self, u):
        fe = u[self.edofs] @ self.Ke
        return np.bincount(self.edofs.ravel(), fe.ravel(), minlength=self.ndof) + self.eps * u

    def solve(self, f, tolerance=1e-4, limit=3000):
        """Displacements for nodal forces f (ndof,), by Jacobi-preconditioned
        conjugate gradients from the last solution."""
        u = self.last.copy() if self.last is not None and len(self.last) == self.ndof else np.zeros(self.ndof)
        r = f - self.multiply(u)
        norm = np.linalg.norm(f) or 1.0
        z = r / self.diag
        p = z.copy()
        rz = r @ z
        iterations = 0
        for iterations in range(1, limit + 1):
            Ap = self.multiply(p)
            alpha = rz / (p @ Ap)
            u += alpha * p
            r -= alpha * Ap
            if np.linalg.norm(r) < tolerance * norm:
                break
            z = r / self.diag
            rz_next = r @ z
            p = z + (rz_next / rz) * p
            rz = rz_next
        self.last = u
        return u, iterations

    def element_stress(self, u):
        """Stress at each brick's centre: (m, 6) as xx, yy, zz, xy, yz, xz."""
        strain = u[self.edofs] @ self.B0.T
        return strain @ self.D.T


def balance(nodes, forces, weights=None):
    """Adds the smallest rigid-pattern correction (a + b x r on every node)
    that brings the nodal forces to exact equilibrium."""
    n = len(nodes)
    c = nodes.mean(axis=0)
    r = nodes - c
    total = forces.sum(axis=0)
    moment = np.cross(r, forces).sum(axis=0)
    # Correction f_n = a + b x r_n: sum = n a + b x sum(r) = n a (sum r = 0);
    # moment = sum r x (b x r) = (sum |r|^2 I - sum r r^T) b.
    a = -total / n
    J = (r**2).sum() * np.eye(3) - r.T @ r
    b = np.linalg.solve(J + np.eye(3) * 1e-9, -moment)
    return forces + a + np.cross(b, r)


def node_average(grid: Grid, values: np.ndarray) -> np.ndarray:
    """Per-node averages of per-brick values (n,) or (n, k)."""
    values = np.asarray(values, dtype=float)
    flat = values.reshape(len(values), -1)
    n = len(grid.nodes)
    count = np.bincount(grid.elements.ravel(), minlength=n).astype(float)
    out = np.empty((n, flat.shape[1]))
    for c in range(flat.shape[1]):
        out[:, c] = np.bincount(grid.elements.ravel(), np.repeat(flat[:, c], 8), minlength=n)
    out /= np.maximum(count, 1)[:, None]
    return out.reshape((n,) + values.shape[1:])


def interpolate(grid: Grid, node_values: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Node values read at arbitrary points (a surface mesh's vertices):
    trilinear over the grid nodes that exist, the nearest node otherwise."""
    points = np.asarray(points, dtype=float)
    values = np.asarray(node_values, dtype=float)
    flat = values.reshape(len(values), -1)
    shape = np.array(grid.node_index.shape)
    q = (points - grid.origin) / grid.h
    base = np.clip(np.floor(q).astype(int), 0, shape - 2)
    frac = np.clip(q - base, 0, 1)
    total = np.zeros((len(points), flat.shape[1]))
    weight = np.zeros(len(points))
    for c in CORNERS:
        idx = grid.node_index[base[:, 0] + c[0], base[:, 1] + c[1], base[:, 2] + c[2]]
        w = np.prod(np.where(c, frac, 1 - frac), axis=1) * (idx >= 0)
        total += w[:, None] * flat[np.maximum(idx, 0)]
        weight += w
    missing = weight < 1e-9
    if missing.any():
        # Points beyond the grid's filled bricks: the nearest node.
        for start in range(0, int(missing.sum()), 512):
            rows = np.flatnonzero(missing)[start : start + 512]
            d = ((points[rows, None, :] - grid.nodes[None, :, :]) ** 2).sum(axis=2)
            total[rows] = flat[d.argmin(axis=1)]
            weight[rows] = 1
    out = total / weight[:, None]
    return out.reshape((len(points),) + values.shape[1:])
