"""Jug settings: a larger, deep, strongly incut version of the proven crimp."""

import math
from dataclasses import asdict, dataclass

if __package__:
    from .crimp_engine import parameters as crimp
else:
    from crimp_engine import parameters as crimp


@dataclass(frozen=True)
class Parameters(crimp.Parameters):
    width: float = 150
    edge_depth: float = 40
    incut: float = 40
    lip_radius: float = 10
    body_height: float = 58
    body_rounding: float = 24
    end_rounding: float = 18
    bow: float = 10
    end_wrap: float = 115
    arc_rise: float = 5
    size: float = 100
    grip_quality: float = 50


CONTROLS = [
    dict(item, label=item["label"].lower())
    for item in crimp.CONTROLS
    if item["group"] != "Grip"
]
CONTROLS[:0] = [
    dict(
        key="size",
        label="overall size",
        group="Grip",
        min=75,
        max=140,
        step=1,
        unit="%",
        help="Scales the whole hold around the selected preset. Screw hole diameters stay the same.",
    ),
    dict(
        key="grip_quality",
        label="more / less bite",
        group="Grip",
        min=0,
        max=90,
        step=1,
        unit="%",
        help="Higher gives a more positive incut; lower makes the grip less positive. This is shape, not a problem grade.",
    ),
    dict(
        key="edge_depth",
        label="grip reach",
        group="Grip",
        min=25,
        max=60,
        step=0.5,
        unit="mm",
        help="Lengthens the gripping section outward from the wall. Separate from the curve of the arch.",
    ),
    dict(
        key="arc_rise",
        label="arc rise",
        group="Grip",
        min=0,
        max=25,
        step=0.5,
        unit="mm",
        help="Raises the middle of the arch farther from the wall, keeping its ends flush.",
    ),
    dict(
        key="lip_radius",
        label="lip comfort",
        group="Grip",
        min=4,
        max=18,
        step=0.5,
        unit="mm",
        help="Rounds the contact edge. Higher is softer and uses more of the usable grip.",
    ),
]
CONTROLS.append(
    dict(
        key="end_wrap",
        label="ends toward the wall",
        group="Shape",
        min=0,
        max=180,
        step=1,
        unit="%",
        help="Bends the whole gripping section into an arch that meets the wall at both ends. Zero keeps a straight rail.",
    )
)
PRESETS = {
    "board jug": Parameters(),
    "deep jug": Parameters(
        width=135,
        edge_depth=48,
        incut=45,
        grip_quality=62.5,
        body_height=72,
        lip_radius=12,
        end_wrap=145,
        arc_rise=12,
    ),
}


def parse_parameters(values):
    if not isinstance(values, dict):
        raise ValueError("Settings must be a JSON object.")
    merged = asdict(Parameters()) | values
    # Fit numeric controls within the shared engine's supported bounds.
    for item in CONTROLS:
        value = merged[item["key"]]
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if not math.isfinite(value):
                raise ValueError(f"{item['label']} must be a finite number.")
            merged[item["key"]] = min(item["max"], max(item["min"], value))
    if isinstance(merged["width"], (int, float)) and isinstance(
        merged["end_rounding"], (int, float)
    ):
        merged["end_rounding"] = min(merged["end_rounding"], merged["width"] / 2 - 0.5)
    wrap = merged.pop("end_wrap")
    rise = merged.pop("arc_rise")
    size = merged.pop("size")
    bite = merged.pop("grip_quality")
    if any(
        isinstance(v, bool) or not isinstance(v, (int, float))
        for v in (wrap, rise, size, bite)
    ):
        raise ValueError("Grip controls must be numbers.")
    merged["incut"] = 20 + bite * 0.4
    parsed = crimp.parse_parameters(merged)
    return Parameters(
        **asdict(parsed), end_wrap=wrap, arc_rise=rise, size=size, grip_quality=bite
    )


def design_document(p):
    return dict(
        generator="garage-holds-jug", version=2, units="mm", parameters=asdict(p)
    )


def schema():
    return dict(
        version=2,
        defaults=asdict(Parameters()),
        controls=CONTROLS,
        presets={name: asdict(p) for name, p in PRESETS.items()},
    )
