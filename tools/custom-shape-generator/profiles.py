"""Localized, editable side-section subtraction; no shared lab changes."""
import math
import numpy as np
import manifold3d as m
import trimesh
from tools.hold_mounting import _inside, _room
from .profile_paint import validate_paint, subtract_paint
from .blending import blend_cut,cut_extrusion

ANGLES={'top':0,'left':90,'bottom':180,'right':270}
VIEW_ANGLES={'top':270,'left':0,'bottom':90,'right':180}

def cut_angle(cut):
    # Old saved profiles keep their original material-edge orientation.
    return (VIEW_ANGLES if cut.get('viewBased',False) else ANGLES)[cut['edge']]

def mounting_piece(trial,holes,shank,head,seat,name):
    """Discard offcuts; retain the wall-mounted piece carrying the screws."""
    if trial.status()!=m.Error.NoError or trial.volume()<=0:
        raise ValueError(f'{name}: this cut removes the entire hold.')
    candidates=[]
    for piece in trial.decompose():
        contact=piece.slice(.001).area()
        if contact<=.001:continue
        if holes and not _inside(np.asarray(holes),_room(piece,shank,head,seat,False,edge_clearance=3)).all():continue
        candidates.append((contact,piece.volume(),piece))
    if not candidates:
        raise ValueError(f'{name}: keep a mounting base with clearance around every mounting hole.')
    return max(candidates,key=lambda candidate:candidate[:2])[2]

def validate_cut(cut):
    if not isinstance(cut,dict) or not isinstance(cut.get('id'),str) or not cut['id']:
        raise ValueError('Invalid cut profile.')
    if cut.get('edge') not in ANGLES or type(cut.get('enabled')) is not bool:
        raise ValueError('Choose a valid cut edge and enabled state.')
    for key,low,high in [('position',.05,.95),('width',.01,.8)]:
        value=cut.get(key)
        if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:
            raise ValueError(f'Cut {key} must be between {low} and {high}.')
    if type(cut.get('depth')) not in (int,float) or not math.isfinite(cut['depth']) or cut['depth']<=0:
        raise ValueError('Cut depth must be a positive finite number.')
    for key,low,high in [('heightOffset',-300,300),('edgeSmoothing',.1,5),('insideRadius',0,8),('outsideRadius',0,8)]:
        value=cut.get(key)
        if (value is not None or (key in ('insideRadius','outsideRadius') and key in cut)) and (type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high):
            raise ValueError(f'Cut {key} must be between {low} and {high}.')
    if type(cut.get('fullSide',False)) is not bool:
        raise ValueError('Whole-side selection must be true or false.')
    if type(cut.get('viewBased',False)) is not bool:
        raise ValueError('View selection must be true or false.')
    for key in ('blendEnds','blendRims'):
        if type(cut.get(key,False)) is not bool:raise ValueError(f'Cut {key} must be true or false.')
    profile=cut.get('profile')
    if not isinstance(profile,list) or len(profile)!=33 or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in profile):
        raise ValueError('Cut profiles need 33 samples between zero and one.')
    anchor=cut.get('anchor')
    if cut.get('paint') is not None:validate_paint(cut['paint'])
    if anchor is not None and (not isinstance(anchor,(list,tuple)) or len(anchor)!=2 or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=1 for v in anchor)):
        raise ValueError('Invalid cut anchor.')

def placement(cut,polygons,center,scale):
    validate_cut(cut)
    return _placement(cut,polygons,center,scale)


def _placement(cut,polygons,center,scale):
    theta=math.radians(cut_angle(cut));c,s=math.cos(theta),math.sin(theta)
    rotation=np.array([[c,-s],[s,c]])
    local=[p@rotation for p in polygons]
    points=np.concatenate(local);low,high=points.min(axis=0),points.max(axis=0)
    if cut.get('anchor') is None:
        along=low[0]+cut['position']*(high[0]-low[0])
    else:
        ax,ay=cut['anchor']
        anchor=(np.array([(ax-.5)*scale,(.5-ay)*scale])-center)@rotation
        along=anchor[0]
    crossings=[]
    for ring in local:
        for a,b in zip(ring,np.roll(ring,-1,axis=0)):
            if (a[0]<=along<b[0] or b[0]<=along<a[0]):
                crossings.append(a[1]+(b[1]-a[1])*(along-a[0])/(b[0]-a[0]))
    if not crossings:
        raise ValueError(f"{cut.get('name','Cut')}: its selected region no longer exists. Reposition the cut.")
    edge=max(crossings)
    if cut.get('anchor') is not None and abs(edge-anchor[1])>max(2.,scale*.04):
        raise ValueError(f"{cut.get('name','Cut')}: the outline moved away from its anchor. Reposition or disable this cut.")
    world=np.array([along,edge])@rotation.T+center
    normalized=[float(world[0]/scale+.5),float(.5-world[1]/scale)]
    return rotation,along,edge,normalized

def cut_span(cut,points,scale,along):
    low,high=float(points[:,0].min()),float(points[:,0].max())
    if cut.get('fullSide',False):return (low+high)/2,high-low+2
    width=cut['width']*scale
    if not cut.get('viewBased',False):return along,width
    # The side camera looks along positive local X, from the minimum X face.
    # Start just outside that face so the first sliver is cut cleanly too.
    start=low-.01;end=min(low+width,high+.01)
    return (start+end)/2,end-start

def section(mesh,rotation,along):
    tangent=np.array([rotation[0,0],rotation[1,0],0.])
    origin=tangent*along
    lines=trimesh.intersections.mesh_plane(mesh,tangent,origin)
    if not len(lines):return np.empty((0,2,2))
    normal=np.array([rotation[0,1],rotation[1,1],0.])
    return np.stack((lines@normal,lines[:,:,2]),axis=2)

def intervals(lines,z):
    if not len(lines):return []
    # Evaluate all segment crossings together: the painted-cut validation asks
    # for hundreds of rows, often against thousands of section edges.
    a,b=lines[:,0],lines[:,1]
    crossing=((a[:,1]<=z)&(z<b[:,1]))|((b[:,1]<=z)&(z<a[:,1]))
    a,b=a[crossing],b[crossing]
    hits=a[:,0]+(b[:,0]-a[:,0])*(z-a[:,1])/(b[:,1]-a[:,1])
    return np.unique(np.round(hits,6)).tolist()

def section_outlines(lines):
    """Join mesh-plane segments for antialiased fills without scan-line bands."""
    points={};adjacent={}
    for a,b in lines:
        akey=tuple(np.round(a,6));bkey=tuple(np.round(b,6))
        if akey==bkey:continue
        points[akey]=a.tolist();points[bkey]=b.tolist()
        adjacent.setdefault(akey,set()).add(bkey)
        adjacent.setdefault(bkey,set()).add(akey)
    outlines=[]
    while adjacent:
        start=next(iter(adjacent));key=start;ring=[]
        while key in adjacent:
            ring.append(points[key]);other=next(iter(adjacent[key]))
            adjacent[key].remove(other)
            if not adjacent[key]:del adjacent[key]
            adjacent[other].discard(key)
            if not adjacent[other]:del adjacent[other]
            key=other
            if key==start:break
        if len(ring)>2:outlines.append(ring)
    return outlines

def reference(mesh,cut,polygons,center,scale,holes=(),shank=5.5,head=11,seat=12):
    rotation,along,edge,anchor=placement(cut,polygons,center,scale)
    lines=section(mesh,rotation,along)
    if not len(lines):raise ValueError('This region has no usable cross-section. Choose another position.')
    display=lines.copy();display[:,:,0]=edge-display[:,:,0]
    projected=[]
    height=float(mesh.bounds[1,2]);cone=(head-shank)/2
    for index,hole in enumerate(holes):
        x=float(edge-(np.asarray(hole)@rotation)[1])
        projected.append(dict(index=index+1,center=x,outline=[
            [x-shank/2,0],[x+shank/2,0],[x+shank/2,seat],
            [x+head/2,seat+cone],[x+head/2,height],
            [x-head/2,height],[x-head/2,seat+cone],[x-shank/2,seat],
        ]))
    return dict(segments=display.tolist(),outlines=section_outlines(display),holes=projected,anchor=anchor,edge=edge,
                height=float(lines[:,:,1].max()),width=float(cut['width']*scale))

def apply_cuts(solid,cuts,polygons,center,scale,depth,holes,shank,head,seat):
    if not isinstance(cuts,list) or len(cuts)>12:
        raise ValueError('Use at most 12 cut profiles.')
    ids=set()
    base_mesh=None
    for cut in cuts:
        validate_cut(cut)
        if cut['id'] in ids:raise ValueError('Cut IDs must be unique.')
        ids.add(cut['id'])
        painted=cut.get('paint')
        if not cut['enabled'] or not any(painted['material'] if painted else cut['profile']):continue
        if painted:
            if cut.get('anchor') is None:raise ValueError('Select a region before applying a cut.')
            rotation,along,edge,_=_placement(cut,polygons,center,scale)
            solid=subtract_paint(solid,cut,rotation,along,edge,polygons,scale,depth,holes,shank,head,seat)
            continue
        if base_mesh is None:
            base_data=solid.to_mesh()
            base_mesh=trimesh.Trimesh(vertices=base_data.vert_properties[:,:3],faces=base_data.tri_verts,process=False)
        if cut.get('anchor') is None:raise ValueError('Select and confirm a region before applying a cut.')
        name=cut.get('name','Cut')
        rotation,along,edge,_=_placement(cut,polygons,center,scale)
        mesh_data=solid.to_mesh()
        mesh=trimesh.Trimesh(vertices=mesh_data.vert_properties[:,:3],faces=mesh_data.tri_verts,process=False)
        lines=section(base_mesh,rotation,along)
        samples=np.linspace(4,depth-2,33)
        amounts=np.array(cut['profile'])*cut['depth']
        boundary=[]
        # Check the centre and both sides of the extrusion. Cut depth must
        # leave 3 mm in the frontmost connected material interval.
        local_points=np.concatenate(polygons)@rotation
        full_side=cut.get('fullSide',False)
        cut_center,width=cut_span(cut,local_points,scale,along)
        for z,amount in zip(samples,amounts):
            hits=intervals(lines,z)
            boundary.append(hits[-1]-amount+.001 if len(hits)>=2 else edge+scale)
        check_width=np.ptp(local_points[:,0])*.96 if full_side else width*.998
        for offset in np.linspace(-check_width/2,check_width/2,13 if full_side else 5):
            strip=section(mesh,rotation,cut_center+offset)
            for z,amount,cut_line in zip(samples,amounts,boundary):
                if amount<.001:continue
                hits=intervals(strip,z)
                if full_side and (len(hits)<2 or hits[-1]<=cut_line):continue
                if not len(strip) or z>strip[:,:,1].max()-2+.005:
                    raise ValueError(f'{name}: leave 2 mm below the local top. Erase the upper part of this profile.')
                if len(hits)<2 or cut_line-hits[-2]<3:
                    raise ValueError(f'{name}: reduce depth or width; leave at least 3 mm behind the cut.')
        for z,amount in zip(samples,amounts):
            hits=intervals(lines,z)
            if len(hits)<2:
                if amount>.001:raise ValueError(f'{name}: the profile reaches above this region. Erase that part of the profile.')
        outside=edge+scale
        outline=np.vstack((np.column_stack((boundary,samples)),[[outside,samples[-1]],[outside,samples[0]]]))
        cutter=cut_extrusion(m.CrossSection([outline[::-1].copy()]),width,not full_side and cut.get('blendEnds',False),cut.get('insideRadius',1.5))
        cutter=cutter.transform(((0,0,1,cut_center-width/2),(1,0,0,0),(0,1,0,0))).rotate((0,0,cut_angle(cut)))
        cutter=cutter.as_original()
        trial=solid-cutter
        trial=blend_cut(trial,cutter.original_id(),np.r_[rotation[:,0],0],False,cut.get('blendRims',False),radius=cut.get('outsideRadius',1.5),end_plane=cut_center+width/2 if not full_side else None)
        trial=mounting_piece(trial,holes,shank,head,seat,name)
        if holes and not _inside(np.asarray(holes),_room(trial,shank,head,seat,False,edge_clearance=3)).all():
            raise ValueError(f'{name}: this cut is too close to a mounting hole. Reduce or reposition it.')
        if solid.volume()-trial.volume()<.001:
            raise ValueError(f'{name}: the cut does not intersect material here. Reposition or edit its profile.')
        solid=trial
    return solid
