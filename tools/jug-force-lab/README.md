# Force Lab

An unlisted, temporary page at `/jug-force-lab`. It loads a hold on a wall
and shows where the force goes: into each screw, into the wall behind the
back, and through the plastic inside. The hold can come from the Crimp,
Sloper, Jug, Foot, Pocket or Round Pinch Lab, or from the pile. The
page is not in the
labs list, the navigation or the sitemap, and it asks search engines not to
index it. Anyone with the link can open it.

To remove it, delete these together:
- `src/app/jug-force-lab/`
- `src/features/force-lab/` (including `pile.ts`, which lists pile holds)
- `api/jug_force.py` and its entry in `vercel.json`
- the `jug_force` rewrite in `next.config.ts`
- the `jug-force-lab` job in `.github/workflows/ci.yml`
- the `/jug-force-lab` entry in `src/lib/error-reports.ts`
- this folder

## Running it locally

```powershell
python tools\jug-force-lab\server.py
```

Then start the site with `JUG_FORCE_API_URL=http://127.0.0.1:8799` set, so
that `/api/jug_force` reaches this server. On Vercel, `api/jug_force.py`
answers that route directly.

## What you can set

- **Hold:** a Hold Lab generator with all its settings and presets, or a
  published pile hold. Either can be turned on the wall in quarter turns.
- **Pull:** the force, how far it leans out from the wall, a side pull,
  where the hand sits across the hold, how far out from the wall the fingers
  land, and how wide the hand is. You can also click the hold to put the
  fingers exactly where they go.
- **Wall:** the material (18 mm or 12 mm plywood, OSB, MDF, hardwood, or
  concrete with anchors) and the angle, from a slab to a roof.
- **Print and screws:** the print material (PLA, PETG, ASA/ABS, nylon CF),
  the screw type (#10 or #8 wood screw) and the screw length.

## Pile holds ([holds.py](holds.py))

The page lists published designs that have a ready STL. Picking one asks
the site for a fresh signed link to its model (the preview copy when there
is one), and the function downloads it. It only fetches https links to the
site's own R2 bucket, up to 40 MB.

- **Placing it:** the STL goes onto its mounting face the way the site's
  previews do it (`stl-orientation.ts`), then turns by the creator's saved
  orientation.
- **Finding its holes:** they are openings 3 to 14 mm across in the back
  face, followed upward until they widen into a head recess (the seat) or
  come out through the top. Holes 8 mm or wider are taken as bolts; a hole
  that closes over is not a fastener.
- **Limits:** a model that is not a closed solid, or that has no holes
  through the back, cannot be analysed. The hold is assumed to print
  back-down.

## Screw pull-out

Pull-out values come from the Wood Handbook's ultimate withdrawal load for a
wood screw in side grain:

    p = 15,700 G² D L  (lb, in)  =  108.25 G² D L  (N, mm)

Here G is the wood's specific gravity, D the screw's nominal diameter, and L
the thread in the wall. The NDS design value, W = 2,850 G² D lb per inch,
is the same load divided by about 5.5. Sheet goods use an equivalent
specific gravity: APA TT-051 puts plywood and OSB between about 0.42 and 0.55.
MDF uses face screw-holding test results instead (ASTM D1037), which
manufacturers list at about 1,100 to 1,450 N for a #10.

| Wall (G) | #10 (4.83 mm) | #8 (4.17 mm) |
| --- | --- | --- |
| 18 mm plywood (0.50) | 131 N/mm · 2.35 kN | 113 N/mm · 2.03 kN |
| 12 mm plywood (0.50) | 131 N/mm · 1.57 kN | 113 N/mm · 1.35 kN |
| 18 mm OSB (0.42) | 92 N/mm · 1.66 kN | 80 N/mm · 1.43 kN |
| 18 mm MDF (face tests) | 72 N/mm · 1.30 kN | 63 N/mm · 1.13 kN |
| Hardwood (0.63, 18 mm of thread) | 208 N/mm · 3.74 kN | 179 N/mm · 3.23 kN |

These are typical failure loads. For a design (safe working) load, divide by
about 5.5.

Each screw is also checked for:
- its head punching through the printed seat, over the screw's head
  diameter (#10 9.8 mm, #8 8.4 mm flat heads);
- the steel snapping (about 5.4 and 4.0 kN, estimated from the thread
  root, so check your screw's rating);
- sideways load into the wall;
- pull-out and sideways load together.

## The model ([force.py](force.py))

- **The hold** is a rigid body on its flat back. The wall is a
  compression-only bed, and the screws are tension-only springs with no
  preload. An active-set solve finds which part of the back stays pressed in.
- **Forces along the wall** are shared by the screws in shear: an equal
  share each, plus a twist about their centre.
- **Everything is linear in the force,** so the failure force is the set
  force divided by the worst utilisation.

## Stress inside the hold ([fea.py](fea.py))

The rigid solve gives every load on the hold. An elastic solve then finds
the stress inside it:

- **The grid:** the hold is filled with about 16,000 cubes (1.6 to 4 mm a
  side, depending on its size).
- **The loads:** the fingers are spread over the hand's width at the contact.
  Each head pulls its seat toward the wall, each shank bears sideways near
  the back, and the wall pushes where it is pressed in. These loads
  balance, so no supports are needed.
- **The solver:** plain numpy, since Vercel has no sparse solver. Every cube
  shares one stiffness matrix, so a conjugate-gradient solve takes about
  half a second.
- **The checks:** each cube is checked across the print layers (tension and
  shear between layers) and along them (in-layer tension). Cubes right at a
  concentrated load are shown but left out of the check, since a point
  load's peak belongs to the grid, not the plastic.

The page shows this as layer stress or strength used on the surface, with a
ring at the most stressed spot. It can also cut the hold open across its
width or along one print layer.

Material figures live in [materials.py](materials.py). They are typical
failure values, not design values. The cubes are a few millimetres across,
so details smaller than that, such as the edge of a screw hole, are
smoothed over. Read the results as a comparison between set-ups, not as a
rating.

## Tests

```powershell
python -m unittest discover -s tools\jug-force-lab\tests
```
