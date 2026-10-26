import math
import os
import random
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import (
    FLOOR,
    LIP_SPAN,
    MARGIN,
    body,
    build,
    fillets,
    largest,
    lip_reach,
    pocket,
    slot,
)
from parameters import BASE, CONTROLS, PRESETS, design_document, parse_parameters

from tools.hold_mounting import SEAT_FLOOR, _inside

# Push CI samples each sweep with fixed seeds. The nightly deep run
# (.github/workflows/deep-tests.yml) sets HOLD_TESTS_DEEP=1 for the full
# counts and HOLD_TESTS_SEED for fresh seeds, printed in its log. Many
# random settings are refused, so a sweep only asserts more than a quarter
# build: about half do, and a tighter floor fails on unlucky fresh seeds.
DEEP = os.environ.get("HOLD_TESTS_DEEP") == "1"
SEED = int(os.environ.get("HOLD_TESTS_SEED", "0"))


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


def span_at(section, z):
    """The lowest and highest y where a closed (z, y) outline crosses z."""
    after = np.roll(section, -1, axis=0)
    a, b = section, after
    crossing = (a[:, 0] - z) * (b[:, 0] - z) <= 0
    a, b = a[crossing], b[crossing]
    run = np.where(b[:, 0] == a[:, 0], 1.0, b[:, 0] - a[:, 0])
    y = a[:, 1] + (z - a[:, 0]) / run * (b[:, 1] - a[:, 1])
    return y.min(), y.max()


def creases(model, quality):
    """The bends, in degrees, between neighbouring faces in and around the
    pocket, wall plane left out: where one passes the lab's 30 degree crease
    angle the viewer shades a hard line, and where many sit just under it
    a faint seam shows anyway."""
    mesh = model.mesh
    _, cut, _, _, _ = pocket(model.parameters, quality)
    ends = mesh.vertices[mesh.face_adjacency_edges]
    near = cut.project().offset(1.0, manifold.JoinType.Round, 2.0, 16)
    around = _inside(ends.mean(axis=1)[:, :2], near.to_polygons())
    off_wall = ends[:, :, 2].max(axis=1) > 0.05
    return np.degrees(mesh.face_adjacency_angles[around & off_wall])


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

    def test_presets_seat_their_screws_at_least_8_mm_off_the_wall(self):
        # The automatic seat aims for 40% of the depth and comes down no
        # lower than 8 mm before the body grows (RIL-136); every preset is
        # sized so it never has to.
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                self.assertGreaterEqual(min(h.seat for h in build(p).holes), SEAT_FLOOR)

    def test_closed_pockets_keep_a_floor(self):
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                closed = build(replace(p, through=False))
                self.assertGreaterEqual(closed.floor, FLOOR - 0.1)
        # A pocket deeper than the body makes the body deeper, and says so.
        deep = build(
            replace(
                PRESETS["Two-finger pocket"], through=False, pocket_depth=50, depth=20
            )
        )
        self.assertGreaterEqual(deep.floor, FLOOR - 0.1)
        self.assertIn("depth", deep.adjusted)
        self.assertGreater(deep.parameters.depth, 20)
        # Past the depth slider's maximum the pocket itself gives instead.
        small = build(
            replace(
                PRESETS["Two-finger pocket"],
                through=False,
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
        closed = build(
            replace(PRESETS["Two-finger pocket"], screws=False, through=False)
        )
        opened = build(replace(PRESETS["Two-finger pocket"], screws=False))
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
        # Push runs try each preset as it is and each hardware variant on the
        # default preset; the deep run tries every variant on every preset.
        def hardware(p):
            return [
                replace(p, through=not p.through),
                replace(p, bolt_mount=True),
                replace(p, screw_count=3),
                replace(p, through=not p.through, bolt_mount=True),
            ]

        variants = list(PRESETS.values())
        for p in PRESETS.values() if DEEP else [PRESETS["Two-finger pocket"]]:
            variants += hardware(p)
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
            p = replace(PRESETS[name], through=False)
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
            (replace(PRESETS["Two-finger pocket"], through=False), 35),
            (PRESETS["Three-finger pocket"], 35),
            (replace(PRESETS["Slopey pocket"], incut=-10), 35),
            (replace(PRESETS["Two-finger pocket"], incut=20), 35),
            (replace(PRESETS["Mono"], through=False, incut=20, lip_radius=14), 45),
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
                # Simplified only to 0.05 mm: coarser, a small lower lip's arc
                # would read as a few sharp chords.
                for turned, offset, axes, half in planes:
                    for polygon in turned.slice(offset).simplify(0.05).to_polygons():
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

    def test_default_opens_to_the_wall_two_pads_deep(self):
        # The default pocket runs all the way back: the wall is its back, so
        # the back face is a ring and nothing is left behind the pocket.
        self.assertTrue(BASE.through)
        model = build(BASE)
        self.assertEqual(model.adjusted, {})
        self.assertEqual(model.floor, 0)
        self.assertEqual(contours_at(model.mesh, 0.5), 2 + len(model.holes))
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                self.assertTrue(p.through)
        # Open, the pocket is as deep as the face over the mouth stands off
        # the wall. The first open default gave about 1.3 finger pads (20 mm
        # each) there, too shallow to use; the standard pockets give about
        # 2.3, while the deep and slopey presets go further and less far.
        standard = ("Two-finger pocket", "Mono", "Three-finger pocket", "Pocket rail")
        for name in standard:
            with self.subTest(name=name):
                p = PRESETS[name]
                v = build(p).mesh.vertices
                near = np.abs(v[:, 1]) < p.opening_height / 2 + 6
                over = v[(np.abs(v[:, 0]) < 3) & near]
                self.assertAlmostEqual(over[:, 2].max() / 20, 2.3, delta=0.1)
        # Closed, the pocket depth is measured along the floor itself.
        self.assertEqual(BASE.pocket_depth, 46)

    def test_open_section_is_the_drawn_c(self):
        # Riley's second drawing, the open default: the roof runs level from
        # the upper lip back to the wall and curls down onto it; the floor
        # drops from the lower lip to the incut, runs level back to the wall
        # and curls up onto it; between the two curls the wall itself is the
        # pocket's back. Rounded everywhere inside, and where the curls meet
        # the wall they meet it at a real angle, not a feathered edge.
        for name in ("Two-finger pocket", "Three-finger pocket", "Mono"):
            p = PRESETS[name]
            with self.subTest(name=name):
                depth = p.depth * p.size / 100
                h, incut = p.opening_height, p.incut
                cut = slot(p, depth, "export")
                section = largest(cut.rotate((0, 90, 0)).slice(0))
                z = section[:, 0]
                body = section[(z > 0) & (z < depth - 0.3)]
                at_face = largest(cut.slice(depth - 0.05))
                self.assertAlmostEqual(at_face[:, 1].min(), -h / 2, delta=0.5)
                self.assertAlmostEqual(at_face[:, 1].max(), h / 2, delta=0.5)
                # A level roof at the upper lip, from the lip back to the curl.
                for at in (depth / 2, depth / 3):
                    self.assertAlmostEqual(span_at(section, at)[1], h / 2, delta=0.5)
                self.assertLessEqual(body[:, 1].max(), h / 2 + 0.5)
                # The floor sits the incut below the lower lip, runs level at
                # the back, and only goes down on the way in to it.
                bottom = -h / 2 - incut
                self.assertAlmostEqual(body[:, 1].min(), bottom, delta=0.5)
                level = body[body[:, 1] < bottom + 0.5]
                self.assertGreater(np.ptp(level[:, 0]), 3)
                front = body[(body[:, 1] < -incut / 2) & (body[:, 0] > depth / 2)]
                order = np.argsort(-front[:, 0])
                self.assertTrue(np.all(np.diff(front[order, 1]) <= 0.3))
                # The wall shows between the curls for at least a third of
                # the chamber's height.
                lo, hi = np.array(cut.slice(0.0).bounds()).reshape(2, 2)
                self.assertGreater(hi[1] - lo[1], (h + incut) / 3)
                self.assertLess(hi[1] - lo[1], h + incut - 4)
                # Rounded: no bend over 35 degrees between the wall and face.
                turning = self.turning_angles(section)
                self.assertLess(turning[(z > 0.3) & (z < depth - 1.0)].max(), 35)
                # Where the curls cross the wall plane they rise off it at
                # 20 degrees or more: a real edge at the wall.
                after = np.roll(section, -1, axis=0)
                step = (after - section)[(section[:, 0] < 0) != (after[:, 0] < 0)]
                self.assertEqual(len(step), 2)
                rise = np.degrees(np.arctan2(np.abs(step[:, 0]), np.abs(step[:, 1])))
                self.assertGreaterEqual(rise.min(), 20)

    def test_lower_lip_stays_round(self):
        # The lower lip is where the fingers rest. A shallow open pocket
        # still ramps its floor down over most of the body's depth, so an
        # incut lower lip keeps a real radius: the old, deeper closed
        # default's was about 6 mm, and none falls far below that.
        for name, p in PRESETS.items():
            with self.subTest(name=name):
                p = build(p).parameters
                solid, s = body(p, "preview")
                cut = slot(p, s["depth"], "preview")
                mouth, (radii, *_) = fillets(p, solid, cut, s["depth"])
                lower = mouth[:, 1] < -p.opening_height / 2 + 1
                self.assertGreaterEqual(radii[lower].min(), 5)

    def test_openings_are_about_twenty_mm_per_finger(self):
        # Three fingers take 61 mm, not 66; the others narrow in proportion,
        # and the mono stays round.
        ratio = 61 / 66
        self.assertEqual(PRESETS["Three-finger pocket"].opening_width, 61)
        self.assertEqual(
            PRESETS["Two-finger pocket"].opening_width, round(45 * ratio)
        )
        mono = PRESETS["Mono"]
        self.assertEqual(mono.opening_width, round(26 * ratio))
        self.assertEqual(mono.opening_height, mono.opening_width)
        help = next(c["help"] for c in CONTROLS if c["key"] == "opening_width")
        for size in (round(25 * ratio), round(45 * ratio), 61):
            self.assertIn(f"{size} ", help)
        self.assertNotIn("66", help)

    def test_wall_opening_reads_round(self):
        # The hole through to the wall was a rounded square; its corners are
        # eased a little rounder, short of an oval: it fills less of its
        # bounding box than it did (0.93 for two fingers, 0.95 for three),
        # and still more than a circle's 0.79.
        for name, most in (("Two-finger pocket", 0.9), ("Three-finger pocket", 0.93)):
            with self.subTest(name=name):
                p = build(PRESETS[name]).parameters
                hole = slot(p, p.depth * p.size / 100, "export").slice(0.0)
                lo, hi = np.array(hole.bounds()).reshape(2, 2)
                fill = hole.area() / np.prod(hi - lo)
                self.assertLess(fill, most)
                self.assertGreater(fill, 0.84)

    def test_body_has_no_facet_creases(self):
        # The body's rounded rim and crown are sampled alike all round, so
        # the preview has no faceted creases or stripes on it: no two faces
        # bend more than 15 degrees, on a round, a squarish or a wobbly body.
        for p in (
            BASE,
            PRESETS["Pocket rail"],
            replace(BASE, character=0.8, seed=7, crown=35, taper=30),
        ):
            with self.subTest(roundness=p.roundness, character=p.character):
                solid, _ = body(build(replace(p, screws=False)).parameters, "preview")
                mesh = solid.to_mesh()
                faces = trimesh.Trimesh(
                    mesh.vert_properties[:, :3], mesh.tri_verts, process=True
                )
                ends = faces.vertices[faces.face_adjacency_edges]
                off_wall = ends[:, :, 2].min(axis=1) > 0.05
                bends = np.degrees(faces.face_adjacency_angles[off_wall])
                self.assertLess(bends.max(), 15)

    def test_cavity_outline_turns_finely(self):
        # In preview the cavity's outline turns no more than about 3 degrees
        # from vertex to vertex, at the mouth and inside alike, so the hull
        # joins the two point for point: a mouth sampled more coarsely than
        # the chamber fans out in long triangles, shaded as stripes.
        for p in (BASE, PRESETS["Three-finger pocket"]):
            with self.subTest(width=p.opening_width):
                b = build(p).parameters
                depth = b.depth * b.size / 100
                cut = slot(b, depth, "preview")
                for z in (depth - 0.05, depth / 2, depth / 4):
                    outline = largest(cut.slice(z))
                    turning = self.turning_angles(outline)
                    self.assertLess(turning.max(), 3.5, f"at z={z:.1f}")

    def test_pocket_has_no_seams(self):
        # The lab shades a bend over 30 degrees as a hard line, so nowhere
        # in or around the pocket may two faces meet that sharply: not where
        # the lip leaves the face, not where it joins the cavity wall, not
        # inside the chamber, and not at a needle or speck left by the
        # booleans, whose normal is noise.
        cases = [
            (BASE, "preview"),
            (BASE, "export"),
            (PRESETS["Three-finger pocket"], "preview"),
            (PRESETS["Mono"], "preview"),
            (PRESETS["Slopey pocket"], "preview"),
            (replace(BASE, through=False), "preview"),
            (replace(BASE, through=False), "export"),
        ]
        for p, quality in cases:
            with self.subTest(
                through=p.through, width=p.opening_width, quality=quality
            ):
                model = build(replace(p, screws=False), quality)
                bends = creases(model, quality)
                self.assertGreater(len(bends), 500)
                self.assertLess(bends.max(), 30, f"{np.sum(bends >= 30)} hard lines")

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
        p = replace(PRESETS["Two-finger pocket"], screws=False, through=False)
        small, large = build(p), build(replace(p, size=200))
        np.testing.assert_allclose(
            large.mesh.extents[:2], small.mesh.extents[:2] * 2, rtol=1e-4
        )
        # The same pocket in a body twice as deep leaves far more floor.
        self.assertGreater(large.floor, small.floor + 25)

    def test_random_settings_export_closed_solids(self):
        # A seeded sweep across every control and switch. The fitter may say
        # hardware or the opening does not fit, in words; anything else must
        # export as one closed body.
        rng = random.Random(2026 + SEED)
        count = 40 if DEEP else 3
        exported = 0
        for _ in range(count):
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
        self.assertGreater(exported, count // 4)

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
                    through=False,
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
        rng = random.Random(78 + SEED)
        count = 60 if DEEP else 3
        cases = [
            dict(
                opening_width=80, opening_height=45, width=50, height=50, screw_count=3
            )
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
        self.assertGreater(rebuilt, count // 4)

    def test_manual_seat_survives_turning_screws_off(self):
        for p in PRESETS.values():
            for quality in ("preview", "export"):
                model = build(
                    replace(p, screws=False, auto_seat=False, seat_depth=9), quality
                )
                self.assertTrue(model.mesh.is_watertight)
                self.assertEqual(model.holes, [])

    def test_screws_sit_in_mirror_image(self):
        # A symmetrical hold gets symmetrical hardware: the pair mirror each
        # other either side of the pocket, and a third sits on the middle
        # line, never crowded in beside one of the pair (Riley's screenshot:
        # the three-finger preset had it 11 mm from its neighbour).
        cases = list(PRESETS.items()) + [
            ("default, three screws", replace(BASE, screw_count=3)),
            ("closed, three screws", replace(BASE, through=False, screw_count=3)),
        ]
        for name, p in cases:
            with self.subTest(name=name):
                model = build(p)
                self.assertEqual(len(model.holes), p.screw_count)
                left, right = sorted(model.holes[:2], key=lambda h: h.x)
                self.assertAlmostEqual(left.x, -right.x, delta=0.5)
                self.assertAlmostEqual(left.y, right.y, delta=0.5)
                self.assertGreater(right.x - left.x, model.parameters.opening_width)
                if p.screw_count == 3:
                    self.assertLess(abs(model.holes[2].x), 0.5)
                if name in PRESETS:
                    self.assertEqual(model.adjusted, {})

    def test_manual_seat_is_used_when_it_fits(self):
        model = build(
            replace(PRESETS["Two-finger pocket"], auto_seat=False, seat_depth=3)
        )
        self.assertEqual(model.holes[0].seat, 3)
        self.assertEqual(model.parameters.seat_depth, 3)

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
