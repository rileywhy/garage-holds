# Jug Lab — local demo

Run `./tools/jug-generator/run.ps1` in PowerShell, then open http://127.0.0.1:8780/.
The launcher reuses the Crimp Lab Python environment. The site version is at
`/make/jug`, backed by the same engine through `api/jug.py`.

For local site development, run `python tools/jug-generator/serve_api.py` and
set `JUG_API_URL=http://127.0.0.1:8781` when running Next.js. Omit this variable
on Vercel; the Python function serves `/api/jug` directly.

The jug is a larger, deep, strongly incut crimp with a smooth rounded contact
edge. The default uses a 158 mm sweep span, 57.5 mm edge depth, 90% bite (56° incut) and a
10.5 mm lip radius. The whole gripping section follows an arch into the wall,
then is trimmed flush at Z=0; the finished width is smaller than the sweep span.
The centre section stays unchanged instead of being squeezed at the shoulders.
Presets: board jug, deep jug, and two-handed jug (a 330 mm sweep span with a
gentler arch and four screws; the finished hold is over twice the width of the
other two, which is wider than most printer beds).

Grip controls are overall size (75–140%), more/less bite, grip reach, arc rise,
and lip comfort. Size scales geometry before hole fitting, leaving hardware
diameters unchanged. The bite slider maps 0–180% to 20–60° incut; 90% is the midpoint and maps to 56°. It is not a grade. Grip reach spans 15–100 mm, centred on 57.5 mm. Width goes up to 400 mm.
Millimeter lengths include inch equivalents. Automatic mounting spreads the
outer screws with body width and lowers the centre screw for a triangular layout.

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
