"""Sloper Lab's versioned settings and GUI schema. Dimensions are millimetres."""

import math

# Standalone GUI entry points also need the repository's shared hardware code.
import sys
from dataclasses import asdict, dataclass, fields
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools import hold_hardware as hardware

MAX_WIDTH = 525
MAX_HEIGHT = 420
MAX_PROJECTION = 175


@dataclass(frozen=True)
class Parameters:
    width: float = 165
    height: float = 127.5
    projection: float = 67.5
    incut: float = 32.55
    arc_wrap: float = 0
    palm_curve: float = 25  # Legacy settings key; labelled "surface curve" in the GUI.
    slope: float = 12
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
    auto_seat: bool = True
    seat_depth: float = 24.3


def control(key, label, group, minimum, maximum, step, unit, help_text):
    return dict(
        key=key,
        label=label,
        group=group,
        min=minimum,
        max=maximum,
        step=step,
        unit=unit,
        help=help_text,
    )


CONTROLS = [
    control(
        "incut",
        "Incut lift",
        "Grip",
        0,
        45,
        0.05,
        "°",
        "Raises the rounded surface as it projects from the wall. Higher is more positive, up to 45°. 0 keeps a plain dome.",
    ),
    control(
        "arc_wrap",
        "Arc wrap",
        "Grip",
        0,
        60,
        1,
        "°",
        "Continues the rounded arc back toward the wall for more incut. 0 is a half dome; higher values wrap farther around and narrow the mounting face.",
    ),
    control(
        "projection",
        "Depth from the wall",
        "Grip",
        12,
        MAX_PROJECTION,
        0.05,
        "mm",
        "Depth at the centre. Actual overall depth appears beside the preview.",
    ),
    control(
        "palm_curve",
        "Surface curve",
        "Grip",
        0,
        100,
        1,
        "%",
        "0 is a round dome. Higher values flatten the centre while keeping rounded shoulders.",
    ),
    control(
        "slope",
        "Surface slope",
        "Grip",
        -45,
        45,
        1,
        "°",
        "Shifts the dome's bulge up or down. Use incut lift for a more positive grip; this fine-tunes its curve.",
    ),
    control(
        "width",
        "Width",
        "Shape",
        40,
        MAX_WIDTH,
        0.25,
        "mm",
        "Overall width across the board. Stretch it into a rail.",
    ),
    control(
        "height",
        "Height",
        "Shape",
        40,
        MAX_HEIGHT,
        0.25,
        "mm",
        "Height before incut lift. Arc wrap narrows the mounting face; actual dimensions appear below.",
    ),
    control(
        "taper",
        "Left / right taper",
        "Shape",
        -65,
        65,
        1,
        "%",
        "Changes the depth from one side to the other.",
    ),
    control(
        "character",
        "Surface character",
        "Shape",
        0,
        1.5,
        0.05,
        "",
        "Broad, smooth undulations. Zero keeps the surface smooth; this is not print texture.",
    ),
    control(
        "screw_count",
        "Number of screws",
        "Mounting",
        2,
        6,
        1,
        "",
        "Two to six holes spread around the body. Turn mounting holes off for none.",
    ),
    control("screw_spacing", "Manual screw span", "Mounting", 6, MAX_WIDTH, 0.25, "mm", "Distance between the outer screw centres."),
    *hardware.SCREW_CONTROLS,
    control(
        "seat_depth",
        "Seat above the wall",
        "Mounting",
        0.5,
        30,
        0.5,
        "mm",
        "Material below the countersink. Automatic follows the depth; manual is adjusted if it cannot fit.",
    ),
]

CONTROLS.extend(hardware.BOLT_CONTROLS)

PRESETS = {
    "Rounded board sloper": Parameters(),
    "Round ball": Parameters(
        width=120,
        height=120,
        projection=98.5,
        palm_curve=0,
        slope=0,
        incut=18.6,
        arc_wrap=40,
    ),
    "Broad sloper": Parameters(
        width=217.5, height=150, projection=63, palm_curve=75, slope=18, incut=41.85
    ),
    "Sloping rail": Parameters(
        width=315, height=97.5, projection=57, palm_curve=55, slope=22, incut=37.2
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


def parse_parameters(values: dict) -> Parameters:
    if not isinstance(values, dict):
        raise ValueError("Settings must be a JSON object.")
    if unknown := values.keys() - {f.name for f in fields(Parameters)}:
        raise ValueError(f"Unknown settings: {', '.join(sorted(unknown))}")
    parsed = asdict(Parameters()) | values
    for item in CONTROLS:
        value = parsed[item["key"]]
        if not finite_number(value):
            raise ValueError(f"{item['label']} must be a finite number.")
        # Typed values outside the sliders snap to the supported range.
        parsed[item["key"]] = min(item["max"], max(item["min"], value))
    for key in ("screws", "auto_spacing", "auto_seat", "bolt_mount"):
        if not isinstance(parsed[key], bool):
            raise ValueError("Mounting switches must be on or off.")
    if parsed["screw_count"] != int(parsed["screw_count"]):
        raise ValueError("Number of screws must be a whole number.")
    parsed["screw_count"] = int(parsed["screw_count"])
    seed = parsed["seed"]
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 999999:
        raise ValueError("Seed must be a whole number between 0 and 999999.")
    parsed["head_diameter"] = max(
        parsed["head_diameter"], parsed["shank_diameter"] + hardware.HEAD_OVER_SHANK
    )
    parsed["bolt_head_diameter"] = max(
        parsed["bolt_head_diameter"], parsed["bolt_diameter"] + 2
    )
    return Parameters(**parsed)


def design_document(p: Parameters) -> dict:
    return dict(
        generator="garage-holds-sloper", version=1, units="mm", parameters=asdict(p)
    )


def schema() -> dict:
    return dict(
        version=1,
        defaults=asdict(Parameters()),
        controls=CONTROLS,
        presets={name: asdict(p) for name, p in PRESETS.items()},
    )
