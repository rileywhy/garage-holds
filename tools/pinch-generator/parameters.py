"""Independent, versioned pinch controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace


@dataclass(frozen=True)
class Parameters:
    # The grip: the span across the top edges, how far the finger side
    # stands off the wall, each side's lean, and how much lower the thumb
    # side stands than the finger side.
    width: float = 55
    depth: float = 44
    thumb_angle: float = -5
    finger_angle: float = -5
    offset: float = 0
    edge_radius: float = 9
    # The body, before overall scale.
    shape: str = "domed"
    top_rise: float = 6.5
    size: float = 100
    height: float = 110
    end_rounding: float = 60
    base_flare: float = 4.5
    character: float = 0
    seed: int = 0
    # Mounting, shared with the other labs. Automatic mounting takes the
    # bolt on a pinch over 60 mm across when it fits there.
    auto_mount: bool = True
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
        "width",
        "Span",
        "Grip",
        25,
        110,
        1,
        "mm",
        "Thumb to fingers, across the top edges, before overall scale. Most hands pinch 40–60 mm comfortably; wider is harder.",
    ),
    control(
        "depth",
        "Depth",
        "Grip",
        20,
        70,
        1,
        "mm",
        "How far the finger side stands off the wall, before overall scale: how much side there is to pinch.",
    ),
    control(
        "thumb_angle",
        "Thumb side angle",
        "Grip",
        -30,
        40,
        1,
        "°",
        "Negative undercuts the side, a lip to pinch behind: the more undercut, the better it holds. Positive leans it in toward the top, a wedge that slips. Relative to the wall's normal, not a grade.",
    ),
    control(
        "finger_angle",
        "Finger side angle",
        "Grip",
        -30,
        40,
        1,
        "°",
        "The same for the side your fingers wrap: negative undercuts, positive leans in.",
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
        "edge_radius",
        "Edge rounding",
        "Grip",
        2,
        20,
        0.5,
        "mm",
        "Rounds the edges your thumb and fingers wrap, and the ridge on a ridged top. Smaller bites; bigger is kinder and slopier.",
    ),
    control(
        "top_rise",
        "Top rise",
        "Shape",
        0,
        25,
        0.5,
        "mm",
        "How far the middle of the top stands above the line between its edges, before overall scale.",
        shapes=["domed", "ridged"],
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
        "How much of each end rounds off toward the wall: squarer ends at 20, a full oval at 100.",
    ),
    control(
        "base_flare",
        "Base flare",
        "Shape",
        0,
        15,
        0.5,
        "mm",
        "Widens the foot of each side into the wall for strength, before overall scale. Zero meets the wall square.",
    ),
    control(
        "character",
        "Character",
        "Shape",
        0,
        1,
        0.05,
        "",
        "Seeded waviness along the sides for a less uniform pinch. Zero is smooth.",
    ),
    control(
        "screw_count",
        "Screw count",
        "Mounting",
        1,
        3,
        1,
        "",
        "Screws run up the middle of the pinch: two by default, three on a tall one.",
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
        key="auto_mount",
        label="Bolt on pinches over 60 mm",
        group="Mounting",
        help="A wide pinch levers hard on the wall, so over 60 mm across it takes the bolt and one anti-rotation screw where they fit, and screws otherwise. Ticking or clearing Bolt + one screw yourself turns this off.",
    ),
]

# Over this span, after overall scale, automatic mounting takes the bolt.
BOLT_SPAN = 60

SHAPES = {"flat": "Flat top", "domed": "Domed top", "ridged": "Ridged top"}

BASE = Parameters()
# Each preset fits as written: nothing has to grow or give.
PRESETS = {
    "Block pinch": BASE,
    "Narrow pinch": replace(
        BASE,
        width=35,
        depth=37,
        thumb_angle=-10,
        finger_angle=-10,
        edge_radius=6.5,
        top_rise=4.5,
        height=99,
    ),
    "Wide pinch": replace(
        BASE,
        width=83,
        depth=46,
        thumb_angle=-2,
        finger_angle=-2,
        edge_radius=11,
        top_rise=9,
        height=121,
    ),
    "Wedge": replace(
        BASE,
        shape="flat",
        width=44,
        depth=48,
        thumb_angle=15,
        finger_angle=15,
        edge_radius=6.5,
        base_flare=0,
    ),
    "Lip pinch": replace(
        BASE,
        shape="flat",
        width=62,
        depth=40,
        thumb_angle=-22,
        finger_angle=-22,
        edge_radius=5.5,
        base_flare=9,
    ),
    "Offset pinch": replace(
        BASE,
        shape="flat",
        width=53,
        depth=51,
        thumb_angle=5,
        finger_angle=-15,
        offset=40,
        edge_radius=7.5,
        base_flare=6.5,
    ),
    "Ridged fin": replace(
        BASE,
        shape="ridged",
        width=42,
        depth=44,
        thumb_angle=0,
        finger_angle=0,
        edge_radius=5.5,
        top_rise=13,
        height=132,
        end_rounding=45,
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
    if data["shape"] not in SHAPES:
        raise ValueError("Unknown pinch top.")
    for key in ("screws", "bolt_mount", "auto_seat", "auto_mount"):
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
        generator="garage-holds-pinch",
        version=1,
        slug="pinch",
        label="Pinch Lab",
        defaults=asdict(BASE),
        presets={key: asdict(value) for key, value in PRESETS.items()},
        shapes=SHAPES,
        shapeLabel="Top",
        controls=CONTROLS,
        toggles=TOGGLES,
    )


def design_document(p):
    return dict(
        generator="garage-holds-pinch", version=1, units="mm", parameters=asdict(p)
    )
