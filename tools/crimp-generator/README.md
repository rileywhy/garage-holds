# Crimp Lab

The crimp generator behind `/make/crimp` on the site, and a local design tool. It starts with a rounded board crimp (22 mm nominal edge depth, 5 mm lip radius) and can make small flat edges, curved incut crimps, and sloping rails. Python owns the geometry; a small browser GUI gives it an interactive Three.js preview. No Blender, desktop GUI framework, accounts, or hosted services are required.

## Run on Windows

From the Garage Holds project folder:

```powershell
npm ci # Only needed if the project's dependencies aren't installed yet.
.\tools\crimp-generator\run.ps1
```

The launcher creates a local `.venv`, installs the three pinned Python dependencies, and opens **http://127.0.0.1:8765**. It uses Python 3.12+ from PATH, or the bundled Codex Python on this computer. Leave its terminal running; Ctrl+C stops the tool. Use `-Port 8766` if that port is busy, or `-NoBrowser` to open the page yourself. The launcher can be run from another directory too.

Manual setup on any platform with Python 3.12+:

```sh
cd tools/crimp-generator
python -m venv .venv
# Windows: .venv/Scripts/python.exe; macOS/Linux: .venv/bin/python
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python server.py
```

The viewer reuses the main project's installed Three.js package. The Python server binds only to the local computer and serves an explicit asset list. It is a development tool, not a production API.

## Designing a crimp

- **Grip:** nominal edge depth, incut or slope, and lip radius. Positive incut raises the outer lip relative to the inner shelf. Negative values create a sloping contact surface. Rounding larger than the grip face can hold shrinks to the largest radius that fits, and the preview reports the radius used.
- **Shape:** width, body height, lower body rounding, rounded ends, curve across the width, left/right taper, and broad body character. The default stays clean. **New variation** or entering a seed starts with visible character (at least 1.4), varying the number, position, and balance of body folds. Dial character down for subtler results, or reset for the clean default. The same seed and settings reproduce the same shape; folds leave the contact surface and flat back unchanged.
- **Mounting:** three screw holes by default, with a count control for two to six. Holes form an evenly spaced row. Turn mounting holes off for none. Automatic spacing starts around 60% of the width while leaving room between recesses. Turn it off to choose the span between the outermost centres yourself. The row moves down when a large rounded lip needs clearance above the recesses. Diameters and the countersink seat are independent controls. Actual count and spacing appear beside the preview. Loading older settings files without a count preserves their original two-hole layout.

Start with a preset, then adjust sliders or type exact values. The 3D view supports rotation, pan, and zoom, plus fixed viewing angles. The side profile shows the centre of the generated hold, including its bow and character. Invalid combinations explain the problem and disable export while keeping the last valid model visible.

**Export STL** builds a finer mesh than the preview. **Save settings** downloads a versioned JSON design that **Load settings** can restore; STL alone does not retain editable parameters. Files download through the browser. There is no automatic upload to Garage Holds yet.

## Dimensions and geometry

All dimensions are millimetres. The original mesh uses **X across the hold, Y up the wall, Z out from the wall**, with its flat mounting face at **Z = 0**. The viewer rotates it onto a horizontal bed for inspection; exported coordinates stay unchanged.

Edge depth is the nominal outward distance between the inner shelf and outer lip **before rounding**. The body includes a 6 mm root behind the inner shelf. Rounding consumes some contact depth, and taper changes depth across the width. The dimensions beside the preview are the actual overall bounding box, not the usable finger depth. There is no inferred climbing grade.

**Estimated material** shows grams for 25–40% infill, using PETG at 1.27 g/cm³ ([Prusament datasheet](https://prusament.com/wp-content/uploads/2022/10/PETG_Prusament_TDS_2021_10_EN.pdf)). The calculation reserves a rough solid shell of surface area × 1.6 mm (capped at the model volume), then applies infill to the remaining core. This includes an allowance for walls and skins, but no supports, brim or waste. Shell overlap and actual slicer settings affect the result; this is a budgeting estimate, not a print-settings recommendation.

The shelf continues in one plane to the mounting back, avoiding a second rounded ridge behind the lip. Arc and rounded-end sampling are finer for smooth previews and exports. Preview normals preserve sharp hole/back edges without shading ridges from uneven Boolean triangles.

The engine lofts circularly rounded cross-sections through rounded ends. Manifold performs solid Boolean subtraction for through holes, 90° countersinks, and straight head recesses. Recesses must fit inside a body slice with a small geometric margin. Exports must have closed, consistently wound meshes with positive volume. These are geometry checks; they do not establish the strength of a printed hold, an adequate screw seat for a load, or suitable printer/material settings. This prototype needs physical design review and testing before use.

The files in the original `ai hold models` and `hold models` folders were reviewed as references. This tool uses a new geometry implementation and does not require or copy their models.

## Code and tests

- `parameters.py`: frozen settings, shared control schema, presets, validation, and the versioned design document.
- `geometry.py`: pure settings-to-mesh generation. It knows nothing about HTTP or the GUI.
- `server.py`: local asset serving, bounded JSON requests, preview/export endpoints, and a small synchronized mesh cache.
- `web/`: plain JavaScript controls, an isolated Three.js viewer, and styling. No frontend build step.
- `tests/`: geometry/export, validation, and local HTTP contract tests.

```powershell
.\tools\crimp-generator\.venv\Scripts\python.exe -m unittest discover -s tools/crimp-generator/tests -v
```

## On the site

`api/crimp.py` at the repository root is a Vercel Python function that
imports this folder's `geometry.py` and `parameters.py` unchanged. GET
returns the schema; POST takes `{"action": "preview" | "stl" | "validate",
"parameters": {...}}`. The React page in `src/features/crimp-lab` is a port
of `web/`, so a settings file saved by either loads in the other. Vercel
installs the root `requirements.txt` (a copy of this folder's) at build
time; keep the two files identical.

For `next dev`, run `.venv/bin/python serve_api.py` here and set
`CRIMP_API_URL=http://127.0.0.1:8766` in `.env.local`; Next forwards
`/api/crimp` to it. `tests/test_vercel_api.py` covers the hosted handler.
The local GUI server (`server.py`) stays loopback-only and is not part of
the deployment.
