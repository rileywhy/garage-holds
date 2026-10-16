import math
import random
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import manifold3d as manifold
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import FLOOR, LIP_SPAN, MARGIN, build, largest, lip_reach, pocket, slot
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
                incut=14,
                lip_radius=6,
                size=60,
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
        steep = build(replace(PRESETS["Mono"], through=True, incut=25))
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

    def turning_angles(self, points):
        before, after = np.roll(points, 1, axis=0), np.roll(points, -1, axis=0)
        v1, v2 = points - before, after - points
        cross = v1[:, 0] * v2[:, 1] - v1[:, 1] * v2[:, 0]
        dot = (v1 * v2).sum(axis=1)
        return np.degrees(np.abs(np.arctan2(cross, dot)))

    def test_cavity_section_is_a_rounded_c(self):
        # Riley's drawing: in section the pocket is a C. The roof runs in
        # from the upper lip and curls down a rounded back; the floor ramps
        # down from the lower lip into a rounded bottom that sits the incut
        # below the lip; the deepest point is at the chamber's mid-height,
        # not on the floor; and there is no corner anywhere inside.
        for name in ("Two-finger pocket", "Three-finger pocket", "Mono"):
            p = PRESETS[name]
            with self.subTest(name=name):
                depth = p.depth * p.size / 100
                h, incut, d = p.opening_height, p.incut, p.pocket_depth
                cut = slot(p, depth, "export")
                section = largest(cut.rotate((0, 90, 0)).slice(0))
                z = section[:, 0]
                inside = section[z < depth - 0.3]
                # The opening at the face is the stadium itself: nothing
                # bulges below the lower lip or above the upper one there.
                at_face = largest(cut.slice(depth - 0.05))
                self.assertAlmostEqual(at_face[:, 1].min(), -h / 2, delta=0.5)
                self.assertAlmostEqual(at_face[:, 1].max(), h / 2, delta=0.5)
                deepest = inside[np.argmin(inside[:, 0])]
                self.assertAlmostEqual(deepest[1], -incut / 2, delta=2.5)
                self.assertAlmostEqual(deepest[0], depth - d, delta=1.0)
                lowest = inside[np.argmin(inside[:, 1])]
                self.assertAlmostEqual(lowest[1], -h / 2 - incut, delta=1.0)
                self.assertAlmostEqual(lowest[0], depth - 0.65 * d, delta=3.0)
                self.assertLessEqual(inside[:, 1].max(), h / 2 + 0.5)
                # The floor only goes down on the way in to the bottom.
                front = inside[(inside[:, 0] > depth - 0.65 * d) & (inside[:, 1] < 0)]
                order = np.argsort(-front[:, 0])
                self.assertTrue(np.all(np.diff(front[order, 1]) <= 0.3))
                # Rounded everywhere below the face: no bend over 35 degrees.
                turning = self.turning_angles(section)
                self.assertLess(turning[z < depth - 1.0].max(), 35)
                # And it follows the incut: more incut, lower bottom.
                more = slot(replace(p, incut=incut + 8), depth, "export")
                self.assertAlmostEqual(
                    more.bounding_box()[1], cut.bounding_box()[1] - 8, delta=0.5
                )

    def test_lip_has_no_creases(self):
        # A rounded lip: along section curves through the roof, floor and
        # side lips, no bend sharper than the facets themselves, whatever
        # the floor angle, the body's crown and taper, or a seeded wobble;
        # an open pocket too. The curves are read off the finished solid.
        # The last two push well past the presets (a mono with most of its
        # opening again in incut and a big lip; a steep, tapered, wobbly
        # body). At the slider extremes beyond these the lip is a thin
        # blade over a cone facet and its outer end can still kink.
        cases = [
            (PRESETS["Two-finger pocket"], 35),
            (PRESETS["Three-finger pocket"], 35),
            (replace(PRESETS["Slopey pocket"], incut=-10), 35),
            (replace(PRESETS["Two-finger pocket"], through=True, incut=20), 35),
            (replace(PRESETS["Mono"], incut=20, lip_radius=14), 45),
            (
                replace(
                    PRESETS["Two-finger pocket"],
                    crown=35,
                    taper=30,
                    character=0.8,
                    seed=7,
                ),
                45,
            ),
        ]
        for p, limit in cases:
            with self.subTest(values=asdict(p)):
                model = build(replace(p, screws=False), "export")
                b = model.parameters
                depth = b.depth * b.size / 100
                reach = lip_reach(b)
                half_h = b.opening_height / 2 + max(b.incut, 0)
                solid = manifold.Manifold(
                    manifold.Mesh(
                        np.asarray(model.mesh.vertices, dtype=np.float32),
                        np.asarray(model.mesh.faces, dtype=np.uint32),
                    )
                )
                floor = max(depth - 2 * reach - 2, 3.0)
                worst, examined = 0.0, 0
                # Planes x = x0 give (z, y) and cut the roof and floor lips
                # squarely; the plane y = 0 gives (x, -z) through the side
                # lips; planes at 45 degrees through each corner's arc centre
                # cut the corner lips. Planes grazing the tilted floor or
                # roof would turn sharply where they leave the cavity, so
                # none are used.
                run = max(b.opening_width - b.opening_height, 0) / 2
                planes = (
                    [
                        (solid.rotate((0, 90, 0)), -x0, lambda c: (c[1], c[0]), half_h)
                        for x0 in (0.0, run + 2, -(run + 2))
                    ]
                    + [
                        (
                            solid.rotate((90, 0, 0)),
                            0.0,
                            lambda c: (c[0], -c[1]),
                            b.opening_width / 2,
                        )
                    ]
                    + [
                        (
                            solid.rotate((0, 0, -sign * 45)).rotate((0, 90, 0)),
                            -sign * run * math.cos(math.radians(45)),
                            lambda c: (c[1], c[0]),
                            max(b.opening_width, b.opening_height) / 2,
                        )
                        for sign in (1, -1)
                    ]
                )
                for turned, offset, axes, half in planes:
                    for polygon in turned.slice(offset).simplify(0.3).to_polygons():
                        points = np.asarray(polygon)
                        before, after = (
                            np.roll(points, 1, axis=0),
                            np.roll(points, -1, axis=0),
                        )
                        v1, v2 = points - before, after - points
                        cross = v1[:, 0] * v2[:, 1] - v1[:, 1] * v2[:, 0]
                        dot = (v1 * v2).sum(axis=1)
                        turning = np.degrees(np.abs(np.arctan2(cross, dot)))
                        along, out = axes(points.T)
                        band = (np.abs(along) <= half + reach + 3) & (out >= floor)
                        if band.any():
                            worst = max(worst, float(turning[band].max()))
                            examined += int(band.sum())
                self.assertGreater(examined, 40)
                self.assertLess(
                    worst, limit, f"a {worst:.0f} degree bend in the lip band"
                )

    def test_mono_opening_is_round(self):
        # Equal width and height give a round hole at the face; the lip's
        # reach around it varies a little with the wall it leaves and the
        # face it meets, so the shadow is only roughly opening plus two lips.
        p = replace(PRESETS["Mono"], incut=0, screws=False)
        depth = p.depth * p.size / 100
        _, cut, _, _, _ = pocket(p, "preview")
        lo, hi = np.array(slot(p, depth, "preview").slice(depth).bounds()).reshape(2, 2)
        mouth = hi - lo
        self.assertAlmostEqual(mouth[0], mouth[1], delta=0.3)
        self.assertAlmostEqual(mouth[0], p.opening_width, delta=0.5)
        lo, hi = np.array(cut.project().bounds()).reshape(2, 2)
        for size in hi - lo:
            self.assertGreaterEqual(size, p.opening_width + 2 * p.lip_radius - 1)
            self.assertLessEqual(
                size, p.opening_width + 2 * LIP_SPAN * p.lip_radius + 1
            )

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
