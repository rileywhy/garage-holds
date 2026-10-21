"""Independent, versioned crack controls. All lengths are millimetres."""

import math
from dataclasses import asdict, dataclass, replace

from tools import hold_hardware as hardware


@dataclass(frozen=True)
class Parameters:
    # The crack: its width at the mouth, how far it runs into the block,
    # each face's lean, a narrowing partway along it for locks, and the
    # rounding of its lips. By default a short finger-lock block: the crack
    # narrows from 39 mm to 16 mm near its bottom end, so fingers slot in
    # above the narrowing and pull down into it.
    width: float = 39
    depth: float = 50
    flare: float = 0
    constriction: float = 23
    constriction_height: float = 15
    edge_radius: float = 5
    # The block: one piece with the crack through it, or one side of a
    # crack to print twice.
    shape: str = "block"
    length: float = 80
    side: float = 25
    back: float = 10
    character: float = 0
    seed: int = 0
    # Mounting, shared with the other labs. Screws run in a line up each
    # side; a longer crack takes more (see SCREW_LENGTH).
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
        "Crack width",
        "Grip",
        12,
        120,
        1,
        "mm",
        "Across the mouth of the crack. Thin fingers jam around 15 mm (a #0.3 Camalot), fingers 20–25 (#0.4 to #0.5), hands 55–70 (#2 to #3) and fists 90–110 (#4).",
        shapes=["block"],
    ),
    control(
        "depth",
        "Crack depth",
        "Grip",
        20,
        140,
        1,
        "mm",
        "How far the crack runs in from its mouth: about 50 mm takes fingers to the second knuckle, 100 mm a whole hand.",
    ),
    control(
        "flare",
        "Flare",
        "Grip",
        -15,
        20,
        0.5,
        "°",
        "Each face's lean. Positive flares the crack out, wider at its mouth than inside; negative flares it in, wider inside, so a jam locks behind the mouth, and the block widens to keep its sides. Eased when the crack would close up or the block would outgrow a 256 mm bed.",
    ),
    control(
        "constriction",
        "Constriction",
        "Grip",
        0,
        30,
        0.5,
        "mm",
        "Narrows the crack by this much over a short stretch partway along it, for locks: slot in above it and pull down into it. Two printed sides take half each. Eased when the crack would close up.",
    ),
    control(
        "constriction_height",
        "Constriction height",
        "Grip",
        15,
        85,
        1,
        "%",
        "Where the constriction sits, as a share of the length from the bottom end.",
    ),
    control(
        "edge_radius",
        "Edge rounding",
        "Grip",
        1,
        15,
        0.5,
        "mm",
        "Rounds the lips of the crack, where your skin bears, and the block's front corners and ends. Smaller bites; bigger is kinder.",
    ),
    control(
        "length",
        "Length",
        "Shape",
        80,
        240,
        1,
        "mm",
        "Along the crack, up the wall. The block prints on its back, so keep it within your printer bed.",
    ),
    control(
        "side",
        "Side thickness",
        "Shape",
        12,
        55,
        0.5,
        "mm",
        "Each side of the crack, from its face to the outside, where it is thinnest: at the mouth, or at the floor of a crack flared in. The screws run through the sides.",
    ),
    control(
        "back",
        "Back",
        "Shape",
        6,
        30,
        0.5,
        "mm",
        "Material behind the crack, joining its two sides.",
        shapes=["block"],
    ),
    control(
        "character",
        "Wander",
        "Shape",
        0,
        1,
        0.05,
        "",
        "Seeded waviness: the crack wanders side to side along its length and keeps its width. Zero runs it straight.",
    ),
    control(
        "screw_count",
        "Screws per side",
        "Mounting",
        1,
        4,
        1,
        "",
        "Screws run in a line up each side of the crack. Chosen from the size, there are two, and three once the crack runs past 180 mm.",
    ),
    control(
        "seat_depth",
        "Screw seat",
        "Mounting",
        2,
        30,
        0.5,
        "mm",
        "Material beneath each screw head. Automatic follows the depth; reduced to fit when necessary. The recess above it is long, so use a long driver bit.",
    ),
    *hardware.SCREW_CONTROLS,
    *hardware.BOLT_CONTROLS,
]

# Chosen from the size, each side takes two screws up to 180 mm long and one
# more for every 60 mm past that: three on the longest the slider allows.
SCREW_LENGTH = 180
SCREW_STEP = 60
# The automatic seat stands this share of the block's depth off the wall,
# as the Pinch Lab seats its screws, and never more than SEAT_MAX.
SEAT_SHARE = 0.3
SEAT_MAX = 20

SHAPES = {"block": "One block", "half": "One side (print two)"}

BASE = Parameters()
# A plain finger crack, parallel and the same width all the way along: the
# start of the other presets.
STRAIGHT = replace(
    BASE, width=22, constriction=0, constriction_height=40, edge_radius=4, length=160
)
# Each preset fits as written: nothing has to ease.
PRESETS = {
    "Finger crack": BASE,
    "Parallel fingers": STRAIGHT,
    "Thin fingers": replace(STRAIGHT, width=15, depth=45, edge_radius=3),
    # A gentler constriction a little below the middle of a longer crack.
    "Finger locks": replace(
        STRAIGHT, width=24, constriction=9, constriction_height=45, length=180
    ),
    "Flared fingers": replace(STRAIGHT, width=32, depth=45, flare=10, edge_radius=5),
    "Hand crack": replace(
        STRAIGHT,
        width=60,
        depth=100,
        edge_radius=7,
        length=200,
        side=30,
        back=12,
    ),
    # Wide cracks make a big block; two printed sides, mounted apart, make
    # the same crack from less plastic and fit a smaller bed.
    "Hand crack, one side": replace(
        STRAIGHT,
        shape="half",
        width=60,
        depth=100,
        edge_radius=7,
        length=200,
        side=30,
    ),
    "Fist crack, one side": replace(
        STRAIGHT,
        shape="half",
        width=100,
        depth=110,
        edge_radius=8,
        length=220,
        side=34,
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
        raise ValueError("Unknown crack form.")
    for key in ("screws", "bolt_mount", "auto_seat", "auto_screw_count"):
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
        generator="garage-holds-crack",
        version=1,
        slug="crack",
        label="Crack Lab",
        defaults=asdict(BASE),
        presets={key: asdict(value) for key, value in PRESETS.items()},
        shapes=SHAPES,
        shapeLabel="Form",
        autoScrewCount=True,
        controls=CONTROLS,
    )


def design_document(p):
    return dict(
        generator="garage-holds-crack", version=1, units="mm", parameters=asdict(p)
    )
