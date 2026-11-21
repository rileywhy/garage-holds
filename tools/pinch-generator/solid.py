"""The closed solid both pinch bodies end in: sections lofted up the wall and
closed onto a point at each end."""

import manifold3d as manifold
import numpy as np
import trimesh


def lofted_solid(rings, first, last):
    """A Manifold solid through rings of equal point counts, each fanned shut
    onto the point beyond it: first before the rings, last after them."""
    vertices = np.vstack(([first], *rings, [last]))
    n, count = len(rings[0]), len(rings)
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces.append((0, 1 + k, 1 + j))
        for i in range(count - 1):
            a, b = 1 + i * n + j, 1 + i * n + k
            faces.extend(((a, b, b + n), (a, b + n, a + n)))
        a, b = 1 + (count - 1) * n + j, 1 + (count - 1) * n + k
        faces.append((a, b, len(vertices) - 1))
    mesh = trimesh.Trimesh(vertices, faces, process=True)
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
            "The pinch could not form a closed solid. Try less extreme shape settings."
        )
    return solid
