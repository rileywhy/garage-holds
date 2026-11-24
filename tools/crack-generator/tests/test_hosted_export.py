import sys
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build
from parameters import BASE


class HostedExportTests(unittest.TestCase):
    def test_deep_angled_cracks_fit_the_download_response(self):
        for p in (
            replace(BASE, depth=75),
            replace(BASE, depth=140, character=1, seed=11, flare=-15),
            replace(BASE, depth=140, character=1, jam_angle=90),
        ):
            with self.subTest(parameters=p):
                preview = build(p)
                export = build(p, "export")
                self.assertTrue(export.mesh.is_volume)
                self.assertEqual(export.holes, preview.holes)
                self.assertEqual(export.parameters, preview.parameters)
                self.assertLess(len(export.mesh.export(file_type="stl")), 4_500_000)
