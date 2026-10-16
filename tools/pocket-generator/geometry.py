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
import trimesh

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
# A fillet on a sharp (undercut) edge starts further out than its radius;
# past this many radii the radius shrinks instead, so an overhanging lip
# keeps a rounded edge without eating the face around it.
LIP_SPAN = 1.4
# The least face left over the chamber around the lip, so an overhanging
# lower lip is a lip and not a sliver.
LIP_MEAT = 4.0
# The least wedge angle between the face and the cavity wall at the lip,
# so a lip under a steep crown is a lip and not a blade.
LIP_WEDGE = math.radians(25)
# The share of the pocket depth before the bowl begins.
THROAT = 0.3
# Odd arc counts put a vertex on each axis, so a mouth measures exactly
# what was asked for across and up.
QUALITY = {
    "preview": dict(sphere=16, ring=72, arc=13, slabs=10, chamber=32),
    "export": dict(sphere=32, ring=144, arc=25, slabs=32, chamber=72),
}
LIMITS = {control["key"]: (control["min"], control["max"]) for control in CONTROLS}


def sphere_points(radius, segments):
    return manifold.Manifold.sphere(radius, segments).to_mesh().vert_properties[:, :3]


def largest(section):
    polygons = section.to_polygons()
    if not polygons:
        raise ValueError("The pocket does not fit this body.")
    return np.asarray(max(polygons, key=len))


def lip_lean(p):
    """How far the lower lip overhangs the floor behind it, as an angle from
    vertical: the floor ramps down from the lip into the chamber's bottom
    over the front half of the depth. Nothing when the floor rises."""
    if p.through:
        return math.atan2(max(p.incut, 0), max(p.depth * p.size / 100, 1.0))
    return math.atan2(max(p.incut, 0), max(p.pocket_depth / 2, 1.0))


def lip_factor(p):
    """The lip's reach across the face relative to its radius: one on a
    square edge, more on the undercut lower lip, capped at LIP_SPAN."""
    return min(LIP_SPAN, 1 / math.tan((math.pi / 2 - lip_lean(p)) / 2))


def lip_limit(p):
    """The most lip rounding a pocket can take: the fillet must meet the
    cavity wall within half the pocket's depth, closer under an overhanging
    lip; no limit once the pocket opens to the wall."""
    if p.through:
        return LIMITS["lip_radius"][1]
    reach_down = lip_factor(p) * math.cos(lip_lean(p))
    return min(LIMITS["lip_radius"][1], p.pocket_depth / (2 * reach_down))


def lip_reach(p):
    """How far the lip rounding reaches across the face from the mouth."""
    return min(p.lip_radius, lip_limit(p)) * lip_factor(p)


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
    """The pocket cavity. Closed, it is the hull of the mouth and a rounded
    chamber behind it: an ellipsoid as tall as the opening plus the incut
    and as long as the pocket is deep, hung so its top is level with the
    upper lip and its bottom sits the incut below the lower lip, its ends
    rounding off with the stadium's. In section that is a C: the roof runs
    in and curls down the rounded back, the floor ramps down from the lower
    lip into the rounded bottom, and the deepest point is at the chamber's
    mid-height. A positive incut hooks the fingers behind the lip; a
    negative one lifts the floor away. Open to the wall, it is a stadium
    prism skewed by the incut over the body's depth."""
    q = QUALITY[quality]
    width, height = p.opening_width, p.opening_height
    run, rr = max(width - height, 0) / 2, min(width, height) / 2
    outline = stadium(width, height, q["arc"])
    if p.through:
        slope = p.incut / max(p.depth * p.size / 100, 1.0)
        near = np.column_stack(
            (
                outline[:, 0],
                outline[:, 1] + 25 * slope,
                np.full(len(outline), depth + 25),
            )
        )
        far = np.column_stack(
            (
                outline[:, 0],
                outline[:, 1] - (depth + 80) * slope,
                np.full(len(outline), -80.0),
            )
        )
        return manifold.Manifold.hull_points(np.vstack((near, far)))
    # The mouth at the face hulls with the chamber; the prism that carries
    # the opening up through the face is added separately, or the hull
    # would bulge below the lower lip at the face.
    mouth = np.column_stack((outline, np.full(len(outline), depth)))
    above = np.column_stack((outline, np.full(len(outline), depth + 25)))
    prism = manifold.Manifold.hull_points(np.vstack((mouth, above)))
    # A throat before the bowl: the chamber starts THROAT of the depth in,
    # so the lower lip keeps real thickness instead of thinning to a wedge.
    throat = THROAT * p.pocket_depth
    a, b = (p.pocket_depth - throat) / 2, (height + p.incut) / 2
    centre_y, centre_z = -p.incut / 2, depth - throat - a
    angles = np.linspace(0, 2 * math.pi, q["chamber"], endpoint=False)
    ellipse = np.column_stack((b * np.sin(angles), a * np.cos(angles)))
    ends = rr * np.sin(np.linspace(0, math.pi / 2, q["arc"]))
    stations = np.concatenate((-run - ends[::-1], run + ends))
    points = [mouth]
    for x in stations:
        scale = (
            math.sqrt(max(0.0, 1 - ((abs(x) - run) / rr) ** 2)) if abs(x) > run else 1.0
        )
        ring = ellipse * scale
        points.append(
            np.column_stack(
                (np.full(len(ring), x), centre_y + ring[:, 0], centre_z + ring[:, 1])
            )
        )
    return manifold.Manifold.hull_points(np.vstack(points)) + prism


def surface_height(solid, xy, fallback):
    """Z of the body's face above each (x, y), by ray cast from the front."""
    z = np.full(len(xy), float(fallback))
    for i, (x, y) in enumerate(xy):
        hits = solid.ray_cast((float(x), float(y), 1000.0), (float(x), float(y), -1.0))
        if hits:
            z[i] = hits[0].position[2]
    return z


def outward_normals(polygon):
    """Unit normals at a closed polygon's vertices, pointing out."""
    edges = np.roll(polygon, -1, axis=0) - polygon
    edge_normals = np.column_stack((edges[:, 1], -edges[:, 0]))
    edge_normals /= np.linalg.norm(edge_normals, axis=1)[:, None]
    normals = edge_normals + np.roll(edge_normals, 1, axis=0)
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    x, y = polygon[:, 0], polygon[:, 1]
    if np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) < 0:
        normals = -normals
    return normals


def loft(rings, lift=40.0):
    """One closed solid through rings that share a vertex count: a fan over
    the first, strips between neighbours, a skirt straight up from the
    last to a flat cap. Unlike a hull, a strip never reaches across a ring,
    so a ring draped over a curved face is followed, not undercut."""
    # Anticlockwise rings make the strips face out, the bottom fan face
    # down and the top fan face up; the volume sign catches the rest.
    x, y = rings[0][:, 0], rings[0][:, 1]
    if np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y) < 0:
        rings = [ring[::-1] for ring in rings]
    count = len(rings[0])
    top = rings[-1].copy()
    top[:, 2] = top[:, 2].max() + lift
    layers = rings + [top]
    vertices = np.vstack(
        layers + [rings[0].mean(axis=0, keepdims=True), top.mean(axis=0, keepdims=True)]
    )
    first, last = len(vertices) - 2, len(vertices) - 1
    faces = [(first, (k + 1) % count, k) for k in range(count)]
    for i in range(len(layers) - 1):
        for k in range(count):
            a, b = i * count + k, i * count + (k + 1) % count
            c, d = (i + 1) * count + (k + 1) % count, (i + 1) * count + k
            faces.extend([(a, b, c), (a, c, d)])
    base = (len(layers) - 1) * count
    faces.extend((last, base + k, base + (k + 1) % count) for k in range(count))
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
        raise ValueError("The lip could not form a closed solid.")
    return solid


def subdivide(polygon, spacing):
    """The polygon with every edge split into pieces no longer than spacing,
    so a ring draped over a curved face is sampled often enough to follow
    it: a long straight run sampled only at its ends sags below a dome."""
    points = []
    for a, b in zip(polygon, np.roll(polygon, -1, axis=0)):
        pieces = max(1, int(math.ceil(np.linalg.norm(b - a) / spacing)))
        points.extend(a + (b - a) * k / pieces for k in range(pieces))
    return np.array(points)


def mouth_outline(cut, face):
    """The opening where the cutter meets the face plane, finely sampled."""
    return subdivide(largest(cut.slice(face)), 2.5)


def wall_offsets(cut, face, mouth, normals, depths):
    """For each mouth vertex, how far along its outward normal the cavity
    wall sits at that vertex's depth below the face: negative where the
    wall has moved in (a floor rising with the floor angle, a roof curling
    down with the scoop), positive where it leans out (an undercut roof).
    Read off the cutter's own section, so any cavity shape is followed."""
    sections = {}
    offsets = np.zeros(len(mouth))
    for i, (m, n, d) in enumerate(zip(mouth, normals, depths)):
        key = round(float(d), 1)
        if key not in sections:
            polygon = largest(cut.slice(face - key))
            sections[key] = (polygon, np.roll(polygon, -1, axis=0) - polygon)
        a, e = sections[key]
        dm = a - m
        det = e[:, 0] * n[1] - e[:, 1] * n[0]
        ok = np.abs(det) > 1e-9
        t = np.where(
            ok, (e[:, 0] * dm[:, 1] - e[:, 1] * dm[:, 0]) / np.where(ok, det, 1), np.inf
        )
        s = np.where(ok, (n[0] * dm[:, 1] - n[1] * dm[:, 0]) / np.where(ok, det, 1), -1)
        hits = t[(s >= -1e-9) & (s <= 1 + 1e-9) & ok]
        offsets[i] = hits[np.argmin(np.abs(hits))] if len(hits) else 0.0
    return offsets


def lip_arcs(p, cut, face, mouth, deficit=None, slopes=None, with_wedge=False):
    """The fillet at every mouth vertex, in that vertex's outward-and-down
    plane, between the face and the cavity wall as the cutter really has
    it below that vertex. The face may sit below the apex plane there (a
    crown, a wobble: the deficit) and fall away outward (the slope), so the
    corner is where the wall meets that lower face, the wall is measured
    below it, and the arc ends tangent to the face's real slope. A wall
    leaning out (the undercut roof of a tilted pocket) makes a sharper
    edge, so a fillet of the same radius starts further out across the
    face and deeper down the wall. Returns the corner points, their
    outward normals, each arc's centre (out, down), its start and end
    angles, and the slope used."""
    lip = LIMITS["lip_radius"][1] if p is None else min(p.lip_radius, lip_limit(p))
    normals = outward_normals(mouth)
    if deficit is None:
        deficit = np.zeros(len(mouth))
    if slopes is None:
        slopes = np.zeros(len(mouth))
    base = wall_offsets(cut, face, mouth, normals, deficit)
    corners = mouth + normals * base[:, None]
    along = np.column_stack((np.ones(len(mouth)), slopes))
    along /= np.linalg.norm(along, axis=1)[:, None]
    into = np.column_stack((along[:, 1], -along[:, 0]))
    depths = np.full(len(mouth), float(lip))
    radii = np.full(len(mouth), float(lip))
    depths = np.full(len(mouth), float(lip))
    for _ in range(6):
        # The wall below each vertex as the straight line from the lip
        # corner to the wall at the tangent depth.
        here = wall_offsets(cut, face, mouth, normals, deficit + depths) - base
        below = wall_offsets(cut, face, mouth, normals, deficit + depths + 1.0) - base
        down = np.column_stack((here, -depths))
        down /= np.linalg.norm(down, axis=1)[:, None]
        # Where the wall's own direction at the tangent depth differs from
        # that line by more than 8 degrees, the wall bends between the lip
        # and the tangent point: a smaller fillet meets it where it is still
        # straight.
        local = np.column_stack((below - here, -np.ones(len(here))))
        local /= np.linalg.norm(local, axis=1)[:, None]
        bent = np.arccos(np.clip((down * local).sum(axis=1), -1, 1)) > math.radians(8)
        corner = np.arccos(np.clip((along * down).sum(axis=1), -1, 1))
        # On a sharp edge the fillet would start further out than LIP_SPAN
        # radii; shrink its radius there instead.
        spread = 1 / np.tan(corner / 2)
        radii = np.minimum(
            radii, np.where(spread > LIP_SPAN, lip * LIP_SPAN / spread, lip)
        )
        radii = np.where(bent, radii * 0.8, radii)
        tangent = radii * spread
        depths = np.maximum(0.5, -down[:, 1] * tangent)
    vertex = np.zeros((len(mouth), 2))
    centres = vertex + along * tangent[:, None] + into * radii[:, None]
    wall = vertex + down * tangent[:, None] - centres
    flat = vertex + along * tangent[:, None] - centres
    start = np.arctan2(wall[:, 1], wall[:, 0])
    end = np.arctan2(flat[:, 1], flat[:, 0])
    start = end + np.mod(start - end, 2 * math.pi)
    start = np.where(start - end > math.pi, start - 2 * math.pi, start)
    if with_wedge:
        return radii, corners, normals, centres, start, end, slopes, corner
    return radii, corners, normals, centres, start, end, slopes


def trumpet(p, solid, cut, depth, quality):
    """The lip: the fillet arcs from lip_arcs laid onto the real surface by
    ray cast, ring by ring from the wall's tangent point round to the
    face's, and lofted into one solid."""
    q = QUALITY[quality]
    face = float(surface_height(solid, np.array([[0.0, 0.0]]), depth)[0])
    mouth = mouth_outline(cut, face)
    heights = surface_height(solid, mouth, depth)
    deficit = face - heights
    slopes = face_slopes(p, solid, depth, cut, face, mouth, deficit)
    radii, corners, normals, centres, start, end, slopes = lip_arcs(
        p, cut, face, mouth, deficit, slopes
    )
    # Ring heights: the wall end of each arc stays in the frame the wall
    # was measured in (the corner's face height plus the arc), the face end
    # lands on the real surface, and the drape ramps in between, so the
    # fillet meets the wall exactly and the face wherever it really is. The
    # first ring sits a touch inside the cavity along the wall's normal and
    # the last a touch below the surface, so the skirt crosses it and the cutter meets both
    # surfaces instead of lying on them: coincident faces leave needle-thin
    # slivers behind.
    corner_z = surface_height(solid, corners, depth)
    rings = []
    for i in range(q["slabs"] + 1):
        a = start + (end - start) * i / q["slabs"]
        u = centres[:, 0] + radii * np.cos(a)
        w = centres[:, 1] + radii * np.sin(a)
        if i == 0:
            u, w = u + 0.2 * np.cos(start), w + 0.2 * np.sin(start)
        if i == q["slabs"]:
            w = w - 0.1
        xy = corners + normals * u[:, None]
        drape = surface_height(solid, xy, depth) - (corner_z + slopes * u)
        z = corner_z + w + drape * (i / q["slabs"])
        rings.append(np.column_stack((xy, z)))
    return loft(rings)


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


def face_slopes(p, solid, depth, cut, face, mouth, deficit):
    """The face's slope at each arc's outer end, read by ray cast a
    millimetre either side of the point where the fillet meets the face,
    refined once as that point moves with the slope. A ray that misses the
    body (the sample fell off the rim) falls back to the slope of the chord
    from the lip corner."""
    slopes = np.zeros(len(mouth))
    inner = surface_height(solid, mouth, depth)
    for _ in range(2):
        _, corners, normals, centres, _, _, _ = lip_arcs(
            p, cut, face, mouth, deficit, slopes
        )
        span = np.maximum(centres[:, 0], 1.0)
        ahead = surface_height(solid, corners + normals * (span + 1)[:, None], np.nan)
        behind = surface_height(solid, corners + normals * (span - 1)[:, None], np.nan)
        at = surface_height(solid, corners + normals * span[:, None], np.nan)
        chord = np.nan_to_num((at - inner) / span, nan=0.0)
        local = (ahead - behind) / 2
        slopes = np.clip(np.where(np.isnan(local), chord, local), -1.5, 1.5)
    return slopes


def lip_check(p, cut):
    """What the lip would be on the body this setting builds: the least
    face left over the cavity along the lip rim, and the least wedge angle
    between the face and the cavity wall at the lip, both with the face's
    real slope. The cutter here has its face plane at z=0."""
    solid, s = body(p, "preview")
    depth = s["depth"]
    mouth = mouth_outline(cut, 0.0)
    heights = surface_height(solid, mouth, depth)
    deficit = depth - heights
    slopes = face_slopes(p, solid, depth, cut, 0.0, mouth, deficit)
    _, corners, normals, centres, _, _, _, wedge = lip_arcs(
        p, cut, 0.0, mouth, deficit, slopes, with_wedge=True
    )
    rim = corners + normals * centres[:, :1]
    face = surface_height(solid, rim, depth)
    meat = np.full(len(rim), np.inf)
    for i, (x, y) in enumerate(rim):
        hits = cut.ray_cast(
            (float(x), float(y), -0.01), (float(x), float(y), -depth - 1)
        )
        if hits:
            meat[i] = face[i] - (depth + hits[0].position[2])
    return float(meat.min()), float(wedge.min())


def fit_pocket(requested):
    """Grow the body so the pocket fits, before any solid is built: depth for
    the floor, then width and height for the mouth, its lip and the margin
    of face around them, and for an open pocket's exit through the back.
    Growth stops at the sliders' maximums; past that the opening shrinks."""
    p = requested
    scale = p.size / 100
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
        # The cutter itself, with the face plane at z=0 and only the part
        # inside the body kept: its section at the face is the mouth, its
        # shadow is everything the cavity needs below the face.
        cut = slot(p, 0.0, "preview").trim_by_plane((0, 0, 1), -s["depth"])
        _, corners, normals, centres, _, _, _ = lip_arcs(
            p, cut, 0.0, mouth_outline(cut, 0.0)
        )
        rim = manifold.CrossSection([(corners + normals * centres[:, :1]).tolist()])
        checks = [
            (rim.offset(MARGIN, manifold.JoinType.Round, 2.0, 16), s["front"]),
            (
                cut.project().offset(MARGIN, manifold.JoinType.Round, 2.0, 16),
                s["back"] if p.through else s["front"],
            ),
        ]
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
            # Enough face around the mouth; now enough face over the chamber
            # along the lip rim, where a crowned face falls toward the
            # chamber's top. Deeper bodies first, then less incut.
            if p.through:
                return p
            meat, wedge = lip_check(p, cut)
            if meat >= LIP_MEAT and wedge >= LIP_WEDGE:
                return p
            # Too little face over the chamber: a deeper body; too thin a
            # wedge at the lip: less incut (depth does not change an angle).
            if meat < LIP_MEAT and p.depth < LIMITS["depth"][1]:
                p = replace(p, depth=p.depth + 1.0)
            elif p.incut > LIMITS["incut"][0]:
                p = replace(p, incut=p.incut - 1.0)
            else:
                raise ValueError(
                    "The pocket does not fit this body, even at the deepest the sliders allow. Reduce the crown or the incut."
                )
            continue
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
    # One body, after dropping the specks a grazing contact between the lip
    # and the cavity wall can leave behind (no volume to speak of).
    message = "The pocket hold must remain one closed body."
    pieces = [piece for piece in pocketed.decompose() if piece.volume() > 1.0]
    if len(pieces) != 1:
        raise ValueError(message)
    mesh = closed_mesh(pieces[0], message)
    return Model(mesh, p, requested, profile, holes, floor)
