"""Independent, versioned round pinch controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace

from tools import hold_hardware as hardware


@dataclass(frozen=True)
class Parameters:
    # The grip: the span across the widest point, how far the top stands
    # off the wall, the round each side rolls over, how far each side cuts
    # back under it, and how much lower the thumb side stands.
    width: float = 66
    depth: float = 48
    rounding: float = 16
    thumb_incut: float = 9
    finger_incut: float = 9
    offset: float = 0
    # The body, before overall scale.
    top_rise: float = 7
    size: float = 100
    height: float = 110
    end_rounding: float = 60
    arch: float = 70
    hourglass: float = 0
    taper: float = 0
    bend: float = 0
    # Mounting, shared with the other labs. A wider pinch levers harder, so
    # by default it takes more screws as it grows (see SCREW_SPAN).
    auto_screw_count: bool = True
    screws: bool = True
    screw_count: int = 2
    auto_seat: bool = True
    seat_depth: float = 16
    shank_diameter: float = hardware.SHANK_DIAMETER
    head_diameter: float = hardware.HEAD_DIAMETER
    bolt_mount: bool = False
    bolt_diameter: float = hardware.BOLT_DIAMETER
    bolt_head_diameter: float = hardware.BOLT_HEAD_DIAMETER


def control(key, label, group, low, high, step, unit, help):
    return dict(
        key=key, label=label, group=group, min=low, max=high, step=step, unit=unit, help=help
    )


CONTROLS = [
    control(
        "width",
        "Span",
        "Grip",
        25,
        110,
        1,
        "mm",
        "Thumb to fingers, across the widest point, before overall scale. Most hands pinch 40–60 mm comfortably; wider is harder.",
    ),
    control(
        "depth",
        "Depth",
        "Grip",
        20,
        70,
        1,
        "mm",
        "How far the top stands off the wall, before overall scale.",
    ),
    control(
        "rounding",
        "Rounding",
        "Grip",
        6,
        30,
        0.5,
        "mm",
        "The round each side rolls over, from its widest point onto the top: what your thumb and finger pads wrap. Bigger is kinder and slopier. Before overall scale; limited by the span and the depth.",
    ),
    control(
        "thumb_incut",
        "Thumb incut",
        "Grip",
        0,
        16,
        0.5,
        "mm",
        "How far the thumb side cuts back under its round, a hollow to pinch behind: the deeper, the better it holds. Zero is a straight side. Before overall scale; eased when the hollow would be too steep to print or the pinch too thin.",
    ),
    control(
        "finger_incut",
        "Finger incut",
        "Grip",
        0,
        16,
        0.5,
        "mm",
        "The same for the side your fingers wrap: a hollow for the fingertips under the round.",
    ),
    control(
        "offset",
        "Offset",
        "Grip",
        0,
        60,
        1,
        "%",
        "Lowers the thumb side against the finger side, so the top slopes across: an offset pinch. Zero is symmetric.",
    ),
    control(
        "top_rise",
        "Top rise",
        "Shape",
        0,
        25,
        0.5,
        "mm",
        "How far the middle of the top stands above its two rounds, before overall scale.",
    ),
    control(
        "size",
        "Overall scale",
        "Shape",
        50,
        200,
        1,
        "%",
        "Scales the whole pinch, span included. Hardware stays the same size.",
    ),
    control(
        "height",
        "Height",
        "Shape",
        40,
        200,
        1,
        "mm",
        "Up the wall, before overall scale. Grows when the screws need room.",
    ),
    control(
        "end_rounding",
        "Rounded ends",
        "Shape",
        20,
        100,
        1,
        "%",
        "The outline on the wall: a block with rounded corners at 20, a full oval at 100.",
    ),
    control(
        "arch",
        "Arch",
        "Shape",
        0,
        100,
        1,
        "%",
        "How the top falls away toward each end, seen from the side: a level top that drops at the ends at 0, a full arch standing tallest in the middle at 100.",
    ),
    control(
        "hourglass",
        "Hourglass",
        "Shape",
        0,
        60,
        1,
        "%",
        "Narrows the span toward the middle of the pinch's length, so it pinches in at the waist and flares out to each end.",
    ),
    control(
        "taper",
        "Taper",
        "Shape",
        0,
        70,
        1,
        "%",
        "Narrows the span steadily from the bottom end to the top one.",
    ),
    control(
        "bend",
        "Bend",
        "Shape",
        0,
        25,
        0.5,
        "mm",
        "Bends the pinch into a crescent, fingers on the outside and thumb on the inside. Before overall scale; limited by the length.",
    ),
    control(
        "screw_count",
        "Screw count",
        "Mounting",
        1,
        6,
        1,
        "",
        "Screws run in a line up the middle of the pinch. Chosen from the size, there are two, and one more for every 30 mm the span runs past 60 mm after overall scale.",
    ),
    control(
        "seat_depth",
        "Screw seat",
        "Mounting",
        2,
        30,
        0.5,
        "mm",
        "Material beneath the screw head. Automatic follows the depth; reduced to fit when necessary.",
    ),
    *hardware.SCREW_CONTROLS,
    *hardware.BOLT_CONTROLS,
]

BASE = Parameters()
# Each preset fits as written: nothing has to grow or give.
PRESETS = {
    "Round pinch": BASE,
    "Wide pinch": replace(
        BASE,
        width=96,
        depth=52,
        rounding=22,
        thumb_incut=10,
        finger_incut=10,
        top_rise=9,
        height=125,
    ),
    # A crescent, like the incut pinches of commercial sets: fingers round
    # the outside of the curve, thumb in the hollow of the inside.
    "Crescent pinch": replace(
        BASE,
        width=58,
        depth=46,
        thumb_incut=8,
        finger_incut=10,
        height=132,
        end_rounding=85,
        arch=85,
        bend=14,
    ),
    # Plump all over: an oval on the wall under a full arch.
    "Egg pinch": replace(
        BASE,
        width=74,
        depth=56,
        rounding=26,
        top_rise=10,
        height=112,
        end_rounding=100,
        arch=100,
        taper=15,
    ),
    "Hour glass": replace(
        BASE,
        width=90,
        depth=50,
        rounding=20,
        hourglass=24,
        height=142,
        end_rounding=45,
        arch=55,
    ),
    "Offset pinch": replace(
        BASE,
        width=64,
        depth=54,
        offset=35,
        thumb_incut=5,
        finger_incut=12,
    ),
    "Slim pinch": replace(
        BASE,
        width=44,
        depth=42,
        rounding=14,
        thumb_incut=6,
        finger_incut=6,
        top_rise=5,
        height=100,
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
    for key in ("screws", "bolt_mount", "auto_seat", "auto_screw_count"):
        if not isinstance(data[key], bool):
            raise ValueError(f"{key} must be true or false.")
    for item in CONTROLS:
        key = item["key"]
        value = data[key]
        if not finite_number(value):
            raise ValueError(f"{key} must be a finite number.")
        data[key] = max(item["min"], min(item["max"], value))
    if int(data["screw_count"]) != data["screw_count"]:
        raise ValueError("screw_count must be a whole number.")
    data["screw_count"] = int(data["screw_count"])
    data["head_diameter"] = max(
        data["head_diameter"], data["shank_diameter"] + hardware.HEAD_OVER_SHANK
    )
    return Parameters(**data)


def schema():
    return dict(
        generator="garage-holds-roundpinch",
        version=1,
        slug="roundpinch",
        label="Round Pinch Lab",
        defaults=asdict(BASE),
        presets={key: asdict(value) for key, value in PRESETS.items()},
        autoScrewCount=True,
        controls=CONTROLS,
    )


def design_document(p):
    return dict(
        generator="garage-holds-roundpinch", version=1, units="mm", parameters=asdict(p)
    )
