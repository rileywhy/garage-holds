"""Force lab: the load model, the stress solve, the holds and the API."""

import json
import math
import sys
import unittest
from pathlib import Path

import manifold3d as manifold
import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import contract  # noqa: E402
import fea  # noqa: E402
import force  # noqa: E402
import holds  # noqa: E402
import materials  # noqa: E402

JUG = holds.generated("jug")
DEFAULT = force.analyze(JUG, force.Load())


def block_slicer(x, y, z):
    """Outline of an axis-aligned block centred on the origin in x and y."""
    outline = [np.array([(-x / 2, -y / 2), (x / 2, -y / 2), (x / 2, y / 2), (-x / 2, y / 2)])]
    return lambda height: outline if 0 <= height <= z else []


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
        self.assertEqual(force.parse_load({"height": -1}).height, 0.02)
        self.assertEqual(force.parse_load({"point": [1, 2, 3]}).point, (1.0, 2.0, 3.0))
        for bad in (
            {"grip": 1}, {"force": "lots"}, {"force": math.inf}, {"force": True}, [],
            {"point": [1, 2]}, {"point": "here"}, {"point": [1, 2, math.nan]},
        ):
            with self.assertRaises(ValueError):
                force.parse_load(bad)


class SolveTests(unittest.TestCase):
    """The rigid model on a plain rectangular back with three screws."""

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
        self.assertAlmostEqual(tension.sum() - pressure.sum(), f[2], delta=1e-6 * f[2])
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


class StressSolveTests(unittest.TestCase):
    """The voxel elastic solve against hand calculations on a block."""

    def setUp(self):
        self.grid = fea.voxelize(block_slicer(40, 20, 30), ((-20, -10, 0), (20, 10, 30)), 2.0)
        self.solver = fea.Solver(self.grid)

    def face_shares(self, z):
        """Each node's share of a face at height z (its tributary area)."""
        nodes = self.grid.nodes
        on = np.abs(nodes[:, 2] - z) < 1e-6
        corner_x = np.isclose(np.abs(nodes[:, 0]), 20)
        corner_y = np.isclose(np.abs(nodes[:, 1]), 10)
        share = on * np.where(corner_x, 0.5, 1.0) * np.where(corner_y, 0.5, 1.0)
        return share / share.sum()

    def test_a_straight_pull_gives_force_over_area(self):
        f = np.zeros((len(self.grid.nodes), 3))
        f[:, 2] += 800 * self.face_shares(30) - 800 * self.face_shares(0)
        u, _ = self.solver.solve(fea.balance(self.grid.nodes, f).ravel(), tolerance=1e-8)
        stress = self.solver.element_stress(u)
        middle = self.grid.element_ijk[:, 2] == 7
        np.testing.assert_allclose(stress[middle, 2], 800 / (40 * 20), rtol=0.01)

    def test_sliding_gives_shear_over_area(self):
        # A sideways pull on the top, held by the bottom: the same force back,
        # plus the couple that keeps the block from tipping.
        nodes = self.grid.nodes
        top, bottom = self.face_shares(30), self.face_shares(0)
        f = np.zeros((len(nodes), 3))
        f[:, 1] += 400 * top - 400 * bottom
        y = nodes[:, 1] * (bottom > 0)
        f[:, 2] += 400 * 30 * bottom * y / (bottom * y * y).sum()
        u, _ = self.solver.solve(fea.balance(nodes, f).ravel(), tolerance=1e-8)
        stress = self.solver.element_stress(u)
        middle = self.grid.element_ijk[:, 2] == 7
        # The bricks of one layer carry the whole sliding force between them.
        self.assertAlmostEqual(stress[middle, 4].mean(), 400 / (40 * 20), delta=0.01)

    def test_balance_leaves_no_net_force_or_moment(self):
        nodes = self.grid.nodes
        f = np.zeros((len(nodes), 3))
        f[0] = (10, -5, 3)
        g = fea.balance(nodes, f)
        np.testing.assert_allclose(g.sum(axis=0), 0, atol=1e-9)
        np.testing.assert_allclose(np.cross(nodes - nodes.mean(axis=0), g).sum(axis=0), 0, atol=1e-6)

    def test_interpolation_reproduces_a_linear_field(self):
        nodes = self.grid.nodes
        values = 2 * nodes[:, 0] - nodes[:, 2] + 5
        points = np.array([(3.3, 1.1, 7.7), (-12.5, -4.0, 20.2)])
        np.testing.assert_allclose(
            fea.interpolate(self.grid, values, points), 2 * points[:, 0] - points[:, 2] + 5, atol=1e-9
        )


class HoldTests(unittest.TestCase):
    def test_every_lab_builds_a_mountable_hold(self):
        for kind in holds.KINDS:
            with self.subTest(kind=kind):
                hold = holds.generated(kind)
                self.assertGreaterEqual(len(hold.holes), 1)
                self.assertAlmostEqual(float(hold.mesh.bounds[0][2]), 0, places=3)
                self.assertTrue(hold.back)

    def test_a_quarter_turn_turns_the_holes_too(self):
        turned = holds.generated("jug", turn=90)
        for a, b in zip(JUG.holes, turned.holes):
            self.assertAlmostEqual(b.x, -a.y, places=6)
            self.assertAlmostEqual(b.y, a.x, places=6)
        with self.assertRaises(ValueError):
            holds.generated("jug", turn=45)

    def test_a_pile_stl_is_laid_on_its_back_and_its_holes_found(self):
        for kind, settings in (("jug", {}), ("pocket", {"bolt_mount": True})):
            with self.subTest(kind=kind):
                made = holds.generated(kind, settings)
                tipped = made.mesh.copy()
                tipped.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
                placed = holds.place_stl(tipped.export(file_type="stl"))
                self.assertAlmostEqual(float(placed.bounds[0][2]), 0, places=3)
                self.assertAlmostEqual(float(placed.bounds[1][2]), float(made.mesh.bounds[1][2]), delta=0.2)
                found = holds.find_holes(holds._solid(placed), float(placed.bounds[1][2]))
                self.assertEqual(len(found), len(made.holes))
                self.assertEqual(sorted(h.bolt for h in found), sorted(h.bolt for h in made.holes))
                for hole in found:
                    nearest = min(made.holes, key=lambda h: abs(h.shank - hole.shank) + abs(h.seat - hole.seat))
                    self.assertAlmostEqual(hole.shank, nearest.shank, delta=0.3)
                    self.assertAlmostEqual(hole.seat, nearest.seat, delta=0.5)
                    self.assertAlmostEqual(hole.head, nearest.head, delta=0.5)

    def test_only_the_sites_own_model_links_are_fetched(self):
        good = "https://" + "a" * 32 + ".r2.cloudflarestorage.com/bucket/key.stl?X-Amz-Signature=1"
        self.assertEqual(holds.check_url(good), good)
        for bad in (
            "http://" + "a" * 32 + ".r2.cloudflarestorage.com/key",
            "https://example.com/key.stl",
            "https://" + "a" * 32 + ".r2.cloudflarestorage.com.evil.com/key",
            "file:///etc/passwd",
            None,
        ):
            with self.assertRaises(ValueError):
                holds.check_url(bad)

    def test_orientations_are_real_quarter_turns(self):
        np.testing.assert_allclose(holds.orientation_matrix("x,-y,-z"), np.diag((1, -1, -1)))
        for bad in ("x,y", "x,x,z", "-x,y,z", "q,y,z"):
            with self.assertRaises(ValueError):
                holds.orientation_matrix(bad)

    def test_a_shape_with_no_holes_cannot_be_mounted(self):
        cube = trimesh.creation.box((40, 40, 20))
        cube.apply_translation((0, 0, 10))
        placed = holds.place_stl(cube.export(file_type="stl"))
        bare = holds._mount("Cube", "pile", placed, holds.find_holes(holds._solid(placed), 20.0), {}, 0)
        with self.assertRaises(ValueError):
            force.analyze(bare, force.Load())


class AnalysisTests(unittest.TestCase):
    def test_the_upper_screws_of_a_jug_carry_the_most(self):
        f = sorted(DEFAULT["fasteners"], key=lambda item: item["y"])
        self.assertGreater(f[-1]["tension"], f[0]["tension"])

    def test_pull_and_wall_balance_on_the_real_back(self):
        s = DEFAULT["summary"]
        fz = DEFAULT["load"]["components"][2]
        self.assertAlmostEqual(s["total_tension"] - s["contact_force"], fz, delta=1.0)

    def test_failure_force_is_where_the_worst_part_reaches_its_limit(self):
        s = DEFAULT["summary"]
        self.assertAlmostEqual(s["failure_force"], 1000 / s["governing"]["use"], delta=0.5)
        doubled = force.analyze(JUG, force.Load(force=2000))
        self.assertAlmostEqual(doubled["summary"]["failure_force"], s["failure_force"], delta=1.0)
        self.assertAlmostEqual(doubled["summary"]["peak"]["use"], 2 * s["peak"]["use"], delta=0.01)

    def test_steeper_walls_peel_harder(self):
        tension = [
            max(f["tension"] for f in force.analyze(JUG, force.Load(wall_angle=a))["fasteners"])
            for a in (0, 30, 60)
        ]
        self.assertLess(tension[0], tension[1])
        self.assertLess(tension[1], tension[2])

    def test_contact_follows_position_and_height(self):
        low = force.analyze(JUG, force.Load(height=0.2))["load"]["point"]
        high = force.analyze(JUG, force.Load(height=0.7))["load"]["point"]
        self.assertGreater(high[2], low[2] + 10)
        across = force.analyze(JUG, force.Load(position=40))["load"]["point"]
        self.assertAlmostEqual(across[0], 40, delta=0.5)

    def test_a_picked_point_snaps_to_the_surface(self):
        target = JUG.display.vertices[123]
        point = force.analyze(JUG, force.Load(point=tuple(target + 0.3)))["load"]["point"]
        np.testing.assert_allclose(point, target, atol=0.01)

    def test_the_hold_check_comes_from_the_stress_solve(self):
        s = DEFAULT["summary"]
        hold_check = next(c for c in DEFAULT["checks"] if c["part"] == "Hold")
        self.assertAlmostEqual(hold_check["use"], s["peak"]["use"])
        self.assertGreater(s["peak"]["use"], 0)
        self.assertLess(s["peak"]["use"], 1)

    def test_weaker_layers_use_more_of_their_strength(self):
        asa = force.analyze(JUG, force.Load(), hold="asa")
        self.assertGreater(asa["summary"]["peak"]["use"], DEFAULT["summary"]["peak"]["use"])

    def test_wall_materials_change_the_result(self):
        concrete = force.analyze(JUG, force.Load(), wall="concrete")
        mdf = force.analyze(JUG, force.Load(), wall="mdf_18")
        self.assertGreater(concrete["summary"]["failure_force"], mdf["summary"]["failure_force"])

    def test_display_mesh_and_colours_line_up(self):
        mesh = DEFAULT["mesh"]
        self.assertEqual(len(mesh["vertices"]) // 3, len(mesh["use"]))
        self.assertEqual(len(mesh["use"]), len(mesh["sigma"]))
        self.assertEqual(max(mesh["faces"]) + 1, len(mesh["use"]))
        p = DEFAULT["pressure"]
        self.assertEqual(len(p["values"]), p["nx"] * p["ny"])

    def test_the_stress_grid_comes_on_request(self):
        result = force.analyze(JUG, force.Load(), grid=True)
        g = result["grid"]
        self.assertEqual(len(g["index"]), len(g["sigma"]))
        self.assertLess(max(g["index"]), g["shape"][0] * g["shape"][1] * g["shape"][2])
        self.assertNotIn("grid", DEFAULT)

    def test_unknown_choices_are_refused(self):
        for kwargs in (dict(wall="cardboard"), dict(hold="wood"), dict(screw="no14")):
            with self.assertRaises(ValueError):
                force.analyze(JUG, force.Load(), **kwargs)


class ScrewTests(unittest.TestCase):
    def test_pull_out_follows_the_wood_handbook(self):
        # p = 108.25 G^2 D L (N, mm): a #10 in plywood at G 0.50.
        q = materials.withdrawal_per_mm(materials.WALLS["plywood_18"], materials.SCREWS["no10"])
        self.assertAlmostEqual(q, 108.25 * 0.5**2 * 4.83, places=6)
        self.assertAlmostEqual(q * 18, 2353, delta=2)

    def test_the_nds_design_value_is_the_ultimate_over_about_five_and_a_half(self):
        screw = materials.SCREWS["no10"]
        nds = 2850 * 0.5**2 * (screw.diameter / 25.4) * 4.448 / 25.4  # N/mm
        q = materials.withdrawal_per_mm(materials.WALLS["plywood_18"], screw)
        self.assertAlmostEqual(q / nds, 15700 / 2850, places=2)

    def test_mdf_matches_face_screw_holding_tests(self):
        q = materials.withdrawal_per_mm(materials.WALLS["mdf_18"], materials.SCREWS["no10"])
        self.assertTrue(1100 <= q * 17 <= 1450)

    def test_a_number_8_grips_less_than_a_number_10(self):
        eight = force.analyze(JUG, force.Load(), screw="no8")["fasteners"][0]
        ten = DEFAULT["fasteners"][0]
        self.assertAlmostEqual(eight["capacity"]["wall"] / ten["capacity"]["wall"], 4.17 / 4.83, places=3)
        self.assertLess(eight["capacity"]["pull_through"], ten["capacity"]["pull_through"])

    def test_every_wall_lists_a_pull_out_for_every_screw(self):
        table = materials.pullout_table()
        self.assertEqual(set(table), set(materials.WALLS))
        for wall, row in table.items():
            self.assertEqual(set(row), set(materials.SCREWS))

    def test_more_thread_in_the_wall_grips_harder(self):
        short = force.analyze(JUG, force.Load(), screw_length=21)
        self.assertLess(short["fasteners"][0]["capacity"]["wall"], DEFAULT["fasteners"][0]["capacity"]["wall"])
        self.assertTrue(any("too short" in n for n in short["notes"]))


class ApiTests(unittest.TestCase):
    def test_schema_lists_every_lab_and_the_materials(self):
        s = contract.schema()
        self.assertEqual(set(s["kinds"]), set(holds.KINDS) - {"pinch"})
        self.assertIn("Round pinch", s["kinds"]["roundpinch"]["presets"])
        self.assertIn("Board jug", s["kinds"]["jug"]["presets"])
        self.assertEqual(set(s["materials"]["walls"]), set(materials.WALLS))
        self.assertIn("pullout_per_mm", s["materials"])

    def test_analyze_round_trip_for_another_lab(self):
        for kind in ("roundpinch", "pinch"):
            with self.subTest(kind=kind):
                status, body = contract.analyze(
                    json.dumps({"source": {"kind": kind, "turn": 90}, "load": {"force": 800}}).encode()
                )
                self.assertEqual(status, 200, body)
                self.assertEqual(body["source"]["kind"], kind)
                np.testing.assert_allclose(
                    body["source"]["dimensions"], holds.generated(kind, turn=90).mesh.extents, atol=0.0051,
                )
                json.dumps(body, allow_nan=False)

    def test_the_mesh_can_be_left_out(self):
        status, body = contract.analyze(b'{"mesh": false}')
        self.assertEqual(status, 200)
        self.assertNotIn("vertices", body["mesh"])

    def test_bad_requests_are_refused(self):
        self.assertEqual(contract.analyze(b"{")[0], 400)
        self.assertEqual(contract.analyze(b"[]")[0], 400)
        self.assertEqual(contract.analyze(b'{"extra": 1}')[0], 400)
        self.assertEqual(contract.analyze(b'{"mesh": 1}')[0], 400)
        self.assertEqual(contract.analyze(b'{"source": {"kind": "boulder"}}')[0], 422)
        self.assertEqual(contract.analyze(b'{"source": {"kind": "jug", "settings": {"colour": 1}}}')[0], 422)
        self.assertEqual(contract.analyze(b'{"source": {"turn": 45}}')[0], 422)
        self.assertEqual(contract.analyze(b'{"source": {"pile": {"url": "https://example.com/a.stl"}}}')[0], 422)
        self.assertEqual(contract.analyze(b'{"wall": "cardboard"}')[0], 422)
        self.assertEqual(contract.analyze(b'{"screw": "lag"}')[0], 422)

    def test_the_vercel_function_loads_the_contract(self):
        import importlib

        sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
        function = importlib.import_module("api.jug_force")
        self.assertTrue(hasattr(function, "handler"))


if __name__ == "__main__":
    unittest.main()
