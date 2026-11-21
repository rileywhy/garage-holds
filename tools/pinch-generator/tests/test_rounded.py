"""The rounded pinch (rounded.py): its section, its fall toward the ends,
what it eases, and where its hardware goes. The sweeps every style shares
(closed exports, random settings, reopened designs) are in test_geometry."""

import math
import sys
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build, loft
from parameters import PRESETS, ROUNDED
from rounded import BEND_SHARE, HOLLOW_SLOPE, WAIST
from test_geometry import across, assert_recesses_enclosed, crossings

PLAIN = replace(ROUNDED, screws=False)
NAMES = [name for name, p in PRESETS.items() if p.shape == "rounded"]


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


class RoundedPinchTests(unittest.TestCase):
    def test_presets_build_as_written(self):
        self.assertGreaterEqual(len(NAMES), 5)
        for name in NAMES:
            with self.subTest(name=name):
                model = build(PRESETS[name])
                self.assertEqual(model.adjusted, {})
                self.assertTrue(model.holes)
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
        # The reason for this style: a bigger round lowers the widest point
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
                assert_recesses_enclosed(self, build(replace(ROUNDED, **change)))

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

    def test_scale_is_direct(self):
        small, large = build(PLAIN), build(replace(PLAIN, size=200))
        np.testing.assert_allclose(
            large.mesh.extents, small.mesh.extents * 2, rtol=1e-4
        )
        self.assertEqual(large.adjusted, {})


if __name__ == "__main__":
    unittest.main()
