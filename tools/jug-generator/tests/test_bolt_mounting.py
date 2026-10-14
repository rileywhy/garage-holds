"""Bolt mounting must drill exactly one bolt and one anti-rotation screw."""

import sys
import unittest
from dataclasses import replace
from pathlib import Path

import manifold3d as manifold
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geometry import build
from parameters import PRESETS, parse_parameters


class BoltMountingTests(unittest.TestCase):
    def test_all_presets_bolt_and_one_screw_export_consistently(self):
        for name, p in PRESETS.items():
            with self.subTest(preset=name):
                requested = replace(p, bolt_mount=True)
                preview, exported = build(requested), build(requested, "export")
                self.assertEqual(len(preview.screws), 1)
                self.assertEqual(len(preview.bolts), 1)
                self.assertAlmostEqual(preview.bolts[0][0], 0, places=7)
                self.assertEqual(preview.screws, exported.screws)
                self.assertEqual(preview.bolts, exported.bolts)
                self.assertEqual(preview.parameters, exported.parameters)
                for model in (preview, exported):
                    self.assertTrue(model.mesh.is_watertight)
                    self.assertTrue(model.mesh.is_winding_consistent)
                    self.assertGreater(model.mesh.volume, 0)
                    solid = manifold.Manifold(
                        manifold.Mesh(
                            vert_properties=np.asarray(
                                model.mesh.vertices, dtype=np.float32
                            ),
                            tri_verts=np.asarray(model.mesh.faces, dtype=np.uint32),
                        )
                    )
                    self.assertEqual(len(solid.decompose()), 1)
                    self.assertEqual(len(solid.slice(0.1).to_polygons()), 3)
                separation = np.linalg.norm(
                    np.array(preview.screws[0]) - preview.bolts[0]
                )
                self.assertGreaterEqual(
                    separation, (p.bolt_head_diameter + p.head_diameter) / 2 + 3
                )

    def test_no_holes_and_legacy_settings(self):
        p = parse_parameters({})
        self.assertFalse(p.bolt_mount)
        model = build(replace(p, screws=False, bolt_mount=True))
        self.assertEqual(model.screws, [])
        self.assertEqual(model.bolts, [])
        with self.assertRaises(ValueError):
            parse_parameters({"bolt_mount": "true"})
