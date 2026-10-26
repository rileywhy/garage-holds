# Jug Lab — local demo

Run `./tools/jug-generator/run.ps1` in PowerShell, then open http://127.0.0.1:8780/.
The launcher reuses the Crimp Lab Python environment. The site version is at
`/make/jug`, backed by the same engine through `api/jug.py`.

For local site development, run `python tools/jug-generator/serve_api.py` and
set `JUG_API_URL=http://127.0.0.1:8781` when running Next.js. Omit this variable
on Vercel; the Python function serves `/api/jug` directly.

The jug is a larger, deep, strongly incut crimp with a smooth rounded contact
edge. The default uses a 158 mm sweep span, 57.5 mm edge depth, 90% bite (56° incut) and a
10.5 mm lip radius and a 100 mm nominal mounting-base height along the wall.
The whole gripping section follows an arch into the wall,
then is trimmed flush at Z=0; the finished width is smaller than the sweep span.
The centre section stays unchanged instead of being squeezed at the shoulders.
Presets: board jug, deep jug, and two-handed jug (a 253 mm sweep span with a
gentler arch and four screws; the finished hold is about 243 mm wide, nearly
twice the other two and 5% inside a 256 mm printer bed).

Grip controls are overall size (75–140%), more/less bite, grip reach, arc rise,
and lip comfort. Size scales geometry before hole fitting, leaving hardware
diameters unchanged. The bite slider maps 0–180% to 20–60° incut; 90% is the midpoint and maps to 56°. It is not a grade. Grip reach spans 15–100 mm, centred on 57.5 mm. Width goes up to 400 mm.
Millimeter lengths include inch equivalents. Automatic mounting spreads the
outer screws with body width and centers each screw in the usable mounting
section, then biases the inner screws away from the lip for a deeper mounting
arc. The mounting tab's screw arc slider sets a 0–20 mm center offset (6 mm
by default), tapering to zero at the outer screws; available material limits
it. Odd counts have one deepest center screw,
and even counts have a matched inner pair.
The preview limits the arc slider to the offset that fits and returns the
applied value, so values beyond the available material do not silently produce
identical models.
Automatic span grows with hole count. Editing manual screw span switches off
automatic span. Span follows the finished mounting width, with additional
spread as holes are added. The loop-arrow reset beside span or seat restores
automatic fitting; double-clicking either slider does the same. Other sliders
reset to their defaults.
Body-height inputs keep your requested value. The preview reports a fitted
height when the requested base cannot contain the grip and mounting holes.
The outside shape is resolved independently of the screw seat. Automatic
fitting aims for 40% of the projection (at most 20 mm) and comes down to fit,
preferring at least 8 mm; compact profiles may fit lower. Reset restores
automatic fitting. Adjusting seat selects a manual
depth while preserving body dimensions
and hole centers. Its range reaches the top of the hold profile. Where the
chosen seat is above the local surface, the countersink no longer intersects
the hold, leaving only the through-hole.
Shanks and head recesses retain at least 5 mm of material to the body edges at the fitting slices, including
in bolt mode. This geometric clearance is not a strength rating.

`crimp_engine.py` loads the existing Crimp Lab as an isolated Python package.
`geometry.py` delegates mesh generation, fitting, screw holes and material
estimates to that engine. There is no separate scoop or cavity geometry.
`parameters.py` owns the jug defaults and exposes the shared control schema.

The browser offers 3D and 40° board previews, settings files and STL export.
Settings use `garage-holds-jug`, version 2; version 1 scoop settings are not
compatible with this replacement and are rejected rather than misinterpreted.

Run tests with:

```powershell
& './tools/crimp-generator/.venv/Scripts/python.exe' -m unittest discover -s tools/jug-generator/tests
& './tools/crimp-generator/.venv/Scripts/python.exe' -m unittest discover -s tools/crimp-generator/tests
```

A closed mesh does not establish printed hold strength.

Mounting offers screw-only or a centred M10 bolt plus one off-centre anti-rotation screw. Bolt clearance defaults to 10.5 mm with a 20 mm flat-bottom counterbore; both are adjustable. The bolt never moves sideways to fit.
