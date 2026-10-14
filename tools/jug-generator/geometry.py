"""Jug Lab's calibrated controls mapped onto the shared shape engine."""

import math
from dataclasses import asdict, replace

if __package__:
    from .crimp_engine import geometry as crimp
    from .crimp_engine import parameters as crimp_settings
    from .parameters import parse_parameters
else:
    from crimp_engine import geometry as crimp
    from crimp_engine import parameters as crimp_settings
    from parameters import parse_parameters

SCALED = (
    "width",
    "edge_depth",
    "body_height",
    "body_rounding",
    "end_rounding",
    "bow",
    "lip_radius",
)


def engine_parameters(p):
    values = asdict(p)
    for key in ("end_wrap", "arc_rise", "size", "grip_quality", "screw_arc"):
        values.pop(key)
    factor = p.size / 100
    limits = {item["key"]: item for item in crimp_settings.CONTROLS}
    for key in SCALED:
        limit = limits[key]
        maximum = crimp_settings.JUG_MAXIMA.get(key, limit["max"])
        values[key] = min(maximum, max(limit["min"], values[key] * factor))
    values["end_rounding"] = min(values["end_rounding"], values["width"] / 2 - 0.5)
    return crimp.Parameters(**values)


def _same(a, b):
    if isinstance(a, float) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-9)
    return a == b


class Model:
    def __init__(self, model, requested):
        self.mesh = model.mesh
        self.profile = model.profile
        self.screws = model.screws
        self.bolts = model.bolts
        factor = requested.size / 100
        self.parameters = replace(
            requested,
            body_height=model.parameters.body_height / factor,
            seat_depth=model.seat_depth,
            screw_arc=(
                min(requested.screw_arc, model.screw_arc_limit)
                if model.screw_arc_limit is not None else requested.screw_arc
            ),
            screw_spacing=(
                model.screws[-1][0] - model.screws[0][0]
                if len(model.screws) > 1
                else requested.screw_spacing
            ),
        )
        # Scaling up and back down leaves float noise that is not a change.
        self.adjusted = {
            key: value
            for key, value in asdict(self.parameters).items()
            if not _same(value, asdict(requested)[key])
        }
        self._model = model

    def preview(self):
        return self._model.preview() | dict(
            parameters=asdict(self.parameters), adjusted=self.adjusted
        )


def build(requested, quality="preview"):
    if quality not in {"preview", "export"}:
        raise ValueError("Unknown mesh quality.")
    p = parse_parameters(asdict(requested))
    base = engine_parameters(p)
    model = crimp.build(
        base,
        quality,
        end_wrap=p.end_wrap / 100,
        arc_rise=p.arc_rise * p.size / 100,
        jug=True,
        screw_arc=p.screw_arc,
    )
    return Model(model, p)
