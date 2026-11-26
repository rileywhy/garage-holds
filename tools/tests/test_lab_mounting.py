"""Compare fitted mounting and the drilled mesh across the hold labs."""

import importlib
import unittest
from pathlib import Path

import manifold3d as manifold
import numpy as np

from tools.hold_mounting import SCREW_HEAD_MARGIN

# Default screw-only exports, from the default branch before sharing the fit.
# Ordered pairs are the reported bore centers in millimeters.
DEFAULT_MOUNTING = {
    # Crack fits its own rows (crack-generator screw_room) and shares the
    # drill and bolt fit; it joined main after the fit was shared.
    "crack": (
        20,
        [
            (-27.716306, -27.0),
            (-29.724802, 27.0),
            (27.716306, -27.0),
            (29.724802, 27.0),
        ],
    ),
    "crimp": (11, [(-30, -0.96), (0, -0.96), (30, -0.96)]),
    "foot": (6.5, [(-7.180071, 1.272811), (7.180071, 1.272811)]),
    "jug": (
        10,
        [
            (-40.507788, -8.804173),
            (-22.279283, -22.878616),
            (22.279283, -22.878616),
            (40.507788, -8.804173),
        ],
    ),
    "pinch": (19, [(0, -17.872640), (0, 0), (0, 17.872640)]),
    "pocket": (
        20,
        [(-22.875808, 33.273903), (22.875808, 33.273903), (0, -39.512760)],
    ),
    "round-pinch": (19, [(0, -20.9), (0, 0), (0, 20.9)]),
    "sloper": (20, [(0, -36.975), (41.439316, 18.4875), (-41.439316, 18.4875)]),
}


class LabMounting(unittest.TestCase):
    def assert_bore(self, mesh, center, height, radius, margin=0):
        solid = manifold.Manifold(
            manifold.Mesh64(mesh.vertices.copy(), mesh.faces.astype(np.uint64))
        )
        self.assertEqual(solid.status(), manifold.Error.NoError)
        contours = solid.slice(height).to_polygons()
        distances = []
        for contour in contours:
            points = np.vstack((contour, contour[0])) - center
            edges = np.diff(points, axis=0)
            lengths_squared = (edges**2).sum(axis=1)
            nonzero = lengths_squared > 0
            start = points[:-1][nonzero]
            edges = edges[nonzero]
            t = -(start * edges).sum(axis=1) / lengths_squared[nonzero]
            nearest = start + np.clip(t, 0, 1)[:, None] * edges
            distances.append(np.linalg.norm(nearest, axis=1).min())
        bore, *neighbors = sorted(distances)
        # The mesh uses polygonal circles. Measure against the inscribed
        # radius with enough tolerance for 48 segments and float32 vertices.
        self.assertAlmostEqual(bore, radius, delta=0.025)
        self.assertTrue(neighbors)
        self.assertGreaterEqual(neighbors[0] - radius, margin - 0.04)

    def test_defaults_keep_seat_depth_and_positions_with_shared_screw_margin(self):
        tools = Path(__file__).resolve().parents[1]
        labs = {
            p.parent.name.removesuffix("-generator")
            for p in tools.glob("*-generator/parameters.py")
        }
        self.assertEqual(labs, DEFAULT_MOUNTING.keys())
        self.assertEqual(SCREW_HEAD_MARGIN, 1.5)
        for lab, (seat, centers) in DEFAULT_MOUNTING.items():
            with self.subTest(lab=lab):
                package = f"tools.{lab}-generator"
                contract = importlib.import_module(f"{package}.parameters")
                geometry = importlib.import_module(f"{package}.geometry")
                params = contract.parse_parameters(contract.schema()["defaults"])
                preview = geometry.build(params)
                export = geometry.build(params, "export")
                self.assertEqual(preview.parameters.seat_depth, seat)
                self.assertEqual(export.parameters.seat_depth, seat)
                for output in (preview.preview(), export.preview()):
                    self.assertEqual(output["bolts"], [])
                    np.testing.assert_allclose(output["screws"], centers, atol=1e-6)
                for center in centers:
                    shank, head = params.shank_diameter / 2, params.head_diameter / 2
                    self.assert_bore(export.mesh, center, seat - 0.1, shank)
                    self.assert_bore(
                        export.mesh,
                        center,
                        seat + head - shank + 0.1,
                        head,
                        SCREW_HEAD_MARGIN,
                    )

    def test_bolt_and_screw_seat_and_positions_match_preview_in_every_lab(self):
        # The default crack is too narrow at its floor for a bolt recess and
        # refuses one (its own tests cover that), so it is left out here.
        for lab in DEFAULT_MOUNTING.keys() - {"crack"}:
            with self.subTest(lab=lab):
                package = f"tools.{lab}-generator"
                contract = importlib.import_module(f"{package}.parameters")
                geometry = importlib.import_module(f"{package}.geometry")
                params = contract.parse_parameters(
                    {**contract.schema()["defaults"], "bolt_mount": True}
                )
                preview = geometry.build(params)
                export = geometry.build(params, "export")
                seat = export.parameters.seat_depth
                self.assertEqual(preview.parameters.seat_depth, seat)
                preview_mount, export_mount = preview.preview(), export.preview()
                for kind in ("bolts", "screws"):
                    self.assertEqual(len(export_mount[kind]), 1)
                    np.testing.assert_allclose(
                        export_mount[kind], preview_mount[kind], atol=1e-6
                    )
                bolt, screw = export_mount["bolts"][0], export_mount["screws"][0]
                self.assertAlmostEqual(bolt[0], 0)
                shank, head = params.shank_diameter / 2, params.head_diameter / 2
                self.assert_bore(
                    export.mesh, bolt, seat - 0.1, params.bolt_diameter / 2
                )
                self.assert_bore(
                    export.mesh, bolt, seat + 0.1, params.bolt_head_diameter / 2
                )
                self.assert_bore(export.mesh, screw, seat - 0.1, shank)
                self.assert_bore(
                    export.mesh,
                    screw,
                    seat + head - shank + 0.1,
                    head,
                    SCREW_HEAD_MARGIN,
                )

    def test_custom_shape_recess_keeps_its_seat_position_and_margin(self):
        geometry = importlib.import_module("tools.custom-shape-generator.geometry")
        y, x = np.ogrid[:256, :256]
        material = ((abs(x - 128) < 72) & (abs(y - 128) < 52)).astype(int)
        request = {
            "document": {
                "version": 1,
                "size": 256,
                "material": material.ravel().tolist(),
                "holes": [{"x": 128.5, "y": 128.5}],
            },
            "parameters": {"scale": 150, "depth": 30, "incut": 0},
        }
        export = geometry.build(request)
        preview = geometry.build({**request, "action": "preview"})
        seat = export.metadata["seatDepth"]
        self.assertEqual(preview.metadata["seatDepth"], seat)
        self.assertEqual(seat, 12)
        self.assert_bore(export, (0, 0), seat - 0.1, 2.75)
        self.assert_bore(export, (0, 0), seat + 2.85, 5.5, SCREW_HEAD_MARGIN)
