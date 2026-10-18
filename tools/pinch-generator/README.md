# Pinch Lab

A block you squeeze between thumb and fingers: the span across its top
edges, how far it stands off the wall, each side's lean (a wedge leaning in
or an undercut lip to pinch behind), how much lower the thumb side stands
than the finger side, a flat, domed or ridged top, the edge rounding and a
flare into the wall at the foot of each side. On the site it runs as a
Vercel Python function (`api/pinch.py`) behind `/make/pinch`, on the same
React shell as the other parametric labs (`src/features/hold-lab`). It is
labelled experimental on the site: it generates, exports a closed solid and
mounts, and the controls may still move around.

`parameters.py` owns controls, switches and presets; `geometry.py` owns the
section, the loft and the fitting. The material estimate comes from the
Crimp engine (`crimp_engine.py` loads `tools/crimp-generator` under a
namespace). Hardware clearance checks, the screw layout, the bolt fitting,
the cutters and the closed-solid check are the shared ones in
`tools/hold_mounting.py`.

X runs across the hold, thumb side at -X; Y runs up the wall, Z out of it.
The section across the pinch is a polygon with filleted corners, as the
Crimp Lab builds its profile: each side a straight face at its own angle, a
chamfer at its foot rising at 45 degrees from the wall and blended into the
side, and a top between the two edges. A domed top is the largest arc the
top has room for and a ridged one is rounded like the edges, each raised
until it stands the top rise above the line between the edges. The edges are
rounded first, then the flares, then the top. The section is lofted up the
wall; toward each end it shrinks about the middle of the top at the wall,
as a quarter ellipse sampled at even steps of its slope, keeping its edge
rounding where it fits, so the ends round down onto the wall without
drawing the edges to points. Character waves each side in and out along
the pinch, fading to nothing at the wall so the back stays as built.

Undercuts ease, one degree at a time, until the pinch keeps 16 mm between
its sides (or its span, when that is narrower) everywhere below its edges.
Hardware goes only where a vertical line from the wall leaves through the
top: clear of both sides, their edges, the waist above a flare, and the
ends' slopes. The shared fitters work on the body cut down to that region,
so no recess, shank or bore can open through an undercut side, at any
height (RIL-37). Screws run up the middle of the pinch, where it levers;
when they could only sit side by side the pinch grows taller, up to the
height slider. Automatic mounting takes the bolt and one anti-rotation
screw on a pinch over 60 mm across, after overall scale, where they fit, and
screws otherwise; ticking or clearing the bolt by hand turns it off.
Overall scale multiplies the whole pinch; hardware stays in millimetres.

There is no standalone GUI: the lab page is the interface. To run the hosted
route for `next dev`, start `serve_api.py` (port 8796) and set
`PINCH_API_URL=http://127.0.0.1:8796` in `.env.local`; `next.config.ts`
forwards `/api/pinch` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/pinch-generator/serve_api.py
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/pinch-generator/tests -v
```

Which side takes the thumb depends on the hand and how it meets the hold;
turned upside down on the wall, the same hold swaps its sides. The
geometry is our own.

Closed mesh and hardware clearance tests are geometry checks, not printed
strength certification. Material estimates include a nominal shell and
25–40% infill; use a slicer for actual print estimates.
