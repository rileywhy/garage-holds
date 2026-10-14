"""Regression checks for Jug Lab's shared crimp geometry."""

import io
import sys
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crimp_engine import geometry as crimp
from geometry import build, engine_parameters
from parameters import PRESETS, Parameters, design_document, parse_parameters


class GeometryTests(unittest.TestCase):
    def test_default_controls_are_centered_and_maximum_jug_fits(self):
        from parameters import CONTROLS

        controls = {c["key"]: c for c in CONTROLS}
        for key in ("edge_depth", "grip_quality"):
            c = controls[key]
            self.assertEqual(getattr(Parameters(), key), (c["min"] + c["max"]) / 2)
        model = build(
            Parameters(size=140, edge_depth=100, grip_quality=180, bolt_mount=True)
        )
        self.assertTrue(model.mesh.is_watertight)
        self.assertEqual(model.bolts[0][0], 0)
        np.testing.assert_allclose(
            build(model.parameters).mesh.vertices, model.mesh.vertices
        )

    def test_calibrated_controls_change_the_intended_geometry(self):
        p = Parameters()
        small, large = build(replace(p, size=80)), build(replace(p, size=125))
        self.assertGreater(large.mesh.extents[0], small.mesh.extents[0] * 1.3)
        self.assertGreater(large.mesh.volume, small.mesh.volume)
        self.assertEqual(
            engine_parameters(replace(p, size=125)).shank_diameter, p.shank_diameter
        )
        self.assertGreater(
            engine_parameters(parse_parameters({"grip_quality": 80})).incut,
            engine_parameters(parse_parameters({"grip_quality": 20})).incut,
        )
        near, far = build(replace(p, arc_rise=0)), build(replace(p, arc_rise=15))
        self.assertGreater(far.mesh.extents[2], near.mesh.extents[2] + 10)
        short, long = build(replace(p, edge_depth=30)), build(replace(p, edge_depth=55))
        self.assertGreater(long.mesh.extents[2], short.mesh.extents[2] + 5)
        for model in (small, large, near, far, short, long):
            self.assertTrue(model.mesh.is_watertight)
            again = build(model.parameters)
            np.testing.assert_allclose(model.mesh.vertices, again.mesh.vertices)

    def test_one_handed_mounting_is_spread_and_staggered(self):
        for name in ("board jug", "deep jug"):
            p = PRESETS[name]
            model = build(p)
            left, middle, right = model.screws
            self.assertGreaterEqual(right[0] - left[0], p.width * 0.32)
            self.assertLess(middle[1], min(left[1], right[1]) - 5)

    def test_jug_uses_the_crimp_engine_exactly(self):
        for p in PRESETS.values():
            jug, original = (
                build(p),
                crimp.build(
                    engine_parameters(p),
                    end_wrap=p.end_wrap / 100,
                    arc_rise=p.arc_rise * p.size / 100,
                ),
            )
            np.testing.assert_array_equal(jug.mesh.vertices, original.mesh.vertices)
            np.testing.assert_array_equal(jug.mesh.faces, original.mesh.faces)

    def test_shoulders_sweep_to_wall(self):
        p = Parameters(screws=False)
        wrapped, straight = build(p), build(replace(p, end_wrap=0))
        # The centre grip stays identical; the whole section sweeps into
        # the board, producing broad flat mounting faces at both ends.
        np.testing.assert_allclose(wrapped.profile, straight.profile)
        back = wrapped.mesh.vertices[np.isclose(wrapped.mesh.vertices[:, 2], 0)]
        for sign in (-1, 1):
            end = back[sign * back[:, 0] > p.width * 0.25]
            self.assertGreater(np.ptp(end[:, 1]), 10)

    def test_arch_preserves_grip_section_before_wall_intersection(self):
        p = Parameters(screws=False, bow=0, end_wrap=100, arc_rise=0)
        straight, arch = build(replace(p, end_wrap=0)), build(p)
        source = straight.mesh.vertices
        # Interior rings retain every profile point above the wall after
        # translation. This catches squeezing or reshaping the contact lip.
        selected = source[
            (np.abs(source[:, 0]) > 20) & (np.abs(source[:, 0]) < 40)
        ].copy()
        selected[:, 2] -= (p.edge_depth + 6) * (selected[:, 0] / (p.width / 2)) ** 2
        selected = selected[selected[:, 2] > 1]
        self.assertGreater(len(selected), 20)
        for vertex in selected:
            self.assertLess(
                np.linalg.norm(arch.mesh.vertices - vertex, axis=1).min(), 1e-4
            )

    def test_presets_export_closed_solids_with_consistent_mounting(self):
        for name, p in PRESETS.items():
            with self.subTest(preset=name):
                a, b = build(p), build(p, "export")
                self.assertTrue(a.mesh.is_watertight)
                self.assertTrue(b.mesh.is_watertight)
                self.assertTrue(b.mesh.is_winding_consistent)
                self.assertGreater(b.mesh.volume, 0)
                self.assertEqual(a.parameters, b.parameters)
                self.assertEqual(a.screws, b.screws)
                loaded = trimesh.load(
                    io.BytesIO(b.mesh.export(file_type="stl")), file_type="stl"
                )
                self.assertTrue(loaded.is_watertight)
                np.testing.assert_allclose(loaded.extents, b.mesh.extents, atol=1e-4)

    def test_default_is_deep_incut_rounded_and_low_projection(self):
        model = build(Parameters())
        self.assertLessEqual(model.mesh.extents[2], 66.01)
        self.assertEqual(model.parameters.edge_depth, 57.5)
        self.assertEqual(model.parameters.grip_quality, 90)
        self.assertEqual(model.parameters.incut, 56)
        self.assertGreaterEqual(model._model.lip_radius, 7)
        self.assertEqual(len(model.screws), 3)
        self.assertAlmostEqual(model.mesh.bounds[0, 2], 0)

    def test_two_handed_jug_is_nearly_twice_as_wide_and_fits_a_bed(self):
        widths = {name: build(p).mesh.extents[0] for name, p in PRESETS.items()}
        for name in ("board jug", "deep jug"):
            self.assertGreater(widths["two-handed jug"], 1.9 * widths[name])
        self.assertLessEqual(widths["two-handed jug"], 256 * 0.95)
        model = build(PRESETS["two-handed jug"])
        self.assertEqual(len(model.screws), 4)
        xs = sorted(x for x, _ in model.screws)
        self.assertGreater(xs[-1] - xs[0], widths["two-handed jug"] * 0.55)
        self.assertNotIn(
            "body_height", build(replace(PRESETS["board jug"], size=125)).adjusted
        )

    def test_saved_parameters_reproduce_adjusted_mesh(self):
        model = build(Parameters(body_height=20, lip_radius=20))
        again = build(parse_parameters(design_document(model.parameters)["parameters"]))
        np.testing.assert_array_equal(model.mesh.vertices, again.mesh.vertices)
        self.assertEqual(design_document(model.parameters)["version"], 2)

    def test_screw_counts_and_seed(self):
        for count in range(2, 7):
            model = build(Parameters(screw_count=count, width=240))
            self.assertEqual(len(model.screws), count)
            self.assertTrue(model.mesh.is_watertight)
        a = build(Parameters(character=1.5, screws=False))
        b = build(Parameters(character=1.5, screws=False, seed=22))
        self.assertGreater(np.max(np.abs(a.profile - b.profile)), 0.1)

    def test_old_scoop_settings_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_parameters({"well_depth": 45})


if __name__ == "__main__":
    unittest.main()
