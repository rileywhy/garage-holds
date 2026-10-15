# Foot Lab

Footholds: board edges, toe-in edges, neutral chips, slopey wedges, balls,
rounded dishes and rock teeth. On the site it runs as a Vercel Python function
(`api/foot.py`) behind `/make/foot`, on the same React shell as the Sloper and
Jug Labs (`src/features/hold-lab`). It is labelled experimental on the site:
it generates, exports a closed solid and mounts, and the controls may still
move around.

`parameters.py` owns controls and presets; `geometry.py` owns the loft and
fitting. The rounded-profile math and material estimate come from the Crimp
engine (`crimp_engine.py` loads `tools/crimp-generator` under a namespace).
Hardware clearance checks, the cutters and the closed-solid check are the
shared ones in `tools/hold_mounting.py`.

Overall scale multiplies all body lengths, leaving angles and hardware sizes
fixed. The ball and dish default to an automatic screw count: one below 50 mm
scaled width, two at or above it. One to three screws, or a centred bolt plus
one anti-rotation screw. Undersized bodies grow to fit hardware; the adjusted
settings are saved with the STL's design document.

## Local

Run from the repository root with the labs' Python environment (numpy,
trimesh, manifold3d):

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/foot-generator/server.py --no-browser
```

Open http://127.0.0.1:8790 for the standalone GUI. Use `--port 8791` if that
port is occupied. The viewer reuses the other labs' assets and the project's
installed Three.js.

To run the hosted route for `next dev`, start `serve_api.py` (port 8785) and
set `FOOT_API_URL=http://127.0.0.1:8785` in `.env.local`; `next.config.ts`
forwards `/api/foot` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/foot-generator/tests -v
```

The shape families are informed by [Atomik classic feet](https://www.atomikclimbingholds.com/20-classic-feet-set-1-screw-on), [smear slopers](https://atomikclimbingholds.com/10-large-smear-slopers-screw-on), and [Metolius Mini Tech](https://www.metoliusclimbing.com/products/mini-tech-footholds); the generated geometry is our own.

Closed mesh and hardware clearance tests are geometry checks, not printed strength certification. Material estimates include a nominal shell and 25–40% infill; use a slicer for actual print estimates.
