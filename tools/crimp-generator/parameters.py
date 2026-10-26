"""The generator's shared parameter contract, in millimetres and degrees."""

import math

# Standalone GUI entry points also need the repository's shared hardware code.
import sys
from dataclasses import asdict, dataclass, fields, replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools import hold_hardware as hardware
from tools.hold_mounting import automatic_seat


@dataclass(frozen=True)
class Parameters:
    width: float = 100
    edge_depth: float = 22
    incut: float = 12
    lip_radius: float = 5
    body_height: float = 48
    body_rounding: float = 8
    end_rounding: float = 12
    bow: float = 0
    taper: float = 0
    character: float = 0
    seed: int = 21
    screws: bool = True
    bolt_mount: bool = False
    bolt_diameter: float = hardware.BOLT_DIAMETER
    bolt_head_diameter: float = hardware.BOLT_HEAD_DIAMETER
    screw_count: int = 3
    auto_spacing: bool = True
    screw_spacing: float = 60
    shank_diameter: float = hardware.SHANK_DIAMETER
    head_diameter: float = hardware.HEAD_DIAMETER
    # The seat follows the edge depth (see seat_height) unless auto_seat is
    # off, in which case seat_depth is used as given.
    auto_seat: bool = True
    seat_depth: float = 10


def seat_height(p: "Parameters") -> float:
    """Where the countersink starts, above the wall. An automatic seat
    follows the body's projection from the wall, as every lab's does
    (tools/hold_mounting.py): 11 mm on the default 28 mm crimp."""
    if not p.auto_seat:
        return p.seat_depth
    return automatic_seat(p.edge_depth + 6)


# The GUI reads this schema instead of keeping its own copy of limits/defaults.
CONTROLS = [
    dict(
        key="edge_depth",
        label="Edge depth",
        group="Grip",
        min=2,
        max=60,
        step=0.5,
        unit="mm",
        help="Nominal reach from the inner shelf to the lip, before rounding. Measured out from the wall.",
    ),
    dict(
        key="incut",
        label="Incut / slope",
        group="Grip",
        min=-60,
        max=60,
        step=1,
        unit="°",
        help="Positive makes the outer lip higher than the inner shelf; negative makes a sloping edge. This is geometry, not a difficulty grade.",
    ),
    dict(
        key="lip_radius",
        label="Lip rounding",
        group="Grip",
        min=0,
        max=20,
        step=0.25,
        unit="mm",
        help="Radius of the front contact edge. More rounding uses some of the nominal edge depth.",
    ),
    dict(
        key="width",
        label="Overall width",
        group="Shape",
        min=20,
        max=300,
        step=1,
        unit="mm",
        help="Full width including rounded ends. The middle offers the most consistent grip.",
    ),
    dict(
        key="body_height",
        label="Body height",
        group="Shape",
        min=10,
        max=150,
        step=1,
        unit="mm",
        help="Height from the lower body to the nominal outer lip. Sloping edges can extend higher at the wall; bow also changes the overall height.",
    ),
    dict(
        key="body_rounding",
        label="Body rounding",
        group="Shape",
        min=0,
        max=30,
        step=0.5,
        unit="mm",
        help="Softens the lower front of the body, independently of the gripping lip.",
    ),
    dict(
        key="end_rounding",
        label="Rounded ends",
        group="Shape",
        min=0.5,
        max=60,
        step=0.5,
        unit="mm",
        help="Length of each rounded end. Larger ends leave less of the straight middle.",
    ),
    dict(
        key="bow",
        label="Curve across the hold",
        group="Shape",
        min=-60,
        max=60,
        step=0.5,
        unit="mm",
        help="Bends the outline and lip across the width. Zero gives a straight board edge.",
    ),
    dict(
        key="taper",
        label="Left / right taper",
        group="Shape",
        min=-80,
        max=80,
        step=1,
        unit="%",
        help="Makes one end deeper and the other shallower. The centre retains the chosen depth.",
    ),
    dict(
        key="character",
        label="Body character",
        group="Shape",
        min=0,
        max=3,
        step=0.05,
        unit="",
        help="Adds broad, seeded folds to the front body. Leaves the middle gripping surface unchanged; this is not print texture.",
    ),
    dict(
        key="screw_count",
        label="Number of screw holes",
        group="Mounting",
        min=2,
        max=6,
        step=1,
        unit="",
        help="Evenly distributes two to six holes across the hold. Turn mounting holes off for none.",
    ),
    dict(
        key="screw_spacing",
        label="Manual screw span",
        group="Mounting",
        min=6,
        max=260,
        step=1,
        unit="mm",
        help="Distance between the two outermost screw centres. Used only when automatic spacing is off.",
    ),
    *hardware.SCREW_CONTROLS,
    dict(
        key="seat_depth",
        label="Seat above the wall",
        group="Mounting",
        min=0.5,
        max=30,
        step=0.5,
        unit="mm",
        help="Distance from the flat back to the start of the countersink. More leaves a thicker floor under the screw head. Checked for geometric fit, not load capacity.",
    ),
]

CONTROLS.extend(hardware.BOLT_CONTROLS)

# Jugs may be taller, deeper, and wide enough for two hands.
JUG_MAXIMA = {
    "edge_depth": 140,
    "body_height": 300,
    "width": 400,
    "screw_spacing": 360,
    "seat_depth": 140,
}

PRESETS = {
    "Rounded board crimp": Parameters(),
    "Small flat edge": Parameters(edge_depth=10, incut=0, lip_radius=2, body_height=42),
    "Curved incut": Parameters(
        edge_depth=24,
        incut=22,
        lip_radius=3.5,
        bow=7,
        taper=15,
        character=0.35,
    ),
    "Sloping rail": Parameters(
        width=125,
        edge_depth=26,
        incut=-18,
        lip_radius=4,
        body_height=55,
        screw_spacing=72,
        end_rounding=18,
    ),
}


def finite_number(value) -> bool:
    """An int or float that fits a finite float; a bool is not a number,
    and an integer too large for a float would make isfinite raise."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def parse_parameters(values: dict, *, jug: bool = False) -> Parameters:
    if not isinstance(values, dict):
        raise ValueError("Settings must be a JSON object.")
    allowed = {field.name for field in fields(Parameters)}
    unknown = values.keys() - allowed
    if unknown:
        raise ValueError(f"Unknown settings: {', '.join(sorted(unknown))}")
    parsed = asdict(Parameters()) | values
    for control in CONTROLS:
        key, value = control["key"], parsed[control["key"]]
        if not finite_number(value):
            raise ValueError(f"{control['label']} must be a finite number.")
        maximum = JUG_MAXIMA.get(key, control["max"]) if jug else control["max"]
        if not control["min"] <= value <= maximum:
            raise ValueError(
                f"{control['label']} must be between {control['min']} and {maximum} {control['unit']}."
            )
    for key in ("screws", "auto_spacing", "auto_seat", "bolt_mount"):
        if not isinstance(parsed[key], bool):
            raise ValueError("Screw holes and automatic spacing must be on or off.")
    if parsed["screw_count"] != int(parsed["screw_count"]):
        raise ValueError("Number of screw holes must be a whole number.")
    parsed["screw_count"] = int(parsed["screw_count"])
    seed = parsed["seed"]
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 999999:
        raise ValueError("Seed must be a whole number between 0 and 999999.")
    p = Parameters(**parsed)
    if p.bolt_head_diameter < p.bolt_diameter + 2:
        raise ValueError("The bolt recess must be at least 2 mm wider than its hole.")
    if p.end_rounding >= p.width / 2:
        raise ValueError(
            "Reduce rounded ends or increase width: each end must use less than half the width."
        )
    if p.screws:
        if p.head_diameter < p.shank_diameter + hardware.HEAD_OVER_SHANK:
            raise ValueError(
                f"The head recess must be at least {hardware.HEAD_OVER_SHANK:g} mm wider than the screw hole."
            )
        if (
            not p.bolt_mount
            and not p.auto_spacing
            and p.screw_spacing + p.head_diameter + 4 > p.width
        ):
            if jug:
                p = replace(
                    p,
                    screw_spacing=max(0.0, p.width - p.head_diameter - 4),
                )
            else:
                raise ValueError(
                    "Move the screws closer together, reduce end rounding, or increase width."
                )
        if (
            not p.auto_spacing
            and not p.bolt_mount
            and p.screw_spacing / (p.screw_count - 1) < p.head_diameter + 1.5
        ):
            raise ValueError(
                "Move the screws further apart so the head recesses do not overlap."
            )
    return p


def schema() -> dict:
    return dict(
        version=1,
        defaults=asdict(Parameters()),
        controls=CONTROLS,
        presets={name: asdict(value) for name, value in PRESETS.items()},
    )


def design_document(p: Parameters) -> dict:
    return dict(
        generator="garage-holds-crimp", version=1, units="mm", parameters=asdict(p)
    )
