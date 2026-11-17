"""No lab leaves a thin floor under a screw head.

Printed holds were cracking around their screws: an automatic seat could
come down to 2 mm of plastic (0.5 in the Crimp and Jug Labs) to make a row
fit. Every preset of every lab now stands on at least MIN_SEAT. A lab is
found by its tools/<name>-generator/parameters.py, so a new lab is checked
without being listed here.
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
)

LABS = sorted(path.parent.name for path in ROOT.glob("tools/*-generator/parameters.py"))


class SeatMinimum(unittest.TestCase):
    def test_the_minimum_is_in_the_range_makers_asked_for(self):
        # "5 to 10 mm of plastic under the screw head."
        self.assertGreaterEqual(MIN_SEAT, 5)
        self.assertGreaterEqual(FOOT_SEAT_FLOOR, MIN_SEAT)
        self.assertGreaterEqual(SEAT_FLOOR, MIN_SEAT)
        self.assertLess(MANUAL_MIN_SEAT, MIN_SEAT)

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
                    self.assertGreaterEqual(model.parameters.seat_depth, MIN_SEAT)


if __name__ == "__main__":
    unittest.main()
