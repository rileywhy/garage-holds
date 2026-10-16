import importlib
import unittest
import numpy as np

engine=importlib.import_module('tools.custom-shape-generator.geometry')

def request():
    y,x=np.mgrid[:256,:256]
    mask=((x-128)**2/85**2+(y-128)**2/65**2<1).astype(int)
    return dict(document=dict(version=1,size=256,material=mask.ravel().tolist(),holes=[],cuts=[]),parameters=dict(scale=200,depth=30,incut=0))

def cut_for(r,edge='top',position=.5):
    cut=dict(id=f'{edge}-{position}',name='Test cut',enabled=True,edge=edge,position=position,anchor=None,width=.06,depth=2,profile=[0.]*33)
    base=engine.build({**r,'document':{**r['document'],'cuts':[]},'sectionCut':cut})
    cut['anchor']=base.metadata['section']['anchor']
    cut['profile'][8:17]=[.3,.7,1,1,1,1,1,.7,.3]
    return cut

class ProfileTests(unittest.TestCase):
    def test_partial_width_edits_do_not_reject_existing_thin_curved_silhouette(self):
        import manifold3d as m
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        body=m.Manifold.cylinder(30,30,30,96)
        polygon=np.asarray(body.slice(1).to_polygons()[0])
        y,x=np.mgrid[:128,:128]
        u=-12+(x+.5)*84/128
        z=30*(1-(y+.5)/128)
        pixels=((u-30)**2+(z-15)**2<36).astype(int).ravel().tolist()
        for width in (.1,.2,.3):
            for radius in (0,3,8):
                with self.subTest(width=width,radius=radius):
                    cut=dict(id='curved',name='Curved',enabled=True,edge='left',viewBased=True,
                             fullSide=False,position=.5,width=width,depth=6,profile=[0.]*33,
                             blendEnds=True,blendRims=True,insideRadius=radius,outsideRadius=radius,
                             paint=dict(size=128,min=-12,max=72,material=pixels))
                    rotation,along,edge,_=profiles.placement(cut,[polygon],np.zeros(2),100)
                    result=paint.subtract_paint(body,cut,rotation,along,edge,[polygon],100,30,[],4,8,12)
                    data=result.to_mesh()
                    mesh=engine.trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=True)
                    self.assertTrue(mesh.is_watertight)
                    self.assertTrue(mesh.is_winding_consistent)
                    self.assertGreater(result.volume(),0)
                    self.assertLess(result.volume(),body.volume())

    def test_painted_partial_cut_still_rejects_a_new_thin_wall(self):
        import manifold3d as m
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        body=m.Manifold.cube((60,10,30),True).translate((0,0,15))
        polygon=np.array([[-30,-5],[30,-5],[30,5],[-30,5]])
        y,x=np.mgrid[:128,:128]
        u=(x+.5)*12/128
        z=30*(1-(y+.5)/128)
        pixels=((u<9)&(z>8)&(z<22)).astype(int).ravel().tolist()
        cut=dict(id='thin',name='Thin',edge='top',fullSide=False,width=.2,
                 paint=dict(size=128,min=0,max=12,material=pixels))
        with self.assertRaisesRegex(ValueError,'wall thinner than 3 mm'):
            paint.subtract_paint(body,cut,np.eye(2),0,5,[polygon],100,30,[],4,8,12)

    def test_affected_width_starts_at_the_viewed_face_in_all_four_views(self):
        import manifold3d as m
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        body=m.Manifold.cube((60,80,30),True).translate((0,0,15))
        polygon=np.array([[-30,-40],[30,-40],[30,40],[-30,40]])
        y,x=np.mgrid[:256,:256];u=-12+(x+.5)*104/256;z=42-(y+.5)*54/256
        pixels=(((u-1)**2+(z-15)**2)<6**2).astype(int).ravel().tolist()
        for side in ('top','right','bottom','left'):
            with self.subTest(side=side):
                cut=dict(id=side,name=side,enabled=True,edge=side,viewBased=True,fullSide=False,
                         position=.5,width=.1,depth=6,anchor=None,profile=[0.]*33,
                         paint=dict(size=256,min=-12,max=92,bottom=-12,top=42,material=pixels))
                rotation,along,edge,_=profiles.placement(cut,[polygon],np.zeros(2),100)
                local=polygon@rotation;near=local[:,0].min()
                result=paint.subtract_paint(body,cut,rotation,along,edge,[polygon],100,30,[],4,8,12)
                data=result.to_mesh();mesh=engine.trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)
                self.assertTrue(mesh.is_watertight)
                # A 10 mm affected width reaches the visible face, but not
                # the center or the far side of the box.
                near_hits=profiles.intervals(profiles.section(mesh,rotation,near+1.123),15.123)
                center_hits=profiles.intervals(profiles.section(mesh,rotation,.123),15.123)
                beyond_hits=profiles.intervals(profiles.section(mesh,rotation,near+11.123),15.123)
                self.assertLess(near_hits[-1],edge-3)
                self.assertAlmostEqual(center_hits[-1],edge,places=4)
                self.assertAlmostEqual(beyond_hits[-1],edge,places=4)
                wider=paint.subtract_paint(body,{**cut,'width':.2},rotation,along,edge,[polygon],100,30,[],4,8,12)
                self.assertLess(wider.volume(),result.volume())

    def test_painted_cut_height_and_smoothing_change_geometry_without_repainting(self):
        import manifold3d as m
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        body=m.Manifold.cube((60,80,30),True).translate((0,0,15))
        y,x=np.mgrid[:256,:256];u=-12+(x+.5)*104/256;z=42-(y+.5)*54/256
        mask=(u-1)**2+(z-15)**2<6**2
        cut=dict(id='settings',name='Settings',enabled=True,edge='top',fullSide=True,
                 position=.5,width=.1,depth=6,anchor=None,profile=[0.]*33,
                 paint=dict(size=256,min=-12,max=92,bottom=-12,top=42,material=mask.astype(int).ravel().tolist()))
        pixels=list(cut['paint']['material'])
        polygon=np.array([[-30,-40],[30,-40],[30,40],[-30,40]])
        def build(**settings):
            return paint.subtract_paint(body,{**cut,**settings},np.eye(2),0,40,[polygon],100,30,[],4,8,12)
        original=build();shifted=build(heightOffset=5)
        self.assertAlmostEqual(shifted.volume(),original.volume(),places=2)
        def mesh(solid):
            data=solid.to_mesh();return engine.trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)
        original_lines=profiles.section(mesh(original),np.eye(2),0)
        shifted_lines=profiles.section(mesh(shifted),np.eye(2),0)
        self.assertLess(profiles.intervals(original_lines,10)[-1],39)
        self.assertAlmostEqual(profiles.intervals(shifted_lines,10)[-1],40)
        fine=build(edgeSmoothing=.3);soft=build(edgeSmoothing=2)
        self.assertGreater(abs(fine.volume()-soft.volume()),10)
        for solid in (shifted,fine,soft):
            result=mesh(solid)
            self.assertTrue(result.is_watertight)
            self.assertTrue(result.is_winding_consistent)
        self.assertEqual(cut['paint']['material'],pixels)
        for key,value in [('heightOffset',301),('edgeSmoothing',0),('edgeSmoothing',6)]:
            with self.assertRaisesRegex(ValueError,key):profiles.validate_cut({**cut,key:value})

    def test_section_intervals_handle_shared_vertices_gaps_and_horizontal_edges(self):
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        # Two disjoint rectangular sections, including duplicated mesh edges.
        lines=np.array([[[-4,0],[-4,5]],[[-4,5],[-4,10]],[[-2,10],[-2,0]],
                        [[2,0],[2,10]],[[4,10],[4,0]],[[-4,0],[-2,0]],
                        [[-4,0],[-4,5]]],dtype=float)
        for z in (0,2.5,5,9.99):
            self.assertEqual(profiles.intervals(lines,z),[-4,-2,2,4])
            self.assertEqual(profiles.intervals(lines[:,::-1],z),[-4,-2,2,4])
        self.assertEqual(profiles.intervals(lines,10),[])
        self.assertEqual(profiles.intervals(np.empty((0,2,2)),5),[])

    def test_wide_paint_mask_has_a_smooth_physical_boundary(self):
        import manifold3d as m
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        size=256;dx=220/size;dz=54/size
        y,x=np.mgrid[:size,:size]
        mask=((x+.5)*dx-110)**2+(42-(y+.5)*dz-15)**2<8**2
        pieces=[]
        for row in range(size):
            indices=np.flatnonzero(mask[row])
            if not len(indices):continue
            low=indices[0]*dx;high=(indices[-1]+1)*dx
            bottom=42-(row+1)*dz;top=42-row*dz
            pieces.append(m.CrossSection([[(low,bottom),(high,bottom),(high,top),(low,top)]]))
        ring=m.CrossSection.batch_boolean(pieces,m.OpType.Add).to_polygons()[0]
        smooth=paint.smooth_boundary(ring,dx,dz)
        radii=np.linalg.norm(smooth-[110,15],axis=1)
        self.assertLess(np.sqrt(np.mean((radii-8)**2)),.15)
        tangent=np.roll(smooth,-1,axis=0)-smooth
        tangent/=np.linalg.norm(tangent,axis=1)[:,None]
        turns=np.arccos(np.clip(np.sum(tangent*np.roll(tangent,-1,axis=0),axis=1),-1,1))
        self.assertLess(turns.max(),.15)

    def test_outside_strokes_cut_the_part_and_export_watertight(self):
        import manifold3d as m
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        body=m.Manifold.cube((60,80,30),True).translate((0,0,15))
        y,x=np.mgrid[:256,:256];u=-12+(x+.5)*104/256;z=42-(y+.5)*54/256
        mask=((u+1)**2+(z-31)**2<8**2)|((u+1)**2+(z+1)**2<6**2)
        cut=dict(id='outside',name='Outside',edge='top',fullSide=True,
                 paint=dict(size=256,min=-12,max=92,bottom=-12,top=42,material=mask.astype(int).ravel().tolist()))
        paint.validate_paint(cut['paint'])
        polygon=np.array([[-30,-40],[30,-40],[30,40],[-30,40]])
        result=paint.subtract_paint(body,cut,np.eye(2),0,40,[polygon],100,30,[],4,8,12)
        self.assertLess(result.volume(),body.volume()-100)
        data=result.to_mesh()
        mesh=engine.trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)
        self.assertTrue(mesh.is_watertight)
        self.assertTrue(mesh.is_winding_consistent)
        self.assertAlmostEqual(mesh.bounds[0,2],0)
        self.assertAlmostEqual(mesh.bounds[1,2],30)
        for bottom,top in [(1,1),(5,0),(float('nan'),42)]:
            with self.assertRaisesRegex(ValueError,'height bounds'):
                paint.validate_paint({**cut['paint'],'bottom':bottom,'top':top})

    def test_all_side_references_project_holes_and_fitted_countersink_dimensions(self):
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        box=engine.trimesh.creation.box(extents=[80,60,30]);box.apply_translation([0,0,15])
        polygon=np.array([[-40,-30],[40,-30],[40,30],[-40,30]])
        for side in ('right','left','top','bottom'):
            cut=dict(id=side,name=side,enabled=True,edge=side,position=.5,anchor=None,width=.1,depth=6,profile=[0.]*33,viewBased=True)
            reference=profiles.reference(box,cut,[polygon],np.array([0,0]),100,[(10,15),(-20,-10)],5,11,9)
            self.assertEqual(len(reference['holes']),2)
            self.assertEqual(len(reference['outlines']),1)
            rotation,_,edge,_=profiles.placement(cut,[polygon],np.array([0,0]),100)
            for hole,position in zip(reference['holes'],[(10,15),(-20,-10)]):
                self.assertAlmostEqual(hole['center'],edge-(np.asarray(position)@rotation)[1])
                points=np.asarray(hole['outline'])
                self.assertAlmostEqual(points[1,0]-points[0,0],5)
                self.assertAlmostEqual(points[4,0]-points[5,0],11)
                self.assertEqual(points[2,1],9)
                self.assertEqual(points[3,1],12)

    def test_painted_circle_exports_a_smooth_boundary_instead_of_pixel_steps(self):
        import manifold3d as m
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        paint=importlib.import_module('tools.custom-shape-generator.profile_paint')
        body=m.Manifold.cube((60,80,30),True).translate((0,0,15))
        y,x=np.mgrid[:256,:256]
        u=(x+.5)*80/256;z=30*(1-(y+.5)/256)
        mask=(u-40)**2+(z-15)**2<8**2
        cut=dict(id='circle',name='Circle',edge='top',fullSide=True,
                 paint=dict(size=256,min=0,max=80,material=mask.astype(int).ravel().tolist()))
        polygon=np.array([[-30,-40],[30,-40],[30,40],[-30,40]])
        result=paint.subtract_paint(body,cut,np.eye(2),0,40,[polygon],100,30,[],4,8,12)
        data=result.to_mesh()
        mesh=engine.trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)
        lines=profiles.section(mesh,np.eye(2),0)
        changes=np.abs(lines[:,1]-lines[:,0])
        self.assertGreater(np.sum((changes[:,0]>.0001)&(changes[:,1]>.0001)),20)
        self.assertTrue(mesh.is_watertight)
        removed=body.volume()-result.volume()
        self.assertGreater(removed,60*np.pi*7.5**2)
        self.assertLess(removed,60*np.pi*8.5**2)

    def test_view_based_sections_match_the_selected_view_and_keep_legacy_cuts(self):
        profiles=importlib.import_module('tools.custom-shape-generator.profiles')
        box=engine.trimesh.creation.box(extents=[80,40,30])
        box.apply_translation([0,0,15])
        polygon=np.array([[-40,-20],[40,-20],[40,20],[-40,20]])
        for side,width,angle in [('right',40,180),('left',40,0),('top',80,270),('bottom',80,90)]:
            cut=dict(id=side,name=side,enabled=True,edge=side,position=.5,anchor=None,width=.1,depth=6,profile=[0.]*33,viewBased=True)
            reference=profiles.reference(box,cut,[polygon],np.array([0,0]),100)
            self.assertAlmostEqual(np.ptp(np.asarray(reference['segments'])[:,:,0]),width)
            self.assertEqual(profiles.cut_angle(cut),angle)
            cut.pop('viewBased')
            self.assertEqual(profiles.cut_angle(cut),profiles.ANGLES[side])

    def test_high_resolution_cut_discards_detached_cap_and_keeps_mounting_body(self):
        r=request();plain=engine.build(r);cut=cut_for(r)
        cut['profile']=[0.]*33;cut['fullSide']=True
        y,x=np.mgrid[:256,:256];z=30*(1-(y+.5)/256)
        mask=(z>8)&(z<11)
        cut['paint']=dict(size=256,min=-2,max=202,material=mask.astype(int).ravel().tolist())
        r['document']['cuts']=[cut]
        result=engine.build(r)
        self.assertTrue(result.is_watertight)
        import manifold3d as m
        body=m.Manifold(m.Mesh(np.asarray(result.vertices,dtype=np.float32),np.asarray(result.faces,dtype=np.uint32)))
        self.assertEqual(len(body.decompose()),1)
        self.assertAlmostEqual(result.bounds[0,2],0)
        self.assertLess(result.bounds[1,2],9)
        self.assertLess(result.volume,plain.volume/2)

    def test_multiple_actual_cuts_export_watertight_and_preserve_mounting_face(self):
        r=request();plain=engine.build(r)
        r['document']['cuts']=[cut_for(r),cut_for(r,'left')]
        result=engine.build(r)
        self.assertTrue(result.is_watertight)
        self.assertTrue(result.is_winding_consistent)
        self.assertLess(result.volume,plain.volume)
        def back(mesh):return sorted(tuple(p) for p in mesh.vertices if abs(p[2])<1e-6)
        self.assertEqual(back(result),back(plain))
        loaded=engine.trimesh.load_mesh(__import__('io').BytesIO(result.export(file_type='stl')),file_type='stl')
        self.assertTrue(loaded.is_watertight)
        self.assertAlmostEqual(loaded.volume,result.volume,places=2)

    def test_disabled_cut_restores_original_mesh(self):
        r=request();plain=engine.build(r);cut=cut_for(r);cut['enabled']=False
        r['document']['cuts']=[cut]
        unchanged=engine.build(r)
        np.testing.assert_allclose(plain.vertices,unchanged.vertices)
        np.testing.assert_array_equal(plain.faces,unchanged.faces)

    def test_cuts_remain_anchored_when_scale_and_depth_change(self):
        r=request();cut=cut_for(r);r['document']['cuts']=[cut]
        r['parameters'].update(scale=240,depth=45,incut=25)
        mesh=engine.build(r)
        self.assertTrue(mesh.is_watertight)
        self.assertEqual(r['document']['cuts'][0]['anchor'],cut['anchor'])

    def test_concave_outline_with_negative_space(self):
        r=request();mask=np.array(r['document']['material']).reshape((256,256))
        mask[110:145,120:136]=0;mask[160:200,165:215]=0
        r['document']['material']=mask.ravel().tolist()
        r['document']['cuts']=[cut_for(r,'top',.35)]
        mesh=engine.build(r)
        self.assertTrue(mesh.is_watertight)
        self.assertEqual(mesh.euler_number,0)

    def test_removed_anchor_warns_instead_of_relocating_cut(self):
        r=request();cut=cut_for(r);r['document']['cuts']=[cut]
        mask=np.array(r['document']['material']).reshape((256,256));mask[:90]=0
        r['document']['material']=mask.ravel().tolist()
        with self.assertRaisesRegex(ValueError,'anchor|region'):
            engine.build(r)

    def test_unsafe_thickness_and_mounting_hole_cuts_rejected(self):
        r=request();cut=cut_for(r);cut['depth']=60;r['parameters']['scale']=80;r['document']['cuts']=[cut]
        with self.assertRaisesRegex(ValueError,'3 mm'):
            engine.build(r)
        r=request();cut=cut_for(r);cut['depth']=22;cut['profile']=[.7]*33
        r['document']['holes']=[dict(x=128,y=94)]
        r['document']['cuts']=[cut]
        with self.assertRaisesRegex(ValueError,'mounting hole'):
            engine.build(r)

    def test_cut_preview_matches_export(self):
        r=request();r['document']['cuts']=[cut_for(r)]
        full=engine.build(r);r['action']='preview';preview=engine.build(r)
        self.assertTrue(preview.is_watertight)
        self.assertLess(abs(preview.volume-full.volume)/full.volume,.003)

    def test_extreme_incuts_and_body_depths_with_profiles(self):
        for angle in (-60,60):
            for depth in (16,70):
                with self.subTest(angle=angle,depth=depth):
                    r=request();r['parameters'].update(incut=angle,depth=depth)
                    cut=cut_for(r);cut['depth']=.5;r['document']['cuts']=[cut]
                    result=engine.build(r)
                    self.assertTrue(result.is_watertight)
                    self.assertTrue(result.is_winding_consistent)

    def test_invalid_profile_and_placement_rejected(self):
        r=request();cut=cut_for(r);cut['profile']=[0,1];r['document']['cuts']=[cut]
        with self.assertRaisesRegex(ValueError,'33 samples'):engine.build(r)

    def test_full_side_removes_more_than_localized_cut(self):
        r=request();cut=cut_for(r);r['document']['cuts']=[cut]
        local=engine.build(r)
        cut['fullSide']=True
        whole=engine.build(r)
        self.assertTrue(whole.is_watertight)
        self.assertLess(whole.volume,local.volume-100)

    def test_depth_over_sixty_mm_is_allowed_when_it_fits(self):
        r=request();cut=cut_for(r);cut['depth']=65;r['document']['cuts']=[cut]
        model=engine.build(r)
        self.assertTrue(model.is_watertight)

    def test_painted_areas_do_not_remove_material_between_strokes(self):
        r=request();cut=cut_for(r);cut['profile']=[0.]*33
        y,x=np.mgrid[:128,:128];mm=-2+(x+.5)*104/128;z=30*(1-(y+.5)/128)
        mask=((mm-1)**2+(z-8)**2<3**2)|((mm-1)**2+(z-21)**2<3**2)
        cut['paint']=dict(size=128,min=-2,max=102,material=mask.astype(int).ravel().tolist())
        plain=engine.build(r);r['document']['cuts']=[cut];result=engine.build(r)
        self.assertTrue(result.is_watertight)
        self.assertLess(result.volume,plain.volume)
        def outer(mesh,z):
            lines=engine.trimesh.intersections.mesh_plane(mesh,[1,0,0],[0,0,0])
            local=lines[:,:,[1,2]]
            return importlib.import_module('tools.custom-shape-generator.profiles').intervals(local,z)[-1]
        self.assertAlmostEqual(outer(plain,14),outer(result,14),places=4)
        self.assertLess(outer(result,8),outer(plain,8)-2)

    def test_painted_cut_reaches_zero_without_a_base_ledge(self):
        r=request();cut=cut_for(r);cut['profile']=[0.]*33
        y,x=np.mgrid[:128,:128];mm=-2+(x+.5)*104/128;z=30*(1-(y+.5)/128)
        mask=(mm-1)**2+z*z<4**2
        cut['paint']=dict(size=128,min=-2,max=102,material=mask.astype(int).ravel().tolist())
        plain=engine.build(r);r['document']['cuts']=[cut];result=engine.build(r)
        self.assertTrue(result.is_watertight)
        self.assertEqual(result.bounds[0,2],0)
        old=plain.vertices[np.isclose(plain.vertices[:,2],0)];new=result.vertices[np.isclose(result.vertices[:,2],0)]
        self.assertTrue(np.any((np.abs(new[:,0])<7)&(new[:,1]<old[:,1].max()-2)&(new[:,1]>0)))

    def test_painted_cut_protects_mounting_recesses(self):
        r=request();cut=cut_for(r);cut['profile']=[0.]*33;cut['fullSide']=True
        y,x=np.mgrid[:128,:128];mm=-2+(x+.5)*104/128;z=30*(1-(y+.5)/128)
        mask=(mm-24)**2+(z-12)**2<6**2
        cut['paint']=dict(size=128,min=-2,max=102,material=mask.astype(int).ravel().tolist())
        r['document']['holes']=[dict(x=128,y=94)];r['document']['cuts']=[cut]
        with self.assertRaisesRegex(ValueError,'mounting hole'):engine.build(r)

if __name__=='__main__':unittest.main()
