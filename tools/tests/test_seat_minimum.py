"""No lab leaves a thin floor under a screw head.

Printed holds were cracking around their screws: an automatic seat could
come down to 2 mm of plastic (0.5 in the Crimp and Jug Labs) to make a row
fit. Every preset of every lab now stands on at least MIN_SEAT, and a
foothold, which can be too shallow for that, on at least SHALLOW_MIN_SEAT. A
lab is found by its tools/<name>-generator/parameters.py, so a new lab is
checked without being listed here. Every lab takes its floors from
seat_floors(), so the rule is tested once, there.
"""

import importlib
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.hold_mounting import (  # noqa: E402
    FOOT_SEAT_FLOOR,
    MANUAL_MIN_SEAT,
    MIN_SEAT,
    SEAT_FLOOR,
    SHALLOW_MIN_SEAT,
    seat_floors,
)

LABS = sorted(path.parent.name for path in ROOT.glob("tools/*-generator/parameters.py"))


class SeatMinimum(unittest.TestCase):
    def test_the_minimum_is_in_the_range_makers_asked_for(self):
        # "5 to 10 mm of plastic under the screw head."
        self.assertGreaterEqual(MIN_SEAT, 5)
        self.assertGreaterEqual(FOOT_SEAT_FLOOR, MIN_SEAT)
        # Small-profile holds may sit on 3 to 4 mm, never less.
        self.assertGreaterEqual(SHALLOW_MIN_SEAT, 3)
        self.assertGreaterEqual(SEAT_FLOOR, MIN_SEAT)
        self.assertLess(MANUAL_MIN_SEAT, MIN_SEAT)

    def test_a_deep_hold_comes_down_to_its_floor_then_to_the_minimum(self):
        self.assertEqual(seat_floors(12), (SEAT_FLOOR, MIN_SEAT))
        self.assertEqual(seat_floors(6.5), (6.5, MIN_SEAT))
        self.assertEqual(seat_floors(12, floor=FOOT_SEAT_FLOOR), (MIN_SEAT,))

    def test_a_shallow_hold_keeps_its_own_seat_then_comes_down_to_3_mm(self):
        # A hold whose own automatic seat is 5 mm or less cannot carry 5 mm:
        # a 6 mm crimp seats at 4 mm, which every crimp under 7 mm was
        # refused for while MIN_SEAT held for them too.
        self.assertEqual(seat_floors(MIN_SEAT), (MIN_SEAT, SHALLOW_MIN_SEAT))
        self.assertEqual(seat_floors(4.5), (4.5, SHALLOW_MIN_SEAT))
        self.assertEqual(seat_floors(SHALLOW_MIN_SEAT), (SHALLOW_MIN_SEAT,))
        self.assertEqual(seat_floors(2), (SHALLOW_MIN_SEAT,))

    def test_a_seat_set_by_hand_may_come_down_to_the_manual_minimum(self):
        self.assertEqual(seat_floors(12, auto=False), (MANUAL_MIN_SEAT,))
        self.assertEqual(seat_floors(1, auto=False), (1,))

    def test_every_preset_stands_on_at_least_the_minimum(self):
        self.assertTrue({"crimp-generator", "foot-generator"} <= set(LABS), LABS)
        for lab in LABS:
            contract = importlib.import_module(f"tools.{lab}.parameters")
            geometry = importlib.import_module(f"tools.{lab}.geometry")
            schema = contract.schema()
            for name, preset in {"defaults": schema["defaults"], **schema["presets"]}.items():
                with self.subTest(lab=lab, preset=name):
                    settings = contract.parse_parameters({**schema["defaults"], **preset})
                    model = geometry.build(settings)
                    least = SHALLOW_MIN_SEAT if lab == "foot-generator" else MIN_SEAT
                    self.assertGreaterEqual(model.parameters.seat_depth, least)


if __name__ == "__main__":
    unittest.main()
