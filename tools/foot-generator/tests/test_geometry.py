import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build
from parameters import PRESETS, parse_parameters


class FootTests(unittest.TestCase):
    def test_presets_and_exports(self):
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                a, b = build(p), build(p, "export")
                self.assertTrue(a.mesh.is_watertight and b.mesh.is_watertight)
                self.assertTrue(a.mesh.is_winding_consistent)
                self.assertEqual(len(a.holes), p.screw_count)
                self.assertEqual(a.holes, b.holes)
                self.assertGreater(a.mesh.volume, 0)
                self.assertAlmostEqual(a.mesh.bounds[0, 2], 0, places=5)
                c = build(parse_parameters(asdict(a.parameters)))
                np.testing.assert_allclose(a.mesh.extents, c.mesh.extents)

    def test_scale_without_hardware_is_direct(self):
        p = replace(PRESETS["board edge"], screws=False)
        small, large = build(p), build(replace(p, size=200))
        np.testing.assert_allclose(
            large.mesh.extents, small.mesh.extents * 2, rtol=1e-5
        )
        self.assertAlmostEqual(large.mesh.volume / small.mesh.volume, 8, places=4)

    def test_small_single_screws(self):
        for p in PRESETS.values():
            m = build(replace(p, size=50, screw_count=1))
            self.assertEqual(len(m.holes), 1)
            self.assertEqual(m.holes[0].shank, p.shank_diameter)
            self.assertTrue(m.mesh.is_watertight)

    def test_centered_bolt(self):
        for p in PRESETS.values():
            m = build(replace(p, bolt_mount=True))
            self.assertEqual(len(m.holes), 2)
            self.assertEqual(m.holes[0].x, 0)
            self.assertTrue(m.mesh.is_watertight)

    def test_control_extremes(self):
        for angle in (-50, 60):
            for size in (50, 250):
                m = build(
                    replace(
                        PRESETS["board edge"],
                        incut=angle,
                        size=size,
                        screw_count=1,
                        lip_radius=14,
                    )
                )
                self.assertTrue(m.mesh.is_watertight)

    def test_ball_auto_screws_scale_both_directions(self):
        p = PRESETS["ball"]
        small = build(p)
        large = build(replace(small.parameters, size=150))
        back = build(replace(large.parameters, size=100))
        self.assertEqual([len(m.holes) for m in (small, large, back)], [1, 2, 1])
        self.assertEqual(
            len(build(replace(p, size=150, auto_screw_count=False)).holes), 1
        )

    def test_ball_is_spherical_and_rock_is_distinct(self):
        from geometry import body

        p = replace(PRESETS["ball"], screws=False)
        solid, _, _ = body(p, "preview")
        verts = solid.to_mesh().vert_properties[:, :3]
        outer = verts[verts[:, 2] > 0.001]
        radii = np.linalg.norm(outer - [0, 0, p.edge_depth - p.width / 2], axis=1)
        np.testing.assert_allclose(radii, p.width / 2, rtol=1e-5)
        rock = build(replace(PRESETS["rock tooth"], screws=False))
        self.assertGreater(rock.mesh.extents[2], p.edge_depth)
        self.assertGreater(abs(rock.mesh.bounds[0, 0] + rock.mesh.bounds[1, 0]), 0.1)

    def test_validation(self):
        for values in (
            {"size": float("nan")},
            {"screws": 1},
            {"screw_count": 1.5},
            {"unknown": 0},
        ):
            with self.assertRaises(ValueError):
                parse_parameters(values)


if __name__ == "__main__":
    unittest.main()
