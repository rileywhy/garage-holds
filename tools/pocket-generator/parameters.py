"""Independent, versioned pocket controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace


@dataclass(frozen=True)
class Parameters:
    # The pocket. Width and height are the opening at the face; depth runs
    # into the hold along the floor; the floor angle tilts that axis.
    opening_width: float = 45
    opening_height: float = 28
    pocket_depth: float = 40
    floor_angle: float = 10
    lip_radius: float = 12
    through: bool = False
    # The body, before overall scale.
    size: float = 100
    width: float = 92
    height: float = 92
    depth: float = 50
    roundness: float = 100
    edge_rounding: float = 10
    crown: float = 15
    taper: float = 15
    character: float = 0
    seed: int = 0
    # Mounting, shared with the other labs.
    screws: bool = True
    screw_count: int = 2
    auto_seat: bool = True
    seat_depth: float = 3
    shank_diameter: float = 4.5
    head_diameter: float = 8.5
    bolt_mount: bool = False
    bolt_diameter: float = 10.5
    bolt_head_diameter: float = 20


def control(key, label, group, low, high, step, unit, help, **extra):
    return dict(
        key=key,
        label=label,
        group=group,
        min=low,
        max=high,
        step=step,
        unit=unit,
        help=help,
        **extra,
    )


CONTROLS = [
    control(
        "opening_width",
        "Opening width",
        "Grip",
        20,
        80,
        1,
        "mm",
        "About 22 mm per finger: 25 for a mono, 45 for two fingers, 66 for three.",
    ),
    control(
        "opening_height",
        "Opening height",
        "Grip",
        18,
        45,
        1,
        "mm",
        "Room for your fingers to curl. Equal to the width gives a round hole.",
    ),
    control(
        "pocket_depth",
        "Pocket depth",
        "Grip",
        12,
        60,
        1,
        "mm",
        "Measured into the hold along the floor. One finger pad is about 20 mm, two pads about 40.",
        hidden_by="through",
    ),
    control(
        "floor_angle",
        "Floor angle",
        "Grip",
        -20,
        35,
        1,
        "°",
        "Positive tilts the floor up into the hold so fingers hook. Zero goes straight in; negative slopes away.",
    ),
    control(
        "lip_radius",
        "Lip rounding",
        "Grip",
        2,
        20,
        0.5,
        "mm",
        "Rounds the mouth where your fingers rest. A bigger radius is kinder on the skin and needs more body around the opening.",
    ),
    control(
        "size",
        "Overall scale",
        "Shape",
        50,
        200,
        1,
        "%",
        "Scales the body together. The opening and hardware stay as set.",
    ),
    control(
        "width",
        "Width",
        "Shape",
        50,
        140,
        1,
        "mm",
        "Across the wall, before overall scale. Grows when the pocket or hardware needs room.",
    ),
    control(
        "height",
        "Height",
        "Shape",
        50,
        140,
        1,
        "mm",
        "Up the wall, before overall scale. Grows when the pocket or hardware needs room.",
    ),
    control(
        "depth",
        "Depth",
        "Shape",
        20,
        70,
        1,
        "mm",
        "Stand-off from the wall at the middle, before overall scale. Grows to keep a 6 mm floor behind the pocket.",
    ),
    control(
        "roundness",
        "Roundness",
        "Shape",
        0,
        100,
        1,
        "%",
        "A circle or oval at 100. Lower values square the body off with rounded corners.",
    ),
    control(
        "edge_rounding",
        "Edge rounding",
        "Shape",
        2,
        30,
        0.5,
        "mm",
        "Radius of the rim.",
    ),
    control(
        "crown",
        "Crown",
        "Shape",
        0,
        60,
        1,
        "%",
        "Domes the front: the rim sits lower than the middle.",
    ),
    control(
        "taper",
        "Taper",
        "Shape",
        0,
        50,
        1,
        "%",
        "Slopes the sides in toward the front.",
    ),
    control(
        "character",
        "Asymmetry",
        "Shape",
        0,
        1,
        0.05,
        "",
        "Seeded wobble of the rim and crown for a less uniform body. Zero is symmetrical.",
    ),
    control(
        "screw_count",
        "Screw count",
        "Mounting",
        1,
        3,
        1,
        "",
        "Two screws sit beside the pocket. Three adds one below it; one is for small bodies.",
    ),
    control(
        "seat_depth",
        "Screw seat",
        "Mounting",
        2,
        12,
        0.5,
        "mm",
        "Material beneath the screw head. Automatically reduced to fit when necessary.",
    ),
    control(
        "shank_diameter",
        "Screw hole",
        "Mounting",
        3,
        6,
        0.1,
        "mm",
        "Match your screw hardware.",
    ),
    control(
        "head_diameter",
        "Screw head recess",
        "Mounting",
        6,
        12,
        0.1,
        "mm",
        "Countersunk screw head diameter.",
    ),
    control(
        "bolt_diameter",
        "Bolt hole",
        "Mounting",
        8,
        14,
        0.1,
        "mm",
        "Centred bolt hole; hardware dimensions do not scale.",
    ),
    control(
        "bolt_head_diameter",
        "Bolt head recess",
        "Mounting",
        16,
        30,
        0.5,
        "mm",
        "Flat-bottom counterbore, with one anti-rotation screw.",
    ),
]

# Switches the lab shows as checkboxes above the sliders of their tab.
TOGGLES = [
    dict(
        key="through",
        label="Open to the wall",
        group="Grip",
        help="The pocket runs through the back, so the wall is its floor. The body keeps 6 mm around the opening.",
    ),
]

BASE = Parameters()
PRESETS = {
    "Two-finger pocket": BASE,
    "Mono": replace(
        BASE,
        opening_width=26,
        opening_height=26,
        pocket_depth=36,
        floor_angle=15,
        width=76,
        height=76,
        depth=46,
    ),
    "Three-finger pocket": replace(
        BASE,
        opening_width=66,
        opening_height=30,
        pocket_depth=40,
        floor_angle=8,
        width=120,
        height=92,
        depth=50,
        screw_count=3,
    ),
    "Deep two-finger": replace(BASE, pocket_depth=52, floor_angle=12, depth=62),
    "Slopey pocket": replace(
        BASE,
        opening_height=30,
        pocket_depth=26,
        floor_angle=-12,
        lip_radius=13,
        crown=25,
        width=100,
        height=100,
        depth=42,
    ),
    "Pocket rail": replace(
        BASE,
        roundness=25,
        width=124,
        height=74,
        depth=42,
        opening_height=26,
        pocket_depth=30,
        floor_angle=15,
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


def parse_parameters(values):
    if not isinstance(values, dict):
        raise ValueError("Settings must be an object.")
    unknown = values.keys() - asdict(BASE).keys()
    if unknown:
        raise ValueError("Unknown settings: " + ", ".join(sorted(unknown)))
    data = asdict(BASE) | values
    for key in ("screws", "bolt_mount", "auto_seat", "through"):
        if not isinstance(data[key], bool):
            raise ValueError(f"{key} must be true or false.")
    for item in CONTROLS + [dict(key="seed", min=0, max=999999)]:
        key = item["key"]
        value = data[key]
        if not finite_number(value):
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
        generator="garage-holds-pocket",
        version=1,
        slug="pocket",
        label="Pocket Lab",
        defaults=asdict(BASE),
        presets={key: asdict(value) for key, value in PRESETS.items()},
        controls=CONTROLS,
        toggles=TOGGLES,
    )


def design_document(p):
    return dict(
        generator="garage-holds-pocket", version=1, units="mm", parameters=asdict(p)
    )
