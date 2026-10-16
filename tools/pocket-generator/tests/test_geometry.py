import random
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import manifold3d as manifold
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import FLOOR, MARGIN, build, pocket
from parameters import CONTROLS, PRESETS, design_document, parse_parameters

from tools.hold_mounting import _inside


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
        screws=rng.random() < 0.85,
        bolt_mount=rng.random() < 0.3,
        auto_seat=rng.random() < 0.6,
        through=rng.random() < 0.3,
        seed=rng.randint(0, 999999),
    )
    return values


def contours_at(mesh, z):
    """How many outlines a horizontal slice of the finished hold has."""
    solid = manifold.Manifold(
        manifold.Mesh(
            np.asarray(mesh.vertices, dtype=np.float32),
            np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    return solid.slice(z).num_contour()


class PocketTests(unittest.TestCase):
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
                # The presets fit as written: nothing had to grow.
                self.assertEqual(a.adjusted, {})
                c = build(parse_parameters(asdict(a.parameters)))
                np.testing.assert_allclose(a.mesh.extents, c.mesh.extents)

    def test_closed_pockets_keep_a_floor(self):
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                self.assertGreaterEqual(build(p).floor, FLOOR - 0.1)
        # A pocket deeper than the body makes the body deeper, and says so.
        deep = build(replace(PRESETS["Two-finger pocket"], pocket_depth=50, depth=20))
        self.assertGreaterEqual(deep.floor, FLOOR - 0.1)
        self.assertIn("depth", deep.adjusted)
        self.assertGreater(deep.parameters.depth, 20)
        # Past the depth slider's maximum the pocket itself gives instead.
        small = build(
            replace(
                PRESETS["Two-finger pocket"],
                pocket_depth=50,
                floor_angle=35,
                size=50,
                screws=False,
            )
        )
        self.assertGreaterEqual(small.floor, FLOOR - 0.1)
        self.assertIn("pocket_depth", small.adjusted)
        self.assertLessEqual(small.parameters.depth, 70)

    def test_open_pocket_reaches_the_wall(self):
        closed = build(replace(PRESETS["Two-finger pocket"], screws=False))
        opened = build(
            replace(PRESETS["Two-finger pocket"], screws=False, through=True)
        )
        self.assertEqual(opened.floor, 0)
        self.assertTrue(opened.mesh.is_watertight)
        self.assertAlmostEqual(opened.mesh.bounds[0, 2], 0, places=5)
        # The back face is a ring around the exit; a closed pocket's is whole.
        self.assertEqual(contours_at(closed.mesh, 0.5), 1)
        self.assertEqual(contours_at(opened.mesh, 0.5), 2)
        # With a steep floor the exit climbs the back, and the body grows to
        # keep its margin around the exit.
        steep = build(replace(PRESETS["Mono"], through=True, floor_angle=35))
        self.assertEqual(steep.floor, 0)
        self.assertTrue(steep.mesh.is_watertight)
        self.assertEqual(len(steep.holes), 2)

    def test_hardware_clears_the_pocket(self):
        variants = []
        for p in PRESETS.values():
            variants += [
                p,
                replace(p, through=True),
                replace(p, bolt_mount=True),
                replace(p, screw_count=3),
                replace(p, through=True, bolt_mount=True),
            ]
        for p in variants:
            with self.subTest(values=asdict(p)):
                model = build(p)
                self.assertGreaterEqual(len(model.holes), 1)
                self.assertTrue(model.mesh.is_watertight)
                _, cut, _, _, _ = pocket(model.parameters, "preview")
                for hole in model.holes:
                    clear = cut.project().offset(
                        hole.head / 2 + 1, manifold.JoinType.Round, 2.0, 16
                    )
                    self.assertFalse(
                        _inside(np.array([[hole.x, hole.y]]), clear.to_polygons())[0],
                        f"hole at {hole.x:.1f}, {hole.y:.1f} meets the pocket",
                    )

    def test_mono_opening_is_round(self):
        p = replace(PRESETS["Mono"], floor_angle=0, screws=False)
        _, cut, _, _, _ = pocket(p, "preview")
        lo, hi = np.array(cut.project().bounds()).reshape(2, 2)
        size = hi - lo
        self.assertAlmostEqual(size[0], size[1], delta=0.3)
        self.assertAlmostEqual(size[0], p.opening_width + 2 * p.lip_radius, delta=0.5)

    def test_scale_applies_to_the_body_only(self):
        p = replace(PRESETS["Two-finger pocket"], screws=False)
        small, large = build(p), build(replace(p, size=200))
        np.testing.assert_allclose(
            large.mesh.extents[:2], small.mesh.extents[:2] * 2, rtol=1e-4
        )
        # The same pocket in a body twice as deep leaves far more floor.
        self.assertGreater(large.floor, small.floor + 30)

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control and switch. The fitter may say
        # hardware or the opening does not fit, in words; anything else must
        # export as one closed body.
        rng = random.Random(2026)
        exported = 0
        for _ in range(20):
            p = parse_parameters(random_settings(rng))
            with self.subTest(values=asdict(p)):
                try:
                    model = build(p, "export")
                except ValueError as error:
                    self.assertRegex(str(error), "could not fit|does not fit")
                    continue
                self.assertTrue(model.mesh.is_watertight)
                self.assertTrue(model.mesh.is_winding_consistent)
                self.assertGreater(model.mesh.volume, 0)
                if not model.parameters.through:
                    self.assertGreaterEqual(model.floor, FLOOR - 0.1)
                exported += 1
        self.assertGreater(exported, 8)

    def test_growth_stays_within_the_sliders(self):
        limits = {control["key"]: control["max"] for control in CONTROLS}
        model = build(
            parse_parameters(
                dict(
                    opening_width=80,
                    opening_height=45,
                    width=50,
                    height=50,
                    screw_count=3,
                    bolt_mount=False,
                )
            )
        )
        self.assertEqual(len(model.holes), 3)
        self.assertIn("width", model.adjusted)
        for key in ("width", "height", "depth"):
            self.assertLessEqual(getattr(model.parameters, key), limits[key])
        self.assertGreaterEqual(model.floor, FLOOR - 0.1)

    def test_designs_reopen_and_rebuild_the_same_hold(self):
        # The exported design carries the settings actually built, so
        # parsing it back and building again gives the same hold: links,
        # presets and settings files depend on it.
        rng = random.Random(78)
        cases = [
            dict(
                opening_width=80, opening_height=45, width=50, height=50, screw_count=3
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
                again = build(
                    parse_parameters(design_document(model.parameters)["parameters"])
                )
                self.assertEqual(again.parameters, model.parameters)
                self.assertEqual(again.holes, model.holes)
                self.assertEqual(again.mesh.vertices.shape, model.mesh.vertices.shape)
                self.assertTrue(np.allclose(again.mesh.vertices, model.mesh.vertices))
                self.assertEqual(again.adjusted, {})
                rebuilt += 1
        self.assertGreater(rebuilt, 15)

    def test_manual_seat_survives_turning_screws_off(self):
        for p in PRESETS.values():
            for quality in ("preview", "export"):
                model = build(
                    replace(p, screws=False, auto_seat=False, seat_depth=9), quality
                )
                self.assertTrue(model.mesh.is_watertight)
                self.assertEqual(model.holes, [])

    def test_manual_seat_is_used_when_it_fits(self):
        model = build(
            replace(PRESETS["Two-finger pocket"], auto_seat=False, seat_depth=5)
        )
        self.assertEqual(model.holes[0].seat, 5)
        self.assertEqual(model.parameters.seat_depth, 5)

    def test_margin_is_a_sensible_constant(self):
        self.assertGreaterEqual(MARGIN, 4)

    def test_validation(self):
        for values in (
            {"size": float("nan")},
            {"screws": 1},
            {"through": 1},
            {"screw_count": 1.5},
            {"unknown": 0},
        ):
            with self.assertRaises(ValueError):
                parse_parameters(values)


if __name__ == "__main__":
    unittest.main()
