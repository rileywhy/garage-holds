"""The round pinch: its section, its fall toward the ends, what it eases,
where its hardware goes, and that every setting exports a closed solid."""

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
from geometry import BEND_SHARE, HOLLOW_SLOPE, WAIST, build, loft
from parameters import BASE, CONTROLS, PRESETS, design_document, parse_parameters

from tools.hold_mounting import _inside

# Push CI samples the sweep with fixed seeds. The nightly deep run
# (.github/workflows/deep-tests.yml) sets HOLD_TESTS_DEEP=1 for the full
# count and HOLD_TESTS_SEED for fresh seeds, printed in its log.
DEEP = os.environ.get("HOLD_TESTS_DEEP") == "1"
SEED = int(os.environ.get("HOLD_TESTS_SEED", "0"))

PLAIN = replace(BASE, screws=False)
NAMES = list(PRESETS)


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
        auto_screw_count=rng.random() < 0.5,
        auto_seat=rng.random() < 0.6,
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


def assert_recesses_enclosed(case, model):
    """Every recess, its shank and its bore sit inside the body with 1 mm
    to spare, at every height from the wall until the bore leaves through
    the top; there, a vertical line around each hole leaves the body once,
    above its recess."""
    case.assertTrue(model.holes)
    solid = loft(model.parameters, "preview")[0]
    for hole in model.holes:
        cone = 0 if hole.bolt else (hole.head - hole.shank) / 2
        exits = []
        for a in np.linspace(0, 2 * math.pi, 24, endpoint=False):
            r = hole.head / 2 + 0.5
            hits = crossings(solid, hole.x + r * math.cos(a), hole.y + r * math.sin(a))
            case.assertEqual(len(hits), 1)
            case.assertGreater(hits[0], hole.seat + cone + 1)
            exits.append(hits[0])
        turn = np.linspace(0, 2 * math.pi, 48, endpoint=False)
        for z in np.arange(0.5, min(exits) - 0.5, 1.0):
            rings = solid.slice(z).to_polygons()
            r = recess_radius(hole, z) + 1.0
            circle = np.column_stack(
                (hole.x + r * np.cos(turn), hole.y + r * np.sin(turn))
            )
            case.assertTrue(_inside(circle, rings).all(), f"z={z}")


def across(outline, z):
    """Where a closed (x, z) outline crosses the height z: its leftmost and
    rightmost points there."""
    a, b = outline, np.roll(outline, -1, axis=0)
    crossing = (a[:, 1] - z) * (b[:, 1] - z) < 0
    a, b = a[crossing], b[crossing]
    x = a[:, 0] + (z - a[:, 1]) / (b[:, 1] - a[:, 1]) * (b[:, 0] - a[:, 0])
    return x.min(), x.max()


def centre(p):
    """The centre section as built, in (x, z)."""
    return build(p).profile


def widest(outline, finger):
    """The height of one side's widest point."""
    x = outline[:, 0] if finger else -outline[:, 0]
    return outline[np.argmax(x), 1]


def steepest(outline, finger):
    """The steepest lean of one side's hollow from the wall's normal, in
    degrees, between the wall and the side's widest point."""
    x, z = outline[:, 0], outline[:, 1]
    side = ((x > 0) if finger else (x < 0)) & (z <= widest(outline, finger) + 1e-6)
    x, z = np.abs(x[side]), z[side]
    order = np.argsort(z)
    run, climb = np.diff(x[order]), np.diff(z[order])
    return math.degrees(math.atan((run[climb > 1e-9] / climb[climb > 1e-9]).max()))


class RoundPinchTests(unittest.TestCase):
    def test_presets_build_as_written(self):
        self.assertGreaterEqual(len(NAMES), 5)
        for name in NAMES:
            with self.subTest(name=name):
                model = build(PRESETS[name])
                self.assertEqual(model.adjusted, {})
                self.assertTrue(model.holes)
                export = build(PRESETS[name], "export")
                for mesh in (model.mesh, export.mesh):
                    self.assertTrue(mesh.is_watertight and mesh.is_winding_consistent)
                    self.assertGreater(mesh.volume, 0)
                self.assertGreater(len(export.mesh.faces), len(model.mesh.faces))
                np.testing.assert_allclose(
                    export.mesh.extents, model.mesh.extents, atol=0.6
                )
                limit = model.preview()["control_limits"].get("rounding", 30)
                self.assertGreaterEqual(limit, PRESETS[name].rounding)

    def test_span_is_the_widest_point_and_the_feet_cut_back(self):
        p = replace(PLAIN, width=70, depth=50, thumb_incut=6, finger_incut=10)
        outline = centre(p)
        x, z = outline[:, 0], outline[:, 1]
        self.assertAlmostEqual(np.ptp(x), 70, delta=0.01)
        self.assertAlmostEqual(z.max(), 50, delta=0.01)
        feet = x[z < 1e-9]
        self.assertAlmostEqual(feet.min(), -35 + 6, delta=0.01)
        self.assertAlmostEqual(feet.max(), 35 - 10, delta=0.01)
        # Each side's widest point stands off the wall, over its hollow.
        for finger in (False, True):
            self.assertGreater(widest(outline, finger), 0.3 * 50)

    def test_rounding_takes_nothing_from_the_incut(self):
        # The reason for this lab: a bigger round lowers the widest point
        # and leaves the feet, and so the incut, where they were.
        small, large = (centre(replace(PLAIN, rounding=r)) for r in (8, 22))
        for outline in (small, large):
            feet = outline[outline[:, 1] < 1e-9, 0]
            self.assertAlmostEqual(np.ptp(feet), 66 - 18, delta=0.01)
            self.assertAlmostEqual(np.ptp(outline[:, 0]), 66, delta=0.01)
        self.assertAlmostEqual(widest(small, True) - widest(large, True), 14, delta=0.01)
        # Halfway up the round the body is fuller with the smaller one.
        z = 48 - 7 - 2
        self.assertGreater(np.ptp(across(small, z)), np.ptp(across(large, z)) + 4)

    def test_sides_meet_the_wall_and_the_round_upright(self):
        outline = centre(PLAIN)
        x, z = outline[:, 0], outline[:, 1]
        lip = widest(outline, True)
        for low, high in ((0, 1.5), (lip - 1.5, lip + 1.5)):
            band = (x > 0) & (z >= low) & (z <= high)
            self.assertLess(np.ptp(x[band]), 0.25)

    def test_hollows_ease_to_a_printable_slope(self):
        # Asked for more incut than a shallow side can carry, the hollow
        # stops at 45 degrees and the sliders are told.
        p = replace(PLAIN, depth=30, rounding=14, thumb_incut=16, finger_incut=16)
        model = build(p)
        self.assertLess(model.adjusted["finger_incut"], 16)
        limit = math.degrees(HOLLOW_SLOPE) + 0.5
        for finger in (False, True):
            self.assertLess(steepest(model.profile, finger), limit)
        # An offset thumb side is lower, so it carries less.
        low = build(replace(PLAIN, offset=50, thumb_incut=16, finger_incut=16))
        self.assertLess(low.parameters.thumb_incut, low.parameters.finger_incut)
        self.assertLess(steepest(low.profile, False), limit)

    def test_hollows_never_steepen_toward_the_ends(self):
        for name in NAMES:
            with self.subTest(name=name):
                p = replace(PRESETS[name], screws=False)
                solid = loft(p, "export")[0]
                mesh = solid.to_mesh()
                faces = trimesh.Trimesh(
                    mesh.vert_properties[:, :3], mesh.tri_verts, process=True
                )
                # No face off the wall looks down at it more steeply than
                # the hollow's limit: nothing to support when printed.
                down = -faces.face_normals[:, 2]
                off_wall = faces.triangles_center[:, 2] > 0.05
                limit = math.sin(HOLLOW_SLOPE) + 0.02
                self.assertLess(down[off_wall].max(), limit)

    def test_incuts_keep_a_waist(self):
        for change in (
            dict(width=30, thumb_incut=12, finger_incut=12),
            dict(width=50, hourglass=50, thumb_incut=16, finger_incut=16, depth=70),
            dict(width=25, thumb_incut=8, finger_incut=8),
        ):
            with self.subTest(**change):
                p = replace(PLAIN, **change)
                outline = centre(p)
                feet = outline[outline[:, 1] < 1e-9, 0]
                self.assertGreaterEqual(
                    np.ptp(feet), min(WAIST, np.ptp(outline[:, 0])) - 0.01
                )

    def test_offset_lowers_the_thumb_side(self):
        outline = centre(replace(PLAIN, offset=40))
        self.assertAlmostEqual(
            widest(outline, False), 0.6 * widest(outline, True), delta=0.01
        )

    def test_rounding_is_capped_to_what_fits(self):
        preview = build(replace(PLAIN, depth=24, rounding=30)).preview()
        cap = preview["control_limits"]["rounding"]
        self.assertLess(cap, 30)
        # The hollow keeps its share of the depth under the capped round.
        outline = np.array(preview["profile"])
        self.assertGreaterEqual(widest(outline, True), 0.3 * 24 - 0.01)
        self.assertNotIn("edge_radius", preview["control_limits"])

    def test_arch_stands_tallest_in_the_middle(self):
        def top(solid, y):
            return max(crossings(solid, 0, y))

        level = loft(replace(PLAIN, arch=0), "preview")[0]
        arched = loft(replace(PLAIN, arch=100), "preview")[0]
        for solid in (level, arched):
            self.assertAlmostEqual(top(solid, 0), 48, delta=0.05)
            self.assertGreater(top(solid, 0), top(solid, 25))
            self.assertGreater(top(solid, 25), top(solid, 45))
        self.assertGreater(top(level, 40) - top(arched, 40), 8)

    def test_ends_round_from_an_oval_to_a_block(self):
        def width(solid, y):
            x = np.vstack(solid.slice(20).to_polygons())
            return np.ptp(x[np.abs(x[:, 1] - y) < 2.5, 0])

        oval = loft(replace(PLAIN, end_rounding=100), "preview")[0]
        block = loft(replace(PLAIN, end_rounding=20), "preview")[0]
        self.assertGreater(width(block, 40) - width(oval, 40), 10)

    def test_bend_curves_the_pinch_and_its_screws(self):
        p = replace(PRESETS["Crescent pinch"], bend=20, auto_screw_count=False)
        for count in (2, 3):
            with self.subTest(count=count):
                model = build(replace(p, screw_count=count))
                holes = sorted(model.holes, key=lambda h: h.y)
                self.assertEqual(len(holes), count)
                assert_recesses_enclosed(self, model)
                # The middle of the pinch sits toward the finger side of
                # its ends, and the screws follow it.
                solid = loft(model.parameters, "preview")[0]

                def middle(y):
                    ring = np.vstack(solid.slice(10).to_polygons())
                    x = ring[np.abs(ring[:, 1] - y) < 2.5, 0]
                    return (x.min() + x.max()) / 2

                self.assertGreater(middle(0) - middle(50), 10)
                for hole in holes:
                    self.assertAlmostEqual(hole.x, middle(hole.y), delta=3.5)
        long = build(replace(PLAIN, height=60, bend=25))
        self.assertAlmostEqual(long.parameters.bend, BEND_SHARE * 60, delta=0.5)

    def test_recesses_stay_enclosed_over_deep_hollows(self):
        for change in (
            dict(thumb_incut=16, finger_incut=16, depth=60),
            dict(width=52, rounding=26, thumb_incut=10, finger_incut=10),
            dict(bolt_mount=True, width=84, thumb_incut=14, finger_incut=14, depth=56),
            dict(offset=40, finger_incut=14, auto_seat=False, seat_depth=10),
        ):
            with self.subTest(**change):
                assert_recesses_enclosed(self, build(replace(BASE, **change)))

    def test_body_has_no_facet_creases(self):
        for name in NAMES:
            with self.subTest(name=name):
                solid = loft(replace(PRESETS[name], screws=False), "preview")[0]
                mesh = solid.to_mesh()
                faces = trimesh.Trimesh(
                    mesh.vert_properties[:, :3], mesh.tri_verts, process=True
                )
                ends = faces.vertices[faces.face_adjacency_edges]
                off_wall = ends[:, :, 2].min(axis=1) > 0.05
                self.assertLess(
                    np.degrees(faces.face_adjacency_angles[off_wall]).max(), 20
                )

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control. The generator may refuse a
        # setting with a message, but whatever it builds is one closed
        # solid, within the sliders, and reopens as the same hold.
        rng = random.Random(SEED)
        built = 0
        for index in range(240 if DEEP else 30):
            values = random_settings(rng)
            with self.subTest(seed=SEED, index=index, values=values):
                try:
                    model = build(parse_parameters(values), "export")
                except ValueError:
                    continue
                built += 1
                self.assertTrue(model.mesh.is_watertight)
                self.assertGreater(model.mesh.volume, 0)
                p = model.parameters
                self.assertEqual(parse_parameters(asdict(p)), p)
                again = build(
                    parse_parameters(design_document(p)["parameters"]), "export"
                )
                self.assertEqual(again.parameters, p)
                np.testing.assert_allclose(
                    again.mesh.extents, model.mesh.extents, atol=1e-6
                )
        self.assertGreater(built, 20 if not DEEP else 150)

    def test_validation(self):
        for values in (
            {"width": float("nan")},
            {"auto_screw_count": 1},
            {"screw_count": 1.5},
            {"shape": "domed"},
            {"unknown": 0},
        ):
            with self.assertRaises(ValueError):
                parse_parameters(values)
        self.assertEqual(parse_parameters({"rounding": 99}).rounding, 30)

    def test_scale_is_direct(self):
        small, large = build(PLAIN), build(replace(PLAIN, size=200))
        np.testing.assert_allclose(
            large.mesh.extents, small.mesh.extents * 2, rtol=1e-4
        )
        self.assertEqual(large.adjusted, {})


if __name__ == "__main__":
    unittest.main()
