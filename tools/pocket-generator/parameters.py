"""Independent, versioned pocket controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace

from tools import hold_hardware as hardware


@dataclass(frozen=True)
class Parameters:
    # The pocket. Width and height are the opening at the face; depth runs
    # into the hold along the floor; the floor angle tilts that axis.
    opening_width: float = 42
    opening_height: float = 28
    pocket_depth: float = 28
    incut: float = 14
    lip_radius: float = 12
    through: bool = True
    # The body, before overall scale.
    size: float = 100
    width: float = 94
    height: float = 94
    depth: float = 30
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
    shank_diameter: float = hardware.SHANK_DIAMETER
    head_diameter: float = hardware.HEAD_DIAMETER
    bolt_mount: bool = False
    bolt_diameter: float = hardware.BOLT_DIAMETER
    bolt_head_diameter: float = hardware.BOLT_HEAD_DIAMETER


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
        "About 20 mm per finger: 23 for a mono, 42 for two fingers, 61 for three.",
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
        "incut",
        "Incut",
        "Grip",
        -10,
        25,
        1,
        "mm",
        "How far the inside drops below the lower lip. Positive hooks your fingers behind the lip; zero runs straight in; negative lifts the floor away.",
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
        "Stand-off from the wall at the middle, before overall scale. Open to the wall, this is how deep the pocket runs; closed, it grows to keep a 6 mm floor behind the pocket.",
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
    *hardware.SCREW_CONTROLS,
    *hardware.BOLT_CONTROLS,
]

# Switches the lab shows as checkboxes above the sliders of their tab.
TOGGLES = [
    dict(
        key="through",
        label="Open to the wall",
        group="Grip",
        help="The pocket runs back to the wall, which is its floor: the roof and floor curl onto it. Off, the pocket is closed behind with at least 6 mm of floor.",
    ),
]

BASE = Parameters()
# Open to the wall and shallow by default. Openings are about 20 mm a
# finger, and each body is sized to its opening and to screws either side
# of it (and a third centred below).
PRESETS = {
    "Two-finger pocket": BASE,
    "Mono": replace(
        BASE,
        opening_width=24,
        opening_height=24,
        pocket_depth=26,
        incut=12,
        width=78,
        height=78,
        depth=28,
    ),
    "Three-finger pocket": replace(
        BASE,
        opening_width=61,
        opening_height=30,
        pocket_depth=28,
        incut=14,
        width=124,
        height=102,
        depth=32,
        screw_count=3,
    ),
    "Deep two-finger": replace(
        BASE, pocket_depth=36, incut=10, width=104, height=104, depth=40
    ),
    "Slopey pocket": replace(
        BASE,
        opening_height=30,
        pocket_depth=20,
        incut=-6,
        lip_radius=10,
        crown=25,
        width=98,
        height=98,
        depth=26,
    ),
    "Pocket rail": replace(
        BASE,
        roundness=25,
        width=115,
        height=81,
        depth=28,
        opening_height=26,
        pocket_depth=24,
        incut=12,
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
    data["head_diameter"] = max(
        data["head_diameter"], data["shank_diameter"] + hardware.HEAD_OVER_SHANK
    )
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
