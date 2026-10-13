# Sloper Lab — local prototype

A separate, local sloper generator for trying shapes together before adding a
site page. Start at **http://127.0.0.1:8770**. The default sits between a broad
board sloper and a round dome: 192.5 × 148.75 mm footprint, 78.75 mm centre depth, a
broad rounded surface, 35° incut lift, and three screws.

```powershell
.\tools\sloper-generator\run.ps1
# Keep the terminal open. Ctrl+C stops it.
# Use -NoBrowser or -Port 8771 if needed.
```

The launcher reuses Crimp Lab's pinned environment when available; otherwise
it creates its own `.venv` using Python 3.12+. The viewer uses the project's
installed Three.js package (`npm ci` if missing). There is no frontend build.
The server binds only to this computer and serves an explicit asset list.

## Controls

The round ball preset is 40% larger in each dimension than the original;
the other presets are 75% larger. Size sliders retain their small-size minimums
and now reach 525 mm wide, 420 mm high, and 175 mm deep. Loading saved settings
retains their dimensions.

- **grip:** incut lift (0–45°), arc wrap (0–60°), centre depth, surface curve (round dome to a broader
  flatter surface), and surface slope to fine-tune the dome's bias. Incut lift raises
  the rounded surface as it projects from the wall, so it can extend above the mounting
  footprint and offer a positive grip on an overhanging board. The lift angle
  describes this deformation; local contact angles also depend on surface curvature.
  Zero retains the original dome. The default lift is 35° and the maximum is 45° to keep
  the shapes in sloper territory. Older settings above that limit clamp to 45°.
  No grade is inferred. Shallow holds can still limit
  surface slope, but incut lift retains its full range.
  Arc wrap continues the rounded surface past its widest point and back toward the
  wall, adding a rounded return rather than lifting the whole body. It narrows the
  flat mounting face. Zero preserves the original half dome, including older saved
  settings. **round ball** starts with a nearly spherical cap, 40° wrap and 20° lift.
- **shape:** width, height, left/right depth taper, and seeded broad surface
  character. The footprint is always an oval. It is a new sloper surface, not
  a Crimp Lab preset: there is no shelf or sharp gripping lip.
- **mounting:** two to six screws or none, hole/recess sizes, automatic or
  manual seat. Holes spread around the body and fit three inset slices: the
  shank at the back and the head at/above the countersink, with intermediate
  checks for the lifted body. Candidate positions can move up as well as down.
  Crowded footprints
  grow; depth also grows if needed. Automatic seats can lower to half their
  target (at least 3 mm) before growing the body further; manual seats can
  lower further to fit. Changes appear in the sliders and status.

Preview camera orbit, pan, and zoom survive edits. Presets and loaded settings
refit while keeping the viewing direction. **board preview** defaults to 40°
from vertical; **exact side** shows the mounted profile. Viewing settings do
not rotate the exported mesh. On phones the preview stays above the sliders.

**export STL** creates a finer mesh. **save settings** keeps a versioned JSON
design; **load settings** restores it. Older settings without incut lift load
with lift set to zero, preserving their dome. Both use the adjusted settings that
actually built the model. Nothing is uploaded or added to the live site.
Estimated grams use the same 25–40% infill / PETG / 1.6 mm shell approximation
as Crimp Lab. No supports or waste are included.

## Geometry and code

Coordinates: X across, Y up, Z out of the board; the mounting face is Z=0.
A rounded cap over an ellipse makes a closed, flat-backed solid. Arc wrap extends
the polar sweep past 90°; both branches follow the same curve, translated and
scaled to retain the requested centre depth and a flat back.
An invertible shear `Y += Z * tan(incut)` lifts the rounded surface without moving
the back or introducing folded faces. Surface curve controls radial curvature; slope biases depth vertically; taper
biases it sideways. Seeded undulations keep positive depth and a flat back.
The centre profile is sampled from the same surface as the mesh. Preview and
STL use the same mounting solution. Mesh checks do not validate the strength
of a printed hold.

- `parameters.py`: schema, defaults, presets, bounded input and design files.
- `geometry.py`: pure settings-to-mesh code and automatic fit adjustments.
- `server.py`: bounded local API, asset allowlist and an eight-model cache.
- `web/`: plain JavaScript GUI and isolated Three.js viewer; reuses Crimp Lab's
  base stylesheet. No dependency on Next.js routes or accounts.
- `tests/`: geometry, STL round trips, fitting, settings and HTTP contracts.

```powershell
.\tools\crimp-generator\.venv\Scripts\python.exe -m unittest discover -s tools/sloper-generator/tests -v
.\tools\crimp-generator\.venv\Scripts\python.exe -m ruff check tools/sloper-generator
npx prettier --check tools/sloper-generator/web tools/sloper-generator/README.md
```

## On the site

`/make/sloper` uses the same geometry through `api/sloper.py` at `/api/sloper`.
GET returns the schema; POST accepts `{"action":"preview"|"stl"|"validate",
"parameters":{...}}`. Python's namespaced imports keep the Sloper and Crimp
engines separate. Design documents always use `model.parameters` after fitting.

For local site development, run `python tools/sloper-generator/serve_api.py`
on port 8771 and set `SLOPER_API_URL=http://127.0.0.1:8771`. Next rewrites
`/api/sloper` to that server; the rewrite is fixed at build time. The standalone
GUI remains available on port 8770. On Vercel omit this variable; the Python
function serves the route directly. Root `requirements.txt` supplies the same
pinned geometry dependencies as Crimp Lab.
