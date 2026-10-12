"""A rounded surface over an oval, closed by a flat mounting face.

X across the board, Y up, Z out; the back is always Z=0. No HTTP or GUI state.
The rounded cap can wrap past a half dome. A shear lifts it into an incut while
keeping the back at Z=0. This invertible transform cannot fold the mesh.
"""

import math
from dataclasses import asdict, dataclass, replace

import manifold3d as manifold
import numpy as np
import trimesh

if __package__:
    from .parameters import Parameters, parse_parameters
else:
    from parameters import Parameters, parse_parameters


@dataclass
class Model:
    mesh: trimesh.Trimesh
    profile: np.ndarray
    screws: list[tuple[float, float]]
    parameters: Parameters
    adjusted: dict

    def preview(self):
        volume = float(self.mesh.volume)
        shell = min(volume, float(self.mesh.area) * 1.6)
        return dict(
            vertices=np.round(self.mesh.vertices, 5).tolist(),
            faces=self.mesh.faces.tolist(),
            profile=np.round(self.profile, 5).tolist(),
            screws=self.screws,
            dimensions=np.round(self.mesh.extents, 2).tolist(),
            material_grams=[
                round((shell + (volume - shell) * i) / 1000 * 1.27) for i in (0.25, 0.4)
            ],
            triangles=len(self.mesh.faces),
            watertight=bool(self.mesh.is_watertight),
            parameters=asdict(self.parameters),
            adjusted=self.adjusted,
        )


def _surface(p, x, y, returning=False):
    """x/y are normalised to the oval; slope is the centre tangent angle."""
    radial = np.minimum(1, np.sqrt(x * x + y * y))
    exponent = 2 + 4 * p.palm_curve / 100
    dome = np.sqrt(np.maximum(0, 1 - radial**exponent))
    # Past the widest ring, follow the other half of the same rounded arc.
    # Translate and scale the cap so its boundary stays at Z=0 and centre at
    # the requested depth. At zero wrap this is the original half dome.
    cap = (
        -math.sqrt(max(0, 1 - math.cos(math.radians(p.arc_wrap)) ** exponent))
        if p.arc_wrap
        else 0
    )
    dome = (np.where(returning, -dome, dome) - cap) / (1 - cap)
    bias = (p.height / 2) * math.tan(math.radians(p.slope)) / p.projection
    depth = p.projection * dome * (1 - bias * y) * (1 - p.taper / 100 * x)
    if p.character:
        random = np.random.default_rng(p.seed)
        phases = random.uniform(0, 2 * math.pi, 3)
        waves = (
            np.sin(4 * x + phases[0]) * np.sin(3 * y + phases[1])
            + 0.4 * np.cos(7 * x - 2 * y + phases[2])
        ) / 1.4
        depth *= 1 + 0.18 * p.character * waves
    return depth


def _mesh(p, quality):
    radial_count, around = (24, 64) if quality == "preview" else (56, 160)
    sweep = math.radians(90 + p.arc_wrap)
    radial_count = math.ceil(radial_count * (90 + p.arc_wrap) / 90)
    angles = np.arange(around) * 2 * math.pi / around
    vertices = [[0, 0, float(_surface(p, 0, 0))]]
    for i, phi in enumerate(np.linspace(0, sweep, radial_count + 1)[1:]):
        radial = math.sin(phi)
        x, y = radial * np.cos(angles), radial * np.sin(angles)
        depth = _surface(p, x, y, returning=phi > math.pi / 2)
        if i == radial_count - 1:
            depth[:] = 0  # Shared boundary: no epsilon-height rim.
        vertices.extend(np.column_stack((x * p.width / 2, y * p.height / 2, depth)))
    back = len(vertices)
    vertices.append([0, 0, 0])
    faces = []
    for j in range(around):
        next_j = (j + 1) % around
        faces.append((0, 1 + j, 1 + next_j))
        for i in range(radial_count - 1):
            a, b = 1 + i * around + j, 1 + i * around + next_j
            faces.extend(((a, a + around, b + around), (a, b + around, b)))
        a, b = (
            1 + (radial_count - 1) * around + j,
            1 + (radial_count - 1) * around + next_j,
        )
        faces.append((back, b, a))
    vertices = np.asarray(vertices)
    lift = math.tan(math.radians(p.incut))
    vertices[:, 1] += vertices[:, 2] * lift
    mesh = trimesh.Trimesh(vertices, faces, process=True)
    phi = np.linspace(-sweep, sweep, 2 * radial_count + 1)
    y = np.sin(phi)
    profile = np.column_stack(
        (
            y * p.height / 2,
            _surface(p, np.zeros_like(y), y, returning=np.abs(phi) > math.pi / 2),
        )
    )
    profile[[0, -1], 1] = 0
    profile[:, 0] += profile[:, 1] * lift
    return mesh, profile


def _solid(mesh):
    result = manifold.Manifold(
        manifold.Mesh(
            vert_properties=np.asarray(mesh.vertices, dtype=np.float32),
            tri_verts=np.asarray(mesh.faces, dtype=np.uint32),
        )
    )
    if result.status() != manifold.Error.NoError or result.is_empty():
        raise ValueError("The mesh could not form a closed solid.")
    return result


def _inside(points, polygons):
    x, y = points[:, 0], points[:, 1]
    inside = np.zeros(len(points), dtype=bool)
    for polygon in polygons:
        a = np.asarray(polygon)
        for (ax, ay), (bx, by) in zip(a, np.roll(a, 1, axis=0)):
            crosses = (ay > y) != (by > y)
            if crosses.any():
                crossing = (bx - ax) * (y[crosses] - ay) / (by - ay) + ax
                inside[crosses] ^= x[crosses] < crossing
    return inside


def _mounting(p, solid):
    # Evenly spaced around an oval; two holes stay horizontal.
    angles = np.arange(p.screw_count) * 2 * math.pi / p.screw_count
    if p.screw_count != 2:
        angles -= math.pi / 2
    unit = np.column_stack(
        (np.cos(angles) * p.width / 2, np.sin(angles) * p.height / 2)
    )
    candidates = np.array(
        [
            unit * r + [0, -p.height * drop]
            for r in np.arange(0.58, 0.17, -0.04)
            for drop in (0.08, 0.04, 0, -0.04, -0.08, -0.12, -0.16, -0.2)
        ]
    )
    gaps = np.linalg.norm(candidates[:, :, None] - candidates[:, None, :], axis=-1)
    for i in range(p.screw_count):
        gaps[:, i, i] = np.inf
    spaced = gaps.min(axis=(1, 2)) >= p.head_diameter + 1.5
    candidates = candidates[spaced]
    target = round(min(30, p.projection * 0.36) if p.auto_seat else p.seat_depth, 1)
    cone = (p.head_diameter - p.shank_diameter) / 2
    # Prefer a larger body to an extremely shallow automatic screw seat.
    # A manual seat can lower further when its requested height cannot fit.
    floor = max(3.0, target / 2) if p.auto_seat else 0.5
    for seat in np.unique(np.append(np.arange(target, floor - 1e-9, -0.5), floor))[
        ::-1
    ]:
        room = None
        for height, margin in (
            (0.5, p.shank_diameter / 2 + 2),
            (seat / 2, p.shank_diameter / 2 + 2),
            (seat + 0.5, p.head_diameter / 2 + 0.75),
            (seat + cone / 2, (p.shank_diameter + p.head_diameter) / 4 + 0.75),
            (seat + cone + 0.5, p.head_diameter / 2 + 0.75),
        ):
            section = solid.slice(height)
            region = section.offset(-margin, manifold.JoinType.Round, 2, 32)
            room = region if room is None else room ^ region
        if room.is_empty() or not len(candidates):
            continue
        fits = (
            _inside(candidates.reshape(-1, 2), room.to_polygons())
            .reshape(len(candidates), -1)
            .all(axis=1)
        )
        if fits.any():
            return [
                (float(x), float(y)) for x, y in candidates[np.argmax(fits)]
            ], float(round(seat, 1))
    return [], target


def _fit_slope(p):
    # Keep the height field positive everywhere on the oval.
    maximum = math.degrees(math.atan(0.75 * p.projection / (p.height / 2)))
    return replace(p, slope=round(max(-maximum, min(maximum, p.slope)), 4))


def build(requested: Parameters, quality="preview") -> Model:
    if quality not in {"preview", "export"}:
        raise ValueError("Unknown mesh quality.")
    p = parse_parameters(asdict(requested))
    p = replace(p, head_diameter=max(p.head_diameter, p.shank_diameter + 1.5))
    # Mounting uses preview geometry at both qualities, so hole layout and
    # adjusted settings never change just because the user exports an STL.
    for attempt in range(50):
        p = _fit_slope(p)
        mesh, profile = _mesh(p, "preview")
        solid = _solid(mesh)
        screws, seat = _mounting(p, solid) if p.screws else ([], p.seat_depth)
        if not p.screws or screws:
            break
        # Grow the footprint first, then depth if the maximum oval is still
        # too shallow for the chosen hardware. No hidden hole removal.
        if p.width < 300 or p.height < 240:
            p = replace(p, width=min(300, p.width + 8), height=min(240, p.height + 8))
        else:
            p = replace(p, projection=min(100, p.projection + 4))
    else:
        raise ValueError("The mounting solver could not find space for these screws.")
    p = replace(p, seat_depth=seat)
    if quality == "export":
        mesh, profile = _mesh(p, quality)
        solid = _solid(mesh)
    if screws:
        cone_height = (p.head_diameter - p.shank_diameter) / 2
        for x, y in screws:
            shank = manifold.Manifold.cylinder(
                seat + 1, p.shank_diameter / 2, circular_segments=48
            ).translate((x, y, -1))
            cone = manifold.Manifold.cylinder(
                cone_height, p.shank_diameter / 2, p.head_diameter / 2, 48
            ).translate((x, y, seat))
            bore = manifold.Manifold.cylinder(
                float(mesh.bounds[1, 2]) + 1, p.head_diameter / 2, circular_segments=48
            ).translate((x, y, seat + cone_height))
            solid -= shank + cone + bore
        result = solid.to_mesh()
        mesh = trimesh.Trimesh(
            result.vert_properties[:, :3], result.tri_verts, process=True
        )
    if not mesh.is_watertight or not mesh.is_winding_consistent or mesh.volume <= 0:
        raise ValueError("The mesh did not pass closed-solid checks.")
    adjusted = {
        key: value
        for key, value in asdict(p).items()
        if value != asdict(requested)[key]
    }
    return Model(mesh, profile, screws, p, adjusted)
