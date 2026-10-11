import io
import math
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import _inside_contours, _solid, build, cross_section
from parameters import PRESETS, Parameters, design_document, parse_parameters


class GeometryTests(unittest.TestCase):
    def assert_solid(self, model):
        mesh = model.mesh
        self.assertTrue(mesh.is_watertight)
        self.assertTrue(mesh.is_winding_consistent)
        self.assertGreater(mesh.volume, 0)
        self.assertGreaterEqual(mesh.bounds[0, 2], -1e-6)
        self.assertEqual(len(_solid(mesh).decompose()), 1)

    def test_presets_and_stl_round_trip(self):
        for name, settings in PRESETS.items():
            with self.subTest(preset=name):
                preview = build(settings)
                exported = build(settings, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                loaded = trimesh.load(
                    io.BytesIO(exported.mesh.export(file_type="stl")), file_type="stl"
                )
                self.assertTrue(loaded.is_watertight)
                np.testing.assert_allclose(
                    loaded.extents, exported.mesh.extents, atol=1e-4
                )
                self.assertAlmostEqual(
                    loaded.volume / exported.mesh.volume, 1, places=5
                )
                self.assertGreater(len(exported.mesh.faces), len(preview.mesh.faces))
                self.assertAlmostEqual(
                    preview.mesh.volume / exported.mesh.volume, 1, delta=0.01
                )

    def test_contact_angle_and_nominal_depth(self):
        for incut in (-60, 0, 60):
            with self.subTest(incut=incut):
                p = Parameters(incut=incut, lip_radius=2, body_height=150, screws=False)
                _, inner, outer, _ = cross_section(p)
                self.assertEqual(outer[1] - inner[1], p.edge_depth)
                slope = (outer[0] - inner[0]) / p.edge_depth
                self.assertAlmostEqual(math.degrees(math.atan(slope)), incut)
                self.assert_solid(build(p))

    def test_shape_extremes(self):
        cases = [
            Parameters(
                width=20,
                end_rounding=0.5,
                edge_depth=2,
                body_height=10,
                lip_radius=0,
                body_rounding=0,
                incut=0,
                screws=False,
            ),
            Parameters(
                width=300,
                end_rounding=60,
                edge_depth=60,
                body_height=150,
                lip_radius=20,
                body_rounding=30,
                incut=0,
                bow=60,
                character=3,
                taper=80,
                screws=False,
            ),
            Parameters(
                width=300,
                end_rounding=60,
                edge_depth=60,
                body_height=150,
                lip_radius=2,
                incut=60,
                bow=-60,
                character=3,
                taper=-80,
                screws=False,
            ),
            Parameters(width=50),
            Parameters(width=180, bow=15, taper=40, character=1),
            Parameters(edge_depth=8, lip_radius=1, body_height=30),
            Parameters(edge_depth=35, incut=35, body_height=85, screws=False),
            Parameters(incut=-25, bow=-15, end_rounding=22, screws=False),
            Parameters(
                edge_depth=8,
                lip_radius=1,
                character=1,
                taper=40,
                body_height=85,
                screws=False,
            ),
        ]
        for p in cases:
            with self.subTest(parameters=p):
                self.assert_solid(build(p))

    def test_holes_cross_the_back_and_remove_volume(self):
        drilled = build(Parameters())
        undrilled = build(Parameters(screws=False))
        self.assertLess(drilled.mesh.volume, undrilled.mesh.volume)
        self.assertEqual(len(_solid(drilled.mesh).slice(0.1).to_polygons()), 4)
        self.assertEqual(len(drilled.screws), 3)
        self.assertAlmostEqual(drilled.screws[-1][0] - drilled.screws[0][0], 60)

    def test_automatic_spacing_does_not_shift_between_preview_and_export(self):
        p = Parameters(width=50, end_rounding=15, taper=25, edge_depth=12, lip_radius=2)
        preview, exported = build(p), build(p, "export")
        self.assertEqual(preview.screws, exported.screws)
        self.assertLess(preview.screws[-1][0] - preview.screws[0][0], p.width * 0.6)
        self.assert_solid(exported)

    def test_manual_mounting_is_respected_or_rejected(self):
        manual = build(Parameters(auto_spacing=False, screw_spacing=40))
        self.assertEqual(manual.screws[-1][0] - manual.screws[0][0], 40)
        with self.assertRaisesRegex(ValueError, "recess does not fit"):
            build(Parameters(seat_depth=30))
        with self.assertRaisesRegex(ValueError, "screws closer"):
            build(Parameters(width=50, auto_spacing=False))

    def test_oversized_lip_rounding_shrinks_to_fit(self):
        # A radius the grip face cannot hold rounds as far as it can instead
        # of refusing, so slopey edges are reachable; the preview says so.
        p = Parameters(edge_depth=35, incut=35, body_height=30, screws=False)
        model = build(p)
        self.assert_solid(model)
        self.assertLess(model.lip_radius, p.lip_radius)
        self.assertGreater(model.lip_radius, 0)
        self.assertEqual(model.preview()["lip_radius"], model.lip_radius)
        small = build(Parameters(edge_depth=4, lip_radius=20, screws=False))
        self.assert_solid(small)
        self.assertLess(small.lip_radius, 4)
        self.assertEqual(build(Parameters()).lip_radius, Parameters().lip_radius)
        # A sloping edge has room for the full rounding: a 20 mm sloper.
        sloper = build(Parameters(lip_radius=20, incut=-30, screws=False))
        self.assert_solid(sloper)
        self.assertEqual(sloper.lip_radius, 20)

    def test_seeded_character_and_profile_match_the_mesh(self):
        p = Parameters(character=0.7, bow=7, screws=False)
        first, again = build(p), build(p)
        np.testing.assert_array_equal(first.mesh.vertices, again.mesh.vertices)
        changed = build(replace(p, seed=22))
        self.assertFalse(np.allclose(first.mesh.vertices, changed.mesh.vertices))
        plain = build(replace(p, character=0))
        np.testing.assert_array_equal(
            plain.mesh.vertices, build(replace(p, character=0, seed=22)).mesh.vertices
        )
        np.testing.assert_allclose(first.grip_inner, plain.grip_inner)
        np.testing.assert_allclose(first.grip_outer, plain.grip_outer)
        centre = first.mesh.vertices[np.abs(first.mesh.vertices[:, 0]) < 1e-6, 1:]
        for point in first.profile:
            self.assertLess(np.linalg.norm(centre - point, axis=1).min(), 1e-6)

    def test_variations_are_visible_and_preserve_contact_and_back(self):
        p = Parameters(character=1.4, screws=False)
        plain = build(replace(p, character=0))
        first, second = build(p), build(replace(p, seed=22))
        # Millimetre-scale differences, not just floating-point inequality.
        # The default seed moves the profile by about 2.9 mm.
        self.assertGreater(np.max(np.abs(first.profile - plain.profile)), 2.5)
        self.assertGreater(np.max(np.abs(first.profile - second.profile)), 5)
        angle = math.radians(p.incut)
        below_grip = (plain.grip_outer[0] - plain.profile[:, 0]) * math.cos(angle) + (
            plain.profile[:, 1] - plain.grip_outer[1]
        ) * math.sin(angle)
        protected = (below_grip <= 2 * p.lip_radius) | (plain.profile[:, 1] == 0)
        for model in (first, second):
            np.testing.assert_allclose(
                model.profile[protected], plain.profile[protected]
            )
            back = model.mesh.vertices[model.mesh.vertices[:, 2] == 0]
            np.testing.assert_array_equal(
                back, plain.mesh.vertices[plain.mesh.vertices[:, 2] == 0]
            )

    def test_strong_variations_keep_mounting_and_export_valid(self):
        for seed in (0, 1, 5, 13, 21, 22, 999999):
            with self.subTest(seed=seed):
                p = Parameters(character=3, seed=seed)
                preview, exported = build(p), build(p, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                self.assertEqual(len(preview.screws), 3)
                self.assertEqual(preview.screws, exported.screws)
                self.assertAlmostEqual(
                    preview.mesh.volume / exported.mesh.volume, 1, delta=0.01
                )

    def test_expanded_mounting_ranges_and_through_recesses(self):
        small = build(
            Parameters(
                auto_spacing=False,
                screw_spacing=6,
                screw_count=2,
                shank_diameter=1,
                head_diameter=3,
                seat_depth=0.5,
            )
        )
        large = build(
            Parameters(
                width=300,
                end_rounding=0.5,
                edge_depth=60,
                body_height=150,
                incut=0,
                lip_radius=20,
                auto_spacing=False,
                screw_spacing=260,
                shank_diameter=12,
                head_diameter=25,
                seat_depth=30,
            )
        )
        self.assert_solid(small)
        self.assert_solid(large)
        # The deep tapered end exceeds the old hard-coded 100 mm cutter.
        deep = build(
            Parameters(
                width=300,
                end_rounding=0.5,
                edge_depth=60,
                body_height=150,
                incut=0,
                lip_radius=0,
                taper=80,
                auto_spacing=False,
                screw_spacing=260,
                shank_diameter=1,
                head_diameter=3,
                seat_depth=0.5,
            )
        )
        self.assert_solid(deep)
        self.assertGreater(deep.mesh.bounds[1, 2], 100)
        x, y = deep.screws[0]
        contours = _solid(deep.mesh).slice(102).to_polygons()
        self.assertGreater(len(contours), 0)
        self.assertFalse(_inside_contours(x, y, contours))

    def test_requested_hole_counts_are_present_in_preview_and_export(self):
        for count in range(1, 7):
            with self.subTest(count=count):
                p = Parameters(screw_count=count)
                preview, exported = build(p), build(p, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                self.assertEqual(len(preview.screws), count)
                self.assertEqual(preview.screws, exported.screws)
                self.assertEqual(
                    len(_solid(exported.mesh).slice(0.1).to_polygons()), count + 1
                )
                if count == 1:
                    self.assertEqual(preview.screws[0][0], 0)
                    self.assertIsNone(preview.preview()["screw_spacing"])
                else:
                    differences = np.diff([point[0] for point in preview.screws])
                    np.testing.assert_allclose(differences, differences[0])
                    self.assertGreaterEqual(differences[0], p.head_diameter + 1.5)
        single = build(
            Parameters(screw_count=1, auto_spacing=False, screw_spacing=260, width=50)
        )
        self.assertEqual(len(single.screws), 1)
        self.assertEqual(build(Parameters(screws=False, screw_count=6)).screws, [])

    def test_crowded_rows_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "further apart"):
            build(Parameters(screw_count=6, auto_spacing=False, screw_spacing=20))
        with self.assertRaisesRegex(ValueError, "Use fewer holes"):
            build(Parameters(width=20, end_rounding=0.5, screw_count=6))


class ParameterTests(unittest.TestCase):
    def test_defaults_and_document_round_trip(self):
        p = parse_parameters({})
        self.assertEqual(p, Parameters())
        self.assertEqual(p.screw_count, 3)
        self.assertIsInstance(parse_parameters({"screw_count": 3.0}).screw_count, int)
        self.assertEqual(parse_parameters(design_document(p)["parameters"]), p)

    def test_invalid_values(self):
        cases = [
            {"width": float("nan")},
            {"width": float("inf")},
            {"width": True},
            {"width": "100"},
            {"unknown": 1},
            {"screws": 1},
            {"auto_spacing": 0},
            {"screw_count": 0},
            {"screw_count": 7},
            {"screw_count": 2.5},
            {"screw_count": True},
            {"screw_count": "3"},
            {"seed": 1.5},
            {"seed": True},
            {"seed": -1},
            {"edge_depth": 1},
            {"lip_radius": 21},
            {"width": 20, "end_rounding": 10},
            {"shank_diameter": 7, "head_diameter": 7},
        ]
        for values in cases:
            with self.subTest(values=values), self.assertRaises(ValueError):
                parse_parameters(values)
        with self.assertRaises(ValueError):
            parse_parameters([])
        self.assertEqual(parse_parameters(asdict(Parameters())), Parameters())


if __name__ == "__main__":
    unittest.main()
