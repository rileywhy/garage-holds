"""The shared mounting fit in tools/hold_mounting.py, on plain solids.

The generators' own suites only reach it through whole holds. Here a box and
a cone stand in for a hold, so each rule is checked where its answer can be
worked out by hand: where the room for a recess is, where the bolt and the
screws land, how far a manual seat may rise, and what drilling removes.
"""

import math
import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.hold_mounting import (  # noqa: E402
    FOOT_SEAT_FLOOR,
    Hole,
    _highest_enclosed_seat,
    _inside,
    _room,
    assert_closed,
    automatic_seat,
    closed_mesh,
    drill,
    fit_bolt_and_screw,
    lowest_seat,
    screw_layout,
)


@dataclass(frozen=True)
class Hardware:
    """The settings the fit reads, at the crimp lab's defaults."""

    bolt_diameter: float = 10.5
    bolt_head_diameter: float = 20
    shank_diameter: float = 5.5
    head_diameter: float = 11
    auto_seat: bool = True
    screw_count: int = 2


def box(width, height, depth):
    """A hold-shaped box: back on the wall plane (z = 0), centred on x and y."""
    return manifold.Manifold.cube((width, height, depth), center=True).translate(
        (0, 0, depth / 2)
    )


def cone():
    """A body that narrows away from the wall: radius 45 mm at the back, 15 mm
    at the top, 40 mm deep. The higher a recess sits, the less room it has."""
    return manifold.Manifold.cylinder(40, 45, 15, 96)


def tower():
    """Straight-sided for its first 20 mm, then narrowing like the cone, as
    a hold does toward its top. A recess keeps its room up to 20 mm."""
    return manifold.Manifold.cylinder(20, 45, 45, 96) + manifold.Manifold.cylinder(
        20, 45, 15, 96
    ).translate((0, 0, 20))


def bounds(solid):
    return np.array(solid.bounding_box()).reshape(2, 3)


def enclosed(solid, hole, seat, hardware=Hardware()):
    """Whether this hole's recesses fit inside the body at this seat."""
    room = _room(
        solid,
        hardware.bolt_diameter if hole.bolt else hardware.shank_diameter,
        hardware.bolt_head_diameter if hole.bolt else hardware.head_diameter,
        seat,
        hole.bolt,
    )
    return bool(room) and bool(_inside(np.array([[hole.x, hole.y]]), room)[0])


class InsideTests(unittest.TestCase):
    def test_a_point_is_inside_a_contour_but_not_inside_its_hole(self):
        outer = [(0, 0), (10, 0), (10, 10), (0, 10)]
        hole = [(4, 4), (6, 4), (6, 6), (4, 6)]
        points = np.array([[2, 2], [5, 5], [12, 5], [8, 9.5]])
        np.testing.assert_array_equal(
            _inside(points, [outer, hole]), [True, False, False, True]
        )
        np.testing.assert_array_equal(_inside(points, []), [False] * 4)


class RoomTests(unittest.TestCase):
    def test_the_room_is_the_body_inset_by_the_widest_margin(self):
        # A screw's head recess needs head / 2 + 1.5 = 7 mm from every side,
        # more than its shank's 2.75 + 2, so the room is the box inset by 7.
        room = _room(box(60, 40, 30), 5.5, 11, 10, False)
        points = np.array(
            [[22.5, 0], [23.5, 0], [-22.5, 0], [0, 12.5], [0, 13.5], [0, -13.5]]
        )
        np.testing.assert_array_equal(
            _inside(points, room), [True, False, True, True, False, False]
        )

    def test_a_bolt_counterbore_needs_more_room_than_a_screw(self):
        # 20 / 2 + 1.5 = 11.5 mm from every side.
        room = _room(box(60, 40, 30), 10.5, 20, 10, True)
        points = np.array([[18, 0], [19, 0], [0, 8], [0, 9]])
        np.testing.assert_array_equal(
            _inside(points, room), [True, False, True, False]
        )

    def test_there_is_no_room_for_a_recess_above_the_body(self):
        # The recess's top check sits at seat + cone + 2 = 30.75, over the top.
        self.assertEqual(_room(box(60, 40, 30), 5.5, 11, 26, False), [])


class BoltAndScrewTests(unittest.TestCase):
    def test_the_bolt_sits_on_the_centreline_and_the_screw_well_clear_of_it(self):
        solid = box(120, 80, 40)
        holes = fit_bolt_and_screw(Hardware(), solid, bounds(solid), 12)
        self.assertEqual(len(holes), 2)
        bolt, screw = holes
        self.assertTrue(bolt.bolt)
        self.assertFalse(screw.bolt)
        self.assertEqual(bolt.x, 0)
        # Head radii plus 3 mm between them, and to the right of the bolt.
        self.assertGreaterEqual(
            math.dist((bolt.x, bolt.y), (screw.x, screw.y)), (20 + 11) / 2 + 3
        )
        self.assertGreater(screw.x, bolt.x)
        self.assertEqual((bolt.shank, bolt.head), (10.5, 20))
        self.assertEqual((screw.shank, screw.head), (5.5, 11))
        self.assertEqual((bolt.seat, screw.seat), (12, 12))
        for hole in holes:
            self.assertTrue(enclosed(solid, hole, hole.seat))

    def test_the_seat_lowers_until_both_recesses_fit(self):
        solid = cone()
        bolt, screw = fit_bolt_and_screw(Hardware(), solid, bounds(solid), 35)
        self.assertLess(bolt.seat, 35)
        self.assertEqual(bolt.seat, screw.seat)
        self.assertTrue(enclosed(solid, bolt, bolt.seat))
        self.assertTrue(enclosed(solid, screw, screw.seat))

    def test_a_body_too_small_for_both_gets_no_layout(self):
        solid = box(25, 25, 10)
        self.assertEqual(fit_bolt_and_screw(Hardware(), solid, bounds(solid), 6), [])


class ManualSeatTests(unittest.TestCase):
    """A manual seat keeps the layout found at the automatic seat and rises
    toward the requested height only while both recesses stay inside."""

    def setUp(self):
        self.solid = tower()
        self.manual = Hardware(auto_seat=False)

    def fit(self, requested, **options):
        return fit_bolt_and_screw(
            self.manual,
            self.solid,
            bounds(self.solid),
            requested,
            layout_target=8,
            **options,
        )

    def test_a_high_seat_stops_at_the_last_height_both_recesses_are_enclosed(self):
        automatic = fit_bolt_and_screw(
            Hardware(), self.solid, bounds(self.solid), 8
        )
        bolt, screw = self.fit(35)
        # The same spots as the automatic layout, drilled higher.
        self.assertEqual(
            [(h.x, h.y) for h in (bolt, screw)], [(h.x, h.y) for h in automatic]
        )
        # The screw sits at the edge of its room, which holds up to 20 mm:
        # its recess's top check, 4.75 mm over the seat, must stay below that.
        self.assertEqual(bolt.seat, 15)
        self.assertEqual(bolt.seat, screw.seat)
        # Enclosed at the drilled seat, and the next step up is not.
        self.assertTrue(
            enclosed(self.solid, bolt, bolt.seat)
            and enclosed(self.solid, screw, screw.seat)
        )
        self.assertFalse(
            enclosed(self.solid, bolt, bolt.seat + 0.5)
            and enclosed(self.solid, screw, screw.seat + 0.5)
        )

    def test_a_seat_below_the_automatic_one_is_used_as_asked(self):
        self.assertEqual({h.seat for h in self.fit(5)}, {5})

    def test_a_caller_can_let_the_seat_rise_past_the_body(self):
        # The jug lab lets the seat stand above a thin arch.
        self.assertEqual({h.seat for h in self.fit(35, enclose_requested=False)}, {35})

    def test_the_highest_enclosed_seat_never_drops_below_the_fitted_one(self):
        bolt = np.array([0.0, 0.0])
        screw = np.array([40.0, 0.0])  # outside the room at every height
        self.assertEqual(
            _highest_enclosed_seat(self.manual, self.solid, bolt, screw, 30, 8), 8
        )


class ScrewLayoutTests(unittest.TestCase):
    def test_one_screw_is_centred_two_spread_and_a_third_below(self):
        solid = box(120, 80, 30)
        (one,) = screw_layout(Hardware(screw_count=1), solid, 10)
        self.assertEqual((one.x, one.y, one.seat), (0, 0, 10))

        left, right = screw_layout(Hardware(screw_count=2), solid, 10)
        # Toward the sides: the grid point nearest 65% of each half-width.
        self.assertAlmostEqual(left.x, -38.4)
        self.assertAlmostEqual(right.x, 38.4)
        self.assertEqual((left.y, right.y), (0, 0))

        *pair, below = screw_layout(Hardware(screw_count=3), solid, 10)
        self.assertEqual([(h.x, h.y) for h in pair], [(left.x, 0), (right.x, 0)])
        self.assertEqual(below.x, 0)
        self.assertLess(below.y, 0)
        for hole in (*pair, below):
            self.assertEqual((hole.shank, hole.head, hole.bolt), (5.5, 11, False))

    def test_screws_keep_a_head_and_3_mm_apart_and_lower_their_seat_to_fit(self):
        solid = cone()
        holes = screw_layout(Hardware(screw_count=3), solid, 35)
        self.assertEqual(len(holes), 3)
        self.assertLess(holes[0].seat, 35)
        for index, hole in enumerate(holes):
            self.assertTrue(enclosed(solid, hole, hole.seat))
            for other in holes[index + 1 :]:
                self.assertGreaterEqual(
                    math.dist((hole.x, hole.y), (other.x, other.y)), 11 + 3
                )

    def test_no_layout_when_not_every_screw_fits(self):
        self.assertEqual(screw_layout(Hardware(screw_count=3), box(24, 24, 10), 6), [])


class SeatRuleTests(unittest.TestCase):
    def test_the_automatic_seat_is_40_percent_of_the_depth_up_to_20_mm(self):
        self.assertEqual(automatic_seat(28), 11)
        self.assertEqual(automatic_seat(16), 6.5)
        self.assertEqual(automatic_seat(50), 20)
        self.assertEqual(automatic_seat(66), 20)

    def test_it_comes_down_to_8_mm_or_5_on_a_foothold_but_never_below_itself(self):
        self.assertEqual(lowest_seat(20), 8)
        self.assertEqual(lowest_seat(20, FOOT_SEAT_FLOOR), 5)
        self.assertEqual(lowest_seat(6.5), 6.5)

    def test_no_seat_comes_below_the_callers_floor(self):
        # On the cone a 35 mm seat lowers to fit; asked to stop above where
        # it fits, the fit finds nothing, and the caller grows the body.
        solid = cone()
        fitted = screw_layout(Hardware(screw_count=3), solid, 35)[0].seat
        self.assertEqual(
            screw_layout(Hardware(screw_count=3), solid, 35, floor=fitted)[0].seat,
            fitted,
        )
        self.assertEqual(
            screw_layout(Hardware(screw_count=3), solid, 35, floor=fitted + 0.5), []
        )
        bolt = fit_bolt_and_screw(Hardware(), solid, bounds(solid), 35)[0].seat
        self.assertEqual(
            fit_bolt_and_screw(Hardware(), solid, bounds(solid), 35, floor=bolt + 0.5),
            [],
        )


class DrillTests(unittest.TestCase):
    def test_drilling_removes_each_hole_and_leaves_a_closed_body(self):
        solid = box(60, 40, 30)
        holes = [
            Hole(0, 0, 10.5, 20, 12, True),
            Hole(18, 0, 5.5, 11, 12, False),
        ]
        drilled = drill(solid, holes, 30)
        mesh = closed_mesh(drilled, "not closed")
        self.assertTrue(mesh.is_watertight)

        # A bolt: shank to the seat, then a straight counterbore to the top.
        bolt = math.pi * (5.25**2 * 12 + 10**2 * 18)
        # A screw: shank, a 45° countersink cone, then its head bore.
        cone_height = (11 - 5.5) / 2
        countersink = math.pi * cone_height / 3 * (2.75**2 + 2.75 * 5.5 + 5.5**2)
        screw = math.pi * (2.75**2 * 12 + 5.5**2 * (30 - 12 - cone_height))
        self.assertAlmostEqual(
            (60 * 40 * 30 - mesh.volume) / (bolt + countersink + screw), 1, delta=0.005
        )
        # Both holes open onto the back of the hold.
        back = drilled.slice(0.5).area()
        self.assertAlmostEqual(
            back / (60 * 40 - math.pi * (5.25**2 + 2.75**2)), 1, delta=0.001
        )


class ClosedSolidTests(unittest.TestCase):
    def test_an_empty_solid_or_an_open_mesh_is_refused(self):
        with self.assertRaisesRegex(ValueError, "^nothing to export$"):
            closed_mesh(manifold.Manifold(), "nothing to export")
        open_box = trimesh.creation.box((10, 10, 10))
        open_box = trimesh.Trimesh(
            open_box.vertices, open_box.faces[1:], process=False
        )
        with self.assertRaisesRegex(ValueError, "^open$"):
            assert_closed(open_box, "open")
        assert_closed(trimesh.creation.box((10, 10, 10)), "closed")


if __name__ == "__main__":
    unittest.main()
