"""A pinch: a rounded section across the hold lofted up the wall, its two
sides the gripping faces, then drilled.

X runs across the hold, thumb side at -X and finger side at +X; Y runs up
the wall, Z out of it, and the back sits on Z=0. The section is a polygon
with filleted corners, as the Crimp Lab builds its profile: each side a
face at its own angle, bowed in by the swoop, a flare into the wall at its
foot, and a flat, domed or ridged top between the two edges. The section is lofted
along Y and shrinks toward the middle of the top at the wall at each end,
so the ends round down onto the wall. Hardware sits where a vertical line
runs from the wall straight out through the top, clear of both sides and
their edges, so no recess can open through an undercut side or its waist.
Hardware fitting uses the preview body for both output qualities, so
exports agree with previews.
"""

import math
from dataclasses import asdict, replace

import manifold3d as manifold
import numpy as np
import trimesh

if __package__:
    from .crimp_engine import geometry as crimp
    from .parameters import (
        CONTROLS,
        SCREW_SPAN,
        SCREW_STEP,
        SEAT_MAX,
        SEAT_SHARE,
        parse_parameters,
    )
else:
    from crimp_engine import geometry as crimp
    from parameters import (
        CONTROLS,
        SCREW_SPAN,
        SCREW_STEP,
        SEAT_MAX,
        SEAT_SHARE,
        parse_parameters,
    )

from tools.hold_mounting import closed_mesh, drill, fit_bolt_and_screw, screw_layout

# The least width the pinch keeps between its sides anywhere below the top
# edges, so an undercut pinch stands on a neck and not a stalk; a narrower
# span keeps its own width. Printability, not a strength rating.
WAIST = 16.0
# The flare's chamfer meets the wall at this angle, so the foot of each side
# ends in an edge and not a feather, and climbs at most this share of its
# side.
FLARE_ANGLE = math.radians(45)
FLARE_REACH = 0.4
# Character's waviness along the sides, as a share of the span and at most
# this many millimetres.
WAVE = 0.08
WAVE_MAX = 4.0
# Hardware sits only where the section stands at least this share of its
# full size, clear of the ends' slopes.
HARDWARE_SHARE = 0.7
QUALITY = {
    "preview": dict(segments=8, along=30, cap=14),
    "export": dict(segments=16, along=80, cap=24),
}
LIMITS = {control["key"]: (control["min"], control["max"]) for control in CONTROLS}


def bow(s):
    """How far a side bows in at a share s of its edge's height, as a share
    of the swoop: nothing at the wall, the most a third of the way up, and
    back to nothing, level, at the edge, so the rounding over the edge
    stays smooth."""
    s = np.clip(s, 0, 1)
    return 27 / 4 * s * (1 - s) ** 2


def narrowing(p, u):
    """How much of the span the pinch keeps at u along its length, from
    -1 to 1 where its ends start to round off (see loft): the hourglass
    narrows it most at the middle and not at all from there out, levelling
    out at both, so each end keeps its full width before it rounds off."""
    u = min(1.0, abs(u))
    return 1 - p.hourglass / 100 * math.cos(math.pi * u / 2) ** 2


def _unit(v):
    return v / np.linalg.norm(v)


def _turn(before, point, after):
    """The angle the outline turns through at a corner."""
    a, b = _unit(point - before), _unit(after - point)
    return abs(math.atan2(a[0] * b[1] - a[1] * b[0], a @ b))


def _flare(x_wall, angle, reach, flare, inward):
    """The foot of one side: where its chamfer meets the wall, and where it
    meets the side, for a side standing at x_wall on the wall and leaning
    in (toward +X for the thumb side, inward=1) by angle. The chamfer rises
    at FLARE_ANGLE from flare beyond the side's foot, and is shortened to
    climb at most reach up the side."""
    lean = math.cos(FLARE_ANGLE) - math.sin(FLARE_ANGLE) * math.tan(angle)
    run = flare / lean
    if run * math.sin(FLARE_ANGLE) > reach:
        run = reach / math.sin(FLARE_ANGLE)
        flare = run * lean
    height = run * math.sin(FLARE_ANGLE)
    wall = np.array([x_wall - inward * flare, 0.0])
    side = np.array([x_wall + inward * height * math.tan(angle), height])
    return wall, side


def rounded_outline(points, radii, arcs, segments):
    """The corners of an outline filleted with the given radii, each arc
    sampled with its given count and each straight run between them with
    the same count, so sections of one pinch at any size line up point for
    point in the loft. Every fillet must fit its sides; section sees to
    it. A corner with no radius stays sharp."""
    n = len(points)
    pieces = []
    for i in range(n):
        before, point, after = points[i - 1], points[i], points[(i + 1) % n]
        if radii[i] == 0:
            pieces.append((point[None, :], point, point))
            continue
        incoming, outgoing = _unit(point - before), _unit(after - point)
        turn = math.atan2(
            incoming[0] * outgoing[1] - incoming[1] * outgoing[0], incoming @ outgoing
        )
        distance = radii[i] * math.tan(abs(turn) / 2)
        start, end = point - incoming * distance, point + outgoing * distance
        normal = np.array([-incoming[1], incoming[0]]) * np.sign(turn)
        centre = start + normal * radii[i]
        angle = math.atan2(*(start - centre)[::-1])
        angles = angle + np.linspace(0, turn, arcs[i] + 1)
        arc = centre + radii[i] * np.column_stack((np.cos(angles), np.sin(angles)))
        pieces.append((arc, start, end))
    contour = []
    for i, (arc, _, end) in enumerate(pieces):
        contour.extend(arc)
        following = pieces[(i + 1) % n][1]
        contour.extend(
            end + (following - end) * t for t in np.linspace(0, 1, segments + 1)[1:-1]
        )
    return np.asarray(contour)


def section(p, segments=8, share=1.0, arcs=None, narrow=1.0):
    """A section across the pinch, in (x, z) after overall scale: the
    outline, the indices where its top begins and ends (the tangent points
    of the two edge fillets), the middle of its back, and the largest edge
    rounding the sides and top have room for, before scale. Toward the
    ends the section shrinks to a share of its size about the middle of
    the top at the wall; its edges keep their rounding where it fits, so
    the ends round off smoothly instead of drawing the edges to points.
    The hourglass narrows the span alone, to the given share of it."""
    scale = p.size / 100
    span, depth = p.width * scale * share * narrow, p.depth * scale * share
    half = span / 2
    thumb = depth * (1 - p.offset / 100)
    thumb_angle, finger_angle = map(math.radians, (p.thumb_angle, p.finger_angle))
    radius = p.edge_radius * scale
    flare = p.base_flare * scale * share
    rise = p.top_rise * scale * share if p.shape != "flat" else 0.0
    edges = np.array([[-half, thumb], [half, depth]])
    feet = [
        -half - thumb * math.tan(thumb_angle),
        half + depth * math.tan(finger_angle),
    ]
    sides = []
    for foot, angle, top, inward in (
        (feet[0], thumb_angle, thumb, 1),
        (feet[1], finger_angle, depth, -1),
    ):
        if flare > 0:
            sides.append(_flare(foot, angle, FLARE_REACH * top, flare, inward))
        else:
            sides.append((np.array([foot, 0.0]), None))

    def outline(apex):
        # Clockwise from the thumb side's foot: up the thumb side, across
        # the top, down the finger side; the wall closes it.
        (thumb_wall, thumb_flare), (finger_wall, finger_flare) = sides
        points = [thumb_wall]
        if thumb_flare is not None:
            points.append(thumb_flare)
        points.append(edges[0])
        if apex is not None:
            points.append(apex)
        points.append(edges[1])
        if finger_flare is not None:
            points.append(finger_flare)
        points.append(finger_wall)
        return np.array(points)

    def fillets(apex):
        """Each corner's tangent length: the edges first, then the flares,
        then the top's apex, each kept to what its sides have room for."""
        points = outline(apex)
        n = len(points)
        turns = [_turn(points[i - 1], points[i], points[(i + 1) % n]) for i in range(n)]
        length = [np.linalg.norm(points[(i + 1) % n] - points[i]) for i in range(n)]
        flared = sides[0][1] is not None
        c = [1 + flared, n - 2 - flared]  # the two edges
        tangents = [0.0] * n
        caps = []
        for edge, face, top in ((c[0], c[0] - 1, c[0]), (c[1], c[1], c[1] - 1)):
            room = min(
                (0.7 if flared else 0.9) * length[face],
                (0.6 if apex is not None else 0.45) * length[top],
            )
            caps.append(room / max(math.tan(turns[edge] / 2), 1e-9))
            tangents[edge] = min(radius * math.tan(turns[edge] / 2), room)
        if flared:
            for corner, face, chamfer, edge in (
                (1, 1, 0, c[0]),
                (n - 2, n - 3, n - 2, c[1]),
            ):
                tangents[corner] = min(
                    0.9 * length[chamfer], 0.9 * length[face] - tangents[edge]
                )
        if apex is not None:
            k = c[0] + 1
            room = min(
                0.9 * length[c[0]] - tangents[c[0]],
                0.9 * length[k] - tangents[c[1]],
            )
            # A dome is the largest arc the top has room for; a ridge is
            # rounded like the edges.
            wanted = radius * math.tan(turns[k] / 2) if p.shape == "ridged" else room
            tangents[k] = max(0.0, min(wanted, room))
        radii = [
            t / math.tan(turn / 2) if t > 0 and turn > 1e-8 else 0.0
            for t, turn in zip(tangents, turns)
        ]
        return points, turns, tangents, radii, min(caps) / scale, c

    apex = None
    if rise > 0:
        # The apex sits over the middle of the chord between the edges,
        # raised until the rounded top stands rise above that chord.
        chord = edges.mean(axis=0)
        height = rise
        for _ in range(12):
            apex = chord + [0.0, height]
            _, turns, _, radii, _, c = fillets(apex)
            k = c[0] + 1
            drop = radii[k] * (1 / math.cos(turns[k] / 2) - 1)
            height = max(0.01, height + rise - (height - drop))
        apex = chord + [0.0, height]
    points, turns, tangents, radii, cap, c = fillets(apex)
    if arcs is None:
        # As the Crimp Lab samples its fillets: at least segments steps,
        # and no step wider than a sixth of 180 degrees over segments.
        arcs = [max(segments, math.ceil(t / (math.pi / (6 * segments)))) for t in turns]
    contour = rounded_outline(points, radii, arcs, segments)
    starts = (
        points[c[0]] + _unit(points[c[0] + 1] - points[c[0]]) * tangents[c[0]],
        points[c[1]] - _unit(points[c[1]] - points[c[1] - 1]) * tangents[c[1]],
    )
    top = [int(np.argmin(np.linalg.norm(contour - s, axis=1))) for s in starts]
    middle = (points[0][0] + points[-1][0]) / 2
    # The swoop bows each side in toward the middle, up to its edge's
    # rounding; the top and the wall stay put.
    sag = p.swoop * scale * share**2
    if sag > 0:
        index, z = np.arange(len(contour)), contour[:, 1]
        contour = contour.copy()
        thumb_side, finger_side = index <= top[0], index >= top[1]
        contour[thumb_side, 0] += sag * bow(z[thumb_side] / thumb)
        contour[finger_side, 0] -= sag * bow(z[finger_side] / depth)
    return contour, top, middle, cap, arcs


def waves(p, span):
    """Character's waviness, one wave along each side: x offsets as
    functions of the position up the wall, given as a share of half the
    pinch's height."""
    amplitude = p.character * min(WAVE_MAX, WAVE * span)
    rng = np.random.default_rng(p.seed)
    phase = rng.uniform(0, 2 * math.pi, (2, 2))
    frequency = rng.uniform([2, 5], [4, 8], (2, 2))

    def wave(side, u):
        f, a = frequency[side], phase[side]
        return (
            amplitude
            * (math.sin(f[0] * u + a[0]) + 0.4 * math.sin(f[1] * u + a[1]))
            / 1.4
        )

    return wave


def loft(p, quality):
    """The pinch body, its centre section in (x, z), the plan region a
    vertical line can cross from the wall out through the top without
    touching either side (where hardware may go) and its widest point, and
    the largest edge rounding that fits, before scale."""
    q = QUALITY[quality]
    contour, (first, last), middle, cap, arcs = section(p, q["segments"])
    scale = p.size / 100
    length = p.height * scale
    end = p.end_rounding / 100 * length / 2
    core = length / 2 - end
    # Each end rounds off as a quarter ellipse, sampled at even steps of its
    # slope rather than of its angle: a deep pinch with short ends turns
    # fastest where the end leaves the body, and even angle steps bent the
    # surface there past the viewer's smooth shading. One more section sits
    # halfway into the last step, where an undercut side meets the tip of
    # the end at a grazing angle and bent the last facets past it too.
    stand = max(p.depth, p.width / 2) * scale
    slope = np.linspace(0, math.pi / 2, q["cap"] + 2)[1:-1]
    slope = np.append(slope, (slope[-1] + math.pi / 2) / 2)
    theta = np.arctan(np.tan(slope) * end / stand) if end > 0 else slope
    steps = max(1, round(q["along"] * core / (length / 2)))
    ys = np.concatenate(
        (
            -core - end * np.sin(theta[::-1]),
            np.linspace(-core, core, steps + 1) if core > 1e-6 else [0.0],
            core + end * np.sin(theta),
        )
    )
    shares = np.concatenate(
        (np.cos(theta[::-1]), np.ones(steps + 1 if core > 1e-6 else 1), np.cos(theta))
    )
    # The waviness blends from the thumb side's wave to the finger side's
    # across the section, and fades to nothing at the wall, so the back and
    # its footprint stay as built.
    x, z = contour[:, 0], contour[:, 1]
    span = p.width * scale
    blend = np.clip((x - middle) / (span / 2), -1, 1)
    lift = z / z.max()
    wave = waves(p, span)
    index = np.arange(len(contour))
    off_wall = z > 1e-6
    thumb = off_wall & (index <= first)
    finger = off_wall & (index >= last)
    outlines = {(1.0, 1.0): contour}

    # The hourglass is back to full width where the ends start to round,
    # or halfway out along ends that round the whole way.
    flare = max(core, length / 4)

    def ring(y, share):
        u = y / (length / 2)
        key = (share, round(narrowing(p, y / flare), 9))
        if key not in outlines:
            outlines[key] = section(p, q["segments"], share, arcs, key[1])[0]
        outline = outlines[key]
        shift = (1 + blend) / 2 * wave(1, u) - (1 - blend) / 2 * wave(0, u)
        return np.column_stack(
            (
                outline[:, 0] + share * shift * lift,
                np.full(len(outline), y),
                outline[:, 1],
            )
        )

    rings = [ring(y, share) for y, share in zip(ys, shares)]
    # Hardware stays where the pinch stands near its full depth, so every
    # bore leaves through the top and not down the slope of an end.
    left, right, along = [], [], []
    for r, y, share in zip(rings, ys, shares):
        a, b = r[thumb, 0].max(), r[finger, 0].min()
        if share >= HARDWARE_SHARE and b - a > 1e-3:
            left.append(a)
            right.append(b)
            along.append(y)
    region = list(zip(right, along)) + list(zip(left[::-1], along[::-1]))
    vertices = np.vstack(([[0, -length / 2, 0]], *rings, [[0, length / 2, 0]]))
    n, count = len(contour), len(rings)
    faces = []
    for j in range(n):
        k = (j + 1) % n
        faces.append((0, 1 + k, 1 + j))
        for i in range(count - 1):
            a, b = 1 + i * n + j, 1 + i * n + k
            faces.extend(((a, b, b + n), (a, b + n, a + n)))
        a, b = 1 + (count - 1) * n + j, 1 + (count - 1) * n + k
        faces.append((a, b, len(vertices) - 1))
    mesh = trimesh.Trimesh(vertices, faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    solid = manifold.Manifold(
        manifold.Mesh(
            np.asarray(mesh.vertices, dtype=np.float32),
            np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError or solid.is_empty():
        raise ValueError(
            "The pinch could not form a closed solid. Try less extreme shape settings."
        )
    centre = ring(0.0, 1.0)[:, [0, 2]]
    if p.hourglass > 0:
        # The waist is the narrowest section, with the least room to round.
        cap = min(cap, section(p, q["segments"], 1.0, arcs, narrowing(p, 0))[3])
    widest = max((b - a for a, b in zip(left, right)), default=0.0)
    return solid, centre, np.array(region), widest, cap


def fit_waist(requested):
    """Ease any swoop, then any undercut, until the pinch keeps WAIST
    between its sides (or its own span, when that is narrower) everywhere
    below its edges, where the hourglass leaves it narrowest."""
    p = requested
    scale = p.size / 100
    span, depth = p.width * scale * narrowing(p, 0), p.depth * scale
    thumb = depth * (1 - p.offset / 100)
    least = min(WAIST, span)
    z = np.linspace(0, thumb, 61)
    for _ in range(300):
        t, f = map(math.radians, (p.thumb_angle, p.finger_angle))
        sag = p.swoop * scale
        feet = (-span / 2 - thumb * math.tan(t), span / 2 + depth * math.tan(f))
        left = feet[0] + (-span / 2 - feet[0]) * z / thumb + sag * bow(z / thumb)
        right = feet[1] + (span / 2 - feet[1]) * z / depth - sag * bow(z / depth)
        between = right - left
        if between.min() >= least - 1e-9:
            return p
        if p.swoop > 0:
            p = replace(p, swoop=max(0.0, p.swoop - 0.5))
            continue
        at_edge = between[-1]
        key = "thumb_angle" if p.thumb_angle <= p.finger_angle else "finger_angle"
        if at_edge < least - 1e-9:
            key = "finger_angle"
        p = replace(p, **{key: getattr(p, key) + 1})
    raise ValueError("The pinch is too undercut to stand on the wall.")


def mounting_proxy(solid, region):
    """The body cut down to the region where a vertical line meets only the
    wall and the top: the shared fitters then keep every recess, its
    shank and its bore clear of both sides, the edges and the waist."""
    top = solid.bounding_box()[5]
    column = manifold.Manifold.extrude(
        manifold.CrossSection([region.tolist()]), top + 2
    ).translate((0, 0, -1))
    return solid ^ column


def screw_targets(p, proxy, count):
    """Screws in a line up the middle of the pinch, spread up the wall
    where it levers: one in the middle, or evenly from one end of the line
    to the other. The outer two keep to the level part of the top, so each
    recess opens flat instead of out through an end's slope; with long
    rounded ends they spread down onto them, never closer in than 40% of
    the way along the hardware region nor further out than 65%."""
    lo, hi = np.array(proxy.bounding_box()).reshape(2, 3)
    x, y, half = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2
    length = p.height * p.size / 100
    level = length / 2 * (1 - p.end_rounding / 100) - p.head_diameter / 2
    reach = float(np.clip(level, half * 0.4, half * 0.65))
    if count == 1:
        return [(x, y)]
    return [(x, y + t) for t in np.linspace(-reach, reach, count)]


class Model:
    def __init__(self, mesh, p, requested, profile, holes, cap):
        self.mesh, self.parameters, self.profile = mesh, p, profile
        self.holes, self.cap = holes, cap
        # Only report changes the person did not ask for: an automatic seat
        # or screw count landing somewhere is the feature, not an adjustment.
        skipped = {"seat_depth"} if p.auto_seat else set()
        if p.auto_screw_count:
            skipped.add("screw_count")
        self.adjusted = {
            k: v
            for k, v in asdict(p).items()
            if k not in skipped and v != asdict(requested)[k]
        }

    def preview(self):
        return dict(
            vertices=np.round(self.mesh.vertices, 5).tolist(),
            faces=self.mesh.faces.tolist(),
            profile=np.round(self.profile, 5).tolist(),
            parameters=asdict(self.parameters),
            adjusted=self.adjusted,
            screws=[(h.x, h.y) for h in self.holes if not h.bolt],
            bolts=[(h.x, h.y) for h in self.holes if h.bolt],
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            material_grams=crimp.estimate_material(self.mesh),
            triangles=len(self.mesh.faces),
            watertight=bool(self.mesh.is_watertight),
            # Short sides or a narrow top cap the edge rounding; the lab
            # limits the slider to what was built.
            control_limits=(
                {"edge_radius": math.floor(self.cap * 10) / 10}
                if self.cap < LIMITS["edge_radius"][1]
                else {}
            ),
        )


def build(requested, quality="preview"):
    if quality not in QUALITY:
        raise ValueError("Unknown mesh quality.")
    requested = parse_parameters(asdict(requested))
    p = fit_waist(requested)
    # A wider pinch levers harder on the wall: chosen from the size, it
    # takes one more screw for every SCREW_STEP its span runs past
    # SCREW_SPAN, after overall scale. A bolt is only ever asked for.
    automatic = p.auto_screw_count and not p.bolt_mount
    if automatic:
        past = p.width * p.size / 100 - SCREW_SPAN
        count = 2 + max(0, math.ceil(past / SCREW_STEP))
        p = replace(p, screw_count=min(LIMITS["screw_count"][1], count))
    holes = []
    # The body may grow for the hardware, but never past what the sliders
    # allow: the design carries the settings built, and a reopened design
    # is clamped to the sliders, so growth past them would export a
    # different hold from the one previewed (RIL-78).
    for _ in range(120):
        solid, profile, region, widest, cap = loft(p, "preview")
        if not p.screws:
            break
        # A taller pinch has no wider top: a recess that cannot fit across
        # it never will.
        head = p.bolt_head_diameter if p.bolt_mount else p.head_diameter
        if widest < max(head + 3, p.shank_diameter + 4):
            raise ValueError(
                f"The {'bolt recess does' if p.bolt_mount else 'screw recesses do'} not fit across this pinch's top. Widen the span, lower the edge rounding, ease the undercut, or turn holes off."
            )
        depth = p.depth * p.size / 100
        target = (
            min(SEAT_MAX, round(SEAT_SHARE * depth * 2) / 2)
            if p.auto_seat
            else p.seat_depth
        )
        proxy = mounting_proxy(solid, region)
        # The bolt's anti-rotation screw sits in line below it, where the
        # lower of two screws would.
        targets = screw_targets(p, proxy, 2 if p.bolt_mount else p.screw_count)
        holes = (
            fit_bolt_and_screw(
                p,
                proxy,
                np.array(proxy.bounding_box()).reshape(2, 3),
                target,
                screw_target=np.array(targets[0]),
            )
            if p.bolt_mount
            else screw_layout(p, proxy, target, targets=targets)
        )
        grown = replace(p, height=min(LIMITS["height"][1], p.height + 4))
        # Screws belong in a line up the pinch. A layout that could only set
        # them side by side takes a taller pinch, as screws that do not fit
        # at all would, until the sliders run out; a count chosen from the
        # size gives up a screw first, down to two.
        rows = sorted(h.y for h in holes if not h.bolt)
        crowded = any(b - a < p.head_diameter + 2.99 for a, b in zip(rows, rows[1:]))
        if holes and (not crowded or grown == p):
            p = replace(p, seat_depth=holes[0].seat)
            break
        if automatic and p.screw_count > 2:
            p = replace(p, screw_count=p.screw_count - 1)
            continue
        if grown == p:
            raise ValueError(
                "Hardware could not fit this pinch, even at the tallest the sliders allow. Use fewer or smaller holes, widen the span, ease the undercut, or turn holes off."
            )
        p = grown
    else:
        raise ValueError("Hardware could not fit this pinch.")
    if quality == "export":
        solid, profile, region, widest, cap = loft(p, quality)
    if holes:
        solid = drill(solid, holes, solid.bounding_box()[5])
    # Every pinch body is a Manifold solid, so the shared check reads it
    # back as is: no vertex merge, no triangle removal (see RIL-31).
    message = "The pinch must remain one closed body."
    if len(solid.decompose()) != 1:
        raise ValueError(message)
    mesh = closed_mesh(solid, message)
    return Model(mesh, p, requested, profile, holes, cap)
