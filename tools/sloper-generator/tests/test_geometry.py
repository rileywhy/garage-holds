import io
import math
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import _solid, _surface, build
from parameters import PRESETS, Parameters, design_document, parse_parameters


class GeometryTests(unittest.TestCase):
    def assert_solid(self, model):
        mesh = model.mesh
        self.assertTrue(mesh.is_watertight)
        self.assertTrue(mesh.is_winding_consistent)
        self.assertGreater(mesh.volume, 0)
        self.assertEqual(len(_solid(mesh).decompose()), 1)
        self.assertAlmostEqual(mesh.bounds[0, 2], 0, places=6)

    def test_presets_and_export_match(self):
        for name, p in PRESETS.items():
            with self.subTest(preset=name):
                preview, exported = build(p), build(p, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                self.assertEqual(preview.parameters, exported.parameters)
                self.assertEqual(preview.screws, exported.screws)
                self.assertAlmostEqual(
                    preview.mesh.volume / exported.mesh.volume, 1, delta=0.01
                )
                loaded = trimesh.load(
                    io.BytesIO(exported.mesh.export(file_type="stl")), file_type="stl"
                )
                self.assertTrue(loaded.is_watertight)
                np.testing.assert_allclose(
                    loaded.extents, exported.mesh.extents, atol=1e-4
                )
                self.assertGreater(len(exported.mesh.faces), len(preview.mesh.faces))

    def test_presets_are_larger_without_changing_their_proportions(self):
        previous = {
            "rounded board sloper": (110, 85, 45, 1.5),
            "round ball": (95, 95, 78, 120 / 95),
            "broad sloper": (145, 100, 42, 1.5),
            "sloping rail": (210, 65, 38, 1.5),
        }
        for name, (width, height, depth, scale) in previous.items():
            with self.subTest(preset=name):
                p = replace(PRESETS[name], screws=False)
                old = build(replace(p, width=width, height=height, projection=depth))
                new = build(p)
                np.testing.assert_allclose(
                    new.mesh.extents, old.mesh.extents * scale, rtol=0.001
                )
                self.assertAlmostEqual(
                    new.mesh.volume / old.mesh.volume, scale**3, delta=0.001
                )
                # Old saved dimensions remain available, rather than being scaled on load.
                saved = parse_parameters(design_document(old.parameters)["parameters"])
                self.assertEqual(
                    (saved.width, saved.height, saved.projection),
                    (width, height, depth),
                )

    def test_expanded_size_limits_still_export_a_closed_mounted_hold(self):
        p = Parameters(
            width=525,
            height=420,
            projection=175,
            arc_wrap=60,
            incut=45,
            taper=-65,
            character=1.5,
            screw_count=6,
            head_diameter=25,
            shank_diameter=12,
        )
        preview, exported = build(p), build(p, "export")
        self.assert_solid(preview)
        self.assert_solid(exported)
        self.assertEqual(preview.parameters, exported.parameters)
        self.assertEqual(preview.screws, exported.screws)
        self.assertEqual(len(exported.screws), 6)
        self.assertEqual(len(_solid(exported.mesh).slice(0.1).to_polygons()), 7)

    def test_presets_have_less_positive_contact_than_the_previous_incut(self):
        for name, previous_incut in (
            ("rounded board sloper", 35),
            ("round ball", 20),
            ("broad sloper", 45),
            ("sloping rail", 40),
        ):
            with self.subTest(preset=name):
                p = replace(PRESETS[name], screws=False)
                current = build(p)
                previous = build(replace(p, incut=previous_incut))
                centre = len(current.profile) // 2
                outer, inner = centre + centre // 3, centre + centre * 2 // 3
                world_up = np.array(
                    [math.cos(math.radians(40)), -math.sin(math.radians(40))]
                )
                current_rise = (
                    current.profile[outer] - current.profile[inner]
                ) @ world_up
                previous_rise = (
                    previous.profile[outer] - previous.profile[inner]
                ) @ world_up
                self.assertLess(current_rise, previous_rise)
                self.assertAlmostEqual(
                    current.mesh.volume, previous.mesh.volume, delta=1e-5
                )

    def test_dome_volume_and_surface_slope_have_physical_meaning(self):
        p = Parameters(
            width=100,
            height=80,
            projection=40,
            palm_curve=0,
            slope=0,
            screws=False,
            incut=0,
        )
        model = build(p)
        self.assertAlmostEqual(
            model.mesh.volume / (2 * math.pi / 3 * 50 * 40 * 40), 1, delta=0.005
        )
        tilted = replace(p, slope=20)
        epsilon = 1e-6
        slope = (_surface(tilted, 0, epsilon) - _surface(tilted, 0, -epsilon)) / (
            2 * epsilon * p.height / 2
        )
        self.assertAlmostEqual(math.degrees(math.atan(-slope)), 20, places=5)
        self.assertGreater(
            _surface(replace(p, palm_curve=100), 0, 0.5), _surface(p, 0, 0.5)
        )

    def test_profile_matches_the_undrilled_mesh(self):
        p = Parameters(
            character=1.1, seed=10, slope=24, taper=-35, screws=False, arc_wrap=40
        )
        model = build(p)
        centre = model.mesh.vertices[np.abs(model.mesh.vertices[:, 0]) < 1e-6, 1:]
        for point in model.profile:
            self.assertLess(np.linalg.norm(centre - point, axis=1).min(), 1e-5)

    def test_arc_wrap_continues_a_circle_beyond_its_widest_point(self):
        # A radius-50 sphere cut 25 mm below its centre: 75 mm cap depth.
        p = Parameters(
            width=100,
            height=100,
            projection=75,
            arc_wrap=30,
            incut=0,
            slope=0,
            palm_curve=0,
            screws=False,
        )
        model = build(p, "export")
        self.assert_solid(model)
        y, z = model.profile.T
        np.testing.assert_allclose(y**2 + (z - 25) ** 2, 50**2, atol=1e-8)
        self.assertAlmostEqual(
            model.mesh.volume / (math.pi * 75**2 * 25), 1, delta=0.002
        )
        self.assertGreater(y.max(), abs(y[-1]) + 6)
        # The upper return rises away from the wall: added incut with no lift.
        self.assertGreater(y[-2], y[-1])
        self.assertGreater(z[-2], z[-1])

    def test_maximum_arc_wrap_keeps_all_screws_and_export_layout(self):
        for count in (2, 3, 6):
            with self.subTest(count=count):
                p = Parameters(
                    arc_wrap=60,
                    incut=45,
                    screw_count=count,
                    width=40,
                    height=40,
                    projection=12,
                    taper=-65,
                    character=1.5,
                    head_diameter=25,
                    shank_diameter=12,
                )
                preview, exported = build(p), build(p, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                self.assertEqual(preview.parameters, exported.parameters)
                self.assertEqual(preview.screws, exported.screws)
                self.assertEqual(len(preview.screws), count)
                self.assertEqual(
                    len(_solid(exported.mesh).slice(0.1).to_polygons()), count + 1
                )
                self.assertAlmostEqual(
                    preview.mesh.volume / exported.mesh.volume, 1, delta=0.01
                )

    def test_incut_makes_the_surface_more_positive_on_a_40_degree_board(self):
        p = Parameters(screws=False)
        plain = build(replace(p, incut=0))
        wall = np.argmin(np.abs(plain.profile[:, 0] - p.height * 0.4))
        outer = np.argmin(np.abs(plain.profile[:, 0] - p.height * 0.2))
        rises = []
        for incut in (0, 30, 45):
            model = build(replace(p, incut=incut))
            self.assert_solid(model)
            # Measure the actual upper surface section, wall to outer surface,
            # in the world-up direction after mounting at 40 degrees.
            dy, dz = model.profile[outer] - model.profile[wall]
            self.assertGreater(dz, 0)
            rises.append(
                dy * math.cos(math.radians(40)) - dz * math.sin(math.radians(40))
            )
            # Lifting the surface retains the flat mounting face and solid volume.
            back = model.mesh.vertices[np.isclose(model.mesh.vertices[:, 2], 0)]
            old_back = plain.mesh.vertices[np.isclose(plain.mesh.vertices[:, 2], 0)]
            np.testing.assert_array_equal(back, old_back)
            self.assertAlmostEqual(model.mesh.volume, plain.mesh.volume, delta=1e-6)
        self.assertLess(rises[0], -15)
        self.assertGreater(rises[1], rises[0] + 3)
        self.assertGreater(rises[2], rises[1] + 3)

    def test_maximum_incut_keeps_mounting_and_exports_consistent(self):
        for count in (2, 3, 6):
            with self.subTest(count=count):
                p = Parameters(
                    incut=45, screw_count=count, taper=-40, character=1, seed=22
                )
                preview, exported = build(p), build(p, "export")
                self.assert_solid(preview)
                self.assert_solid(exported)
                self.assertEqual(preview.parameters, exported.parameters)
                self.assertEqual(preview.screws, exported.screws)
                self.assertEqual(
                    len(_solid(exported.mesh).slice(0.1).to_polygons()), count + 1
                )

    def test_variations_are_reproducible_and_keep_the_back_flat(self):
        p = Parameters(character=1, screws=False)
        a, again, b = build(p), build(p), build(replace(p, seed=22))
        np.testing.assert_array_equal(a.mesh.vertices, again.mesh.vertices)
        self.assertGreater(np.max(np.abs(a.profile - b.profile)), 2)
        plain = build(replace(p, character=0))
        np.testing.assert_array_equal(
            a.mesh.vertices[a.mesh.vertices[:, 2] == 0],
            plain.mesh.vertices[plain.mesh.vertices[:, 2] == 0],
        )

    def test_screws_exit_the_back_without_overlapping_or_breaking_the_sides(self):
        for count in range(2, 7):
            with self.subTest(count=count):
                model = build(Parameters(screw_count=count))
                self.assert_solid(model)
                self.assertEqual(len(model.screws), count)
                self.assertEqual(
                    len(_solid(model.mesh).slice(0.1).to_polygons()), count + 1
                )
                p = model.parameters
                centres = np.array(model.screws)
                gaps = np.linalg.norm(centres[:, None] - centres[None, :], axis=-1)
                np.fill_diagonal(gaps, np.inf)
                self.assertGreaterEqual(gaps.min(), p.head_diameter + 1.5)
                self.assertLess(
                    model.mesh.volume, build(replace(p, screws=False)).mesh.volume
                )

    def test_small_large_and_extreme_shapes_adjust_instead_of_failing(self):
        cases = [
            Parameters(
                width=40,
                height=40,
                projection=12,
                screw_count=6,
                head_diameter=25,
                shank_diameter=12,
            ),
            Parameters(
                width=40,
                height=40,
                projection=12,
                slope=45,
                taper=65,
                character=1.5,
                screw_count=6,
                head_diameter=25,
                shank_diameter=12,
            ),
            Parameters(
                width=300,
                height=240,
                projection=12,
                slope=-45,
                taper=-65,
                character=1.5,
                seed=0,
            ),
            Parameters(
                width=40, height=40, projection=12, auto_seat=False, seat_depth=30
            ),
            Parameters(
                width=300,
                height=40,
                projection=100,
                palm_curve=100,
                slope=45,
                character=1.5,
            ),
            Parameters(
                width=40, height=240, projection=12, screws=False, slope=45, taper=65
            ),
            Parameters(shank_diameter=12, head_diameter=3),
        ]
        for p in cases:
            with self.subTest(parameters=p):
                a = build(p)
                self.assert_solid(a)
                self.assertEqual(len(a.screws), p.screw_count if p.screws else 0)
                if p.screws and p.auto_seat:
                    self.assertGreaterEqual(a.parameters.seat_depth, 3)
                self.assertTrue(a.adjusted or not p.screws)
                # Saved adjusted settings must reproduce exactly the same model.
                rebuilt = build(a.parameters)
                self.assertEqual(a.parameters, rebuilt.parameters)
                np.testing.assert_array_equal(a.mesh.vertices, rebuilt.mesh.vertices)

    def test_settings_round_trip_and_bad_input(self):
        p = parse_parameters(design_document(Parameters())["parameters"])
        self.assertEqual(p, Parameters())
        self.assertEqual(p.screw_count, 3)
        self.assertEqual(parse_parameters({"width": 1000}).width, 525)
        self.assertEqual(parse_parameters({"incut": 75}).incut, 45)
        self.assertEqual(parse_parameters({"arc_wrap": 90}).arc_wrap, 60)
        self.assertEqual(parse_parameters({"incut": 0}).arc_wrap, 0)
        for data in (
            [],
            {"width": True},
            {"slope": float("nan")},
            {"height": float("inf")},
            {"seed": 1.2},
            {"screw_count": 2.5},
            {"screws": 1},
            {"unknown": 1},
        ):
            with self.subTest(input=data), self.assertRaises(ValueError):
                parse_parameters(data)
        self.assertEqual(asdict(p), design_document(p)["parameters"])


if __name__ == "__main__":
    unittest.main()
