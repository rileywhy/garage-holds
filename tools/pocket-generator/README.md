# Pocket Lab

One finger pocket in a round body: a mono, a two-finger or a three-finger
pocket, set by the opening's width, with its depth, floor angle and lip
rounding under control. By default it opens right through to the wall,
which keeps the hold shallow and light; it can be closed behind instead. On
the site it runs as a Vercel Python function (`api/pocket.py`) behind
`/make/pocket`, on the same React shell as the Sloper, Jug and Foot Labs
(`src/features/hold-lab`). It is labelled experimental on the site: it
generates, exports a closed solid and mounts, and the controls may still
move around.

`parameters.py` owns controls, switches and presets; `geometry.py` owns the
body, the pocket and the fitting. The material estimate comes from the Crimp
engine (`crimp_engine.py` loads `tools/crimp-generator` under a namespace).
Hardware clearance checks, the screw layout, the cutters and the closed-solid
check are the shared ones in `tools/hold_mounting.py`.

The body is a puck: the hull of a ball swept along the inset footprint at
the wall and along a smaller ring at the rim, with rings rising to a crown.
Each ring carries half-circles standing on its outward normals, so the rim
is sampled alike all round; a hull of whole spheres faceted it into stripes
and creases. The
footprint is a superellipse (a circle or oval at full roundness, squarer
below) with a seeded wobble. The pocket is the hull of the stadium mouth and
a rounded chamber behind it, an ellipsoid as tall as the opening plus the
incut and as long as the pocket is deep, hung with its top level with the
upper lip and its bottom the incut below the lower lip. In section that is a
C: the roof runs in and curls down the rounded back, the floor ramps down
from the lip into the rounded bottom, so a positive incut hooks the fingers
behind the lip and a negative one lifts the floor away. Open to the wall,
the wall is the back of the C: the mouth's stadium swept down by the
incut, built as stacked rings sampled at the mouth's own angular step,
runs back through the wall, its corners eased a little rounder where it
meets the wall so the hole reads round rather than square. The roof runs
level and curls down onto the wall; the floor ramps down from the lip over
most of the depth (so an incut lower lip keeps a real radius), runs level
and curls up onto it. The curls cross the wall plane at 25 degrees, so the
body meets the wall in an edge, not a feather. The lip rounding is a
lofted solid: at every mouth vertex a fillet is worked out against the
cavity wall and the face's slope as the cutter and body really have them,
evened out along the mouth so the lip does not scallop, and drawn a hair
clear of both, so it crosses them at a few degrees instead of lying on
them. The finished mesh is tidied of the specks and needles the booleans
leave, whose normals are noise: the lab would shade them as seams.

The body grows before anything is built: deeper for a 6 mm floor behind a
closed pocket, wider or taller for 6 mm of face around the mouth and its lip,
and for 6 mm of back around an open pocket's exit, never past the sliders.
Hardware is then fitted on a proxy body with the pocket's shadow removed at
every height, so no recess or shank can open into the cavity; the real body
is drilled. Screws mirror each other either side of the pocket, with a third
on the middle line below it; when they could only crowd together over or
beside the pocket, the body grows until they spread out, up to the sliders.
Overall scale multiplies the body only; the opening and the hardware stay in
millimetres.

There is no standalone GUI: the lab page is the interface. To run the hosted
route for `next dev`, start `serve_api.py` (port 8795) and set
`POCKET_API_URL=http://127.0.0.1:8795` in `.env.local`; `next.config.ts`
forwards `/api/pocket` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/pocket-generator/serve_api.py
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/pocket-generator/tests -v
```

Opening sizes follow the finger: about 20 mm per finger, so 23 mm for a mono,
42 mm for two fingers and 61 mm for three; depth is measured along the floor,
one finger pad being about 20 mm. Open to the wall, the body's depth is the
pocket's. The geometry is our own.

Closed mesh and hardware clearance tests are geometry checks, not printed
strength certification. Material estimates include a nominal shell and
25–40% infill; use a slicer for actual print estimates.
