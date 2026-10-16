import importlib
import unittest
import numpy as np
engine=importlib.import_module('tools.custom-shape-generator.geometry')

def request(holes=None):
    y,x=np.mgrid[:256,:256]
    mask=((x-128)**2/85**2+(y-128)**2/65**2<1).astype(int)
    return dict(document=dict(version=1,size=256,material=mask.ravel().tolist(),holes=holes or []),parameters=dict(scale=200,depth=30,incut=10))

class GeometryTests(unittest.TestCase):
    def test_binary_preview_transports_mesh_and_metadata_exactly(self):
        import struct
        api=importlib.import_module('api.custom_shape')
        r=request();r['action']='preview'
        mesh=engine.build(r)
        payload=api.preview_bytes(mesh)
        vertices,faces,volume,seat=struct.unpack('<IIdd',payload[:24])
        self.assertEqual(len(payload),24+12*(vertices+faces))
        self.assertEqual(volume,round(mesh.volume/1000,2))
        self.assertEqual(seat,mesh.metadata['seatDepth'])
        np.testing.assert_array_equal(np.frombuffer(payload,dtype='<f4',count=vertices*3,offset=24).reshape((-1,3)),mesh.vertices.astype(np.float32))
        np.testing.assert_array_equal(np.frombuffer(payload,dtype='<u4',offset=24+vertices*12).reshape((-1,3)),mesh.faces)

    def test_preview_is_lighter_and_matches_export_dimensions(self):
        for settings in ({'incut':0}, {'incut':35,'gripDepth':8},
                         {'incut':0,'bodyTaper':8}, {'incut':0,'gripAllSides':True,'gripDepth':6}):
            with self.subTest(settings=settings):
                r=request([dict(x=100,y=128),dict(x=156,y=128)])
                r['parameters'].update(settings)
                full=engine.build(r)
                r['action']='preview'
                preview=engine.build(r)
                self.assertTrue(preview.is_watertight)
                self.assertTrue(preview.is_winding_consistent)
                self.assertLess(len(preview.faces),len(full.faces)*.65)
                np.testing.assert_allclose(preview.bounds,full.bounds,atol=.03)
                self.assertLess(abs(preview.volume-full.volume)/full.volume,.003)
                self.assertAlmostEqual(preview.metadata['seatDepth'],full.metadata['seatDepth'])

    def test_drawing_cache_reuses_outline_for_parameter_and_hole_edits(self):
        engine.prepared_body.cache_clear()
        engine.prepare_mask.cache_clear()
        r=request()
        engine.build(r)
        r['parameters']['depth']=35
        r['document']['holes']=[dict(x=100,y=128)]
        engine.build(r)
        self.assertEqual(engine.prepare_mask.cache_info().hits,1)
        self.assertEqual(engine.prepare_mask.cache_info().misses,1)
        # Changing the mask must not reuse geometry from the earlier drawing.
        r['document']['material'][0]=1
        with self.assertRaisesRegex(ValueError,'connect'):
            engine.build(r)

    def test_watertight_flat_back(self):
        mesh=engine.build(request())
        self.assertTrue(mesh.is_watertight)
        self.assertTrue(mesh.is_winding_consistent)
        self.assertEqual(mesh.bounds[0,2],0)
        self.assertAlmostEqual(mesh.bounds[1,2],30)
    def test_real_holes(self):
        plain=engine.build(request())
        cut=engine.build(request([dict(x=100,y=128),dict(x=156,y=128)]))
        self.assertTrue(cut.is_watertight)
        self.assertLess(cut.volume,plain.volume)
        self.assertEqual(cut.euler_number,-2)
    def test_disconnected(self):
        r=request();r['document']['material'][0]=1
        with self.assertRaisesRegex(ValueError,'connect'):
            engine.build(r)
    def test_edge_hole(self):
        with self.assertRaisesRegex(ValueError,'farther'):
            engine.build(request([dict(x=210,y=128)]))
    def test_concave_and_erased_void(self):
        r=request();a=np.array(r['document']['material']).reshape(256,256);a[100:150,125:145]=0
        r['document']['material']=a.ravel().tolist()
        mesh=engine.build(r)
        self.assertTrue(mesh.is_watertight)
        self.assertEqual(mesh.euler_number,0)
    def test_parameters_preserve_mask(self):
        r=request();copy=list(r['document']['material']);a=engine.build(r)
        r['parameters']['depth']=45;r['parameters']['incut']=-15
        b=engine.build(r)
        self.assertTrue(b.is_watertight)
        self.assertNotEqual(a.volume,b.volume)
        self.assertEqual(copy,r['document']['material'])
    def test_incut_preserves_back_and_lower_support(self):
        r=request();r['parameters']['incut']=0;a=engine.build(r)
        r['parameters']['incut']=60;b=engine.build(r)
        def back(mesh):
            return sorted(tuple(p) for p in mesh.vertices if p[2] <= 6.00001)
        self.assertEqual(back(a),back(b))
        self.assertTrue(b.is_watertight)
        self.assertNotEqual(a.volume,b.volume)
    def test_jug_pocket_and_comfort(self):
        r=request();a=engine.build(r)
        r['parameters'].update(gripDepth=12,lipRadius=6,bodyRounding=5,incut=35)
        b=engine.build(r)
        self.assertTrue(b.is_watertight)
        self.assertTrue(b.is_winding_consistent)
        self.assertEqual(b.euler_number,2)
        self.assertLess(b.volume,a.volume)
        self.assertEqual(b.bounds[0,2],0)
    def test_countersink_does_not_move_body_or_holes(self):
        r=request([dict(x=100,y=128),dict(x=156,y=128)])
        a=engine.build(r)
        r['parameters'].update(autoSeat=False,seatDepth=6,headDiameter=13)
        b=engine.build(r)
        self.assertTrue(b.is_watertight)
        np.testing.assert_allclose(a.bounds,b.bounds)
        self.assertNotEqual(a.volume,b.volume)
        def back(mesh):return sorted(tuple(p) for p in mesh.vertices if abs(p[2]) < .00001)
        self.assertEqual(back(a),back(b))
    def test_invalid_mask(self):
        r=request();r['document']['material'][0]=2
        with self.assertRaises(ValueError):engine.build(r)

    def test_extreme_incuts_and_edge_depth_reach_the_base(self):
        for incut in (-60, 60):
            with self.subTest(incut=incut):
                r=request();r['parameters'].update(incut=incut, gripDepth=80, lipRadius=18)
                mesh=engine.build(r)
                self.assertTrue(mesh.is_watertight)
                self.assertEqual(mesh.bounds[0,2], 0)
        shallow=request();shallow['parameters']['gripDepth']=0
        deep=request();deep['parameters']['gripDepth']=80
        self.assertLess(engine.build(deep).volume, engine.build(shallow).volume)

    def test_lip_radius_and_edge_scoop_change_the_gripping_profile(self):
        sharp = request(); sharp['parameters'].update(gripDepth=0, lipRadius=1)
        comfortable = request(); comfortable['parameters'].update(gripDepth=0, lipRadius=15)
        scooped = request(); scooped['parameters'].update(gripDepth=25, lipRadius=4)
        sharp_mesh = engine.build(sharp)
        comfortable_mesh = engine.build(comfortable)
        scooped_mesh = engine.build(scooped)
        self.assertLess(comfortable_mesh.volume, sharp_mesh.volume)
        self.assertLess(scooped_mesh.volume, sharp_mesh.volume)
        self.assertTrue(comfortable_mesh.is_watertight)
        self.assertTrue(scooped_mesh.is_watertight)

    def test_scoop_preserves_convex_lip(self):
        for incut in (-60, 0, 60):
            with self.subTest(incut=incut):
                r=request();r['parameters'].update(incut=incut, lipRadius=6, gripDepth=0)
                plain=engine.build(r)
                r['parameters']['gripDepth']=12
                scooped=engine.build(r)
                def protected(mesh):
                    return sorted(tuple(p) for p in mesh.vertices if p[2]>=30-.00001)
                self.assertEqual(protected(plain),protected(scooped))
                self.assertLess(scooped.volume,plain.volume)
                self.assertTrue(scooped.is_watertight)

    def test_default_lip_radius_is_ten_mm(self):
        r=request()
        default=engine.build(r)
        r['parameters']['lipRadius']=10
        explicit=engine.build(r)
        np.testing.assert_allclose(default.vertices,explicit.vertices)
        np.testing.assert_array_equal(default.faces,explicit.faces)

    def test_top_rim_has_two_mm_minimum_fillet(self):
        r=request();r['parameters'].update(incut=0,lipRadius=1,bodyRounding=0)
        mesh=engine.build(r)
        top=mesh.vertices[np.isclose(mesh.vertices[:,2],30)]
        np.testing.assert_allclose(top[:,:2].min(axis=0),mesh.bounds[0,:2]+2,atol=.03)
        np.testing.assert_allclose(top[:,:2].max(axis=0),mesh.bounds[1,:2]-2,atol=.03)

    def test_lip_rounding_changes_entire_outer_top_rim(self):
        r=request();r['parameters'].update(incut=0,lipRadius=2,bodyRounding=0,gripAllSides=True)
        small=engine.build(r)
        r['parameters']['lipRadius']=10
        large=engine.build(r)
        def top_bounds(mesh):
            top=mesh.vertices[np.isclose(mesh.vertices[:,2],30)]
            return top[:,:2].min(axis=0),top[:,:2].max(axis=0)
        small_low,small_high=top_bounds(small)
        large_low,large_high=top_bounds(large)
        self.assertTrue(np.all(large_low>small_low+7.9))
        self.assertTrue(np.all(large_high<small_high-7.9))

    def test_top_only_lip_leaves_side_and_bottom_edges_unchanged(self):
        r=request();r['parameters'].update(incut=0,lipRadius=2,bodyRounding=0)
        small=engine.build(r)
        r['parameters']['lipRadius']=10
        large=engine.build(r)
        def top_bounds(mesh):
            top=mesh.vertices[np.isclose(mesh.vertices[:,2],30)]
            return top[:,:2].min(axis=0),top[:,:2].max(axis=0)
        a,b=top_bounds(small);c,d=top_bounds(large)
        np.testing.assert_allclose(a,c,atol=.01)
        self.assertAlmostEqual(b[0],d[0],places=2)
        self.assertGreater(b[1]-d[1],7.5)

    def test_all_sides_applies_scoop_to_bottom_and_side_faces(self):
        r=request();r['parameters'].update(incut=0,gripDepth=8)
        top=engine.build(r)
        r['parameters']['gripAllSides']=True
        all_sides=engine.build(r)
        self.assertTrue(all_sides.is_watertight)
        def back_bounds(mesh):
            back=mesh.vertices[np.isclose(mesh.vertices[:,2],0)]
            return back[:,:2].min(axis=0),back[:,:2].max(axis=0)
        top_low,top_high=back_bounds(top);all_low,all_high=back_bounds(all_sides)
        self.assertTrue(np.all(all_low>top_low+7))
        self.assertLess(all_high[0],top_high[0]-7)

    def test_incut_defaults_to_zero(self):
        r=request();del r['parameters']['incut']
        default=engine.build(r)
        r['parameters']['incut']=0
        explicit=engine.build(r)
        np.testing.assert_allclose(default.vertices,explicit.vertices)

    def test_body_taper_keeps_grabbing_height_and_flat_back(self):
        r=request();r['parameters'].update(incut=0,bodyTaper=0)
        plain=engine.build(r)
        r['parameters']['bodyTaper']=10
        tapered=engine.build(r)
        def back(mesh):
            return sorted(tuple(p) for p in mesh.vertices if abs(p[2])<.00001)
        self.assertEqual(back(plain),back(tapered))
        self.assertAlmostEqual(tapered.bounds[1,2],30)
        threshold=plain.bounds[1,1]-10+.001
        def grip(mesh):
            return sorted(tuple(p) for p in mesh.vertices if p[1]>=threshold)
        self.assertEqual(grip(plain),grip(tapered))
        bottom=plain.bounds[0,1]+.1
        def bottom_height(mesh):
            return mesh.vertices[mesh.vertices[:,1]<=bottom,2].max()
        self.assertLess(bottom_height(tapered),bottom_height(plain)-10)
        self.assertLess(tapered.volume,plain.volume)
        self.assertTrue(tapered.is_watertight)

    def test_taper_with_scoop_void_and_mounting_holes(self):
        r=request([dict(x=100,y=128),dict(x=156,y=128)])
        a=np.array(r['document']['material']).reshape(256,256)
        a[145:165,120:136]=0
        r['document']['material']=a.ravel().tolist()
        r['parameters'].update(incut=0,bodyTaper=8,gripDepth=8)
        mesh=engine.build(r)
        self.assertTrue(mesh.is_watertight)
        self.assertTrue(mesh.is_winding_consistent)
        self.assertEqual(mesh.bounds[0,2],0)

    def test_scoop_joins_lip_with_vertical_tangent(self):
        r=request();r['parameters'].update(incut=0,lipRadius=10,gripDepth=12)
        mesh=engine.build(r)
        # Intersect the actual centre profile just below the lip. A circular
        # cutter clipped into the edge creates a steep shoulder here.
        def edge_at(z):
            lines=engine.trimesh.intersections.mesh_plane(mesh,[0,0,1],[0,0,z])
            crossing=[]
            for a,b in lines:
                if a[0]*b[0]<=0 and abs(b[0]-a[0])>1e-8:
                    crossing.append(a[1]+(b[1]-a[1])*(-a[0])/(b[0]-a[0]))
            return max(crossing)
        self.assertLess(abs(edge_at(20)-edge_at(19.9)),.03)
        self.assertGreater(edge_at(20)-edge_at(13),5)
        # Once the scoop reaches vertical, the inner face stays at the same
        # location all the way down to the mounting base.
        self.assertAlmostEqual(edge_at(10),edge_at(6),places=4)
        self.assertAlmostEqual(edge_at(6),edge_at(.01),places=4)
        self.assertGreater(edge_at(20)-edge_at(.01),11)

if __name__=='__main__':unittest.main()
