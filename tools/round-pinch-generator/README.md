# Round Pinch Lab

A second take on the pinch, kept beside the [Pinch Lab](../pinch-generator/README.md)
while the two are compared. The Pinch Lab's section is a polygon with
filleted corners: its undercut is a straight face, and rounding its edge
eats the undercut, so a pinch can be incut or comfortable but not both.
This one is rounded and incut at once. On the site it runs as a Vercel
Python function (`api/roundpinch.py`) behind `/make/roundpinch`, on the
same React shell as the other parametric labs (`src/features/hold-lab`).
It is labelled experimental, and its presets save to the browser only until
the lab is kept (saving to an account needs `roundpinch` added to the
`lab_presets` check in a migration).

`parameters.py` owns controls and presets; `geometry.py` owns the section
and the loft. The hardware fitting, the growth it may ask for, the material
estimate and the model are the Pinch Lab's: `build` hands its `build` this
body. Hardware clearance checks, the screw layout, the bolt fitting, the
cutters and the closed-solid check are the shared ones in
`tools/hold_mounting.py`.

X runs across the hold, thumb side at -X; Y runs up the wall, Z out of it.
The section is one smooth curve. Each side leaves the wall square, sweeps
out through a hollow to the pinch's widest point, and rolls over a quarter
round onto a shallow domed top, so the pads wrap the round and the
fingertips sit in the hollow under it. Rounding and incut are separate
controls and neither takes from the other; a bigger round lowers the widest
point and leaves the feet where they were. Span is measured at the widest
point. The hollow is deepest at the wall and steepest halfway up, and never
steeper than 45 degrees from the wall's normal, so the pinch prints with its
back on the bed without support. Offset lowers the thumb side's widest
point and tilts the top across.

Along the wall the section is scaled, not capped: the span follows a
rounded outline (Rounded ends, from a block to an oval) and the depth an
arch (Arch), so the pinch stands fullest in the middle and rolls down to
the wall at each end, and the hollows fade toward the ends with the depth.
The hourglass narrows the middle and the taper the top end. Bend curves the
pinch into a crescent with the fingers on the outside, by at most 18% of
the length.

Incuts ease, to the slider's step, until each hollow is no steeper than 45
degrees and the pinch keeps 16 mm between its hollows (or its span, when
that is narrower); the rounding is capped so the hollow keeps 30% of the
depth, and the lab limits its slider to what was built. Hardware goes where
a vertical line from the wall leaves through the top: inside both feet, no
further out over a round than halfway down its width, and where the pinch
stands at least 70% of its depth. Screws run in a line up the middle,
following the bend. The screw count, the bolt and the growth in height
follow the Pinch Lab's rules.

There is no standalone GUI: the lab page is the interface. To run the
hosted route for `next dev`, start `serve_api.py` (port 8798) and set
`ROUNDPINCH_API_URL=http://127.0.0.1:8798` in `.env.local`;
`next.config.ts` forwards `/api/roundpinch` there.

```powershell
& tools/crimp-generator/.venv/Scripts/python.exe tools/round-pinch-generator/serve_api.py
& tools/crimp-generator/.venv/Scripts/python.exe -m unittest discover -s tools/round-pinch-generator/tests -v
```

The shape was drawn from photos of commercial incut pinches; the geometry
is our own. Closed mesh and hardware clearance tests are geometry checks,
not printed strength certification, and comfort has not been tested in the
hand.
