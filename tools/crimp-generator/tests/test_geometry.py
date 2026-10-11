import io
import math
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import _inside_contours, _solid, build, cross_section, estimate_material
from parameters import (
    PRESETS,
    Parameters,
    design_document,
    parse_parameters,
    seat_height,
)


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

    def test_rows_drop_to_fit_deep_edges_and_incuts(self):
        # The default row sits just below the body's midline...
        plain = build(Parameters())
        self.assertAlmostEqual(plain.screws[1][1], -Parameters().body_height * 0.02)
        # ...and a deep, steep edge that used to be refused now gets its row
        # lower down the body where the recesses fit, at the same span.
        steep = build(Parameters(edge_depth=35.5, incut=35, lip_radius=4.5))
        self.assert_solid(steep)
        self.assertEqual(len(steep.screws), 3)
        self.assertAlmostEqual(steep.screws[-1][0] - steep.screws[0][0], 60)
        self.assertLessEqual(steep.screws[1][1], plain.screws[1][1])
        # With the seat set low by hand the top of the body is thin there,
        # and the row has to come well down.
        low_seat = build(
            Parameters(
                edge_depth=35.5, incut=35, lip_radius=4.5, auto_seat=False, seat_depth=4
            )
        )
        self.assertLess(low_seat.screws[1][1], plain.screws[1][1] - 5)
        exported = build(Parameters(edge_depth=35.5, incut=35, lip_radius=4.5), "export")
        self.assertEqual(exported.screws, steep.screws)

    def test_seat_follows_the_depth_unless_set_by_hand(self):
        self.assertEqual(seat_height(Parameters()), 10)
        self.assertEqual(seat_height(Parameters(edge_depth=10)), 6)
        self.assertEqual(seat_height(Parameters(edge_depth=60)), 24)
        self.assertEqual(seat_height(Parameters(auto_seat=False, seat_depth=4)), 4)
        self.assertEqual(build(Parameters()).seat_depth, 10)
        self.assertEqual(build(Parameters()).preview()["seat_depth"], 10)
        by_hand = build(Parameters(auto_seat=False, seat_depth=4))
        self.assertEqual(by_hand.seat_depth, 4)
        # A higher seat leaves more body under the head: the drilled solid
        # with the seat at 10 keeps more volume than with it at 4.
        self.assertGreater(build(Parameters()).mesh.volume, by_hand.mesh.volume)
        for name, preset in PRESETS.items():
            with self.subTest(preset=name):
                self.assert_solid(build(preset))
        # Where the recesses cannot fit that high, the automatic seat comes
        # down to the highest point they do, and says so.
        deep = Parameters(edge_depth=40, incut=40, lip_radius=20, body_height=70)
        lowered = build(deep)
        self.assert_solid(lowered)
        self.assertLess(lowered.seat_depth, seat_height(deep))
        self.assertGreaterEqual(lowered.seat_depth, 0.5)
        self.assertEqual(build(deep, "export").seat_depth, lowered.seat_depth)

    def test_body_grows_instead_of_failing(self):
        self.assertEqual(build(Parameters()).adjusted, {})
        # A deep, steep, rounded edge on the default body had no room for
        # the screws at any seat: the body grows until they fit.
        tall = build(Parameters(edge_depth=40, incut=40, lip_radius=20))
        self.assert_solid(tall)
        self.assertGreater(tall.adjusted["body_height"], 48)
        self.assertEqual(tall.parameters.body_height, tall.adjusted["body_height"])
        self.assertEqual(
            build(Parameters(edge_depth=40, incut=40, lip_radius=20), "export").adjusted,
            tall.adjusted,
        )
        # An incut that would fold the shelf below the body raises it first.
        folded = build(Parameters(edge_depth=30, incut=60, screws=False))
        self.assert_solid(folded)
        self.assertGreaterEqual(
            folded.parameters.body_height, 36 * math.tan(math.radians(60)) + 8
        )
        self.assertEqual(folded.preview()["adjusted"], folded.adjusted)

    def test_holes_cross_the_back_and_remove_volume(self):
        drilled = build(Parameters())
        undrilled = build(Parameters(screws=False))
        self.assertLess(drilled.mesh.volume, undrilled.mesh.volume)
        self.assertEqual(len(_solid(drilled.mesh).slice(0.1).to_polygons()), 4)
        self.assertEqual(len(drilled.screws), 3)
        self.assertAlmostEqual(drilled.screws[-1][0] - drilled.screws[0][0], 60)

    def test_deep_rounded_incuts_have_no_corner_wings_above_the_shelf(self):
        cases = [
            Parameters(edge_depth=31, incut=40, lip_radius=7.25),
            Parameters(
                edge_depth=40,
                incut=40,
                lip_radius=20,
                body_height=70,
                end_rounding=20,
            ),
            Parameters(
                edge_depth=60,
                incut=40,
                lip_radius=15,
                body_height=100,
                end_rounding=25,
            ),
        ]
        for p in cases:
            slope = math.tan(math.radians(p.incut))
            for quality in ("preview", "export"):
                for screws in (False, True):
                    with self.subTest(parameters=p, quality=quality, screws=screws):
                        model = build(replace(p, screws=screws), quality)
                        self.assert_solid(model)
                        # The body may have grown to seat the screws.
                        built = model.parameters
                        shelf_at_wall = (
                            built.body_height / 2 - (built.edge_depth + 6) * slope
                        )
                        vertices = model.mesh.vertices
                        # The shelf plane bounds the entire hold. The old end
                        # tips rose above it, creating the pointed corner wings.
                        above_shelf = vertices[:, 1] - slope * vertices[:, 2]
                        self.assertLessEqual(above_shelf.max(), shelf_at_wall + 1e-5)
                        back = vertices[np.isclose(vertices[:, 2], 0)]
                        self.assertGreaterEqual(
                            back[:, 1].min(), -built.body_height / 2 - 1e-5
                        )
                        self.assertLessEqual(back[:, 1].max(), shelf_at_wall + 1e-5)
                        if screws:
                            self.assertEqual(len(model.screws), 3)
            preview, exported = build(p), build(p, "export")
            self.assertEqual(preview.screws, exported.screws)
            self.assertAlmostEqual(
                preview.mesh.volume / exported.mesh.volume, 1, delta=0.01
            )

    def test_automatic_spacing_does_not_shift_between_preview_and_export(self):
        p = Parameters(width=50, end_rounding=15, taper=25, edge_depth=12, lip_radius=2)
        preview, exported = build(p), build(p, "export")
        self.assertEqual(preview.screws, exported.screws)
        self.assertLess(preview.screws[-1][0] - preview.screws[0][0], p.width * 0.6)
        self.assert_solid(exported)

    def test_manual_mounting_is_respected_or_rejected(self):
        manual = build(Parameters(auto_spacing=False, screw_spacing=40))
        self.assertEqual(manual.screws[-1][0] - manual.screws[0][0], 40)
        with self.assertRaisesRegex(ValueError, "seat is above the top"):
            build(Parameters(auto_seat=False, seat_depth=30))
        with self.assertRaisesRegex(ValueError, "screws closer"):
            build(Parameters(width=50, auto_spacing=False))

    def test_oversized_lip_rounding_shrinks_to_fit(self):
        # A radius the grip face cannot hold rounds as far as it can instead
        # of refusing, so slopey edges are reachable; the preview says so.
        p = Parameters(edge_depth=35, incut=35, body_height=30, screws=False)
        model = build(p)
        self.assert_solid(model)
        # (The body grows to keep the shelf above it, which also makes room
        # for the lip; the rounding is never more than asked.)
        self.assertGreater(model.parameters.body_height, 30)
        self.assertLessEqual(model.lip_radius, p.lip_radius)
        self.assertGreater(model.lip_radius, 0)
        self.assertEqual(model.preview()["lip_radius"], model.lip_radius)
        small = build(Parameters(edge_depth=4, lip_radius=20, screws=False))
        self.assert_solid(small)
        self.assertLess(small.lip_radius, 4 + 6)
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

    def test_material_estimate_includes_shell_and_caps_thin_models(self):
        cube = trimesh.creation.box(extents=[100, 100, 100])
        self.assertEqual(estimate_material(cube), [409, 581])
        thin = trimesh.creation.box(extents=[100, 100, 1])
        self.assertEqual(estimate_material(thin), [13, 13])
        low, high = build(Parameters()).preview()["material_grams"]
        self.assertGreater(low, 0)
        self.assertGreater(high, low)

    def test_maximum_rounding_has_one_shelf_and_no_recess_in_the_lip(self):
        p = Parameters(lip_radius=20)
        profile, inner, outer, radius = cross_section(p)
        wall_y = inner[0] - 6 * math.tan(math.radians(p.incut))
        self.assertTrue(np.any(np.all(np.isclose(profile, [wall_y, 0]), axis=1)))
        shelf = profile[(profile[:, 0] > 0) & (profile[:, 1] > 0) & (profile[:, 1] < 1)]
        self.assertGreater(len(shelf), 0)
        np.testing.assert_allclose(
            shelf[:, 0],
            outer[0] + (shelf[:, 1] - outer[1]) * math.tan(math.radians(p.incut)),
        )
        incoming = np.array([p.body_height * 0.84, (p.edge_depth + 6) * 0.47])
        incoming /= np.linalg.norm(incoming)
        outgoing = np.array(
            [-math.sin(math.radians(p.incut)), -math.cos(math.radians(p.incut))]
        )
        turn = math.acos(float(incoming @ outgoing))
        lip_start = outer[0] - incoming[0] * radius * math.tan(turn / 2)
        for quality in ("preview", "export"):
            with self.subTest(quality=quality):
                plain = build(replace(p, screws=False), quality)
                drilled = build(p, quality)
                self.assert_solid(drilled)
                self.assertEqual(len(drilled.screws), 3)
                self.assertLess(drilled.screws[0][1], build(Parameters()).screws[0][1])
                # Screw cutters must remove no material from the gripping lip.
                plain_lip = _solid(plain.mesh).trim_by_plane((0, 1, 0), lip_start)
                drilled_lip = _solid(drilled.mesh).trim_by_plane((0, 1, 0), lip_start)
                self.assertAlmostEqual(
                    plain_lip.volume(), drilled_lip.volume(), delta=0.01
                )

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
                auto_seat=False, seat_depth=0.5,
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
                auto_seat=False, seat_depth=30,
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
                auto_seat=False, seat_depth=0.5,
            )
        )
        self.assert_solid(deep)
        self.assertGreater(deep.mesh.bounds[1, 2], 100)
        x, y = deep.screws[0]
        contours = _solid(deep.mesh).slice(102).to_polygons()
        self.assertGreater(len(contours), 0)
        self.assertFalse(_inside_contours(x, y, contours))

    def test_requested_hole_counts_are_present_in_preview_and_export(self):
        for count in range(2, 7):
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
                differences = np.diff([point[0] for point in preview.screws])
                np.testing.assert_allclose(differences, differences[0])
                self.assertGreaterEqual(differences[0], p.head_diameter + 1.5)
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
            {"auto_seat": "yes"},
            {"screw_count": 0},
            {"screw_count": 1},
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
