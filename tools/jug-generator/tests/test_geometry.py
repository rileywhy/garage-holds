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

    def test_manual_seat_survives_turning_screws_off(self):
        # Dragging the seat slider sets auto_seat off; turning the mounting
        # holes off afterwards must still build a closed body.
        for quality in ("preview", "export"):
            model = build(
                Parameters(screws=False, auto_seat=False, seat_depth=12), quality
            )
            self.assertTrue(model.mesh.is_watertight)
            self.assertEqual(model.screws, [])

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

    def test_mounting_clearance_from_body_edges(self):
        def boundary_distance(point, contours):
            distances = []
            for contour in contours:
                a = np.asarray(contour)
                edges = np.roll(a, -1, axis=0) - a
                t = np.clip(((point - a) * edges).sum(axis=1) / (edges * edges).sum(axis=1), 0, 1)
                distances.extend(np.linalg.norm(point - (a + t[:, None] * edges), axis=1))
            return min(distances)

        for preset in PRESETS.values():
            for bolt in (False, True):
                for wrap in (0, preset.end_wrap):
                    with self.subTest(width=preset.width, bolt=bolt, wrap=wrap):
                        model = build(replace(preset, bolt_mount=bolt, end_wrap=wrap))
                        p = engine_parameters(model.parameters)
                        uncut = build(replace(model.parameters, screws=False))
                        solid = crimp._solid(uncut.mesh)
                        for centers, shank, head, is_bolt in (
                            (model.screws, p.shank_diameter, p.head_diameter, False),
                            (model.bolts, p.bolt_diameter, p.bolt_head_diameter, True),
                        ):
                            seat = model.parameters.seat_depth
                            cone = 0 if is_bolt else (head - shank) / 2
                            for z, diameter in ((0.5, shank), (seat / 2, shank), (seat + cone + 0.5, head)):
                                contours = solid.slice(z).to_polygons()
                                for center in centers:
                                    self.assertTrue(crimp._inside_contours(*center, contours))
                                    self.assertGreaterEqual(boundary_distance(np.array(center), contours) - diameter / 2, 4.9)

    def test_deeper_mounting_arc_for_odd_and_even_hole_counts(self):
        for count in range(2, 7):
            with self.subTest(count=count):
                p = Parameters(screw_count=count, width=240, body_height=125)
                model, exported = build(p), build(p, "export")
                neutral = build(replace(model.parameters, auto_seat=False, screw_arc=0))
                self.assertEqual(model.screws, exported.screws)
                self.assertTrue(model.mesh.is_watertight)
                self.assertTrue(exported.mesh.is_watertight)
                a, b = np.array(neutral.screws), np.array(model.screws)
                np.testing.assert_allclose(a[:, 0], b[:, 0])
                np.testing.assert_allclose(a[[0, -1]], b[[0, -1]])
                np.testing.assert_allclose(b[:, 1], b[::-1, 1], atol=1e-7)
                if count > 2:
                    self.assertTrue((b[1:-1, 1] < a[1:-1, 1]).all())
                    self.assertTrue((a[:, 1] - b[:, 1] <= 6.001).all())
                else:
                    np.testing.assert_allclose(a, b)

    def test_jug_uses_the_crimp_engine_exactly(self):
        for p in PRESETS.values():
            jug, original = (
                build(p),
                crimp.build(
                    engine_parameters(p),
                    end_wrap=p.end_wrap / 100,
                    arc_rise=p.arc_rise * p.size / 100,
                    jug=True,
                    screw_arc=p.screw_arc,
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
        self.assertEqual(Parameters().body_height, 100)
        self.assertGreaterEqual(model.parameters.body_height, 100)
        self.assertLessEqual(model.parameters.body_height, 130)
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
        self.assertGreater(xs[-1] - xs[0], widths["two-handed jug"] * 0.35)

    def test_body_height_changes_geometry_and_manual_span_is_exact(self):
        low = build(Parameters(body_height=130))
        high = build(Parameters(body_height=150))
        self.assertEqual(low.parameters.body_height, 130)
        self.assertEqual(high.parameters.body_height, 150)
        self.assertGreater(high.mesh.extents[1], low.mesh.extents[1] + 10)
        for span in (40, 60, 80):
            p = Parameters(auto_spacing=False, screw_spacing=span)
            preview, exported = build(p), build(p, "export")
            self.assertAlmostEqual(preview.screws[-1][0] - preview.screws[0][0], span)
            self.assertEqual(preview.screws, exported.screws)
            self.assertFalse(preview.parameters.auto_spacing)

    def test_automatic_span_increases_with_hole_count(self):
        for width in (158, 240):
            spans = []
            for count in range(2, 7):
                model = build(Parameters(width=width, screw_count=count))
                self.assertEqual(len(model.screws), count)
                spans.append(model.screws[-1][0] - model.screws[0][0])
            self.assertTrue((np.diff(spans) > 0).all(), spans)

    def test_manual_span_limit_is_the_largest_slider_value_that_fits(self):
        oversized = build(Parameters(auto_spacing=False, screw_spacing=360))
        self.assertEqual(
            oversized.preview()["control_ranges"]["screw_spacing"]["min"],
            (oversized.parameters.screw_count - 1)
            * (oversized.parameters.head_diameter + 1.5),
        )
        limit = oversized.preview()["control_limits"]["screw_spacing"]
        self.assertEqual(oversized.parameters.screw_spacing, limit)
        self.assertEqual(oversized.screws[-1][0] - oversized.screws[0][0], limit)
        self.assertEqual(
            build(Parameters(auto_spacing=False, screw_spacing=limit)).screws,
            oversized.screws,
        )

    def test_screw_arc_control_and_saved_settings(self):
        self.assertEqual(parse_parameters({}).screw_arc, 6)
        self.assertEqual(parse_parameters({"screw_arc": 30}).screw_arc, 20)
        for invalid in (True, "6", float("nan")):
            with self.assertRaises(ValueError):
                parse_parameters({"screw_arc": invalid})
        flat = build(Parameters(body_height=150, screw_arc=0))
        curved = build(Parameters(body_height=150, screw_arc=12))
        self.assertLess(curved.screws[1][1], flat.screws[1][1] - 5)
        self.assertEqual(curved.screws[0], flat.screws[0])
        self.assertEqual(curved.screws[-1], flat.screws[-1])
        saved = parse_parameters(design_document(curved.parameters)["parameters"])
        self.assertEqual(saved.screw_arc, curved.parameters.screw_arc)
        self.assertGreater(saved.screw_arc, 5)
        self.assertLessEqual(saved.screw_arc, 12)
        self.assertEqual(build(saved, "export").screws, curved.screws)

    def test_arc_limit_prevents_silent_slider_plateau(self):
        model = build(Parameters(screw_arc=20))
        limit = model.preview()["screw_arc_limit"]
        self.assertEqual(model.parameters.screw_arc, limit)
        self.assertGreater(limit, 0)
        self.assertLess(limit, 20)
        flat = build(Parameters(screw_arc=0))
        self.assertLess(model.screws[1][1], flat.screws[1][1])

    def test_seat_only_changes_recess_depth(self):
        for bolt in (False, True):
            models = [build(Parameters(body_height=150, bolt_mount=bolt, auto_seat=False, seat_depth=seat)) for seat in (6, 10)]
            np.testing.assert_allclose(models[0].mesh.bounds, models[1].mesh.bounds)
            np.testing.assert_allclose(models[0].profile, models[1].profile)
            self.assertEqual(models[0].parameters.body_height, models[1].parameters.body_height)
            self.assertEqual([m.parameters.seat_depth for m in models], [6, 10])
            self.assertEqual(models[0].screws, models[1].screws)
            self.assertEqual(models[0].bolts, models[1].bolts)
        high = build(Parameters(auto_seat=False, seat_depth=60))
        self.assertEqual(high.parameters.seat_depth, high.preview()["seat_depth_limit"])
        self.assertEqual(high.screws, build(Parameters()).screws)
        self.assertTrue(high.mesh.is_watertight)

    def test_seat_above_profile_removes_the_recess(self):
        shallow = build(Parameters(auto_seat=False, seat_depth=6))
        above = build(Parameters(auto_seat=False, seat_depth=60))
        beyond = build(Parameters(auto_seat=False, seat_depth=140))
        np.testing.assert_allclose(shallow.mesh.bounds, above.mesh.bounds)
        self.assertEqual(above.screws, shallow.screws)
        self.assertEqual(above.parameters.seat_depth, above.preview()["seat_depth_limit"])
        np.testing.assert_allclose(above.mesh.vertices, beyond.mesh.vertices)
        np.testing.assert_array_equal(above.mesh.faces, beyond.mesh.faces)
        self.assertGreater(above.mesh.volume, shallow.mesh.volume)

    def test_automatic_span_uses_finished_width(self):
        for preset in PRESETS.values():
            model = build(preset)
            self.assertGreaterEqual(model.parameters.screw_spacing / model.mesh.extents[0], 0.59)

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
