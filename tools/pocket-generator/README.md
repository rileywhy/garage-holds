# Pocket Lab

One finger pocket in a round body: a mono, a two-finger or a three-finger
pocket, set by the opening's width, with its depth, floor angle and lip
rounding under control, or opened right through to the wall. On the site it
runs as a Vercel Python function (`api/pocket.py`) behind `/make/pocket`, on
the same React shell as the Sloper, Jug and Foot Labs
(`src/features/hold-lab`). It is labelled experimental on the site: it
generates, exports a closed solid and mounts, and the controls may still
move around.

`parameters.py` owns controls, switches and presets; `geometry.py` owns the
body, the pocket and the fitting. The material estimate comes from the Crimp
engine (`crimp_engine.py` loads `tools/crimp-generator` under a namespace).
Hardware clearance checks, the screw layout, the cutters and the closed-solid
check are the shared ones in `tools/hold_mounting.py`.

The body is a puck: the hull of spheres along the inset footprint at the
wall and along a smaller ring at the rim, with rings rising to a crown. The
footprint is a superellipse (a circle or oval at full roundness, squarer
below) with a seeded wobble. The pocket is a rounded scoop pushed in along
an axis tilted by the floor angle: a stadium mouth whose section is a half
ellipse, narrowing to a line at full depth so the roof sweeps into the floor
in one curve, or a straight stadium prism through the back when it opens to
the wall. The lip rounding is part of the cutter: rings grown from the mouth
along a quarter circle, each point moved to where the tilted wall really is
at its own height and draped onto the face by ray cast, so the body keeps a
genuinely rounded edge that leaves the cavity tangentially.

The body grows before anything is built: deeper for a 6 mm floor behind a
closed pocket, wider or taller for 6 mm of face around the mouth and its lip,
and for 6 mm of back around an open pocket's exit, never past the sliders.
Hardware is then fitted on a proxy body with the pocket's shadow removed at
every height, so no recess or shank can open into the cavity; the real body
is drilled. Overall scale multiplies the body only; the opening and the
hardware stay in millimetres.

There is no standalone GUI: the lab page is the interface. To run the hosted
route for `next dev`, start `serve_api.py` (port 8795) and set
`POCKET_API_URL=http://127.0.0.1:8795` in `.env.local`; `next.config.ts`
forwards `/api/pocket` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/pocket-generator/serve_api.py
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/pocket-generator/tests -v
```

Opening sizes follow the finger: about 22 mm per finger, so 25 mm for a mono,
45 mm for two fingers and 66 mm for three; depth is measured along the floor,
one finger pad being about 20 mm. The geometry is our own.

Closed mesh and hardware clearance tests are geometry checks, not printed
strength certification. Material estimates include a nominal shell and
25–40% infill; use a slicer for actual print estimates.
