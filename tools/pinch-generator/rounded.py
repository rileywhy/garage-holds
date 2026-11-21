"""The rounded pinch: a full, round lip on each side standing over a hollow
cut back beneath it, so a side is incut and rounded at once.

The classic pinch (geometry.py) is a polygon with filleted corners: its
undercut is a straight face, and rounding its edge eats the undercut. Here
the section is one smooth curve. Each side leaves the wall square, sweeps
out through a hollow to the widest point of the pinch, and rolls over a
quarter round onto a domed top. The pads wrap the round and the fingertips
sit in the hollow under it; neither takes anything from the other.

Along the wall the section is scaled, not capped: its span follows a
rounded outline and its depth an arch, so the pinch stands tallest and
fullest in the middle and rolls down to the wall at each end, and the
hollows fade out toward the ends with the depth. X, Y and Z are as in
geometry.py: thumb side at -X, Y up the wall, Z out of it.
"""

import math
from dataclasses import replace

import numpy as np

if __package__:
    from .solid import lofted_solid
else:
    from solid import lofted_solid

# The least width the pinch keeps between its hollows, as in the classic
# pinch: a narrower span keeps its own width, uncut.
WAIST = 16.0
# A hollow's steepest slope from the wall's normal. The pinch prints with
# its back on the bed, so the hollow is an overhang: 45 degrees prints
# without support.
HOLLOW_SLOPE = math.radians(45)
# The hollow keeps at least this share of the depth, so there is always a
# side under the round for fingertips; the top rise takes at most RISE_SHARE.
HOLLOW_SHARE = 0.3
RISE_SHARE = 0.4
# The round keeps this share of the half span at most, leaving a sliver of
# top between the two rounds so every section has the same points.
ROUND_SHARE = 0.96
# The hourglass and taper shrink the depth by these shares of how much they
# narrow the span.
HOURGLASS_DEPTH = 0.3
TAPER_DEPTH = 0.5
# The bend's sag is at most this share of the length: the sections stay
# square to the wall's vertical, so a tighter curve would thin the ends.
BEND_SHARE = 0.18
# Hardware sits where the pinch stands at least this share of its depth,
# and no further out over a round than halfway down its width.
HARDWARE_SHARE = 0.7
HARDWARE_ROUND = 0.5
QUALITY = {
    "preview": dict(hollow=8, round=10, top=10, along=45),
    "export": dict(hollow=16, round=20, top=20, along=111),
}


def frame(p):
    """The centre section's measurements after overall scale: half span,
    depth, the round's reach across and up, the top rise, the height of each
    side's widest point (thumb, finger), and the largest rounding that
    fits, before scale."""
    scale = p.size / 100
    half, depth = p.width * scale / 2, p.depth * scale
    rise = min(p.top_rise * scale, RISE_SHARE * depth)
    room = min(ROUND_SHARE * half, depth - rise - HOLLOW_SHARE * depth)
    radius = min(p.rounding * scale, room)
    lip = depth - rise - radius
    return dict(
        half=half,
        depth=depth,
        radius=radius,
        rise=rise,
        lips=(lip * (1 - p.offset / 100), lip),
        cap=room / scale,
    )


def lengthwise(p, u):
    """The shares of its span and of its depth the pinch keeps at u, from -1
    at its bottom end to 1 at its top. Rounded ends draw the outline on the
    wall from an oval to a block, and the arch draws the top's fall toward
    each end the same way; the hourglass narrows the middle and the taper
    the top end."""
    u = np.abs(np.asarray(u, dtype=float))
    m = 2 + ((100 - p.end_rounding) / 40) ** 1.5
    q = 2 + 4 * (1 - p.arch / 100) ** 2
    span = (1 - u**m) ** (1 / m)
    depth = (1 - u**q) ** (1 / q)
    return span, depth


def narrowing(p, u):
    """The hourglass's and taper's shares of the span and depth at u."""
    u = np.asarray(u, dtype=float)
    waist = p.hourglass / 100 * np.cos(np.pi * u / 2) ** 2
    taper = p.taper / 100 * (u + 1) / 2
    return (
        (1 - waist) * (1 - taper),
        (1 - HOURGLASS_DEPTH * waist) * (1 - TAPER_DEPTH * taper),
    )


def bend(p, u):
    """How far the pinch's middle line sits toward the finger side at u: a
    crescent with the fingers on its outside and the thumb on its inside."""
    length = p.height * p.size / 100
    sag = min(p.bend * p.size / 100, BEND_SHARE * length)
    return sag * (0.5 - np.asarray(u, dtype=float) ** 2)


def section(f, incuts, q, across=1.0, out=1.0):
    """A section across the pinch in (x, z), clockwise from the thumb side's
    foot, shrunk to the given shares of its span and depth. Each hollow
    leaves the wall square and meets its round upright at the side's widest
    point, deepest at the wall and steepest halfway up; the rounds are
    quarter ellipses, and the top between them a shallow parabola over the
    whole span, tilted when the thumb side stands lower."""
    half = f["half"] * across
    rx, rz = f["radius"] * across, f["radius"] * out
    rise = f["rise"] * out
    thumb, finger = (lip * out for lip in f["lips"])
    # The hollows fade with the depth as well as the span, so their slope
    # is never steeper than at the middle.
    cut = [incut * across * out for incut in incuts]

    def top(x, lift):
        base = thumb + (finger - thumb) * (x + half) / (2 * half)
        return base + lift + rise * (1 - (x / half) ** 2)

    s = np.linspace(0, 1, q["hollow"] + 1)[:-1]
    hollow = np.cos(np.pi * s / 2) ** 2
    theta = np.linspace(0, np.pi / 2, q["round"] + 1)
    reach = half - rx + rx * np.cos(theta)
    flat = np.linspace(-(half - rx), half - rx, q["top"] + 1)[1:-1]
    x = np.concatenate(
        (
            -(half - cut[0] * hollow),
            -reach,
            flat,
            reach[::-1],
            (half - cut[1] * hollow)[::-1],
        )
    )
    z = np.concatenate(
        (
            s * thumb,
            top(-reach, rz * np.sin(theta)),
            top(flat, rz),
            top(reach[::-1], rz * np.sin(theta[::-1])),
            (s * finger)[::-1],
        )
    )
    return np.column_stack((x, z))


def stations(p, f, count):
    """Where along the pinch its sections sit, as u from -1 to 1: at even
    steps along its outline and its arch together, so the ends, where both
    turn fastest, get the sections they need. The first and last stop short
    of the ends, which close onto points."""
    length = p.height * p.size / 100
    u = np.sin(np.linspace(-np.pi / 2, np.pi / 2, 20001))
    span, depth = lengthwise(p, u)
    path = np.column_stack((u * length / 2, span * f["half"], depth * f["depth"]))
    along = np.concatenate(([0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))))
    short = along[-1] / (3 * count)
    return np.interp(np.linspace(short, along[-1] - short, count), along, u)


def loft(p, quality):
    """The pinch body, its centre section in (x, z), the plan region a
    vertical line can cross from the wall out through the top without
    touching a hollow or the steep of a round (where hardware may go) and
    its widest point, and the largest rounding that fits, before scale."""
    q = QUALITY[quality]
    f = frame(p)
    scale = p.size / 100
    length = p.height * scale
    incuts = (p.thumb_incut * scale, p.finger_incut * scale)

    def ring(u):
        (span, depth), (narrow, shallow) = lengthwise(p, u), narrowing(p, u)
        across, out = float(span * narrow), float(depth * shallow)
        outline = section(f, incuts, q, across, out)
        middle = float(bend(p, u))
        # Hardware keeps inside both feet, and off the steep of each round.
        inner = f["half"] * across - max(
            HARDWARE_ROUND * f["radius"] * across, max(incuts) * across * out
        )
        return (
            np.column_stack(
                (outline[:, 0] + middle, np.full(len(outline), u * length / 2), outline[:, 1])
            ),
            (middle - inner, middle + inner, out),
        )

    us = stations(p, f, q["along"])
    rings, limits = zip(*(ring(u) for u in us))
    left, right, along = [], [], []
    for u, (a, b, out) in zip(us, limits):
        if out >= HARDWARE_SHARE and b - a > 1e-3:
            left.append(a)
            right.append(b)
            along.append(u * length / 2)
    region = list(zip(right, along)) + list(zip(left[::-1], along[::-1]))
    solid = lofted_solid(
        rings,
        [float(bend(p, -1)), -length / 2, 0],
        [float(bend(p, 1)), length / 2, 0],
    )
    centre = ring(0.0)[0][:, [0, 2]]
    widest = max((b - a for a, b in zip(left, right)), default=0.0)
    return solid, centre, np.array(region), widest, f["cap"]


def fit(requested):
    """Ease each incut until its hollow is no steeper than HOLLOW_SLOPE and
    the pinch keeps WAIST between its hollows (or its own span, when that
    is narrower) at its narrowest, and the bend until it fits the length."""
    p = requested
    scale = p.size / 100
    f = frame(p)
    # The hourglass and taper narrow the middle, hollows and all.
    narrow = float(narrowing(p, 0.0)[0])
    span = 2 * f["half"]
    room = span - min(WAIST, narrow * span) / narrow
    steepest = [2 / math.pi * lip * math.tan(HOLLOW_SLOPE) for lip in f["lips"]]
    cuts = [
        min(cut * scale, limit)
        for cut, limit in zip((p.thumb_incut, p.finger_incut), steepest)
    ]
    if sum(cuts) > room:
        cuts = [cut * room / sum(cuts) for cut in cuts]
    # Down to the slider's step, so the sliders can show what was built.
    thumb, finger = (math.floor(cut / scale * 2 + 1e-9) / 2 for cut in cuts)
    sag = math.floor(BEND_SHARE * p.height * 2 + 1e-9) / 2
    return replace(
        p,
        thumb_incut=min(p.thumb_incut, thumb),
        finger_incut=min(p.finger_incut, finger),
        bend=min(p.bend, sag),
    )


def screw_targets(p, proxy, count):
    """Screws in a line up the middle of the pinch, following its bend: one
    in the middle, or evenly from one end of the line to the other, the
    outer two where the arch still stands near its full depth, so each
    recess opens on the top and not down the fall of an end; never closer
    in than 40% of the way along the hardware region nor further out than
    65%."""
    lo, hi = np.array(proxy.bounding_box()).reshape(2, 3)
    y, half = (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2
    length = p.height * p.size / 100
    u = np.linspace(0, 1, 201)
    level = u[lengthwise(p, u)[1] >= 0.92].max() * length / 2
    reach = float(np.clip(level - p.head_diameter / 2, half * 0.4, half * 0.65))
    rows = [0.0] if count == 1 else np.linspace(-reach, reach, count)
    return [(float(bend(p, (y + t) / (length / 2))), y + t) for t in rows]
