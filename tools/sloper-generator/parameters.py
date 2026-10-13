"""Sloper Lab's versioned settings and GUI schema. Dimensions are millimetres."""

import math
from dataclasses import asdict, dataclass, fields

MAX_WIDTH = 525
MAX_HEIGHT = 420
MAX_PROJECTION = 175


@dataclass(frozen=True)
class Parameters:
    width: float = 192.5
    height: float = 148.75
    projection: float = 78.75
    incut: float = 35
    arc_wrap: float = 0
    palm_curve: float = 25  # Legacy settings key; labelled "surface curve" in the GUI.
    slope: float = 12
    taper: float = 0
    character: float = 0
    seed: int = 21
    screws: bool = True
    screw_count: int = 3
    shank_diameter: float = 5.5
    head_diameter: float = 11
    auto_seat: bool = True
    seat_depth: float = 28.4


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
        "incut lift",
        "Grip",
        0,
        45,
        1,
        "°",
        "Raises the rounded surface as it projects from the wall. Higher is more positive, up to 45°. 0 keeps a plain dome.",
    ),
    control(
        "arc_wrap",
        "arc wrap",
        "Grip",
        0,
        60,
        1,
        "°",
        "Continues the rounded arc back toward the wall for more incut. 0 is a half dome; higher values wrap farther around and narrow the mounting face.",
    ),
    control(
        "projection",
        "depth from the wall",
        "Grip",
        12,
        MAX_PROJECTION,
        0.05,
        "mm",
        "Depth at the centre. Actual overall depth appears beside the preview.",
    ),
    control(
        "palm_curve",
        "surface curve",
        "Grip",
        0,
        100,
        1,
        "%",
        "0 is a round dome. Higher values flatten the centre while keeping rounded shoulders.",
    ),
    control(
        "slope",
        "surface slope",
        "Grip",
        -45,
        45,
        1,
        "°",
        "Shifts the dome's bulge up or down. Use incut lift for a more positive grip; this fine-tunes its curve.",
    ),
    control(
        "width",
        "width",
        "Shape",
        40,
        MAX_WIDTH,
        0.25,
        "mm",
        "Overall width across the board. Stretch it into a rail.",
    ),
    control(
        "height",
        "height",
        "Shape",
        40,
        MAX_HEIGHT,
        0.25,
        "mm",
        "Height before incut lift. Arc wrap narrows the mounting face; actual dimensions appear below.",
    ),
    control(
        "taper",
        "left / right taper",
        "Shape",
        -65,
        65,
        1,
        "%",
        "Changes the depth from one side to the other.",
    ),
    control(
        "character",
        "surface character",
        "Shape",
        0,
        1.5,
        0.05,
        "",
        "Broad, smooth undulations. Zero keeps the surface smooth; this is not print texture.",
    ),
    control(
        "screw_count",
        "number of screws",
        "Mounting",
        2,
        6,
        1,
        "",
        "Two to six holes spread around the body. Turn mounting holes off for none.",
    ),
    control(
        "shank_diameter",
        "screw hole diameter",
        "Mounting",
        1,
        12,
        0.1,
        "mm",
        "Through-hole diameter for your hardware and printer tolerance.",
    ),
    control(
        "head_diameter",
        "head recess diameter",
        "Mounting",
        3,
        25,
        0.5,
        "mm",
        "A 90° countersink joins the through hole to the head recess.",
    ),
    control(
        "seat_depth",
        "seat above the wall",
        "Mounting",
        0.5,
        30,
        0.5,
        "mm",
        "Material below the countersink. Automatic follows the depth; manual is adjusted if it cannot fit.",
    ),
]

PRESETS = {
    "rounded board sloper": Parameters(),
    "round ball": Parameters(
        width=133,
        height=133,
        projection=109.2,
        palm_curve=0,
        slope=0,
        incut=20,
        arc_wrap=40,
    ),
    "broad sloper": Parameters(
        width=253.75, height=175, projection=73.5, palm_curve=75, slope=18, incut=45
    ),
    "sloping rail": Parameters(
        width=367.5, height=113.75, projection=66.5, palm_curve=55, slope=22, incut=40
    ),
}


def parse_parameters(values: dict) -> Parameters:
    if not isinstance(values, dict):
        raise ValueError("Settings must be a JSON object.")
    if unknown := values.keys() - {f.name for f in fields(Parameters)}:
        raise ValueError(f"Unknown settings: {', '.join(sorted(unknown))}")
    parsed = asdict(Parameters()) | values
    for item in CONTROLS:
        value = parsed[item["key"]]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ValueError(f"{item['label']} must be a finite number.")
        # Typed values outside the sliders snap to the supported range.
        parsed[item["key"]] = min(item["max"], max(item["min"], value))
    for key in ("screws", "auto_seat"):
        if not isinstance(parsed[key], bool):
            raise ValueError("Mounting switches must be on or off.")
    if parsed["screw_count"] != int(parsed["screw_count"]):
        raise ValueError("Number of screws must be a whole number.")
    parsed["screw_count"] = int(parsed["screw_count"])
    seed = parsed["seed"]
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 999999:
        raise ValueError("Seed must be a whole number between 0 and 999999.")
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
