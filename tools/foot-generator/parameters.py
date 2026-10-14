"""Independent, versioned foothold controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace


@dataclass(frozen=True)
class Parameters:
    shape: str = "edge"
    auto_screw_count: bool = False
    size: float = 100
    width: float = 48
    body_height: float = 36
    edge_depth: float = 18
    incut: float = 30
    lip_radius: float = 5
    end_rounding: float = 90
    taper: float = 15
    crown: float = 0
    character: float = 0
    seed: int = 0
    screws: bool = True
    screw_count: int = 2
    auto_seat: bool = True
    seat_depth: float = 3
    shank_diameter: float = 4.5
    head_diameter: float = 8.5
    bolt_mount: bool = False
    bolt_diameter: float = 10.5
    bolt_head_diameter: float = 20


def control(key, label, group, low, high, step, unit, help):
    return dict(
        key=key,
        label=label,
        group=group,
        min=low,
        max=high,
        step=step,
        unit=unit,
        help=help,
    )


CONTROLS = [
    control(
        "size",
        "overall scale",
        "Grip",
        50,
        250,
        1,
        "%",
        "Scales every body dimension together. Hardware stays the same size; tiny bodies grow only if needed to fit it.",
    ),
    control(
        "incut",
        "bite / slope",
        "Grip",
        -50,
        60,
        1,
        "°",
        "Positive angles give your toe an edge to pull into. Zero is neutral; negative angles slope away. Relative to the wall, not a grade.",
    ),
    control(
        "edge_depth",
        "toe depth",
        "Grip",
        6,
        45,
        0.5,
        "mm",
        "How far the toe surface projects from the wall before rounding.",
    ),
    control(
        "lip_radius",
        "edge rounding",
        "Grip",
        0.5,
        14,
        0.5,
        "mm",
        "A small radius gives a precise edge. More rounding makes it softer and less defined.",
    ),
    control("width", "width", "Shape", 22, 110, 1, "mm", "Width before overall scale."),
    control(
        "body_height",
        "body height",
        "Shape",
        20,
        240,
        1,
        "mm",
        "Height along the wall before scale. Grows when hardware needs room.",
    ),
    control(
        "end_rounding",
        "rounded ends",
        "Shape",
        0,
        100,
        1,
        "%",
        "Square-ended edge through to an oval button.",
    ),
    control(
        "taper",
        "toe surface taper",
        "Shape",
        -40,
        60,
        1,
        "%",
        "Positive narrows the top; negative makes a wider toe platform.",
    ),
    control(
        "crown",
        "surface crown",
        "Shape",
        0,
        70,
        1,
        "%",
        "Rounds the toe surface across its width for a button or smear.",
    ),
    control(
        "character",
        "asymmetry",
        "Shape",
        0,
        1,
        0.05,
        "",
        "Seeded sideways lean for less uniform feet. Zero is symmetrical.",
    ),
    control(
        "screw_count",
        "screw count",
        "Mounting",
        1,
        3,
        1,
        "",
        "One screw is available for small chips. Two or three spread across larger feet.",
    ),
    control(
        "seat_depth",
        "screw seat",
        "Mounting",
        2,
        12,
        0.5,
        "mm",
        "Material beneath the screw head. Automatically reduced to fit when necessary.",
    ),
    control(
        "shank_diameter",
        "screw hole",
        "Mounting",
        3,
        6,
        0.1,
        "mm",
        "Match your screw hardware.",
    ),
    control(
        "head_diameter",
        "screw head recess",
        "Mounting",
        6,
        12,
        0.1,
        "mm",
        "Countersunk screw head diameter.",
    ),
    control(
        "bolt_diameter",
        "bolt hole",
        "Mounting",
        8,
        14,
        0.1,
        "mm",
        "Centred bolt hole; hardware dimensions do not scale.",
    ),
    control(
        "bolt_head_diameter",
        "bolt head recess",
        "Mounting",
        16,
        30,
        0.5,
        "mm",
        "Flat-bottom counterbore, with one anti-rotation screw.",
    ),
]
BASE = Parameters()
PRESETS = {
    "board edge": BASE,
    "toe-in edge": replace(BASE, incut=55, edge_depth=24, crown=8, taper=25),
    "neutral chip": replace(
        BASE,
        width=38,
        body_height=28,
        edge_depth=12,
        incut=0,
        lip_radius=3.5,
        screw_count=1,
        end_rounding=85,
    ),
    "slopey wedge": replace(
        BASE, incut=-30, edge_depth=20, lip_radius=6, end_rounding=85, taper=40
    ),
    "ball": replace(
        BASE,
        shape="ball",
        width=36,
        body_height=36,
        edge_depth=22,
        incut=0,
        lip_radius=5,
        screw_count=1,
        auto_screw_count=True,
    ),
    "rounded dish": replace(
        BASE,
        shape="dish",
        width=48,
        body_height=48,
        edge_depth=14,
        incut=0,
        screw_count=1,
        auto_screw_count=True,
    ),
    "rock tooth": replace(
        BASE,
        shape="rock",
        width=50,
        body_height=40,
        edge_depth=24,
        incut=25,
        lip_radius=1.5,
        character=0.65,
        screw_count=2,
    ),
}


def parse_parameters(values):
    if not isinstance(values, dict):
        raise ValueError("Settings must be an object.")
    unknown = values.keys() - asdict(BASE).keys()
    if unknown:
        raise ValueError("Unknown settings: " + ", ".join(sorted(unknown)))
    data = asdict(BASE) | values
    if data["shape"] not in ("edge", "ball", "rock", "dish"):
        raise ValueError("Unknown foothold shape.")
    for key in ("screws", "bolt_mount", "auto_seat", "auto_screw_count"):
        if not isinstance(data[key], bool):
            raise ValueError(f"{key} must be true or false.")
    for item in CONTROLS + [dict(key="seed", min=0, max=999999)]:
        key = item["key"]
        value = data[key]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ValueError(f"{key} must be a finite number.")
        data[key] = max(item["min"], min(item["max"], value))
    for key in ("seed", "screw_count"):
        if int(data[key]) != data[key]:
            raise ValueError(f"{key} must be a whole number.")
        data[key] = int(data[key])
    data["head_diameter"] = max(data["head_diameter"], data["shank_diameter"] + 2)
    return Parameters(**data)


def schema():
    return dict(
        generator="garage-holds-foot",
        version=2,
        slug="foot",
        label="Foot Lab",
        defaults=asdict(BASE),
        presets={key: asdict(value) for key, value in PRESETS.items()},
        autoScrewCount=True,
        controls=[
            dict(
                c,
                shapes=(
                    ["edge"]
                    if c["key"] in ("end_rounding", "taper", "crown")
                    else ["edge", "rock"]
                    if c["key"] in ("incut", "lip_radius", "character", "body_height")
                    else ["edge", "ball", "rock", "dish"]
                ),
            )
            for c in CONTROLS
        ],
    )


def design_document(p):
    return dict(
        generator="garage-holds-foot", version=2, units="mm", parameters=asdict(p)
    )
