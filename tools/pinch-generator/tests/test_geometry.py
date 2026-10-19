import math
import os
import random
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import WAIST, build, loft, section
from parameters import (
    BASE,
    CONTROLS,
    PRESETS,
    SCREW_SPAN,
    SCREW_STEP,
    SHAPES,
    design_document,
    parse_parameters,
)

from tools.hold_mounting import _inside

# Push CI samples each sweep with fixed seeds. The nightly deep run
# (.github/workflows/deep-tests.yml) sets HOLD_TESTS_DEEP=1 for the full
# counts and HOLD_TESTS_SEED for fresh seeds, printed in its log.
DEEP = os.environ.get("HOLD_TESTS_DEEP") == "1"
SEED = int(os.environ.get("HOLD_TESTS_SEED", "0"))

# Settings that undercut the sides, flare their feet and lower the seat by
# hand, where a recess could open through a side or its waist (RIL-37).
UNDERCUT = [
    PRESETS["Lip pinch"],
    replace(
        PRESETS["Lip pinch"], base_flare=15, depth=50, auto_seat=False, seat_depth=12
    ),
    replace(PRESETS["Lip pinch"], bolt_mount=True, width=80),
    replace(
        BASE,
        thumb_angle=-20,
        finger_angle=-8,
        offset=35,
        depth=55,
        auto_screw_count=False,
        screw_count=3,
    ),
    replace(
        BASE,
        shape="ridged",
        top_rise=15,
        thumb_angle=-15,
        finger_angle=-15,
        width=70,
        base_flare=10,
        character=1,
        seed=4,
    ),
]


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
        shape=rng.choice(list(SHAPES)),
        screws=rng.random() < 0.85,
        bolt_mount=rng.random() < 0.3,
        auto_screw_count=rng.random() < 0.5,
        auto_seat=rng.random() < 0.6,
        seed=rng.randint(0, 999999),
    )
    return values


def crossings(solid, x, y):
    """The heights where a vertical line through (x, y) crosses the
    surface, from just off the wall outward."""
    return [hit.position[2] for hit in solid.ray_cast((x, y, 0.01), (x, y, 500))]


def recess_radius(hole, z):
    """The radius of a hole's cutter at height z: the shank below the seat,
    the countersink cone above it (none under a bolt), then the head."""
    cone = 0 if hole.bolt else (hole.head - hole.shank) / 2
    if z < hole.seat:
        return hole.shank / 2
    if z < hole.seat + cone:
        return hole.shank / 2 + (z - hole.seat)
    return hole.head / 2


def across(outline, z):
    """Where a closed (x, z) outline crosses the height z: its leftmost and
    rightmost points there."""
    a, b = outline, np.roll(outline, -1, axis=0)
    crossing = (a[:, 1] - z) * (b[:, 1] - z) < 0
    a, b = a[crossing], b[crossing]
    x = a[:, 0] + (z - a[:, 1]) / (b[:, 1] - a[:, 1]) * (b[:, 0] - a[:, 0])
    return x.min(), x.max()


def side_angle(outline, low, high, finger):
    """The lean of one straight side of a section between two heights, in
    degrees: positive leans in toward the top."""
    x, z = outline[:, 0], outline[:, 1]
    mask = (z > low) & (z < high) & ((x > 0) if finger else (x < 0))
    slope = np.polyfit(z[mask], x[mask], 1)[0]
    return math.degrees(math.atan(-slope if finger else slope))


class PinchTests(unittest.TestCase):
    def test_presets_and_exports(self):
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                a, b = build(p), build(p, "export")
                self.assertTrue(a.mesh.is_watertight and b.mesh.is_watertight)
                self.assertTrue(a.mesh.is_winding_consistent)
                self.assertEqual(
                    len(a.holes),
                    2 if a.parameters.bolt_mount else a.parameters.screw_count,
                )
                self.assertEqual(a.holes, b.holes)
                self.assertGreater(a.mesh.volume, 0)
                self.assertAlmostEqual(a.mesh.bounds[0, 2], 0, places=5)
                # The presets fit as written: nothing had to grow or ease.
                self.assertEqual(a.adjusted, {})
                c = build(parse_parameters(asdict(a.parameters)))
                np.testing.assert_allclose(a.mesh.extents, c.mesh.extents)

    def test_sides_stand_at_their_angles(self):
        # Each gripping face leans as asked, between its flare and its edge.
        for thumb, finger in ((0, 0), (25, -10), (-15, 35)):
            with self.subTest(thumb=thumb, finger=finger):
                p = replace(
                    BASE, shape="flat", thumb_angle=thumb, finger_angle=finger, depth=60
                )
                outline = section(p, 16)[0]
                self.assertAlmostEqual(
                    side_angle(outline, 25, 40, False), thumb, delta=0.5
                )
                self.assertAlmostEqual(
                    side_angle(outline, 25, 40, True), finger, delta=0.5
                )

    def test_span_depth_and_top(self):
        # Square sides with no flare: the hold is as wide as its span and
        # stands as deep as asked, plus the top's rise.
        square = replace(
            BASE, thumb_angle=0, finger_angle=0, base_flare=0, screws=False
        )
        for shape, rise in (("flat", 0), ("domed", 6), ("domed", 15), ("ridged", 12)):
            with self.subTest(shape=shape, rise=rise):
                p = replace(square, shape=shape, top_rise=rise)
                outline = section(p, 16)[0]
                self.assertAlmostEqual(np.ptp(outline[:, 0]), p.width, delta=0.01)
                self.assertAlmostEqual(outline[:, 1].max(), p.depth + rise, delta=0.3)
                extents = build(p).mesh.extents
                self.assertAlmostEqual(extents[0], p.width, delta=0.1)
                self.assertAlmostEqual(extents[1], p.height, delta=0.1)

    def test_offset_lowers_the_thumb_side(self):
        # A flat top runs from the finger side's edge down to the thumb
        # side's, which stands the offset lower.
        for offset in (0, 40):
            with self.subTest(offset=offset):
                p = replace(
                    BASE, shape="flat", offset=offset, thumb_angle=0, finger_angle=0
                )
                outline = section(p, 16)[0]
                x, z = outline[:, 0], outline[:, 1]
                top = (np.abs(x) < p.width / 4) & (z > p.depth * 0.3)
                slope, middle = np.polyfit(x[top], z[top], 1)
                self.assertAlmostEqual(
                    middle - slope * p.width / 2,
                    p.depth * (1 - offset / 100),
                    delta=0.01,
                )
                self.assertAlmostEqual(
                    middle + slope * p.width / 2, p.depth, delta=0.01
                )

    def test_undercut_keeps_a_waist(self):
        # Undercut both sides of a narrow, deep pinch as far as they go:
        # the angles ease until the neck is WAIST wide, and the lab is told.
        p = replace(
            BASE, width=40, depth=70, thumb_angle=-30, finger_angle=-30, screws=False
        )
        model = build(p)
        self.assertIn("thumb_angle", model.adjusted)
        self.assertIn("finger_angle", model.adjusted)
        b = model.parameters
        self.assertLess(b.thumb_angle, 0)
        self.assertLess(b.finger_angle, 0)
        outline = section(b, 16)[0]
        for height in np.arange(1, b.depth - b.edge_radius, 2):
            left, right = across(outline, height)
            self.assertGreaterEqual(right - left, WAIST - 0.01)

    def test_wider_pinches_take_more_screws(self):
        # Chosen from the size, a pinch takes two screws, and one more for
        # every SCREW_STEP its span runs past SCREW_SPAN after overall
        # scale. It never takes a bolt it was not asked for.
        for p, count in (
            (BASE, 2),
            (replace(BASE, width=SCREW_SPAN + 1, height=140), 3),
            (replace(BASE, size=130, height=110), 3),
            (replace(BASE, width=SCREW_SPAN + SCREW_STEP + 1, height=180), 4),
            (replace(BASE, width=110, auto_screw_count=False, screw_count=2), 2),
        ):
            with self.subTest(width=p.width, size=p.size, auto=p.auto_screw_count):
                model = build(p)
                self.assertFalse(model.parameters.bolt_mount)
                self.assertEqual(model.parameters.screw_count, count)
                self.assertEqual(len(model.holes), count)
                self.assertEqual(model.adjusted, {})
        # A short pinch gives up screws it has no room for rather than
        # growing taller for them, down to two.
        short = build(replace(BASE, width=110, height=60))
        self.assertEqual(short.parameters.screw_count, 2)
        self.assertEqual(short.parameters.height, 60)
        # The bolt is there when it is asked for.
        bolted = build(replace(BASE, width=40, bolt_mount=True))
        self.assertEqual(sum(h.bolt for h in bolted.holes), 1)

    def test_screws_run_up_the_middle(self):
        for count in (1, 2, 3, 4):
            with self.subTest(count=count):
                p = replace(BASE, auto_screw_count=False, screw_count=count, height=160)
                holes = build(p).holes
                self.assertEqual(len(holes), count)
                xs, ys = [h.x for h in holes], sorted(h.y for h in holes)
                self.assertLess(np.ptp(xs), 0.5)
                if count > 1:
                    self.assertAlmostEqual(ys[0], -ys[-1], delta=1.5)
                    self.assertGreater(ys[-1] - ys[0], p.height * 0.3)
                    # Evenly spaced from one end of the line to the other,
                    # to the step of the 51-point grid the layout snaps to.
                    self.assertLessEqual(np.ptp(np.diff(ys)), p.height / 50 + 0.01)

    def test_recesses_open_on_the_level_top(self):
        # The hardware keeps to the level part of the top, in one line up
        # the pinch, with a bolt's anti-rotation screw below it: no recess
        # opens out through the slope of an end, and none is pushed to the
        # corner of one beside a side.
        cases = [
            (name, dict(auto_screw_count=False, screw_count=count))
            for name in ("Block pinch", "Wide pinch", "Lip pinch", "Ridged fin")
            for count in (2, 3)
        ] + [(name, dict(bolt_mount=True)) for name in ("Wide pinch", "Lip pinch")]
        for name, change in cases:
            with self.subTest(name=name, **change):
                model = build(replace(PRESETS[name], **change))
                solid = loft(model.parameters, "preview")[0]
                self.assertLess(np.ptp([h.x for h in model.holes]), 0.5)
                for hole in model.holes:
                    rims = [
                        max(crossings(solid, hole.x, hole.y + s * hole.head / 2))
                        for s in (-1, 1)
                    ]
                    self.assertLess(abs(rims[0] - rims[1]), 0.5)
                bolts = [h for h in model.holes if h.bolt]
                if bolts:
                    screw = next(h for h in model.holes if not h.bolt)
                    self.assertLess(screw.y, bolts[0].y)

    def test_recesses_stay_enclosed_under_undercut_faces(self):
        # Every recess, its shank and its bore sit inside the body with
        # 1 mm to spare, at every height from the wall until the bore
        # leaves through the top; there, a vertical line around each hole
        # leaves the body once, above its recess. An undercut side or the
        # waist above a flare would cut the circle short or let the line
        # out and back in (RIL-37).
        for p in UNDERCUT if DEEP else UNDERCUT[:3]:
            with self.subTest(values=asdict(p)):
                model = build(p)
                self.assertTrue(model.holes)
                solid = loft(model.parameters, "preview")[0]
                for hole in model.holes:
                    cone = 0 if hole.bolt else (hole.head - hole.shank) / 2
                    exits = []
                    for a in np.linspace(0, 2 * math.pi, 24, endpoint=False):
                        r = hole.head / 2 + 0.5
                        hits = crossings(
                            solid, hole.x + r * math.cos(a), hole.y + r * math.sin(a)
                        )
                        self.assertEqual(len(hits), 1)
                        self.assertGreater(hits[0], hole.seat + cone + 1)
                        exits.append(hits[0])
                    turn = np.linspace(0, 2 * math.pi, 48, endpoint=False)
                    for z in np.arange(0.5, min(exits) - 0.5, 1.0):
                        rings = solid.slice(z).to_polygons()
                        r = recess_radius(hole, z) + 1.0
                        circle = np.column_stack(
                            (hole.x + r * np.cos(turn), hole.y + r * np.sin(turn))
                        )
                        self.assertTrue(_inside(circle, rings).all(), f"z={z}")

    def test_body_has_no_facet_creases(self):
        # The lofted body is sampled finely enough that the preview shades
        # no creases: no two faces bend more than 15 degrees, off the wall.
        for p in (BASE, PRESETS["Ridged fin"], replace(BASE, character=1, seed=9)):
            with self.subTest(shape=p.shape, character=p.character):
                solid = loft(build(replace(p, screws=False)).parameters, "preview")[0]
                mesh = solid.to_mesh()
                faces = trimesh.Trimesh(
                    mesh.vert_properties[:, :3], mesh.tri_verts, process=True
                )
                ends = faces.vertices[faces.face_adjacency_edges]
                off_wall = ends[:, :, 2].min(axis=1) > 0.05
                self.assertLess(
                    np.degrees(faces.face_adjacency_angles[off_wall]).max(), 15
                )

    def test_character_waves_the_sides_and_keeps_the_back(self):
        # The waviness moves the sides in and out along the pinch and fades
        # to nothing at the wall, so the footprint stays as built.
        plain = loft(replace(BASE, screws=False), "preview")[0]
        wavy = loft(replace(BASE, screws=False, character=1, seed=3), "preview")[0]

        def moved(z):
            a, b = plain.slice(z), wavy.slice(z)
            return (a - b).area() + (b - a).area()

        self.assertLess(moved(0.001), 1)
        self.assertGreater(moved(30), 50)

    def test_scale_without_hardware_is_direct(self):
        p = replace(BASE, screws=False)
        small, large = build(p), build(replace(p, size=200))
        # The edge rounding scales too, so the whole pinch doubles.
        np.testing.assert_allclose(
            large.mesh.extents, small.mesh.extents * 2, rtol=1e-4
        )

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control and top. The generator may
        # refuse hardware that does not fit, in words; anything else must
        # export as one closed body.
        rng = random.Random(2026 + SEED)
        count = 40 if DEEP else 6
        exported = 0
        for _ in range(count):
            p = parse_parameters(random_settings(rng))
            with self.subTest(values=asdict(p)):
                try:
                    model = build(p, "export")
                except ValueError as error:
                    self.assertIn("fit", str(error))
                    continue
                self.assertTrue(model.mesh.is_watertight)
                self.assertTrue(model.mesh.is_winding_consistent)
                self.assertGreater(model.mesh.volume, 0)
                exported += 1
        self.assertGreater(exported, count // 2)

    def test_growth_stays_within_the_sliders(self):
        # Three screws up a short pinch: it grows taller for them, but never
        # past the height slider's maximum (RIL-78).
        limits = {control["key"]: control["max"] for control in CONTROLS}
        model = build(
            replace(BASE, size=60, height=40, auto_screw_count=False, screw_count=3)
        )
        self.assertEqual(len(model.holes), 3)
        self.assertLess(np.ptp([h.x for h in model.holes]), 0.5)
        self.assertGreater(model.parameters.height, 40)
        self.assertLessEqual(model.parameters.height, limits["height"])
        self.assertIn("height", model.adjusted)

    def test_designs_reopen_and_rebuild_the_same_hold(self):
        # The exported design carries the settings actually built, so
        # parsing it back and building again gives the same hold: links,
        # presets and settings files depend on it.
        rng = random.Random(78 + SEED)
        count = 60 if DEEP else 4
        cases = [
            asdict(
                replace(BASE, size=60, height=40, auto_screw_count=False, screw_count=3)
            ),
            asdict(
                replace(BASE, width=40, depth=70, thumb_angle=-20, finger_angle=-20)
            ),
        ] + [random_settings(rng) for _ in range(count)]
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
        self.assertGreaterEqual(rebuilt, 2 + count // 2)

    def test_manual_seat_survives_turning_screws_off(self):
        for p in PRESETS.values():
            model = build(replace(p, screws=False, auto_seat=False, seat_depth=9))
            self.assertTrue(model.mesh.is_watertight)
            self.assertEqual(model.holes, [])

    def test_manual_seat_is_used_when_it_fits(self):
        model = build(replace(BASE, auto_seat=False, seat_depth=5))
        self.assertEqual(model.holes[0].seat, 5)
        self.assertEqual(model.parameters.seat_depth, 5)

    def test_edge_rounding_is_capped_to_what_fits(self):
        # A low thumb side has room for less rounding: the lab is told the
        # most that fits, and the edge is built with it.
        p = replace(BASE, depth=20, offset=60, edge_radius=20)
        preview = build(p).preview()
        self.assertLess(preview["control_limits"]["edge_radius"], 20)
        self.assertEqual(build(BASE).preview()["control_limits"], {})

    def test_validation(self):
        for values in (
            {"width": float("nan")},
            {"auto_screw_count": 1},
            {"screw_count": 1.5},
            {"shape": "round"},
            {"unknown": 0},
        ):
            with self.assertRaises(ValueError):
                parse_parameters(values)


if __name__ == "__main__":
    unittest.main()
