# Foot Lab (local prototype)

Run from the repository root:

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/foot-generator/server.py --no-browser
```

Open http://127.0.0.1:8790. Use `--port 8791` if that port is occupied.
Requires the existing labs' numpy, trimesh and manifold3d environment and the site's installed Three.js assets. No new dependencies.

Seven starting points: board edge, toe-in edge, neutral chip, slopey wedge, ball, rounded dish, rock tooth. Overall scale multiplies all body lengths, leaving angles and hardware sizes fixed. The ball defaults to automatic screw count: one below 50 mm scaled width, two at or above it. Turn auto count off for manual mounting. One to three screws, or a centred bolt plus one anti-rotation screw. Undersized bodies grow to fit hardware; the adjusted settings are saved with the STL's design document. The default board preview is 40 degrees from vertical.

`parameters.py` owns controls and presets; `geometry.py` owns the loft and fitting. The rounded-profile math and material estimate come from the Crimp engine. Hardware clearance checks and cutters are shared with the other labs. The browser viewer and styles reuse the existing local lab assets. No public route or deployment is added yet.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/foot-generator/tests -v
```

The shape families are informed by [Atomik classic feet](https://www.atomikclimbingholds.com/20-classic-feet-set-1-screw-on), [smear slopers](https://atomikclimbingholds.com/10-large-smear-slopers-screw-on), and [Metolius Mini Tech](https://www.metoliusclimbing.com/products/mini-tech-footholds); the generated geometry is our own.

Closed mesh and hardware clearance tests are geometry checks, not printed strength certification. Material estimates include a nominal shell and 25–40% infill; use a slicer for actual print estimates.
