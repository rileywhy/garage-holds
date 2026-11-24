# Crack Lab

A crack to jam fingers, hands or fists in: its width at the mouth, how far
it runs in, each face's flare (out, wider at the mouth, or in, wider inside
so a jam locks behind the mouth), a constriction partway along it for locks,
the jam angle those locks are turned to for a steep wall or a roof, the
rounding of its lips, its length up the wall, the thickness of each side
and the back behind the floor, and a seeded wander from side to side. It
comes as one block with the crack through it, or as one side of a crack to
print twice, mirror one in the slicer and mount apart, which makes a wide
crack from less plastic and a smaller bed. On the site it runs as a Vercel
Python function (`api/crack.py`) behind `/make/crack`, on the same React
shell as the other parametric labs (`src/features/hold-lab`). It is labelled
experimental on the site: it generates, exports a closed solid and mounts,
and the controls may still move around.

`parameters.py` owns controls, switches and presets; `geometry.py` owns the
section, the loft and the fitting. The material estimate comes from the
Crimp engine (`crimp_engine.py` loads `tools/crimp-generator` under a
namespace). Hardware clearance checks, the screw layout, the bolt fitting,
the cutters and the closed-solid check are the shared ones in
`tools/hold_mounting.py`.

X runs across the crack, Y up the wall along it, Z out of the wall. The
section across the block is a polygon with filleted corners, as the Pinch
Lab builds its own: square outer sides, rounded front corners, the crack's
faces at the flare with rounded lips, and a floor with rounded corners where
the back joins the two sides. One side of a crack is the left half of that,
its face running to the wall. The section is lofted up the wall: the
constriction moves both faces in over a stretch about a crack width either
side of its height, the wander moves the whole crack sideways and keeps its
width, and toward each end every surface but the back moves into the body
along a quarter circle, so the ends round off with the edges and the back
stays on the wall.

The jam angle turns the constriction and the wander about the middle of
the crack's depth, so they dive down the wall as they go in: on a board
that steep, your weight pulls square into the lock, as it does on a
vertical wall at 0. The default, 40, suits a standard board; at 90, for a
roof, the lock lies along the wall halfway in, and fingers slot up through
it and hang on it. Each point of a face moves by the constriction and the
wander at its own depth, so a turned crack's faces are sampled as finely
across the depth as the loft is along the crack. The block's outside and
its ends do not turn, and a constriction only moves the faces away from
the sides, so the screws fit as they do at 0. A straight, parallel crack
has nothing to turn.

The side thickness is each side at its thinnest: at the mouth, or at the
floor of a crack flared in, where the block widens to keep it. A flare out
eases, half a degree at a time, until the crack keeps 6 mm open at its floor,
and a flare in until the block fits a 256 mm bed; a constriction then eases
to what is left open. Edge rounding is capped to what the section has room
for, and with holes on, to what leaves each side room for its screws.

Screws go only where a vertical line from the wall leaves through a side's
front face, clear of the crack, its lips and the rounded ends; the shared
fitters work on the body cut down to that region, so no recess, shank or
bore can open into the crack (the RIL-37 failure). They run in a line up the
middle of each side, two a side up to 180 mm long and three past that when
chosen from the size; a count chosen that way gives up screws that have no
room, down to one a side (two on one side alone, so it cannot turn). The
long recesses need a long driver bit. Ticking Bolt + one screw puts the bolt
through the crack's floor, its head sunk below the floor, which needs a
crack wider than the head; one side takes it through its middle. The
anti-rotation screw goes in a side, down the crack from the bolt.

There is no standalone GUI: the lab page is the interface. To run the hosted
route for `next dev`, start `serve_api.py` (port 8797) and set
`CRACK_API_URL=http://127.0.0.1:8797` in `.env.local`; `next.config.ts`
forwards `/api/crack` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/crack-generator/serve_api.py
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/crack-generator/tests -v
```

A crack prints on its back with the crack open to the top and stands tall,
so keep the guide's walls and vertical shell thickness. The geometry is our
own.

Closed mesh and hardware clearance tests are geometry checks, not printed
strength certification. Material estimates include a nominal shell and
25–40% infill; use a slicer for actual print estimates.
