"""The screws and bolt every lab drills, defined once in hold_hardware.json.

A screw that fits one lab's hold fits all of them (RIL-116). Each lab takes
its hardware defaults and controls from here, the Custom Shape Lab's browser
controls read the same file, and tools/tests/test_hold_hardware.py checks
that every lab agrees. Hardware never scales with a hold. Millimetres."""

import json
from pathlib import Path

_FILE = json.loads(
    Path(__file__).with_name("hold_hardware.json").read_text(encoding="utf-8")
)

SHANK_DIAMETER = _FILE["defaults"]["shank_diameter"]
HEAD_DIAMETER = _FILE["defaults"]["head_diameter"]
BOLT_DIAMETER = _FILE["defaults"]["bolt_diameter"]
BOLT_HEAD_DIAMETER = _FILE["defaults"]["bolt_head_diameter"]
# The least a head recess may exceed its screw hole: a 1 mm countersink.
HEAD_OVER_SHANK = _FILE["head_over_shank"]

CONTROLS = {item["key"]: item for item in _FILE["controls"]}
SCREW_CONTROLS = [CONTROLS["shank_diameter"], CONTROLS["head_diameter"]]
BOLT_CONTROLS = [CONTROLS["bolt_diameter"], CONTROLS["bolt_head_diameter"]]
