"""Wall, hold and screw materials for the force lab.

Every figure is a typical ultimate (failure) value, not a design value: real
boards, prints and screws vary a lot. The page says so.

Units: N, mm, MPa (N/mm^2). Stiffnesses: N/mm^3 for a bed, N/mm for a spring.

Screw pull-out from wood
------------------------
The Wood Handbook's ultimate withdrawal load for a wood screw in side grain:

    p = 15,700 G^2 D L  (lb, inches)  =  108.25 G^2 D L  (N, mm)

with G the wood's specific gravity, D the screw's nominal (thread)
diameter and L the thread in the wood. The NDS design value for the same
screw, W = 2,850 G^2 D lb per inch, is this divided by about 5.5. Sheet
goods use an equivalent specific gravity: APA TT-051 puts plywood and OSB
between about 0.42 and 0.55.

MDF does not follow the wood formula. Its figure comes from face
screw-holding tests (ASTM D1037: a #10 screw, 17 mm of thread), which
manufacturers list at about 1,100 to 1,450 N; that is about 15 N per mm of
thread per mm of screw diameter.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

WOOD_SCREW_ULTIMATE = 108.25  # N / mm^2: p = 108.25 G^2 D L


@dataclass(frozen=True)
class Screw:
    label: str
    diameter: float  # mm, nominal thread diameter
    head: float  # mm, flat head
    tensile: float  # N, the steel snapping at the thread root
    shear: float  # N, the steel shearing
    note: str = ""


# Hardened steel wood screws. Steel strengths are estimates from the thread
# root (about 2.9 and 3.4 mm) at roughly 600 MPa; check your screw's rating.
SCREWS = {
    "no10": Screw(
        "#10 wood screw (4.8 mm)", 4.83, 9.8, 5400, 3300,
        "The usual hold screw. Fits the labs' 5.5 mm holes.",
    ),
    "no8": Screw(
        "#8 wood screw (4.2 mm)", 4.17, 8.4, 4000, 2400,
        "Thinner: about 14% less grip in the wall and a smaller head on the seat.",
    ),
}
REFERENCE_SCREW = "no10"


@dataclass(frozen=True)
class Wall:
    label: str
    thickness: float  # mm of sheet the screw can bite into
    bed: float  # N/mm^3: how hard the face pushes back per mm it is pressed in
    crush: float  # MPa: bearing strength across the face
    # Screw grip, one of: an (equivalent) specific gravity for the wood
    # formula; a face screw-holding figure (N per mm of thread per mm of
    # diameter) for MDF; or a fixed pull-out per anchor.
    gravity: float = 0.0
    face_holding: float = 0.0
    anchor_pullout: float = 0.0
    lateral: float = 1500.0  # N a #10 carries sideways before the sheet gives
    tnut_pullout: float = 4000.0  # N an M10 T-nut carries before it pulls through
    colour: str = "#c9a46a"
    note: str = ""


WALLS = {
    "plywood_18": Wall(
        "18 mm plywood (birch / ACX)", 18, 30, 6.0, gravity=0.50, lateral=1600,
        tnut_pullout=4500, colour="#d8b47c",
        note="The usual climbing wall sheet. Screw grip at an equivalent specific gravity of 0.50.",
    ),
    "plywood_12": Wall(
        "12 mm plywood", 12, 40, 6.0, gravity=0.50, lateral=1000,
        tnut_pullout=2500, colour="#dcbd8c",
        note="Thin sheet: less thread to grip and T-nuts pull through sooner.",
    ),
    "osb_18": Wall(
        "18 mm OSB", 18, 22, 4.5, gravity=0.42, lateral=1200, tnut_pullout=3000,
        colour="#c49a55",
        note="Screw grip at the APA equivalent specific gravity of 0.42.",
    ),
    "mdf_18": Wall(
        "18 mm MDF", 18, 45, 8.0, face_holding=15.0, lateral=900, tnut_pullout=2000,
        colour="#9a7b5a",
        note="Dense but crumbly: grip from face screw-holding tests, and it strips easily.",
    ),
    "hardwood": Wall(
        "Solid hardwood (oak, maple)", 30, 60, 10.0, gravity=0.63, lateral=2200,
        tnut_pullout=6000, colour="#a8743e",
        note="A beam, post or thick board. The screw's steel may give before the wood.",
    ),
    "concrete": Wall(
        "Concrete with screw anchors", 100, 400, 25.0, anchor_pullout=3500, lateral=3000,
        tnut_pullout=8000, colour="#a7a9ac",
        note="Concrete screws or plug anchors; pull-out is per anchor, whatever the screw.",
    ),
}


def withdrawal_per_mm(wall: Wall, screw: Screw) -> float:
    """Ultimate pull-out per mm of thread in the wall, N/mm (0 for anchors,
    whose pull-out is per anchor)."""
    if wall.gravity:
        return WOOD_SCREW_ULTIMATE * wall.gravity**2 * screw.diameter
    return wall.face_holding * screw.diameter


def lateral(wall: Wall, screw: Screw) -> float:
    """Sideways load into the wall: bearing scales with the screw's diameter."""
    return wall.lateral * screw.diameter / SCREWS[REFERENCE_SCREW].diameter


@dataclass(frozen=True)
class Hold:
    label: str
    # Across the print layers (the layers lie parallel to the wall when a
    # hold prints back-down): tension pulls layers apart, shear slides them.
    layer_tension: float  # MPa
    layer_shear: float  # MPa
    # Within a layer: what a screw head has to shear to pull through its seat.
    punch_shear: float  # MPa
    colour: str = "#e8e3d9"
    note: str = ""


HOLDS = {
    "pla": Hold("PLA", 25, 28, 35, "#e9e4da", "Stiff and strong between layers, but creeps under steady load and softens in a hot garage."),
    "petg": Hold("PETG", 20, 24, 30, "#cfe3e8", "Tough and less brittle than PLA; layers bond slightly weaker."),
    "asa": Hold("ASA / ABS", 14, 20, 26, "#f0d7c4", "Heat and UV resistant; the weakest layer bond of the common choices."),
    "pa_cf": Hold("Nylon CF", 22, 30, 45, "#55575c", "Strong and tough if printed dry and hot."),
}

# Thread grip springs: N/mm of tension per mm the screw pulls out, per mm of
# thread in wood for a #10 (scaled by diameter); anchors are a fixed stiffness.
SCREW_STIFFNESS_PER_MM = 170.0
ANCHOR_STIFFNESS = 8000.0
BOLT_STIFFNESS = 12000.0  # M10 into a T-nut


def pullout_table() -> dict:
    """Ultimate pull-out per mm of thread for every screw in every wall."""
    return {
        wall_key: {
            screw_key: round(withdrawal_per_mm(wall, screw), 1)
            for screw_key, screw in SCREWS.items()
        }
        for wall_key, wall in WALLS.items()
    }


def schema() -> dict:
    return dict(
        walls={key: asdict(w) for key, w in WALLS.items()},
        holds={key: asdict(h) for key, h in HOLDS.items()},
        screws={key: asdict(s) for key, s in SCREWS.items()},
        pullout_per_mm=pullout_table(),
    )
