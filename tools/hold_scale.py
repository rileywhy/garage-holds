"""Body dimensions scale before the generator fits hardware in millimetres."""

from dataclasses import replace
from math import isclose


SCALE_CONTROL = dict(
    key="size", label="Scale", group="Grip", min=75, max=140, step=1, unit="%",
    help="Changes the size of the body. Screw and bolt diameters stay the same.",
)


def scale_body(requested, fields):
    if requested.size == 100:
        return requested
    factor = requested.size / 100
    return replace(requested, **{key: getattr(requested, key) * factor for key in fields})


def restore_dimensions(model, requested, fields):
    """Save the fitted dimensions in the sliders' original (100%) units.

    Unadjusted inputs retain their exact values after a round trip. Mounting
    values and the actual vertices, profile and screw positions remain in mm.
    """
    if requested.size == 100:
        return model
    factor = requested.size / 100
    dimensions = {}
    for key in fields:
        nominal = getattr(model.parameters, key) / factor
        initial = getattr(requested, key)
        dimensions[key] = initial if isclose(nominal, initial, abs_tol=1e-9) else nominal
        if key in model.adjusted:
            model.adjusted[key] = dimensions[key]
    model.parameters = replace(model.parameters, **dimensions)
    return model
