"""Simplify an STL for the browser preview.

The site's 3D preview refuses models over 25 MB or 500k triangles, so a
big upload gets a smaller copy made once, server-side (RIL-87). Quadric
edge collapse through fast_simplification keeps the surface smooth at a
fraction of the triangles; the download always serves the original.
"""

import io

import fast_simplification
import numpy as np
import trimesh

# Well inside the browser limits, with the surface still smooth: 150k
# triangles is a 7.5 MB binary STL.
DEFAULT_TARGET_TRIANGLES = 150_000
MAX_TARGET_TRIANGLES = 400_000
MIN_TARGET_TRIANGLES = 1_000


def load_stl(data: bytes) -> trimesh.Trimesh:
    """One mesh from binary or ASCII STL bytes; a scene collapses to one."""
    loaded = trimesh.load(io.BytesIO(data), file_type="stl", force="mesh")
    if not isinstance(loaded, trimesh.Trimesh) or len(loaded.faces) == 0:
        raise ValueError("This STL has no usable triangles.")
    return loaded


def simplify_stl(data: bytes, target_triangles: int = DEFAULT_TARGET_TRIANGLES):
    """Binary STL bytes with at most target_triangles faces, and the count.

    A mesh already at or under the target comes back re-encoded as binary
    STL, so the copy is always the compact form.
    """
    target = int(min(MAX_TARGET_TRIANGLES, max(MIN_TARGET_TRIANGLES, target_triangles)))
    mesh = load_stl(data)
    if len(mesh.faces) > target:
        vertices, faces = fast_simplification.simplify(
            np.asarray(mesh.vertices, dtype=np.float64),
            np.asarray(mesh.faces, dtype=np.int64),
            target_count=target,
        )
        mesh = trimesh.Trimesh(vertices, faces, process=True)
        if len(mesh.faces) == 0:
            raise ValueError("The mesh collapsed while simplifying.")
    return mesh.export(file_type="stl"), int(len(mesh.faces))
