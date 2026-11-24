import io
import json
import sys
import unittest
from dataclasses import asdict, replace
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import BED, build
from parameters import BASE, Parameters, design_document, parse_parameters

from api.crack import handler


class CrackScaleTests(unittest.TestCase):
    def test_older_settings_and_positional_inputs_still_mean_full_size(self):
        legacy = asdict(BASE)
        del legacy["size"]
        self.assertEqual(parse_parameters(legacy), BASE)
        self.assertEqual(Parameters(42).width, 42)
        self.assertEqual(Parameters(42).size, 100)

    def test_scaled_block_bounds_and_bed_fit(self):
        for size in (75, 140):
            with self.subTest(size=size):
                p = replace(BASE, size=size)
                model = build(p)
                expected = (
                    np.array([p.width + 2 * p.side, p.length, p.depth + p.back])
                    * size
                    / 100
                )
                np.testing.assert_allclose(model.mesh.extents, expected, atol=1e-4)
                np.testing.assert_allclose(
                    model.preview()["dimensions"], expected, atol=0.01
                )
                np.testing.assert_allclose(
                    np.ptp(model.profile, axis=0), expected[[0, 2]], atol=1e-4
                )
                for h in model.holes:
                    self.assertEqual(
                        (h.shank, h.head), (p.shank_diameter, p.head_diameter)
                    )

        for p in (
            replace(BASE, size=140, length=180),
            replace(BASE, size=140, width=110, side=40),
            replace(BASE, size=140, length=200, shape="half"),
        ):
            with (
                self.subTest(parameters=p),
                self.assertRaisesRegex(ValueError, "printer bed"),
            ):
                build(p)
        p = replace(BASE, size=140, width=110, side=27, depth=90, flare=-15)
        fitted = build(p)
        self.assertLessEqual(fitted.mesh.extents[0], BED + 1e-4)
        self.assertGreater(fitted.parameters.flare, p.flare)

    def test_adjusted_dimensions_reopen_in_unscaled_units(self):
        # The narrow mouth limits the constriction. A hardware fit on thin
        # sides also sets the radius-slider cap, in the slider's units.
        p = replace(BASE, size=83, width=20, flare=0, constriction=25)
        fitted = build(p)
        self.assertLess(fitted.adjusted["constriction"], p.constriction)
        reopened = build(
            parse_parameters(design_document(fitted.parameters)["parameters"])
        )
        self.assertEqual(reopened.adjusted, {})
        self.assertEqual(reopened.holes, fitted.holes)
        np.testing.assert_allclose(reopened.mesh.vertices, fitted.mesh.vertices)
        cap = fitted.preview()["control_limits"]["edge_radius"]
        self.assertGreaterEqual(cap, fitted.cap - 0.5)
        self.assertLessEqual(cap, fitted.cap)

    def test_scaled_design_round_trips_through_export_endpoint(self):
        p = replace(
            BASE,
            shape="half",
            size=75,
            side=50,
            depth=65,
            length=100,
            bolt_mount=True,
            jam_angle=90,
        )
        model = build(p)
        self.assertEqual(
            [(h.shank, h.head) for h in model.holes],
            [
                (p.bolt_diameter, p.bolt_head_diameter),
                (p.shank_diameter, p.head_diameter),
            ],
        )
        parameters = design_document(model.parameters)["parameters"]
        request = object.__new__(handler)
        raw = json.dumps({"action": "stl", "parameters": parameters}).encode()
        request.headers = {
            "Content-Type": "application/json",
            "Content-Length": str(len(raw)),
        }
        request.rfile, request.wfile = io.BytesIO(raw), io.BytesIO()
        status, headers = [], {}
        request.send_response = status.append
        request.send_header = headers.__setitem__
        request.end_headers = lambda: None
        request.do_POST()
        self.assertEqual(status, [200])
        self.assertIn("crack-side-48.75mm.stl", headers["Content-Disposition"])
        self.assertEqual(headers["Content-Type"], "model/stl")
        self.assertLess(request.wfile.tell(), 4_500_000)
        request.wfile.seek(0)
        stl = trimesh.load(request.wfile, file_type="stl")
        self.assertTrue(stl.is_volume)
        np.testing.assert_allclose(stl.extents, model.mesh.extents, atol=0.06)
