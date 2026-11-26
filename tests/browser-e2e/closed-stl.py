"""Check the exported STL itself, independently of the preview mesh."""
import sys

import numpy as np
import trimesh

mesh = trimesh.load_mesh(sys.argv[1], file_type="stl")
assert len(mesh.faces) > 0, "STL has no triangles"
assert np.isfinite(mesh.vertices).all(), "STL has non-finite coordinates"
assert mesh.is_watertight, "STL has open or non-manifold edges"
assert mesh.is_winding_consistent, "STL has inconsistent face winding"
assert mesh.volume > 0, "STL has no positive volume"
