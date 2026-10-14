"""Isolated material-mask pipeline shared by manual painting and future importers."""
import math
from functools import lru_cache
import numpy as np
import manifold3d as m
import trimesh
from tools.hold_mounting import Hole, drill, _inside, _room


def contours(mask):
    size = len(mask)
    edges = {}
    for y, x in np.argwhere(mask):
        for empty, a, b in (
            (y == 0 or not mask[y-1,x], (x,y), (x+1,y)),
            (x == size-1 or not mask[y,x+1], (x+1,y), (x+1,y+1)),
            (y == size-1 or not mask[y+1,x], (x+1,y+1), (x,y+1)),
            (x == 0 or not mask[y,x-1], (x,y+1), (x,y)),
        ):
            if empty:
                if a in edges:
                    raise ValueError('Connect diagonal regions with a wider brush stroke.')
                edges[a] = b
    result = []
    while edges:
        start = next(iter(edges))
        point = start
        ring = []
        while True:
            ring.append(point)
            point = edges.pop(point)
            if point == start:
                break
        if len(ring) < 8:
            raise ValueError('Remove tiny isolated pixels or connect them to the body.')
        ring = np.asarray(ring, dtype=float)
        # Local smoothing moves the contour less than one pixel; avoids global
        # simplification that could erase narrow features or concave regions.
        for _ in range(6):
            ring = .5*ring + .25*np.roll(ring,1,axis=0) + .25*np.roll(ring,-1,axis=0)
        result.append(ring)
    return result


@lru_cache(maxsize=8)
def prepare_mask(pixels):
    """Reuse drawing-only work while parameters and semantic holes change."""
    size=256
    mask=np.frombuffer(pixels,dtype=np.uint8).reshape((size,size)).astype(bool)
    if mask.sum() < 64:
        raise ValueError('Paint a larger connected hold to generate a preview.')
    # Four-neighbour connectivity: separate islands are not separate printable holds.
    seen = set()
    stack = [tuple(np.argwhere(mask)[0])]
    while stack:
        y,x = stack.pop()
        if (y,x) in seen:
            continue
        seen.add((y,x))
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0 <= yy < size and 0 <= xx < size and mask[yy,xx] and (yy,xx) not in seen:
                stack.append((yy,xx))
    if len(seen) != mask.sum():
        raise ValueError('Painted regions must connect. Join the islands or erase them.')
    rows=np.flatnonzero(mask.any(axis=1))
    rings=tuple(contours(mask))
    for ring in rings:
        ring.setflags(write=False)
    return rings, int(rows[-1]-rows[0]+1)


@lru_cache(maxsize=16)
def side_faces(lengths, rings):
    count=sum(lengths)
    result=[]
    start=0
    for length in lengths:
        j=np.arange(length)
        offsets=np.arange(rings)[:,None]*count+start
        a=(offsets+j).ravel()
        b=(offsets+(j+1)%length).ravel()
        first=np.column_stack((a,b,b+count))
        second=np.column_stack((a,b+count,a+count))
        result.append(np.stack((first,second),axis=1).reshape((-1,3)))
        start+=length
    return np.concatenate(result).astype(np.uint32)


def build(request):
    doc = request.get('document', {})
    size = doc.get('size')
    if doc.get('version') != 1 or size != 256:
        raise ValueError('Expected a version 1, 256 pixel material mask.')
    pixels = doc.get('material')
    if not isinstance(pixels,list) or len(pixels) != size*size or any(type(v) is not int or v not in (0,1) for v in pixels):
        raise ValueError('Material mask must contain only binary pixels.')
    outlines_pixels,occupied_height=prepare_mask(bytes(pixels))
    p = request.get('parameters', {})
    values = []
    for key, default, low, high in [('scale',200,80,300),('depth',30,16,70),('incut',0,-60,60),('gripDepth',0,0,300),('lipRadius',10,1,20),('bodyRounding',4,0,30),('shankDiameter',5.5,3,8),('headDiameter',11,5,20),('seatDepth',12,2,68)]:
        v = p.get(key,default)
        if type(v) not in (int,float) or not math.isfinite(v) or not low <= v <= high:
            raise ValueError(f'{key} must be between {low} and {high}.')
        values.append(float(v))
    scale,depth,incut,grip_depth,lip_radius,body_rounding,shank,head,seat = values
    body_taper=p.get('bodyTaper',0)
    if type(body_taper) not in (int,float) or not math.isfinite(body_taper) or not 0<=body_taper<=60:
        raise ValueError('Body taper must be between 0 and 60 degrees.')
    all_sides=p.get('gripAllSides',False)
    if type(all_sides) is not bool:
        raise ValueError('Apply grip edits to all sides must be true or false.')
    if head < shank+2:
        raise ValueError("Head recess diameter must exceed the shank by at least 2 mm.")
    auto_seat=p.get("autoSeat",True)
    if type(auto_seat) is not bool:
        raise ValueError("Automatic seat must be true or false.")
    seat=min(12 if auto_seat else seat,depth-head)
    if seat < 2:
        raise ValueError("Increase depth or reduce the head recess diameter.")
    profile_height=occupied_height*scale/size
    grip_depth=min(grip_depth,profile_height)
    lip_radius=min(lip_radius,20,depth-2)
    body_rounding=min(body_rounding,30,depth-2)
    polygons = [(ring-size/2)*scale/size * [1,-1] for ring in outlines_pixels]
    # Canvas Y points down; reversing restores contour winding including erased voids.
    polygons = [ring[::-1].copy() for ring in polygons]
    points = np.concatenate(polygons)
    center = (points.min(axis=0)+points.max(axis=0))/2
    polygons = [ring-center for ring in polygons]
    count = len(points)
    vertices=[]
    # The first 6 mm of the mounting perimeter is invariant under every grip
    # control. Only the upper grabbing edge is incut; lower/support edges do
    # not translate. A rounded pocket can then form a jug-like return lip.
    preview=request.get('action')=='preview'
    straight_segments=3 if preview else 13
    arc_segments=8 if preview else 33
    side_end=2+straight_segments
    rings=side_end+arc_segments
    upper = max(np.max(np.concatenate(polygons)[:,1]),1.)
    base = 6.
    radius = min(max(lip_radius,body_rounding,2.), depth-base-.5)
    # Keep the upper grabbing band at full projection; taper the rest toward
    # a minimum 6 mm body thickness, preserving the flat Z=0 mounting face.
    taper_slope=min(math.tan(math.radians(body_taper)),(depth-base)/max(profile_height,1.))
    taper_start=upper-radius
    # Local outward normals round the rim, including erased openings.
    # A radial scale would shrink hole openings and barely round lateral
    # edges. Every rim gets at least a 2 mm fillet; only the selected grabbing
    # surfaces receive the lip comfort control.
    outlines=[]
    for ring in polygons:
        tangent=np.roll(ring,-1,axis=0)-np.roll(ring,1,axis=0)
        normal=np.column_stack((tangent[:,1],-tangent[:,0]))
        normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-8)
        area=np.sum(ring[:,0]*np.roll(ring[:,1],-1)-ring[:,1]*np.roll(ring[:,0],-1))
        body_radius=min(max(body_rounding,2.),depth-base-.5)
        grip_weight=(np.ones(len(ring)) if all_sides else
                     np.clip(normal[:,1],0,1)*np.clip(ring[:,1]/upper,0,1)) if area>0 else np.zeros(len(ring))
        rounding=body_radius+(max(2.,min(lip_radius,depth-base-.5))-body_radius)*grip_weight
        outlines.append((ring,normal,rounding,grip_weight))
    for k in range(rings+1):
        if k < 3:
            z = k*base/2
            angle = 0.
        elif k <= side_end:
            z = base+(depth-radius-base)*(k-2)/straight_segments
            angle = 0.
        else:
            angle = (k-side_end)/arc_segments*math.pi/2
            z = depth-radius+radius*math.sin(angle)
        for ring,normal,rounding,grip_weight in outlines:
            # Use the local radius in both dimensions, so the 2 mm safety
            # fillet remains circular even beside a much larger outer lip.
            if k < 3:
                local_z=z
            elif k <= side_end:
                local_z=base+(depth-rounding-base)*(k-2)/straight_segments
            else:
                local_z=depth-rounding+rounding*math.sin(angle)
            t=np.maximum(0,(local_z-base)/(depth-base))
            # Bounded, monotone compression avoids folding concave silhouettes.
            shift = upper*.55*math.tanh((depth-base)*math.tan(math.radians(incut))/upper)*t
            inset=rounding*(1-math.cos(angle))
            rounded=ring-normal*inset[:,None]
            if all_sides:
                rounded=rounded-normal*(shift*grip_weight)[:,None]
            else:
                rounded[:,1]-=shift*grip_weight
            projection=depth-taper_slope*np.maximum(0,taper_start-ring[:,1])
            tapered_z=np.broadcast_to(local_z,len(ring))*projection/depth
            vertices.append(np.column_stack((rounded[:,0],rounded[:,1],tapered_z)))
    caps=np.asarray(m.triangulate(polygons),dtype=np.uint32)
    faces=np.concatenate((side_faces(tuple(map(len,polygons)),rings),caps[:,::-1],caps+rings*count))
    solid = m.Manifold(m.Mesh(np.concatenate(vertices).astype(np.float32),faces))
    if solid.status() != m.Error.NoError:
        raise ValueError('This shape cannot be meshed. Widen narrow joins and try again.')
    holes = doc.get('holes',[])
    if not isinstance(holes,list) or len(holes)>12:
        raise ValueError('Use at most 12 mounting holes.')
    positions=[]
    for h in holes:
        if not isinstance(h,dict):
            raise ValueError('Invalid mounting hole location.')
        x,y = h.get('x'),h.get('y')
        if type(x) not in (float,int) or type(y) not in (float,int) or not math.isfinite(x+y) or not 0<=x<size or not 0<=y<size:
            raise ValueError('Invalid mounting hole location.')
        x,y = (np.array([x-size/2,size/2-y])*scale/size-center).tolist()
        if any(math.hypot(x-hx,y-hy)<head+4 for hx,hy in positions):
            raise ValueError(f'Mounting holes need at least {head+4:g} mm between centers.')
        positions.append((x,y))
    # A rounded side-profile scoop makes the painted edge usable as a grip.
    # Keep this operation tied only to edge depth. Lip rounding remains part
    # of the lofted edge transition above rather than becoming a side scoop.
    scoop_radius=min(grip_depth, depth*.95)
    if scoop_radius > 0:
        # Keep the cutter below the screw recesses when a painted example
        # already contains holes. Its axis runs across the whole hold.
        all_points=np.concatenate(polygons)
        edge_shift=upper*.55*math.tanh((depth-base)*math.tan(math.radians(incut))/upper)
        # Preserve the convex lip, then blend into an inner vertical face
        # that runs through the wall-facing base without a lower ledge.
        pocket_top=depth-radius
        pocket_bottom=pocket_top/2
        slope=edge_shift/(depth-base)
        base_solid=solid
        candidate=round(scoop_radius*2)/2
        while candidate > 0:
            # Match the incut tangent at the lip and a vertical tangent at
            # the inner face. Continue that face below Z=0 to open the base.
            u=np.linspace(1,0,97)
            height=pocket_top-pocket_bottom
            z=pocket_top-height*u
            trial=base_solid
            for degrees in ((0,90,180,270) if all_sides else (0,)):
                theta=math.radians(degrees)
                c,s=math.cos(theta),math.sin(theta)
                local=all_points@np.array([[c,-s],[s,c]])
                local_low,local_high=local.min(axis=0),local.max(axis=0)
                local_top=local_high[1]-slope*(pocket_top-base)+.001
                y=local_top-candidate*(3*u*u-2*u*u*u)+slope*height*u*(1-u)**2
                outside=local_high[1]+abs(edge_shift)+candidate+2
                outline=np.vstack(([[local_top-candidate,-1]],
                                   np.column_stack((y,z)),
                                   [[outside,pocket_top],[outside,-1]]))
                pocket=m.CrossSection([outline[::-1].copy()]).extrude(local_high[0]-local_low[0]+4)
                pocket=pocket.transform(((0,0,1,local_low[0]-2),
                                         (1,0,0,0),(0,1,0,0))).rotate((0,0,degrees))
                trial=trial-pocket
            room=_room(trial,shank,head,seat,False,edge_clearance=2)
            if len(trial.decompose()) == 1 and (not positions or _inside(np.asarray(positions),room).all()):
                solid=trial
                grip_depth=max(0, candidate)
                break
            candidate-=.5
        else:
            # Keep the profile printable when an existing hole leaves no safe
            # room for a scoop at the requested depth.
            solid=base_solid
            grip_depth=0
    if positions:
        candidates = list(np.arange(seat,1.99,-.5)) + [2.] if auto_seat else [seat]
        for candidate in candidates:
            safe=_room(solid,shank,head,candidate,False,edge_clearance=2)
            if _inside(np.asarray(positions),safe).all():
                seat=candidate
                break
        else:
            raise ValueError('Move mounting holes farther from the edge or pocket, or reduce the recess diameter.')
    mounted=[Hole(x,y,shank,head,seat,False) for x,y in positions]
    solid = drill(solid,mounted,depth)
    mesh_data=solid.to_mesh()
    mesh=trimesh.Trimesh(vertices=mesh_data.vert_properties[:,:3],faces=mesh_data.tri_verts,process=True)
    if not mesh.is_watertight or mesh.volume <= 0:
        raise ValueError('Unable to create a watertight hold from this drawing.')
    mesh.metadata["seatDepth"]=float(seat)
    return mesh
