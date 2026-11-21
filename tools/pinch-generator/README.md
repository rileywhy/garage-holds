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
classic section and loft and the fitting both styles share; `rounded.py` owns
the rounded style's body; `solid.py` closes either loft into a solid. The material estimate comes from the
Crimp engine (`crimp_engine.py` loads `tools/crimp-generator` under a
namespace). Hardware clearance checks, the screw layout, the bolt fitting,
the cutters and the closed-solid check are the shared ones in
`tools/hold_mounting.py`.

The lab has two styles, chosen with Style. The rounded one ("Rounded, incut
sides", `rounded.py`) was added because the classic one trades comfort for
grip: its undercut is a straight face, and rounding its edge eats the
undercut. The rounded section is one smooth curve instead. Each side leaves
the wall square, sweeps out through a hollow to the pinch's widest point,
and rolls over a quarter round onto a shallow domed top, so the pads wrap
the round and the fingertips sit in the hollow under it. Rounding and incut
are separate controls and neither takes from the other. The hollow is
steepest halfway up and never past 45 degrees, so it prints back-down
without support, and the incuts ease until 16 mm is left between the
hollows. Along the wall the section is scaled rather than capped: the span
follows a rounded outline (Rounded ends, oval to block) and the depth an
arch (Arch), so the pinch stands fullest in the middle, and the hollows
fade toward the ends. Bend curves it into a crescent with the fingers on the
outside. Its hardware keeps inside both feet and off the steep half of each
round, in a line that follows the bend. Span is measured at the widest
point here, not across top edges. The classic style, described next, is
unchanged and still the default, because shared links store only what
differs from the defaults.

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
height (RIL-37). Screws run in a line up the middle of the pinch, where it
levers, evenly out to the ends of the level part of the top so each recess
opens flat; only long rounded ends push them down onto the slopes. Chosen
from the size, the count is two, and one more for every 30 mm the span runs
past 60 mm after overall scale, up to six: a wider pinch takes more screws,
never a bolt it was not asked for. A count chosen that way gives up screws
that have no room, down to two; past that, or with a count set by hand, the
pinch grows taller when the screws could only sit side by side, up to the
height slider. Ticking Bolt + one screw takes the bolt and one anti-rotation
screw in line below it.
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
