import importlib
import unittest
import numpy as np
import manifold3d as m
import trimesh

blend=importlib.import_module('tools.custom-shape-generator.blending').blend_cut
cut_extrusion=importlib.import_module('tools.custom-shape-generator.blending').cut_extrusion
profiles=importlib.import_module('tools.custom-shape-generator.profiles')


def mesh(solid):
    data=solid.to_mesh()
    return trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)


def sharp_length(solid,partial):
    surface=mesh(solid);edges=surface.vertices[surface.face_adjacency_edges]
    midpoint=edges.mean(axis=1)
    region=((midpoint[:,0]>23)&(midpoint[:,0]<27)) if partial else ((midpoint[:,0]<2)|(midpoint[:,0]>38))
    region&=(midpoint[:,1]<7)&(midpoint[:,2]>3)&(midpoint[:,2]<17)
    sharp=surface.face_adjacency_angles>np.radians(60)
    return np.linalg.norm(edges[:,1]-edges[:,0],axis=1)[region&sharp].sum()


class BlendingTests(unittest.TestCase):
    def test_large_blend_has_no_corrugation_on_the_approach_to_the_cut(self):
        body=m.Manifold.cube((40,40,20)).as_original()
        section=m.CrossSection([[(-6,12),(6,12),(6,24),(-6,24)]])
        cutter=cut_extrusion(section,30,True,4).transform(((0,0,1,-5),(1,0,0,0),(0,1,0,0))).as_original()
        rounded=blend(body-cutter,cutter.original_id(),np.array([1.,0,0]),False,True,8,25)
        surface=mesh(rounded);points=surface.vertices[surface.face_adjacency_edges]
        midpoint=points.mean(axis=1)
        approach=(midpoint[:,0]>2)&(midpoint[:,0]<28)&(midpoint[:,1]<1)&(midpoint[:,2]>4)&(midpoint[:,2]<11)
        # Integrated normal variation detects the wrinkles introduced by the
        # old coarse triangulation and per-vertex freeze, independently of shading.
        lengths=np.linalg.norm(points[:,1]-points[:,0],axis=1)
        variation=np.sum((surface.face_adjacency_angles**2*lengths)[approach])
        self.assertLess(variation,4.5)

    def test_radius_combinations_preserve_dimensions_and_export_topology(self):
        section=m.CrossSection([[(-6,12),(6,12),(6,24),(-6,24)]])
        bodies=[m.Manifold.cube((40,40,20)),m.Manifold.cylinder(20,30,30,64)]
        for body in bodies:
            body=body.as_original();bounds=mesh(body).bounds
            for inside,outside in ((.75,.75),(1.5,3),(3,1.5),(3,8),(8,3),(8,8)):
                with self.subTest(bounds=bounds.tolist(),inside=inside,outside=outside):
                    cutter=cut_extrusion(section,50,True,inside).transform(((0,0,1,-35),(1,0,0,0),(0,1,0,0))).as_original()
                    raw=body-cutter
                    rounded=blend(raw,cutter.original_id(),np.array([1.,0,0]),False,True,outside,15)
                    surface=mesh(rounded)
                    self.assertTrue(surface.is_watertight)
                    self.assertTrue(surface.is_winding_consistent)
                    np.testing.assert_allclose(surface.bounds,bounds,atol=.002)
                    self.assertAlmostEqual(raw.slice(.00001).area(),rounded.slice(.00001).area(),places=4)
                    self.assertLess(np.degrees(surface.face_adjacency_angles).max(),91)
                    exported=trimesh.load_mesh(__import__('io').BytesIO(surface.export(file_type='stl')),file_type='stl')
                    self.assertTrue(exported.is_watertight)
                    self.assertTrue(exported.is_winding_consistent)
                    self.assertGreater(exported.volume,0)

    def test_outside_radius_rounds_original_edge_beside_partial_stop(self):
        body=m.Manifold.cube((40,40,20)).as_original()
        section=m.CrossSection([[(-6,12),(6,12),(6,24),(-6,24)]])
        cutter=cut_extrusion(section,30,True).transform(((0,0,1,-5),(1,0,0,0),(0,1,0,0))).as_original()
        raw=body-cutter
        def sharp_top(solid):
            surface=mesh(solid);points=surface.vertices[surface.face_adjacency_edges];mid=points.mean(axis=1)
            selected=(mid[:,0]>22)&(mid[:,0]<28)&(mid[:,2]>18)&(mid[:,1]<8)
            selected&=surface.face_adjacency_angles>np.radians(45)
            return np.linalg.norm(points[:,1]-points[:,0],axis=1)[selected].sum()
        volumes=[]
        for radius in (.75,1.5,3):
            rounded=blend(raw,cutter.original_id(),np.array([1.,0,0]),False,True,radius=radius,end_plane=25)
            self.assertLess(sharp_top(rounded),sharp_top(raw)*.5)
            self.assertTrue(mesh(rounded).is_watertight)
            self.assertAlmostEqual(rounded.slice(.00001).area(),raw.slice(.00001).area(),places=5)
            volumes.append(rounded.volume())
        self.assertGreater(volumes[0],volumes[1])
        self.assertGreater(volumes[1],volumes[2])
        self.assertEqual(blend(raw,cutter.original_id(),np.array([1.,0,0]),False,True,radius=0).volume(),raw.volume())

    def test_inside_radius_sets_the_rolling_cutter_geometry(self):
        section=m.CrossSection([[(0,0),(10,0),(10,10),(0,10)]])
        for radius in (.75,1.5,3):
            rounded=cut_extrusion(section,20,True,radius)
            points=np.concatenate(rounded.slice(20-radius+radius/np.sqrt(2)).to_polygons())
            self.assertAlmostEqual(points[:,0].min(),radius-radius/np.sqrt(2),delta=.02)
            self.assertTrue(mesh(rounded).is_watertight)
        self.assertAlmostEqual(cut_extrusion(section,20,True,0).volume(),2000)

    def test_radii_reject_invalid_values(self):
        cut=dict(id='radius',enabled=True,edge='top',position=.5,width=.2,depth=6,profile=[0.]*33,anchor=None)
        for key in ('insideRadius','outsideRadius'):
            for value in (-1,8.25,float('nan'),None,True,'2'):
                with self.subTest(key=key,value=value),self.assertRaisesRegex(ValueError,key):
                    profiles.validate_cut({**cut,key:value})

    def test_fast_rounding_keeps_deliberate_concave_paint_shapes(self):
        section=m.CrossSection([[(0,0),(10,0),(10,4),(4,4),(4,10),(0,10)]])
        rounded=cut_extrusion(section,20,True)
        notch=m.CrossSection([[(6,6),(6.5,6),(6.5,6.5),(6,6.5)]])
        self.assertLess((rounded.slice(19.8)^notch).area(),1e-6)
        self.assertTrue(mesh(rounded).is_watertight)

    def test_partial_stop_has_a_real_one_point_five_millimeter_radius(self):
        section=m.CrossSection([[(0,0),(10,0),(10,10),(0,10)]])
        rounded=cut_extrusion(section,20,True)
        sharp=cut_extrusion(section,20,False)
        z=20-1.5+1.5/np.sqrt(2)
        polygons=rounded.slice(z).to_polygons()
        points=np.concatenate(polygons)
        self.assertAlmostEqual(points[:,0].max(),10-1.5+1.5/np.sqrt(2),delta=.02)
        self.assertAlmostEqual(points[:,0].min(),1.5-1.5/np.sqrt(2),delta=.02)
        self.assertLess(rounded.volume(),sharp.volume())
        self.assertAlmostEqual(rounded.bounding_box()[5],20,places=4)
        self.assertTrue(mesh(rounded).is_watertight)

    def test_blended_painted_hold_exports_at_full_stl_resolution(self):
        engine=importlib.import_module('tools.custom-shape-generator.geometry')
        y,x=np.mgrid[:256,:256]
        material=(x-np.clip(x,64,192))**2+(y-140)**2<=50**2
        cut=dict(id='export',name='Export',enabled=True,edge='top',viewBased=True,fullSide=False,
                 position=.5,width=.12,depth=6,anchor=None,profile=[0.]*33,blendEnds=True,blendRims=True)
        request=dict(action='preview',document=dict(version=1,size=256,material=material.astype(int).ravel().tolist(),
                     holes=[dict(x=85,y=140),dict(x=171,y=140)],cuts=[]),parameters={})
        reference=engine.build({**request,'sectionCut':cut}).metadata['section']
        cut['anchor']=reference['anchor']
        xs=[point[0] for segment in reference['segments'] for point in segment]
        low=min(0,min(xs))-12;high=max(1,max(xs))+12
        u=low+(x+.5)*(high-low)/256;z=42-(y+.5)*54/256
        cut['paint']=dict(size=256,min=low,max=high,bottom=-12,top=42,
                          material=(((u-30)**2+(z-15)**2)<=6**2).astype(int).ravel().tolist())
        request['document']['cuts']=[cut]
        preview=engine.build(request)
        exported=engine.build({**request,'action':'stl'})
        self.assertTrue(preview.is_watertight)
        self.assertTrue(exported.is_watertight)
        self.assertTrue(exported.is_winding_consistent)
        self.assertAlmostEqual(exported.bounds[0,2],0)
        self.assertLess(abs(preview.volume-exported.volume)/exported.volume,.005)
        # Dense painted geometry used to discard every fairing displacement
        # when a few skinny triangles could not move safely.
        cut['outsideRadius']=0
        sharp=engine.build(request)
        cut['outsideRadius']=.75
        small=engine.build(request)
        cut['outsideRadius']=3
        large=engine.build(request)
        self.assertGreater(sharp.volume-large.volume,5)
        # The continuous constraint field may retain more material than the
        # old discontinuous freeze, but radius changes must remain effective.
        self.assertGreater(small.volume-large.volume,1)
        cut['insideRadius']=8;cut['outsideRadius']=8
        maximum=engine.build(request)
        self.assertTrue(maximum.is_watertight)
        self.assertTrue(maximum.is_winding_consistent)

    def test_cut_crossing_rounded_top_keeps_topology_without_proximity_welding(self):
        engine=importlib.import_module('tools.custom-shape-generator.geometry')
        y,x=np.mgrid[:256,:256]
        material=(x-np.clip(x,64,192))**2+(y-140)**2<=50**2
        cut=dict(id='lip',name='Lip',enabled=True,edge='top',viewBased=True,fullSide=True,
                 position=.5,width=.12,depth=6,anchor=None,profile=[0.]*33,blendEnds=True,blendRims=True)
        request=dict(action='preview',document=dict(version=1,size=256,material=material.astype(int).ravel().tolist(),
                     holes=[dict(x=85,y=140),dict(x=171,y=140)],cuts=[]),parameters={})
        reference=engine.build({**request,'sectionCut':cut}).metadata['section']
        cut['anchor']=reference['anchor']
        xs=[point[0] for segment in reference['segments'] for point in segment]
        low=min(0,min(xs))-12;high=max(1,max(xs))+12
        u=low+(x+.5)*(high-low)/256;z=42-(y+.5)*54/256
        cut['paint']=dict(size=256,min=low,max=high,bottom=-12,top=42,
                          material=(((u-20)**2+(z-27)**2)<36).astype(int).ravel().tolist())
        request['document']['cuts']=[cut]
        for action in ('preview','stl'):
            with self.subTest(action=action):
                result=engine.build({**request,'action':action})
                self.assertTrue(result.is_watertight)
                self.assertTrue(result.is_winding_consistent)
                self.assertGreater(result.volume,0)
                exported=trimesh.load_mesh(__import__('io').BytesIO(result.export(file_type='stl')),file_type='stl')
                self.assertTrue(exported.is_watertight)
        hits=engine.prepared_body.cache_info().hits
        # Changing the cut must reuse the body, while still recomputing the cut.
        cut['blendRims']=False
        unblended=engine.build(request)
        self.assertGreater(engine.prepared_body.cache_info().hits,hits)
        self.assertTrue(unblended.is_watertight)

    def test_partial_stops_and_through_cut_rims_are_geometrically_blended(self):
        body=m.Manifold.cube((40,40,20)).as_original()
        for partial,length in ((True,30),(False,50)):
            with self.subTest(partial=partial):
                cutter=m.Manifold.cylinder(length,6,6,32).rotate((0,90,0)).translate((-5,0,10)).as_original()
                raw=body-cutter
                rounded=blend(raw,cutter.original_id(),np.array([1.,0,0]),partial,not partial)
                self.assertLess(sharp_length(rounded,partial),sharp_length(raw,partial)*.4)
                surface=mesh(rounded)
                self.assertTrue(surface.is_watertight)
                self.assertTrue(surface.is_winding_consistent)
                self.assertAlmostEqual(surface.bounds[0,2],0)
                self.assertLess(np.degrees(surface.face_adjacency_angles).max(),91)
                self.assertAlmostEqual(raw.slice(.00001).area(),rounded.slice(.00001).area(),places=2)
                restored=blend(raw,cutter.original_id(),np.array([1.,0,0]),False,False)
                self.assertEqual(restored.volume(),raw.volume())
                np.testing.assert_array_equal(restored.to_mesh().vert_properties,raw.to_mesh().vert_properties)
                exported=trimesh.load_mesh(__import__('io').BytesIO(surface.export(file_type='stl')),file_type='stl')
                self.assertTrue(exported.is_watertight)

    def test_blend_flags_require_booleans(self):
        cut=dict(id='cut',enabled=True,edge='top',position=.5,width=.2,depth=6,profile=[0.]*33,anchor=None)
        for key in ('blendEnds','blendRims'):
            with self.assertRaisesRegex(ValueError,key):profiles.validate_cut({**cut,key:'true'})
