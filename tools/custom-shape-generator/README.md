# Custom Shape Lab

This feature is isolated from the existing labs. Its only modification to an
existing source file is an additive navigation link in `site-shell.tsx`.
No dependencies or shared configuration were changed.

## Local sandbox

With the regular Next.js sandbox running, start the dedicated geometry service:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/custom-shape-generator/run.ps1
```

Open http://127.0.0.1:3000/make/custom-shape. The Python service listens on 8791.
It uses the existing `.venv` and pinned NumPy, Manifold and Trimesh dependencies.
The development-only `/api/custom-shape` route proxies to that loopback service;
hosted builds call the independent `/api/custom_shape` Python function.

## Pipeline and extension point

`mask.ts` owns the versioned `MaskDocument` contract: 256×256 binary material
pixels and separate semantic mounting-hole locations. `ARTWORK_COLORS` defines
the provisional artwork palette in one place. A future importer should produce
this same contract and use the same generator. There is no upload UI or parser.
Scale is the physical width of the entire canvas, not a bounding-box resize.
Painting uses a swept circular brush, including on touch screens. History stores
up to 30 full gesture snapshots. Parameter edits never mutate the drawing.

`geometry.py` validates connectivity, traces the pixel boundary (including erased
interior voids), locally smooths contours, and constructs a rounded shoulder with
a flat wall-facing back. Grip edits affect the upper grabbing edge by default;
an optional checkbox applies them to all four sides. Incut defaults to 0 degrees
and lip rounding to 10 mm. Edge depth blends into the rounded lip, then continues
vertically through the mounting base. Other top rims receive at least 2 mm of
rounding. Body taper reduces bottom thickness while preserving the upper grabbing
band, with an angle limit based on drawn height and body depth. Disconnected material requires connecting or
erasing islands. Very thin/diagonally connected joins can require widening.

Mounting holes default to the established 5.5 mm shank / 11 mm head convention
and reuse the shared drill implementation by read-only import. Shank diameter,
head recess diameter, and seat height are adjustable, with reset controls and
body-limited slider ranges. Automatic fitting starts at 12 mm and lowers the
seat when needed to fit the profile. Manual seat edits disable automatic mode.
Full-profile clearances are validated before cutting. Countersink edits never
move the hole centers or change the body's outside dimensions.
Changes to scale/incut may require manually repositioning holes;
the generator reports this rather than silently moving them.

Preview requests debounce by 450 ms after a gesture or parameter change. Previous
requests are canceled, and export stays disabled until the current shape passes
validation. STL output is validated for watertightness and positive volume.
The editor caches smoothed, antialiased contours for display without changing
the binary material mask or semantic mounting holes.

## Checks

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
.\.venv\Scripts\python.exe -m unittest discover -s tools/custom-shape-generator/tests
```

Geometry tests cover real screw cuts, erased voids, disconnected regions, edge
clearance, valid winding, a flat back, and parameter changes preserving the mask.
