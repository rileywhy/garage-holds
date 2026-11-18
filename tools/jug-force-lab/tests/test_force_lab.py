"""Jug Force Lab: the load model, the layer stresses and the page's API."""

import json
import math
import sys
import unittest
from pathlib import Path

import manifold3d as manifold
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import force  # noqa: E402
import materials  # noqa: E402
import contract  # noqa: E402

DEFAULT = force.analyze({}, force.Load())


class LoadTests(unittest.TestCase):
    def test_straight_down_on_a_vertical_wall_slides_along_it(self):
        d = force.Load(wall_angle=0, pull_angle=0).direction()
        np.testing.assert_allclose(d, (0, -1, 0), atol=1e-12)

    def test_straight_down_from_a_roof_pulls_straight_out(self):
        d = force.Load(wall_angle=90, pull_angle=0).direction()
        np.testing.assert_allclose(d, (0, 0, 1), atol=1e-12)

    def test_side_pull_swings_along_the_hold(self):
        d = force.Load(side_angle=30).direction()
        self.assertAlmostEqual(d[0], 0.5)
        self.assertAlmostEqual(np.linalg.norm(d), 1.0)

    def test_load_settings_are_fitted_and_checked(self):
        self.assertEqual(force.parse_load({"force": 99999}).force, 5000)
        self.assertEqual(force.parse_load({"depth": -1}).depth, 0)
        for bad in ({"grip": 1}, {"force": "lots"}, {"force": math.inf}, {"force": True}, []):
            with self.assertRaises(ValueError):
                force.parse_load(bad)


class SolveTests(unittest.TestCase):
    """A plain rectangular back with three screws."""

    polygon = [np.array([(-60, -50), (60, -50), (60, 20), (-60, 20)], dtype=float)]
    screws = [(-40, 0), (0, -20), (40, 0)]

    def run_case(self, f=(0.0, -700.0, 600.0), point=(0.0, 10.0, 30.0)):
        cells, mask, _ = force.back_grid(self.polygon, 1.0)
        q = force.solve(cells, mask, 1.0, self.screws, [3000] * 3, f, point, 30.0)
        gap = q[0] + q[1] * cells[:, 1] + q[2] * cells[:, 0]
        pressure = np.where(mask & (gap < 0), -30.0 * gap, 0.0)
        xy = np.array(self.screws, dtype=float)
        tension = np.maximum(0, 3000 * (q[0] + q[1] * xy[:, 1] + q[2] * xy[:, 0]))
        return cells, pressure, xy, tension

    def test_screws_and_wall_balance_the_pull(self):
        f, point = np.array((0.0, -700.0, 600.0)), np.array((0.0, 10.0, 30.0))
        cells, pressure, xy, tension = self.run_case(f, point)
        # Out of the wall: screws pull in, the wall pushes out.
        self.assertAlmostEqual(tension.sum() - pressure.sum(), f[2], delta=1e-6 * f[2])
        # Moment about X at the wall: the pull's against screws and bed.
        m_pull = point[1] * f[2] - point[2] * f[1]
        m_back = (tension * xy[:, 1]).sum() - (pressure * cells[:, 1]).sum()
        self.assertAlmostEqual(m_back, m_pull, delta=1e-6 * abs(m_pull))

    def test_the_higher_screws_take_the_peel(self):
        _, _, _, tension = self.run_case()
        self.assertGreater(tension[0], tension[1])
        self.assertAlmostEqual(tension[0], tension[2], places=6)

    def test_everything_scales_with_the_force(self):
        _, p1, _, t1 = self.run_case((0.0, -700.0, 600.0))
        _, p2, _, t2 = self.run_case((0.0, -1400.0, 1200.0))
        np.testing.assert_allclose(t2, 2 * t1, rtol=1e-9)
        np.testing.assert_allclose(p2, 2 * p1, rtol=1e-9, atol=1e-12)


class LayerTests(unittest.TestCase):
    def test_section_of_a_rectangle_with_a_hole(self):
        outer = np.array([(-50, -20), (50, -20), (50, 20), (-50, 20)], dtype=float)
        hole = np.array([(-5, -5), (-5, 5), (5, 5), (5, -5)], dtype=float)  # clockwise
        A, cx, cy, Ixx, Iyy, Ixy = force.section([outer, hole])
        self.assertAlmostEqual(A, 4000 - 100)
        self.assertAlmostEqual(cx, 0)
        self.assertAlmostEqual(Ixx, 100 * 40**3 / 12 - 10 * 10**3 / 12)
        self.assertAlmostEqual(Iyy, 40 * 100**3 / 12 - 10 * 10**3 / 12)
        self.assertAlmostEqual(Ixy, 0)

    def test_a_pull_off_centre_bends_the_slice(self):
        block = manifold.Manifold.cube((100, 40, 20), True).translate((0, 0, 10))
        f = np.array((0.0, 0.0, 1000.0))
        point = (10.0, 5.0, 30.0)
        fields = force.layer_fields(block, 20.0, f, point, [])
        sigma, _ = force.layer_stress(fields, [(50, 20, 10)])
        Ixx, Iyy = 100 * 40**3 / 12, 40 * 100**3 / 12
        expected = 1000 / 4000 + (10 * 1000 / Iyy) * 50 + (5 * 1000 / Ixx) * 20
        self.assertAlmostEqual(sigma[0], expected, places=6)

    def test_screw_heads_load_only_the_layers_below_their_seats(self):
        block = manifold.Manifold.cube((100, 40, 20), True).translate((0, 0, 10))
        fields = force.layer_fields(block, 20.0, np.zeros(3), (0, 0, 30), [(0, 0, 8, 500)])
        sigma, _ = force.layer_stress(fields, [(0, 0, 4), (0, 0, 15)])
        self.assertAlmostEqual(sigma[0], -500 / 4000, places=6)
        self.assertAlmostEqual(sigma[1], 0, places=9)

    def test_sliding_shear_is_spread_over_the_slice(self):
        block = manifold.Manifold.cube((100, 40, 20), True).translate((0, 0, 10))
        fields = force.layer_fields(block, 20.0, np.array((0, -800.0, 0)), (0, 0, 30), [])
        _, tau = force.layer_stress(fields, [(0, 0, 10)])
        self.assertAlmostEqual(tau[0], 800 / 4000, places=6)


class JugTests(unittest.TestCase):
    def test_the_upper_screws_of_a_jug_carry_the_most(self):
        f = sorted(DEFAULT["fasteners"], key=lambda item: item["y"])
        self.assertGreaterEqual(len(f), 2)
        self.assertGreater(f[-1]["y"], f[0]["y"])
        self.assertGreater(f[-1]["tension"], f[0]["tension"])

    def test_pull_and_wall_balance_on_the_real_back(self):
        s = DEFAULT["summary"]
        fz = DEFAULT["load"]["components"][2]
        self.assertAlmostEqual(s["total_tension"] - s["contact_force"], fz, delta=1.0)

    def test_failure_force_is_where_the_worst_part_reaches_its_limit(self):
        s = DEFAULT["summary"]
        self.assertAlmostEqual(s["failure_force"], 1000 / s["governing"]["use"], delta=0.1)
        doubled = force.analyze({}, force.Load(force=2000))
        self.assertAlmostEqual(doubled["summary"]["failure_force"], s["failure_force"], delta=0.2)

    def test_steeper_walls_peel_harder(self):
        tension = [
            max(f["tension"] for f in force.analyze({}, force.Load(wall_angle=a))["fasteners"])
            for a in (0, 30, 60)
        ]
        self.assertLess(tension[0], tension[1])
        self.assertLess(tension[1], tension[2])

    def test_fingers_deeper_in_the_incut_bear_closer_to_the_wall(self):
        high = force.analyze({}, force.Load(depth=0))["load"]["point"]
        deep = force.analyze({}, force.Load(depth=0.9))["load"]["point"]
        self.assertGreater(high[2], deep[2] + 15)

    def test_hand_position_moves_the_contact_across(self):
        point = force.analyze({}, force.Load(position=40))["load"]["point"]
        self.assertAlmostEqual(point[0], 40, delta=0.5)

    def test_wall_materials_change_the_result(self):
        concrete = force.analyze({}, force.Load(), wall="concrete")
        mdf = force.analyze({}, force.Load(), wall="mdf_18")
        self.assertGreater(concrete["summary"]["failure_force"], DEFAULT["summary"]["failure_force"])
        self.assertLess(mdf["summary"]["failure_force"], DEFAULT["summary"]["failure_force"])

    def test_more_thread_in_the_wall_grips_harder(self):
        short = force.analyze({}, force.Load(), screw_length=25)
        self.assertLess(short["fasteners"][0]["capacity"]["wall"], DEFAULT["fasteners"][0]["capacity"]["wall"])
        too_short = force.analyze({}, force.Load(), screw_length=20)
        self.assertTrue(any("too short" in n for n in too_short["notes"]))

    def test_weaker_layers_use_more_of_their_strength(self):
        asa = force.analyze({}, force.Load(), hold="asa")
        self.assertGreater(asa["summary"]["worst_layer"]["use"], DEFAULT["summary"]["worst_layer"]["use"])

    def test_a_bolt_mount_is_analysed_as_a_bolt(self):
        result = force.analyze({"bolt_mount": True}, force.Load())
        self.assertIn("bolt", [f["kind"] for f in result["fasteners"]])

    def test_display_mesh_and_colours_line_up(self):
        mesh = DEFAULT["mesh"]
        self.assertEqual(len(mesh["vertices"]) // 3, len(mesh["use"]))
        self.assertEqual(len(mesh["use"]), len(mesh["sigma"]))
        self.assertEqual(max(mesh["faces"]) + 1, len(mesh["use"]))
        p = DEFAULT["pressure"]
        self.assertEqual(len(p["values"]), p["nx"] * p["ny"])

    def test_unknown_materials_are_refused(self):
        with self.assertRaises(ValueError):
            force.analyze({}, force.Load(), wall="cardboard")
        with self.assertRaises(ValueError):
            force.analyze({}, force.Load(), hold="wood")


class ScrewTests(unittest.TestCase):
    def test_pull_out_follows_the_wood_handbook(self):
        # p = 108.25 G^2 D L (N, mm): a #10 in plywood at G 0.50.
        q = materials.withdrawal_per_mm(materials.WALLS["plywood_18"], materials.SCREWS["no10"])
        self.assertAlmostEqual(q, 108.25 * 0.5**2 * 4.83, places=6)
        self.assertAlmostEqual(q * 18, 2353, delta=2)

    def test_the_nds_design_value_is_the_ultimate_over_about_five_and_a_half(self):
        # W = 2850 G^2 D lb per inch of thread, D in inches.
        screw = materials.SCREWS["no10"]
        nds = 2850 * 0.5**2 * (screw.diameter / 25.4) * 4.448 / 25.4  # N/mm
        q = materials.withdrawal_per_mm(materials.WALLS["plywood_18"], screw)
        self.assertAlmostEqual(q / nds, 15700 / 2850, places=2)

    def test_mdf_matches_face_screw_holding_tests(self):
        # A #10 with 17 mm of thread: manufacturers list about 1,100 to 1,450 N.
        q = materials.withdrawal_per_mm(materials.WALLS["mdf_18"], materials.SCREWS["no10"])
        self.assertTrue(1100 <= q * 17 <= 1450)

    def test_a_number_8_grips_less_than_a_number_10(self):
        eight = force.analyze({}, force.Load(), screw="no8")["fasteners"][0]
        ten = DEFAULT["fasteners"][0]
        self.assertAlmostEqual(eight["capacity"]["wall"] / ten["capacity"]["wall"], 4.17 / 4.83, places=3)
        self.assertLess(eight["capacity"]["pull_through"], ten["capacity"]["pull_through"])
        self.assertLess(eight["capacity"]["steel"], ten["capacity"]["steel"])

    def test_every_wall_lists_a_pull_out_for_every_screw(self):
        table = materials.pullout_table()
        self.assertEqual(set(table), set(materials.WALLS))
        for wall, row in table.items():
            self.assertEqual(set(row), set(materials.SCREWS))
            if wall != "concrete":
                self.assertGreater(row["no10"], row["no8"])

    def test_unknown_screws_are_refused(self):
        with self.assertRaises(ValueError):
            force.analyze({}, force.Load(), screw="no14")
        self.assertEqual(contract.analyze(b'{"screw": "lag"}')[0], 422)


class ApiTests(unittest.TestCase):
    def test_schema_lists_controls_and_materials(self):
        s = contract.schema()
        self.assertIn("Board jug", s["jug"]["presets"])
        self.assertEqual(set(s["materials"]["walls"]), set(materials.WALLS))
        self.assertIn("force", s["load"]["limits"])

    def test_analyze_round_trip(self):
        status, body = contract.analyze(json.dumps({"load": {"force": 800}, "wall": "osb_18"}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(body["load"]["force"], 800)
        json.dumps(body, allow_nan=False)  # serialisable, no NaN
        self.assertIn("vertices", body["mesh"])

    def test_the_mesh_can_be_left_out(self):
        status, body = contract.analyze(b'{"mesh": false}')
        self.assertEqual(status, 200)
        self.assertNotIn("vertices", body["mesh"])
        self.assertEqual(len(body["mesh"]["use"]), len(DEFAULT["mesh"]["use"]))
        self.assertEqual(contract.analyze(b'{"mesh": 1}')[0], 400)

    def test_the_vercel_function_loads_the_contract(self):
        import importlib

        root = Path(__file__).resolve().parents[3]
        sys.path.insert(0, str(root))
        function = importlib.import_module("api.jug_force")
        self.assertTrue(hasattr(function, "handler"))

    def test_bad_requests_are_refused(self):
        self.assertEqual(contract.analyze(b"{")[0], 400)
        self.assertEqual(contract.analyze(b"[]")[0], 400)
        self.assertEqual(contract.analyze(b'{"extra": 1}')[0], 400)
        self.assertEqual(contract.analyze(b'{"settings": {"colour": 1}}')[0], 400)
        self.assertEqual(contract.analyze(b'{"wall": "cardboard"}')[0], 422)
        self.assertEqual(contract.analyze(b'{"load": {"force": "x"}}')[0], 422)


if __name__ == "__main__":
    unittest.main()
