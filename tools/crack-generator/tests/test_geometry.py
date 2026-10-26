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
from geometry import BED, GAP, NECK_BOUNDS, NECK_REACH, build, loft
from parameters import (
    BASE,
    STRAIGHT,
    CONTROLS,
    PRESETS,
    SCREW_LENGTH,
    SEAT_MAX,
    SEAT_SHARE,
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

# Settings where a recess could open into the crack: thin sides, a crack
# flared in so its faces lean over the screws, a wandering crack, a
# constriction beside a screw, locks turned for a roof, a lowered seat, and
# the bolt in a floor.
CLOSE = [
    replace(STRAIGHT, side=17, flare=-12, depth=60, edge_radius=2),
    replace(
        PRESETS["Finger locks"], character=1, seed=5, auto_seat=False, seat_depth=8
    ),
    replace(
        PRESETS["Finger locks"], character=1, seed=8, constriction=12, jam_angle=90
    ),
    replace(PRESETS["Hand crack"], bolt_mount=True),
    replace(PRESETS["Hand crack, one side"], flare=-10, side=40, bolt_mount=True),
    replace(STRAIGHT, flare=12, width=40, depth=60),
    replace(
        STRAIGHT,
        side=20,
        flare=-12,
        character=1,
        seed=11,
        constriction=12,
        constriction_height=50,
        width=30,
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


def across(solid, y, z):
    """Where the section of a solid at y up the wall crosses the height z
    out from it, left to right: the outsides and the crack's faces."""
    xs = []
    for ring in solid.rotate((90, 0, 0)).slice(y).to_polygons():
        a = np.asarray(ring)
        b = np.roll(a, -1, axis=0)
        # Turned about X, a section's points are (x, -z).
        crossing = (a[:, 1] + z) * (b[:, 1] + z) < 0
        a, b = a[crossing], b[crossing]
        xs.extend(a[:, 0] + (-z - a[:, 1]) / (b[:, 1] - a[:, 1]) * (b[:, 0] - a[:, 0]))
    return np.sort(xs)


def gap(solid, y, z):
    """The crack's width at y up the wall and z out from it."""
    xs = across(solid, y, z)
    return xs[2] - xs[1]


def body(p):
    """The crack body as built for p, before drilling."""
    return loft(build(replace(p, screws=False)).parameters, "preview")[0]


class CrackTests(unittest.TestCase):
    def test_presets_and_exports(self):
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                a, b = build(p), build(p, "export")
                self.assertTrue(a.mesh.is_watertight and b.mesh.is_watertight)
                self.assertTrue(a.mesh.is_winding_consistent)
                sides = 2 if p.shape == "block" else 1
                self.assertEqual(
                    len(a.holes),
                    2 if a.parameters.bolt_mount else a.parameters.screw_count * sides,
                )
                self.assertEqual(a.holes, b.holes)
                self.assertGreater(a.mesh.volume, 0)
                self.assertAlmostEqual(a.mesh.bounds[0, 2], 0, places=5)
                # The presets fit as written: nothing had to ease.
                self.assertEqual(a.adjusted, {})
                c = build(parse_parameters(asdict(a.parameters)))
                np.testing.assert_allclose(a.mesh.extents, c.mesh.extents)

    def test_block_is_as_wide_deep_and_long_as_asked(self):
        for p in (STRAIGHT, PRESETS["Hand crack"], replace(STRAIGHT, back=25, side=40)):
            with self.subTest(width=p.width, side=p.side, back=p.back):
                extents = build(replace(p, screws=False)).mesh.extents
                self.assertAlmostEqual(extents[0], p.width + 2 * p.side, delta=0.01)
                self.assertAlmostEqual(extents[1], p.length, delta=0.01)
                self.assertAlmostEqual(extents[2], p.depth + p.back, delta=0.01)

    def test_crack_is_as_wide_and_deep_as_asked(self):
        # Between its lips and its floor, a parallel crack is its width
        # all the way in, and its floor stands the back off the wall.
        p = replace(STRAIGHT, width=40, depth=70, back=14)
        solid = body(p)
        for z in (p.back + 10, p.back + p.depth / 2, p.back + p.depth - 10):
            self.assertAlmostEqual(gap(solid, 0, z), p.width, delta=0.01)
        floor = crossings(solid, 0, 0)
        self.assertAlmostEqual(floor[0], p.back, delta=0.01)
        self.assertEqual(len(floor), 1)

    def test_flare_leans_each_face(self):
        # Flared out, the crack narrows by twice the flare's tangent for
        # every millimetre in from its mouth; flared in, it widens, and the
        # block widens with it so each side is as thick as asked where the
        # crack is widest.
        for flare in (10, -8):
            with self.subTest(flare=flare):
                p = replace(STRAIGHT, width=36, depth=60, flare=flare, side=30)
                solid = body(p)
                mouth = p.back + p.depth
                for inward in (10, 30, 45):
                    self.assertAlmostEqual(
                        gap(solid, 0, mouth - inward),
                        p.width - 2 * inward * math.tan(math.radians(flare)),
                        delta=0.02,
                    )
                # Clear of the floor's rounding, the side thickens by the
                # flare's tangent for every millimetre out from the floor.
                xs = across(solid, 0, p.back + 10)
                tan = math.tan(math.radians(abs(flare)))
                self.assertAlmostEqual(
                    xs[1] - xs[0], p.side + (10 if flare < 0 else 50) * tan, delta=0.02
                )

    def test_default_is_a_short_finger_lock_block(self):
        # The lab opens on an 80 mm block whose 39 mm crack narrows to
        # 16 mm near its bottom end, so fingers slot in above the narrowing
        # and pull down into it, turned for a 40 degree board.
        self.assertEqual(BASE.jam_angle, 40)
        model = build(BASE)
        np.testing.assert_allclose(model.mesh.extents, (89, 80, 60), atol=0.01)
        self.assertEqual(len(model.holes), 4)
        self.assertEqual(model.adjusted, {})
        solid = body(BASE)
        z = BASE.back + BASE.depth / 2
        lowest = BASE.length * (BASE.constriction_height / 100 - 0.5)
        self.assertAlmostEqual(gap(solid, lowest, z), 16, delta=0.05)
        self.assertGreater(gap(solid, BASE.length / 2 - 8, z), 30)

    def test_constriction_narrows_a_stretch(self):
        # Turned for a vertical wall, the crack narrows by the constriction
        # at its height and is back to its width a crack width or so either
        # side of it, all the way in.
        p = replace(PRESETS["Finger locks"], jam_angle=0)
        solid = body(p)
        middle = p.length * (p.constriction_height / 100 - 0.5)
        z = p.back + p.depth / 2
        self.assertAlmostEqual(
            gap(solid, middle, z), p.width - p.constriction, delta=0.05
        )
        for y in (middle - 30, middle + 30):
            self.assertAlmostEqual(gap(solid, y, z), p.width, delta=0.01)
        between = gap(solid, middle + 12, z)
        self.assertGreater(between, p.width - p.constriction + 0.5)
        self.assertLess(between, p.width - 0.5)

    def test_jam_angle_turns_the_lock(self):
        # The crack is narrowest along a line through the constriction's
        # height halfway in, which dives down the wall at the jam angle as
        # it goes in, and opens square to that line as it does along the
        # crack on a vertical wall: so on a wall that steep, your weight
        # pulls square into the lock. At 90, for a roof, the line lies
        # along the wall halfway in.
        p = replace(PRESETS["Finger locks"], length=160, depth=60, screws=False)
        reach = float(np.clip(NECK_REACH * p.width, *NECK_BOUNDS))
        middle = np.array(
            (p.length * (p.constriction_height / 100 - 0.5), p.back + p.depth / 2)
        )
        for angle in (0, 25, 40, 65, 90):
            with self.subTest(angle=angle):
                solid = loft(build(replace(p, jam_angle=angle)).parameters, "export")[0]
                a = math.radians(angle)
                along = np.array((math.sin(a), math.cos(a)))
                square = np.array((math.cos(a), -math.sin(a)))
                for s in (-20, 0, 20):
                    point = middle + s * along
                    self.assertAlmostEqual(
                        gap(solid, *point), p.width - p.constriction, delta=0.15
                    )
                    for d in (-reach - 2, -reach / 2, reach / 2, reach + 2):
                        y, z = point + d * square
                        # Clear of the lips, the floor's rounding and the
                        # ends.
                        if abs(z - middle[1]) > 24 or abs(y) > p.length / 2 - 10:
                            continue
                        opened = math.cos(math.pi * min(abs(d) / reach, 1) / 2) ** 2
                        self.assertAlmostEqual(
                            gap(solid, y, z),
                            p.width - p.constriction * opened,
                            delta=0.15,
                        )

    def test_a_straight_crack_has_nothing_to_turn(self):
        a, b = (build(replace(STRAIGHT, jam_angle=angle)) for angle in (0, 90))
        np.testing.assert_allclose(a.mesh.vertices, b.mesh.vertices)
        self.assertEqual(a.holes, b.holes)

    def test_turned_locks_close_and_keep_their_screws(self):
        # The jam angle moves only the crack's faces, and a constriction
        # moves them away from the sides: every angle builds one closed
        # body with the screws it has turned for a vertical wall.
        for p in (
            BASE,
            replace(PRESETS["Finger locks"], character=1, seed=5),
            replace(
                PRESETS["Hand crack, one side"], character=1, seed=2, constriction=10
            ),
            replace(PRESETS["Hand crack"], bolt_mount=True, constriction=20),
        ):
            square = build(replace(p, jam_angle=0))
            for angle in (15, 30, 45, 60, 75, 90) if DEEP else (45, 90):
                with self.subTest(values=asdict(p), angle=angle):
                    model = build(replace(p, jam_angle=angle), "export")
                    self.assertTrue(model.mesh.is_watertight)
                    self.assertTrue(model.mesh.is_winding_consistent)
                    self.assertGreater(model.mesh.volume, 0)
                    self.assertEqual(len(model.holes), len(square.holes))
                    self.assertEqual(model.adjusted, {})

    def test_flare_and_constriction_ease_to_keep_the_crack_open(self):
        # A flare that would close the floor eases until it keeps GAP open,
        # a flare in that would widen the block past the bed eases until it
        # fits, and a constriction eases to what is left. The lab is told
        # each.
        for p, keys in (
            (replace(STRAIGHT, width=15, depth=60, flare=20), {"flare"}),
            (replace(STRAIGHT, width=120, side=55, depth=140, flare=-15), {"flare"}),
            (replace(STRAIGHT, width=20, constriction=30), {"constriction"}),
            (
                replace(STRAIGHT, width=20, depth=40, flare=10, constriction=10),
                {"flare", "constriction"},
            ),
        ):
            with self.subTest(values=asdict(p)):
                model = build(replace(p, screws=False))
                self.assertEqual(set(model.adjusted), keys)
                b = model.parameters
                tan = math.tan(math.radians(b.flare))
                self.assertGreaterEqual(
                    min(b.width, b.width - 2 * b.depth * tan) - b.constriction,
                    GAP - 1e-9,
                )
                self.assertLessEqual(model.mesh.extents[0], BED + 1e-6)
        # Eased flares and constrictions keep the slider steps.
        b = build(
            replace(STRAIGHT, width=15, depth=60, flare=20, screws=False)
        ).parameters
        self.assertEqual(b.flare * 2, round(b.flare * 2))

    def test_wander_keeps_the_width_and_the_back(self):
        # The wander moves the crack from side to side along its length and
        # keeps it as wide as asked; the back stays as built.
        plain = body(STRAIGHT)
        wavy = body(replace(STRAIGHT, character=1, seed=3))
        z = STRAIGHT.back + STRAIGHT.depth / 2
        middles = []
        for y in np.linspace(-30, 30, 7):
            self.assertAlmostEqual(gap(wavy, y, z), STRAIGHT.width, delta=0.05)
            xs = across(wavy, y, z)
            middles.append((xs[1] + xs[2]) / 2)
        self.assertGreater(np.ptp(middles), 2)
        self.assertLess(np.max(np.abs(middles)), STRAIGHT.side * 0.15 + 1e-6)
        self.assertAlmostEqual(
            plain.slice(0.001).area(), wavy.slice(0.001).area(), delta=1
        )

    def test_ends_round_off_and_the_back_stays_on_the_wall(self):
        # Toward each end every surface but the back rounds in, so the
        # front, the lips and the outer corners curve down to the end; the
        # back still reaches it.
        p = replace(STRAIGHT, edge_radius=6, screws=False)
        model = build(p)
        mesh = model.mesh
        tip = mesh.vertices[np.abs(mesh.vertices[:, 1]) > p.length / 2 - 1e-6]
        self.assertLess(tip[:, 2].max(), p.depth + p.back - 1)
        self.assertLess(np.ptp(tip[:, 0]), p.width + 2 * p.side - 2)
        back = body(p).slice(0.001)
        lo, hi = np.array(back.bounds()).reshape(2, 2)
        self.assertAlmostEqual(hi[1] - lo[1], p.length, delta=0.01)

    def test_one_side_is_the_left_of_a_crack(self):
        # One side has no floor: its face runs to the wall and the width
        # of the crack it makes with its pair is the mounting's to set.
        p = PRESETS["Hand crack, one side"]
        model = build(replace(p, screws=False))
        extents = model.mesh.extents
        self.assertAlmostEqual(extents[0], p.side, delta=0.01)
        self.assertAlmostEqual(extents[2], p.depth, delta=0.01)
        self.assertEqual(
            model.mesh.vertices.shape,
            build(replace(p, screws=False, width=20)).mesh.vertices.shape,
        )
        np.testing.assert_allclose(
            model.mesh.extents,
            build(replace(p, screws=False, width=20)).mesh.extents,
        )
        # A vertical line through the middle of the side meets only its
        # front.
        self.assertEqual(len(crossings(body(p), 0, 0)), 1)

    def test_screws_run_up_each_side(self):
        for count in (1, 2, 3):
            with self.subTest(count=count):
                p = replace(
                    STRAIGHT, auto_screw_count=False, screw_count=count, length=200
                )
                holes = build(p).holes
                self.assertEqual(len(holes), 2 * count)
                left = sorted((h for h in holes if h.x < 0), key=lambda h: h.y)
                right = sorted((h for h in holes if h.x > 0), key=lambda h: h.y)
                self.assertEqual(len(left), count)
                self.assertEqual(len(right), count)
                # Each a line up the middle of its side, mirrored across
                # the crack.
                middle = p.width / 2 + p.side / 2
                for a, b in zip(left, right):
                    self.assertAlmostEqual(a.x, -middle, delta=0.6)
                    self.assertAlmostEqual(b.x, middle, delta=0.6)
                    self.assertAlmostEqual(a.y, b.y, delta=0.01)
                if count > 1:
                    ys = [h.y for h in left]
                    self.assertAlmostEqual(ys[0], -ys[-1], delta=0.01)
                    self.assertGreater(ys[-1] - ys[0], p.length * 0.6)

    def test_longer_cracks_take_more_screws(self):
        # Chosen from the size, each side takes two screws, and three once
        # the crack runs past SCREW_LENGTH.
        for p, count in (
            (replace(STRAIGHT, length=SCREW_LENGTH), 2),
            (replace(STRAIGHT, length=SCREW_LENGTH + 1), 3),
            (replace(STRAIGHT, length=240), 3),
            (replace(STRAIGHT, length=240, auto_screw_count=False, screw_count=1), 1),
        ):
            with self.subTest(length=p.length, auto=p.auto_screw_count):
                model = build(p)
                self.assertEqual(model.parameters.screw_count, count)
                self.assertEqual(len(model.holes), 2 * count)
                self.assertEqual(model.adjusted, {})
        # A short crack gives up screws it has no room for, down to one a
        # side; asked for by hand, they are refused in words.
        short = build(replace(STRAIGHT, length=80, side=18, edge_radius=1))
        self.assertGreaterEqual(short.parameters.screw_count, 1)
        with self.assertRaisesRegex(ValueError, "fit"):
            build(
                replace(
                    STRAIGHT, length=80, auto_screw_count=False, screw_count=4, side=15
                )
            )

    def test_bolt_goes_through_the_floor(self):
        # A block's bolt sits in the crack's floor, its head below the
        # floor, and its anti-rotation screw in a side down the crack from
        # it. A finger crack's floor has no room for one.
        p = replace(PRESETS["Hand crack"], bolt_mount=True)
        model = build(p)
        bolt = next(h for h in model.holes if h.bolt)
        screw = next(h for h in model.holes if not h.bolt)
        self.assertAlmostEqual(bolt.x, 0, places=6)
        self.assertLess(bolt.seat, p.back)
        self.assertGreater(abs(screw.x), p.width / 2)
        self.assertLess(screw.y, bolt.y)
        with self.assertRaisesRegex(ValueError, "fit"):
            build(replace(STRAIGHT, bolt_mount=True))
        # One side takes its bolt in its middle.
        one = build(replace(PRESETS["Fist crack, one side"], side=45, bolt_mount=True))
        self.assertEqual(sum(h.bolt for h in one.holes), 1)

    def test_recesses_stay_enclosed_clear_of_the_crack(self):
        # Every recess, its shank and its bore sit inside the body with
        # 1 mm to spare, at every height from the wall until the bore
        # leaves through the front or the floor; there, a vertical line
        # around each hole leaves the body once, above its recess. A face
        # leaning over a screw, or a screw too near the crack, would cut
        # the circle short or let the line out into the crack and back in.
        for p in CLOSE if DEEP else CLOSE[:4]:
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
        # no creases off the wall: no two faces bend more than 15 degrees,
        # far below the viewer's 60 degree crease angle.
        for p in (
            STRAIGHT,
            PRESETS["Finger locks"],
            replace(STRAIGHT, character=1, seed=9, flare=8, width=30),
            PRESETS["Hand crack, one side"],
        ):
            with self.subTest(values=asdict(p)):
                mesh = body(p).to_mesh()
                faces = trimesh.Trimesh(
                    mesh.vert_properties[:, :3], mesh.tri_verts, process=True
                )
                ends = faces.vertices[faces.face_adjacency_edges]
                off_wall = ends[:, :, 2].min(axis=1) > 0.05
                self.assertLess(
                    np.degrees(faces.face_adjacency_angles[off_wall]).max(), 15
                )

    def test_fits_a_printer_bed(self):
        # Lying on its back, the widest, longest block the sliders allow
        # stays within a 256 mm bed with 5% to spare.
        limits = {control["key"]: control["max"] for control in CONTROLS}
        p = replace(
            STRAIGHT,
            width=limits["width"],
            side=limits["side"],
            length=limits["length"],
            screws=False,
        )
        extents = build(p).mesh.extents
        self.assertLessEqual(extents[0], BED)
        self.assertLessEqual(extents[1], BED)

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control and form. The generator may
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

    def test_designs_reopen_and_rebuild_the_same_hold(self):
        # The exported design carries the settings actually built, so
        # parsing it back and building again gives the same hold: links,
        # presets and settings files depend on it.
        rng = random.Random(78 + SEED)
        count = 60 if DEEP else 4
        cases = [
            asdict(replace(STRAIGHT, width=15, depth=60, flare=20)),
            asdict(replace(STRAIGHT, auto_seat=False, seat_depth=30)),
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
            self.assertEqual(model.parameters.seat_depth, 9)

    def test_automatic_seat_follows_the_depth(self):
        # Each screw head sits SEAT_SHARE of the block's depth off the
        # wall, and never more than SEAT_MAX.
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                depth = p.depth + (p.back if p.shape == "block" else 0)
                seat = min(SEAT_MAX, round(SEAT_SHARE * depth * 2) / 2)
                self.assertEqual({h.seat for h in build(p).holes}, {seat})

    def test_manual_seat_is_used_when_it_fits(self):
        model = build(replace(STRAIGHT, auto_seat=False, seat_depth=5))
        self.assertEqual({h.seat for h in model.holes}, {5})
        self.assertEqual(model.parameters.seat_depth, 5)
        self.assertEqual(model.adjusted, {})

    def test_edge_rounding_is_capped_to_what_fits(self):
        # Thin sides have room for less rounding: the lab is told the most
        # that fits, and the edges are built with it.
        p = replace(STRAIGHT, side=12, edge_radius=15, screws=False)
        limits = build(p).preview()["control_limits"]
        self.assertLess(limits["edge_radius"], 15)
        self.assertEqual(
            build(replace(STRAIGHT, side=50, depth=80)).preview()["control_limits"], {}
        )
        # With holes on it also leaves each side room for its screws, so
        # rounding the edges never turns them away.
        rounded = build(replace(STRAIGHT, edge_radius=15))
        self.assertEqual(len(rounded.holes), 4)
        self.assertLess(rounded.preview()["control_limits"]["edge_radius"], 6)
        self.assertEqual(rounded.adjusted, {})
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                limits = build(p).preview()["control_limits"]
                self.assertGreaterEqual(limits.get("edge_radius", 15), p.edge_radius)

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
