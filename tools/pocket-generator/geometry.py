"""A puck with one finger pocket cut into its face, then drilled.

X runs across the hold, Y up the wall, Z out of the wall; the back sits on
Z=0. The pocket is a rounded slot pushed in along a floor axis tilted by the
floor angle, with the lip rounding built into the cutter as a stacked
trumpet draped onto the face. Hardware is fitted on a proxy body with the
pocket's full-height shadow removed, so no recess can open into the cavity,
and the real body is drilled. Hardware fitting uses the preview body for
both output qualities, so exports agree with previews.
"""

import math
from dataclasses import asdict, replace

import manifold3d as manifold
import numpy as np

if __package__:
    from .crimp_engine import geometry as crimp
    from .parameters import CONTROLS, parse_parameters
else:
    from crimp_engine import geometry as crimp
    from parameters import CONTROLS, parse_parameters

from tools.hold_mounting import (
    _inside,
    closed_mesh,
    drill,
    fit_bolt_and_screw,
    screw_layout,
)

# The least material behind a closed pocket, and the least face around the
# mouth (or back around an open pocket's exit). Both are printability, not
# strength ratings.
FLOOR = 6.0
MARGIN = 6.0
QUALITY = {
    "preview": dict(sphere=16, ring=72, arc=12, slabs=8),
    "export": dict(sphere=32, ring=144, arc=24, slabs=12),
}
LIMITS = {control["key"]: (control["min"], control["max"]) for control in CONTROLS}


def sphere_points(radius, segments):
    return manifold.Manifold.sphere(radius, segments).to_mesh().vert_properties[:, :3]


def largest(section):
    polygons = section.to_polygons()
    if not polygons:
        raise ValueError("The pocket does not fit this body.")
    return np.asarray(max(polygons, key=len))


def lip_limit(p):
    """The most lip rounding a pocket can take: half its depth, so the
    fillet's lowest ring still meets the cavity wall; no limit once the
    pocket opens to the wall."""
    if p.through:
        return LIMITS["lip_radius"][1]
    return min(LIMITS["lip_radius"][1], p.pocket_depth / 2)


def stadium(width, height, arc=24):
    """A rounded slot outline: semicircles joined by straight runs along the
    longer side, a circle when the sides are equal."""
    rr = min(width, height) / 2
    points = []
    if width >= height:
        runs = (
            (1, -math.pi / 2, width / 2 - rr, 0),
            (-1, math.pi / 2, width / 2 - rr, 0),
        )
        for sx, start, dx, dy in runs:
            for a in np.linspace(start, start + math.pi, arc):
                points.append((sx * dx + rr * math.cos(a), dy + rr * math.sin(a)))
    else:
        runs = ((1, 0, 0, height / 2 - rr), (-1, math.pi, 0, height / 2 - rr))
        for sy, start, dx, dy in runs:
            for a in np.linspace(start, start + math.pi, arc):
                points.append((dx + rr * math.cos(a), sy * dy + rr * math.sin(a)))
    return np.array(points)


def shell(p, count):
    """The body's outlines after overall scale, before any solid is built:
    the footprint at the wall, the ring of sphere centres inset from it,
    the smaller ring at the rim, the face outline, and the sizes the hull
    is built from. The seed's wobble and crown drift are drawn here, in one
    order, so the fit and the body agree."""
    scale = p.size / 100
    width, height, depth = p.width * scale, p.height * scale, p.depth * scale
    rim = depth * (1 - p.crown / 100)
    rng = np.random.default_rng(p.seed)
    phase = rng.uniform(0, 2 * math.pi, 2)
    drift = rng.uniform(-1, 1, 2) * 0.1 * p.character * np.array([width, height]) / 2
    # A superellipse: a circle or oval at full roundness, squarer below.
    n = 2 + (1 - p.roundness / 100) * 6
    t = np.linspace(0, 2 * math.pi, count, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    x = width / 2 * np.sign(c) * np.abs(c) ** (2 / n)
    y = height / 2 * np.sign(s) * np.abs(s) ** (2 / n)
    wobble = 1 + 0.08 * p.character * (
        0.6 * np.sin(2 * t + phase[0]) + 0.4 * np.sin(3 * t + phase[1])
    )
    outline = np.column_stack((x * wobble, y * wobble))
    # The rim radius must leave a ring of sphere centres inside the
    # footprint, wobble included, or the inset outline vanishes.
    radius = max(
        1.0,
        min(p.edge_rounding * scale, rim - 1, np.min(np.hypot(*outline.T)) - 1.5),
    )
    back = manifold.CrossSection([outline.tolist()])
    ring = largest(back.offset(-radius, manifold.JoinType.Round, 2.0, 32))
    top = ring * (1 - p.taper / 100)
    front = manifold.CrossSection([top.tolist()]).offset(
        radius, manifold.JoinType.Round, 2.0, 32
    )
    return dict(
        depth=depth,
        rim=rim,
        radius=radius,
        drift=drift,
        ring=ring,
        top=top,
        back=back,
        front=front,
    )


def body(p, quality):
    """The puck: the hull of spheres along the inset footprint at the wall
    and along the smaller ring at the rim, with rings rising to the crown.
    Convex, so always one closed solid; trimmed flat at the wall."""
    q = QUALITY[quality]
    s = shell(p, q["ring"])
    radius, rim, depth, top, drift = (
        s["radius"],
        s["rim"],
        s["depth"],
        s["top"],
        s["drift"],
    )
    centres = [
        np.column_stack((s["ring"], np.zeros(len(top)))),
        np.column_stack((top, np.full(len(top), rim - radius))),
    ]
    for scale in (0.7, 0.4):
        z = rim - radius + (depth - rim) * (1 - scale * scale)
        centres.append(
            np.column_stack((top * scale + drift * (1 - scale), np.full(len(top), z)))
        )
    centres.append(np.array([[drift[0], drift[1], depth - radius]]))
    sphere = sphere_points(radius, q["sphere"])
    points = np.vstack([sphere + centre for group in centres for centre in group])
    solid = manifold.Manifold.hull_points(points).trim_by_plane((0, 0, 1), 0)
    return solid, s


def slot(p, depth, quality):
    """The pocket cavity, tilted by the floor angle about the mouth's centre
    on the face plane: a stadium prism with a rounded bottom, or one that
    runs on through the back when the pocket opens to the wall."""
    q = QUALITY[quality]
    width, height = p.opening_width, p.opening_height
    rr = min(width, height) / 2
    outline = stadium(width, height, q["arc"])
    mouth = np.column_stack((outline, np.full(len(outline), depth + 25)))
    if p.through:
        far = np.column_stack((outline, np.full(len(outline), -depth - 80)))
        cut = manifold.Manifold.hull_points(np.vstack((mouth, far)))
    else:
        sphere = sphere_points(rr, q["sphere"])
        ends = (
            [(sx * (width / 2 - rr), 0) for sx in (-1, 1)]
            if width >= height
            else [(0, sy * (height / 2 - rr)) for sy in (-1, 1)]
        )
        deep = [sphere + (x, y, depth - p.pocket_depth + rr) for x, y in ends]
        cut = manifold.Manifold.hull_points(np.vstack(deep + [mouth]))
    return (
        cut.translate((0, 0, -depth))
        .rotate((p.floor_angle, 0, 0))
        .translate((0, 0, depth))
    )


def surface_height(solid, xy, fallback):
    """Z of the body's face above each (x, y), by ray cast from the front."""
    z = np.full(len(xy), float(fallback))
    for i, (x, y) in enumerate(xy):
        hits = solid.ray_cast((float(x), float(y), 1000.0), (float(x), float(y), -1.0))
        if hits:
            z[i] = hits[0].position[2]
    return z


def trumpet(p, solid, cut, depth, quality):
    """The lip: rings grown outward from the mouth along a quarter circle of
    the lip radius and dropped below the face by the same circle, each
    draped onto the real surface. The hulls between neighbouring rings are
    convex, and their union leaves a rounded edge on the body."""
    q = QUALITY[quality]
    lip = min(p.lip_radius, lip_limit(p))
    # Each ring starts from the tilted slot's own section at its height, so
    # the fillet leaves the cavity wall tangentially wherever the floor
    # angle has moved that wall; stacking one mouth outline straight down
    # left a ridge where the two crossed.
    face = float(surface_height(solid, np.array([[0.0, 0.0]]), depth)[0])
    rings = []
    for i in range(q["slabs"] + 1):
        a = math.pi / 2 * i / q["slabs"]
        grow, drop = lip * (1 - math.cos(a)), lip * (1 - math.sin(a))
        section = cut.slice(face - drop)
        outline = largest(
            section.offset(grow, manifold.JoinType.Round, 2.0, 32) if grow else section
        )
        rings.append(
            np.column_stack((outline, surface_height(solid, outline, depth) - drop))
        )
    pieces = [
        manifold.Manifold.hull_points(np.vstack((rings[i], rings[i + 1])))
        for i in range(q["slabs"])
    ]
    lid = rings[-1].copy()
    lid[:, 2] += 40
    pieces.append(manifold.Manifold.hull_points(np.vstack((rings[-1], lid))))
    return manifold.Manifold.batch_boolean(pieces, manifold.OpType.Add)


def pocket(p, quality):
    """The body with its pocket cut, the cutter, the centre profile and the
    floor left behind the pocket (zero when it opens to the wall)."""
    solid, s = body(p, quality)
    depth = s["depth"]
    cut = slot(p, depth, quality)
    cut = cut + trumpet(p, solid, cut, depth, quality)
    pocketed = solid - cut
    floor = 0.0 if p.through else max(0.0, cut.bounding_box()[2])
    profile = largest(pocketed.rotate((0, 90, 0)).slice(0))[:, ::-1]
    return solid, cut, pocketed, profile, floor


def mounting_proxy(solid, cut, depth):
    """The body with the pocket's shadow removed at every height, so the
    shared fitter keeps every recess and shank clear of the cavity."""
    column = manifold.Manifold.extrude(cut.project(), depth + 120).translate(
        (0, 0, -100)
    )
    return solid - column


def outside(points, section):
    return ~_inside(np.asarray(points, dtype=float), section.to_polygons())


def fit_pocket(requested):
    """Grow the body so the pocket fits, before any solid is built: depth for
    the floor, then width and height for the mouth, its lip and the margin
    of face around them, and for an open pocket's exit through the back.
    Growth stops at the sliders' maximums; past that the opening shrinks."""
    p = requested
    scale = p.size / 100
    angle = math.radians(p.floor_angle)
    rr = min(p.opening_width, p.opening_height) / 2
    if not p.through:
        # How far below the face plane the tilted cutter reaches, measured
        # on the cutter itself: a tall opening dips further than a wide one.
        dip = -slot(p, 0.0, "export").bounding_box()[2]
        depth = max(p.depth, math.ceil((dip + FLOOR) / scale))
        if depth > LIMITS["depth"][1]:
            # The body is as deep as its slider allows: the pocket gives.
            depth = LIMITS["depth"][1]
            while (
                dip + FLOOR > depth * scale
                and p.pocket_depth > LIMITS["pocket_depth"][0]
            ):
                p = replace(p, pocket_depth=p.pocket_depth - 1)
                dip = -slot(p, 0.0, "export").bounding_box()[2]
        p = replace(p, depth=float(depth))
    for _ in range(400):
        s = shell(p, 72)
        rise = math.tan(angle)
        mouth = manifold.CrossSection(
            [stadium(p.opening_width, p.opening_height / math.cos(angle), 12).tolist()]
        )
        checks = [
            (
                mouth.offset(p.lip_radius + MARGIN, manifold.JoinType.Round, 2.0, 16),
                s["front"],
            )
        ]
        if p.through:
            exit_ = mouth.translate((0, s["depth"] * rise))
            checks.append(
                (exit_.offset(MARGIN, manifold.JoinType.Round, 2.0, 16), s["back"])
            )
        else:
            # The rounded bottom's shadow: its end spheres project at full
            # size wherever the axis points, only shifted up or down the
            # wall; a tall opening's straight run foreshortens between them.
            width, height = p.opening_width, p.opening_height
            if height > width:
                height = width + (height - width) * math.cos(angle)
            deep = manifold.CrossSection(
                [stadium(width, height, 12).tolist()]
            ).translate((0, (p.pocket_depth - rr) * math.sin(angle)))
            checks.append(
                (deep.offset(MARGIN, manifold.JoinType.Round, 2.0, 16), s["front"])
            )
        worst = None
        for region, within in checks:
            points = largest(region)
            bad = points[outside(points, within)]
            if len(bad):
                lo, hi = np.array(within.bounds()).reshape(2, 2)
                half = (hi - lo) / 2
                ratios = np.abs(bad) / half
                worst = ratios.max(axis=0)
                break
        if worst is None:
            return p
        key = "width" if worst[0] >= worst[1] else "height"
        value = getattr(p, key)
        if value < LIMITS[key][1]:
            p = replace(p, **{key: min(LIMITS[key][1], value + 1)})
            continue
        # The body is as big as its slider allows: the opening gives instead.
        opening = "opening_width" if key == "width" else "opening_height"
        current = getattr(p, opening)
        if current <= LIMITS[opening][0]:
            raise ValueError(
                "The opening does not fit this body, even at the largest size the sliders allow. Narrow the opening, lower the lip rounding or reduce the taper."
            )
        p = replace(p, **{opening: max(LIMITS[opening][0], current - 1)})
    raise ValueError("The opening does not fit this body.")


class Model:
    def __init__(self, mesh, p, requested, profile, holes, floor):
        self.mesh, self.parameters, self.profile = mesh, p, profile
        self.holes, self.floor = holes, floor
        # Only report changes the person did not ask for: an automatic seat
        # landing somewhere is the feature, not an adjustment.
        skipped = {"seat_depth"} if p.auto_seat else set()
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
            floor=round(float(self.floor), 1),
            # A shallow pocket caps its lip rounding; the lab limits the
            # slider to what was built.
            control_limits=(
                {"lip_radius": round(limit, 1)}
                if (limit := lip_limit(self.parameters)) < LIMITS["lip_radius"][1]
                else {}
            ),
        )


def build(requested, quality="preview"):
    if quality not in QUALITY:
        raise ValueError("Unknown mesh quality.")
    requested = parse_parameters(asdict(requested))
    p = fit_pocket(requested)
    holes = []
    # The body may grow for the hardware, but never past what the sliders
    # allow: the design carries the settings built, and a reopened design
    # is clamped to the sliders, so growth past them would export a
    # different hold from the one previewed (RIL-78).
    for _ in range(120):
        solid, cut, pocketed, profile, floor = pocket(p, "preview")
        if not p.screws:
            break
        depth = p.depth * p.size / 100
        target = min(8, depth * 0.25) if p.auto_seat else p.seat_depth
        proxy = mounting_proxy(solid, cut, depth)
        holes = (
            fit_bolt_and_screw(
                p, proxy, np.array(proxy.bounding_box()).reshape(2, 3), target
            )
            if p.bolt_mount
            else screw_layout(p, proxy, target)
        )
        if holes:
            p = replace(p, seat_depth=holes[0].seat)
            break
        grown = replace(
            p,
            width=min(LIMITS["width"][1], p.width + 2),
            height=min(LIMITS["height"][1], p.height + 2),
        )
        if grown == p:
            raise ValueError(
                "Hardware could not fit this body, even at the largest size the sliders allow. Use fewer holes or smaller recesses, or turn holes off."
            )
        p = grown
    else:
        raise ValueError("Hardware could not fit this body.")
    if quality == "export":
        solid, cut, pocketed, profile, floor = pocket(p, quality)
    if holes:
        pocketed = drill(pocketed, holes, pocketed.bounding_box()[5])
    # The body is a Manifold solid throughout, so the shared check reads it
    # back as is: no vertex merge, no triangle removal (see RIL-31).
    message = "The pocket hold must remain one closed body."
    if len(pocketed.decompose()) != 1:
        raise ValueError(message)
    mesh = closed_mesh(pocketed, message)
    return Model(mesh, p, requested, profile, holes, floor)
