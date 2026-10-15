import random
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build
from parameters import CONTROLS, PRESETS, design_document, parse_parameters

SHAPES = ("edge", "ball", "rock", "dish")


def random_settings(rng):
    """One setting per control, on its step, anywhere in its range."""
    values = {}
    for control in CONTROLS:
        steps = int(round((control["max"] - control["min"]) / control["step"]))
        value = control["min"] + rng.randint(0, steps) * control["step"]
        values[control["key"]] = (
            int(value) if control["key"] == "screw_count" else round(value, 4)
        )
    values.update(
        shape=rng.choice(SHAPES),
        screws=rng.random() < 0.85,
        bolt_mount=rng.random() < 0.3,
        auto_seat=rng.random() < 0.6,
        auto_screw_count=rng.random() < 0.4,
        seed=rng.randint(0, 999999),
    )
    return values


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
        p = replace(PRESETS["Board edge"], screws=False)
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
                        PRESETS["Board edge"],
                        incut=angle,
                        size=size,
                        screw_count=1,
                        lip_radius=14,
                    )
                )
                self.assertTrue(m.mesh.is_watertight)

    def test_ball_auto_screws_scale_both_directions(self):
        p = PRESETS["Ball"]
        small = build(p)
        large = build(replace(small.parameters, size=150))
        back = build(replace(large.parameters, size=100))
        self.assertEqual([len(m.holes) for m in (small, large, back)], [1, 2, 1])
        self.assertEqual(
            len(build(replace(p, size=150, auto_screw_count=False)).holes), 1
        )

    def test_ball_is_spherical_and_rock_is_distinct(self):
        from geometry import body

        p = replace(PRESETS["Ball"], screws=False)
        solid, _, _ = body(p, "preview")
        verts = solid.to_mesh().vert_properties[:, :3]
        outer = verts[verts[:, 2] > 0.001]
        radii = np.linalg.norm(outer - [0, 0, p.edge_depth - p.width / 2], axis=1)
        np.testing.assert_allclose(radii, p.width / 2, rtol=1e-5)
        rock = build(replace(PRESETS["Rock tooth"], screws=False))
        self.assertGreater(rock.mesh.extents[2], p.edge_depth)
        self.assertGreater(abs(rock.mesh.bounds[0, 0] + rock.mesh.bounds[1, 0]), 0.1)

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control, all four shapes. The fitter may
        # say hardware does not fit, in words; anything else must export as
        # one closed body.
        rng = random.Random(2026)
        exported = 0
        for _ in range(20):
            p = parse_parameters(random_settings(rng))
            with self.subTest(values=asdict(p)):
                try:
                    model = build(p, "export")
                except ValueError as error:
                    self.assertIn("could not fit", str(error))
                    continue
                self.assertTrue(model.mesh.is_watertight)
                self.assertTrue(model.mesh.is_winding_consistent)
                self.assertGreater(model.mesh.volume, 0)
                exported += 1
        self.assertGreater(exported, 8)

    def test_growth_stays_within_the_sliders(self):
        # Three screws on a small dish: the hardware needs a bigger body.
        # The body used to grow past the width slider's maximum, so the
        # exported design was clamped on reopening and built a different
        # hold from the preview (RIL-78).
        limits = {control["key"]: control["max"] for control in CONTROLS}
        model = build(
            parse_parameters(
                dict(
                    shape="dish", size=50, width=110, edge_depth=6, screw_count=3,
                    auto_screw_count=False,
                )
            )
        )
        self.assertEqual(len(model.holes), 3)
        self.assertLessEqual(model.parameters.width, limits["width"])
        self.assertLessEqual(model.parameters.body_height, limits["body_height"])
        self.assertLessEqual(model.parameters.edge_depth, limits["edge_depth"])

    def test_designs_reopen_and_rebuild_the_same_hold(self):
        # The exported design carries the settings actually built, so
        # parsing it back and building again gives the same hold: links,
        # presets and settings files depend on it.
        rng = random.Random(78)
        cases = [
            dict(
                shape="dish", size=50, width=110, edge_depth=6, screw_count=3,
                auto_screw_count=False,
            )
        ] + [random_settings(rng) for _ in range(30)]
        rebuilt = 0
        for values in cases:
            p = parse_parameters(values)
            try:
                model = build(p)
            except ValueError:
                continue
            with self.subTest(values=values):
                again = build(parse_parameters(design_document(model.parameters)["parameters"]))
                self.assertEqual(again.parameters, model.parameters)
                self.assertEqual(again.holes, model.holes)
                self.assertEqual(again.mesh.vertices.shape, model.mesh.vertices.shape)
                self.assertTrue(np.allclose(again.mesh.vertices, model.mesh.vertices))
                self.assertEqual(again.adjusted, {})
                rebuilt += 1
        self.assertGreater(rebuilt, 15)

    def test_manual_seat_survives_turning_screws_off(self):
        # Dragging the seat slider sets auto_seat off; turning the mounting
        # holes off afterwards must still build a closed body.
        for p in PRESETS.values():
            for quality in ("preview", "export"):
                model = build(
                    replace(p, screws=False, auto_seat=False, seat_depth=9), quality
                )
                self.assertTrue(model.mesh.is_watertight)
                self.assertEqual(model.holes, [])

    def test_manual_seat_is_used_when_it_fits(self):
        model = build(replace(PRESETS["Board edge"], auto_seat=False, seat_depth=5))
        self.assertEqual(model.holes[0].seat, 5)
        self.assertEqual(model.parameters.seat_depth, 5)

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
