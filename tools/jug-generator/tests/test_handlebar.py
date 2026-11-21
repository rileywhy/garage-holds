"""The Handlebar shape: an oval bar on two feet, two screws in each."""

import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build
from parameters import PRESETS, Parameters, parse_parameters, schema

HANDLEBAR = PRESETS["Handlebar"]


class HandlebarTests(unittest.TestCase):
    def test_preset_selects_the_handlebar_shape(self):
        self.assertEqual(HANDLEBAR.shape, "handlebar")
        presets = schema()["presets"]
        self.assertEqual(presets["Handlebar"]["shape"], "handlebar")
        # Every other preset switches the menu back.
        for name, values in presets.items():
            if name != "Handlebar":
                self.assertEqual(values["shape"], "jug", name)

    def test_two_screws_in_each_foot(self):
        model = build(HANDLEBAR)
        self.assertEqual(len(model.screws), 4)
        left = [s for s in model.screws if s[0] < 0]
        right = [s for s in model.screws if s[0] > 0]
        self.assertEqual(len(left), 2)
        self.assertEqual(len(right), 2)
        # Side by side up the wall, far enough apart for both heads.
        self.assertGreater(abs(left[0][1] - left[1][1]), HANDLEBAR.head_diameter)
        self.assertEqual(model.bolts, [])

    def test_bar_stands_off_the_wall_with_room_for_fingers(self):
        model = build(HANDLEBAR)
        mesh = model.mesh
        self.assertTrue(mesh.is_watertight)
        self.assertAlmostEqual(mesh.bounds[0][2], 0, places=3)
        # The middle section floats clear of the wall by the finger gap and
        # is as thick as the bar.
        section = np.asarray(model.profile)
        self.assertAlmostEqual(section[:, 1].min(), HANDLEBAR.bar_clearance, delta=0.5)
        self.assertAlmostEqual(
            section[:, 1].max() - section[:, 1].min(), HANDLEBAR.bar_thickness, delta=0.5
        )
        # Nothing at the middle of the wall: the opening runs right through.
        v = mesh.vertices
        middle = v[np.abs(v[:, 0]) < 2]
        self.assertGreater(middle[:, 2].min(), HANDLEBAR.bar_clearance - 0.5)

    def test_controls_change_the_bar(self):
        base = build(HANDLEBAR).mesh.extents
        wider = build(replace(HANDLEBAR, bar_span=140)).mesh.extents
        deeper = build(replace(HANDLEBAR, bar_clearance=60)).mesh.extents
        self.assertAlmostEqual(wider[0] - base[0], 40, delta=0.5)
        self.assertAlmostEqual(deeper[2] - base[2], 15, delta=0.5)
        smaller = build(replace(HANDLEBAR, size=80)).mesh.extents
        self.assertLess(smaller[0], base[0])

    def test_extremes_export_closed_solids_with_four_screws(self):
        for values in (
            dict(bar_span=80, bar_clearance=30, bar_thickness=24, size=75),
            dict(bar_span=160, bar_clearance=70, bar_thickness=44, size=140),
            dict(bar_thickness=44, size=75, shank_diameter=8, head_diameter=20),
            dict(auto_seat=False, seat_depth=2),
        ):
            model = build(replace(HANDLEBAR, **values), "export")
            self.assertTrue(model.mesh.is_watertight, values)
            self.assertEqual(len(model.screws), 4, values)

    def test_bolt_and_jug_settings_do_not_apply(self):
        model = build(replace(HANDLEBAR, bolt_mount=True, screw_count=6))
        self.assertEqual(len(model.screws), 4)
        self.assertFalse(model.parameters.bolt_mount)
        # The jug's own settings survive a trip through the handlebar.
        self.assertEqual(model.parameters.screw_count, 6)
        self.assertEqual(model.parameters.width, HANDLEBAR.width)

    def test_screws_off_drills_nothing(self):
        model = build(replace(HANDLEBAR, screws=False))
        self.assertEqual(model.screws, [])

    def test_shape_is_validated_and_old_designs_stay_jugs(self):
        with self.assertRaises(ValueError):
            parse_parameters(dict(shape="teapot"))
        old = asdict(Parameters())
        for key in ("shape", "bar_span", "bar_clearance", "bar_thickness"):
            old.pop(key)
        self.assertEqual(parse_parameters(old).shape, "jug")

    def test_preview_reports_no_adjustment_for_the_preset(self):
        self.assertEqual(build(HANDLEBAR).preview()["adjusted"], {})


if __name__ == "__main__":
    unittest.main()
