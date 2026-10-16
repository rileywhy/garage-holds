"""Rounded edge profiles swept across a tapered footprint, then drilled.

X runs across the hold, Y up the wall, Z out of the wall. Hardware fitting
uses the same preview body for both output qualities, so exports agree.
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

from tools.hold_mounting import closed_mesh, drill, fit_bolt_and_screw, screw_layout


def shaped_body(p, quality):
    scale = p.size / 100
    width, height, depth = np.array([p.width, p.body_height, p.edge_depth]) * scale
    segments = 64 if quality == "preview" else 112
    if p.shape == "dish":
        # Low, convex dish: a broad spherical dome compressed in projection.
        # No positive rim or scoop; the surface slopes away in every direction.
        radius = width / 2
        solid = (
            manifold.Manifold.sphere(radius, segments)
            .scale((1, 1, depth / radius))
            .trim_by_plane((0, 0, 1), 0)
        )
        used_radius = radius
    elif p.shape == "ball":
        # A spherical cap, with a genuinely circular section. Toe depth sets
        # the cut through the sphere; width is the sphere's full diameter.
        radius = width / 2
        depth = min(depth, radius * 1.7)
        solid = (
            manifold.Manifold.sphere(radius, segments)
            .translate((0, 0, depth - radius))
            .trim_by_plane((0, 0, 1), 0)
        )
        used_radius = radius
    elif p.shape == "rectangle":
        # A plain block: flat back, vertical sides, and every standing edge
        # and top edge rounded by the lip radius, so there is no sharp arris
        # to grab or snap. The hull of eight spheres: four at the top corners
        # and four centred on the back plane, so the trim at z=0 leaves a
        # crisp back face of the full footprint.
        used_radius = max(
            0.5,
            min(p.lip_radius * scale, width / 2 - 0.5, height / 2 - 0.5, depth - 0.5),
        )
        sphere = (
            manifold.Manifold.sphere(used_radius, 16 if quality == "preview" else 24)
            .to_mesh()
            .vert_properties[:, :3]
        )
        corners = [
            (sx * (width / 2 - used_radius), sy * (height / 2 - used_radius), z)
            for sx in (-1, 1)
            for sy in (-1, 1)
            for z in (0.0, depth - used_radius)
        ]
        solid = manifold.Manifold.hull_points(
            np.vstack([sphere + corner for corner in corners])
        ).trim_by_plane((0, 0, 1), 0)
    else:
        # Uneven rock footprint with an off-centre tooth and a second ledge.
        # Hulls of small spheres bevel the ridge without losing broad facets.
        rise = math.tan(math.radians(p.incut)) * depth * 0.35
        rng = np.random.default_rng(p.seed)
        points = np.array(
            [
                [-0.48, -0.35, 0],
                [-0.30, -0.52, 0],
                [0.34, -0.43, 0],
                [0.49, 0.08, 0],
                [0.22, 0.48, 0],
                [-0.38, 0.39, 0],
                [-0.32, -0.20, 0.60],
                [0.28, -0.27, 0.48],
                [-0.24, 0.17, 0.72],
                [0.12, 0.30, 1.0],
                [0.37, 0.10, 0.68],
                [-0.04, -0.10, 0.82],
            ]
        ) * [width, height, depth]
        points[6:, 0] += rng.uniform(-0.06, 0.06, 6) * width * p.character
        points[6:, 1] += rng.uniform(-0.06, 0.06, 6) * height * p.character
        points[9, 1] += rise
        used_radius = min(p.lip_radius * scale, min(width, height, depth) * 0.12)
        sphere = (
            manifold.Manifold.sphere(used_radius, 16 if quality == "preview" else 24)
            .to_mesh()
            .vert_properties[:, :3]
        )
        solid = manifold.Manifold.hull_points(
            np.vstack([sphere + point for point in points])
        ).trim_by_plane((0, 0, 1), 0)
    contours = solid.rotate((0, 90, 0)).slice(0).to_polygons()
    profile = np.asarray(max(contours, key=len))[:, ::-1]
    return solid, profile, used_radius


def body(p, quality):
    if p.shape != "edge":
        return shaped_body(p, quality)
    factor = p.size / 100
    width, height, depth, radius = (
        np.array([p.width, p.body_height, p.edge_depth, p.lip_radius]) * factor
    )
    # Angle stays independent of body size. Steep slope presets grow a back
    # face instead of folding the profile over itself.
    rise = depth * math.tan(math.radians(p.incut))
    height = max(height, abs(rise) + 12 * factor)
    points = np.array(
        [
            [-height / 2, 0],
            [height / 2 - max(rise, 0), 0],
            [height / 2 + min(rise, 0), depth],
            [-height / 2 + height * 0.16, depth * 0.65],
        ]
    )
    profile, radii = crimp._rounded_outline(
        points,
        [0, radius * 0.6, radius, radius * 1.8],
        12 if quality == "preview" else 22,
    )
    # Clockwise/anticlockwise is normalized by trimesh after capping.
    rings = []
    count = 41 if quality == "preview" else 73
    lean = np.random.default_rng(p.seed).uniform(-1, 1) * p.character
    for theta in np.linspace(-math.pi / 2, math.pi / 2, count):
        u = math.sin(theta)
        rounding = p.end_rounding / 100
        end = 1 - rounding * (1 - max(0.02, math.cos(theta)))
        yz = profile.copy()
        yz[:, 0] *= end
        yz[:, 1] *= end * (1 - p.crown / 100 * u * u)
        x = width / 2 * u * (1 - p.taper / 100 * (yz[:, 0] / height + 0.5))
        yz[:, 0] += lean * height * 0.12 * u
        rings.append(np.column_stack((x, yz)))
    vertices = np.vstack(rings)
    n = len(profile)
    faces = []
    for i in range(count - 1):
        for j in range(n):
            a, b, c, d = (
                i * n + j,
                i * n + (j + 1) % n,
                (i + 1) * n + (j + 1) % n,
                (i + 1) * n + j,
            )
            faces.extend([(a, b, c), (a, c, d)])
    # End profiles are convex rounded quadrilaterals; fan caps stay on their plane.
    for i in (0, count - 1):
        center = len(vertices)
        vertices = np.vstack((vertices, rings[i].mean(axis=0)))
        for j in range(n):
            faces.append(
                (center, i * n + j, i * n + (j + 1) % n)
                if i != 0
                else (center, i * n + (j + 1) % n, i * n + j)
            )
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=True)
    if mesh.volume < 0:
        mesh.invert()
    solid = manifold.Manifold(
        manifold.Mesh(
            np.asarray(mesh.vertices, dtype=np.float32),
            np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if solid.status() != manifold.Error.NoError:
        raise ValueError("Could not close the foothold body.")
    return solid, profile, radii[2]


class Model:
    def __init__(self, mesh, p, requested, profile, radius, holes):
        self.mesh, self.parameters, self.profile = mesh, p, profile
        self.radius, self.holes = radius, holes
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
            profile=self.profile.tolist(),
            parameters=asdict(self.parameters),
            adjusted=self.adjusted,
            screws=[(h.x, h.y) for h in self.holes if not h.bolt],
            bolts=[(h.x, h.y) for h in self.holes if h.bolt],
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            material_grams=crimp.estimate_material(self.mesh),
            triangles=len(self.mesh.faces),
            watertight=bool(self.mesh.is_watertight),
            lip_radius=round(self.radius, 2),
        )


def build(requested, quality="preview"):
    if quality not in ("preview", "export"):
        raise ValueError("Unknown mesh quality.")
    requested = parse_parameters(asdict(requested))
    p = replace(
        requested,
        body_height=max(
            requested.body_height,
            abs(requested.edge_depth * math.tan(math.radians(requested.incut))) + 12,
        ),
    )
    if p.shape != "edge":
        p = replace(p, body_height=requested.body_height)
    if p.auto_screw_count and not p.bolt_mount:
        p = replace(p, screw_count=2 if p.width * p.size / 100 >= 50 else 1)
    holes = []
    # The body may grow for the hardware, but never past what the sliders
    # allow: the design carries the settings built, and a reopened design
    # is clamped to the sliders, so growth past them would export a
    # different hold from the one previewed (RIL-78).
    limits = {control["key"]: control["max"] for control in CONTROLS}
    for attempt in range(120):
        solid, profile, radius = body(p, "preview")
        if not p.screws:
            break
        target = (
            min(8, p.edge_depth * p.size / 100 * 0.25) if p.auto_seat else p.seat_depth
        )
        holes = (
            fit_bolt_and_screw(
                p, solid, np.array(solid.bounding_box()).reshape(2, 3), target
            )
            if p.bolt_mount
            else screw_layout(p, solid, target)
        )
        if holes:
            p = replace(p, seat_depth=holes[0].seat)
            break
        # Hardware doesn't shrink. Grow the body explicitly and echo that change.
        grown = replace(
            p,
            width=min(limits["width"], p.width + 2),
            body_height=min(limits["body_height"], p.body_height + 4),
            edge_depth=min(limits["edge_depth"], p.edge_depth + 0.5),
        )
        if grown == p:
            raise ValueError(
                "Hardware could not fit this body, even at the largest size the sliders allow. Use fewer holes or smaller recesses, or turn holes off."
            )
        p = grown
    else:
        raise ValueError("Hardware could not fit this body.")
    if quality == "export":
        solid, profile, radius = body(p, quality)
    if holes:
        solid = drill(solid, holes, solid.bounding_box()[5])
    # Every foothold body is a Manifold solid, so the shared check reads it
    # back as is: no vertex merge, no triangle removal (see RIL-31).
    message = "Foothold must remain one closed body."
    if len(solid.decompose()) != 1:
        raise ValueError(message)
    mesh = closed_mesh(solid, message)
    return Model(mesh, p, requested, profile, radius, holes)
