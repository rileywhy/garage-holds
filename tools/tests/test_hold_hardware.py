"""Every lab drills the same screws (RIL-116).

Each lab's defaults, hardware controls and presets must match
tools/hold_hardware.json, so a screw that fits one lab's hold fits them all.
A lab is found by its tools/<name>-generator/parameters.py, so a new lab is
checked without being listed here.
"""

import importlib
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools import hold_hardware as hardware  # noqa: E402

LABS = sorted(path.parent.name for path in ROOT.glob("tools/*-generator/parameters.py"))
KEYS = ("shank_diameter", "head_diameter", "bolt_diameter", "bolt_head_diameter")
# Thread and head diameters of the hardware people mount holds with, and the
# least room a printed hole needs around them.
STANDARD_SCREWS = {"#10 wood screw": (4.83, 9.78), "M5 countersunk": (5.0, 10.0)}
STANDARD_BOLT = (10.0, 16.0)  # M10 socket head cap screw
PRINT_CLEARANCE = 0.5


def parse_or_none(contract, values):
    try:
        return contract.parse_parameters(values)
    except ValueError:
        return None


class DefaultHardware(unittest.TestCase):
    def test_the_default_screw_hole_and_recess_take_standard_hold_screws(self):
        for name, (thread, head) in STANDARD_SCREWS.items():
            with self.subTest(name):
                self.assertGreaterEqual(
                    hardware.SHANK_DIAMETER, thread + PRINT_CLEARANCE
                )
                self.assertGreaterEqual(hardware.HEAD_DIAMETER, head + PRINT_CLEARANCE)

    def test_the_default_bolt_hole_and_counterbore_take_an_m10_bolt(self):
        thread, head = STANDARD_BOLT
        self.assertGreaterEqual(hardware.BOLT_DIAMETER, thread + PRINT_CLEARANCE)
        self.assertGreaterEqual(hardware.BOLT_HEAD_DIAMETER, head + PRINT_CLEARANCE)

    def test_the_defaults_sit_inside_their_own_controls(self):
        for key in KEYS:
            control = hardware.CONTROLS[key]
            value = getattr(hardware, key.upper())
            self.assertLessEqual(control["min"], value, key)
            self.assertLessEqual(value, control["max"], key)
        self.assertGreaterEqual(
            hardware.HEAD_DIAMETER - hardware.SHANK_DIAMETER, hardware.HEAD_OVER_SHANK
        )


class EveryLabMatches(unittest.TestCase):
    def test_the_labs_are_found(self):
        self.assertTrue({"crimp-generator", "foot-generator"} <= set(LABS), LABS)

    def test_every_lab_defaults_to_the_shared_hardware(self):
        for lab in LABS:
            with self.subTest(lab):
                defaults = importlib.import_module(f"tools.{lab}.parameters").schema()[
                    "defaults"
                ]
                for key in KEYS:
                    self.assertEqual(
                        defaults[key], getattr(hardware, key.upper()), f"{lab} {key}"
                    )

    def test_every_lab_shows_the_shared_hardware_controls(self):
        for lab in LABS:
            with self.subTest(lab):
                controls = importlib.import_module(f"tools.{lab}.parameters").schema()[
                    "controls"
                ]
                for key in KEYS:
                    found = [item for item in controls if item["key"] == key]
                    self.assertEqual(len(found), 1, f"{lab} {key}")
                    shared = hardware.CONTROLS[key]
                    self.assertEqual(
                        {field: found[0].get(field) for field in shared}, shared
                    )

    def test_every_preset_uses_the_shared_hardware(self):
        for lab in LABS:
            presets = importlib.import_module(f"tools.{lab}.parameters").schema()[
                "presets"
            ]
            for name, preset in presets.items():
                with self.subTest(f"{lab} {name}"):
                    for key in KEYS:
                        self.assertEqual(preset[key], getattr(hardware, key.upper()))

    def test_every_lab_keeps_the_head_recess_wider_than_the_hole(self):
        gap = hardware.HEAD_OVER_SHANK
        for lab in LABS:
            with self.subTest(lab):
                contract = importlib.import_module(f"tools.{lab}.parameters")
                exact = parse_or_none(
                    contract, {"shank_diameter": 6, "head_diameter": 6 + gap}
                )
                self.assertIsNotNone(exact)
                self.assertEqual(exact.head_diameter, 6 + gap)
                # Too narrow is either refused or widened, never drilled.
                narrow = parse_or_none(
                    contract, {"shank_diameter": 6, "head_diameter": 6 + gap - 0.5}
                )
                if narrow is not None:
                    self.assertGreaterEqual(narrow.head_diameter, 6 + gap)


class CustomShapeLabMatches(unittest.TestCase):
    def test_the_custom_shape_generator_checks_the_shared_screw(self):
        geometry = importlib.import_module("tools.custom-shape-generator.geometry")
        rows = {row[0]: row[1:] for row in geometry.SETTINGS}
        for key, row in (
            ("shank_diameter", rows["shankDiameter"]),
            ("head_diameter", rows["headDiameter"]),
        ):
            control = hardware.CONTROLS[key]
            self.assertEqual(
                row, (getattr(hardware, key.upper()), control["min"], control["max"])
            )


if __name__ == "__main__":
    unittest.main()
