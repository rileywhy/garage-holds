"""A painted section becomes a bounded subtraction, never a half-plane."""
import numpy as np
import manifold3d as m
from .blending import blend_cut,cut_extrusion
from tools.hold_mounting import _inside, _room

def validate_paint(paint):
    if not isinstance(paint,dict) or paint.get('size') not in (128,256):
        raise ValueError('Painted cut profiles use a 128 or 256 pixel mask.')
    pixels=paint.get('material')
    if not isinstance(pixels,list) or len(pixels)!=paint['size']**2 or any(type(v) is not int or v not in (0,1) for v in pixels):
        raise ValueError('Painted cut profiles must contain binary pixels.')
    low,high=paint.get('min'),paint.get('max')
    if any(type(v) not in (int,float) or not np.isfinite(v) for v in (low,high)) or high<=low:
        raise ValueError('Invalid painted cut dimensions.')
    if 'bottom' in paint or 'top' in paint:
        bottom,top=paint.get('bottom'),paint.get('top')
        if any(type(v) not in (int,float) or not np.isfinite(v) for v in (bottom,top)) or top<=bottom:
            raise ValueError('Invalid painted cut height bounds.')

def smooth_boundary(ring,pixel_width,pixel_height,preserve_zero=False,smoothing=None):
    """Filter at a physical distance, independent of mask aspect ratio.

    Equal arc-length samples prevent the short vertical pixel edges from
    dominating the smoothing of long horizontal shelves (and vice versa).
    """
    ring=np.asarray(ring,dtype=float)
    lengths=np.linalg.norm(np.roll(ring,-1,axis=0)-ring,axis=1)
    cumulative=np.r_[0,np.cumsum(lengths)]
    sigma=smoothing if smoothing is not None else max(pixel_width,pixel_height)*1.2
    # Keep sampling dense enough for the original painted detail even when
    # the user chooses a broad smoothing radius.
    spacing=min(sigma,max(pixel_width,pixel_height)*.85)/4
    count=max(12,int(np.ceil(cumulative[-1]/spacing)))
    distances=np.arange(count)*cumulative[-1]/count
    closed=np.vstack((ring,ring[0]))
    points=np.column_stack([np.interp(distances,cumulative,closed[:,axis]) for axis in (0,1)])
    zero=points[:,1]<=0
    sigma_samples=sigma/(cumulative[-1]/count)
    offsets=np.arange(-int(np.ceil(3*sigma_samples)),int(np.ceil(3*sigma_samples))+1)
    weights=np.exp(-.5*(offsets/sigma_samples)**2);weights/=weights.sum()
    smoothed=sum(weight*np.roll(points,int(offset),axis=0) for offset,weight in zip(offsets,weights))
    if preserve_zero:smoothed[zero,1]=-.01
    return smoothed

def subtract_paint(solid,cut,rotation,along,edge,polygons,scale,depth,holes,shank,head,seat):
    from .profiles import section,intervals,cut_angle,mounting_piece,cut_span
    import trimesh
    paint=cut['paint'];size=paint['size'];mask=np.array(paint['material'],dtype=bool).reshape((size,size))
    pieces=[];pixel=(paint['max']-paint['min'])/size
    offset=cut.get('heightOffset',0)
    z_bottom=paint.get('bottom',0)+offset;z_top=paint.get('top',depth)+offset
    pixel_height=(z_top-z_bottom)/size
    for row in range(size):
        indices=np.flatnonzero(mask[row])
        if not len(indices):continue
        starts=np.r_[indices[0],indices[1:][np.diff(indices)>1]]
        ends=np.r_[indices[:-1][np.diff(indices)>1],indices[-1]]+1
        for start,end in zip(starts,ends):
            low=edge-(paint['min']+end*pixel);high=edge-(paint['min']+start*pixel)
            bottom=z_top-(row+1)*pixel_height;top=z_top-row*pixel_height
            if row==size-1 and z_bottom==0:bottom=-.01
            pieces.append(m.CrossSection([[(low,bottom),(high,bottom),(high,top),(low,top)]]))
    if not pieces:return solid
    painted=m.CrossSection.batch_boolean(pieces,m.OpType.Add)
    # Legacy masks end exactly at zero; keep that boundary below the wall so
    # smoothing cannot reintroduce a ledge. Expanded masks already cross it.
    contours=[smooth_boundary(ring,pixel,pixel_height,z_bottom==0,cut.get('edgeSmoothing')) for ring in painted.to_polygons()]
    painted=m.CrossSection(contours)
    points=np.concatenate(polygons)@rotation
    full=cut.get('fullSide',False)
    centre,width=cut_span(cut,points,scale,along)
    rounded_end=not full and cut.get('blendEnds',False) and cut.get('insideRadius',1.5)>0
    cutter=cut_extrusion(painted,width,rounded_end,cut.get('insideRadius',1.5)).transform(((0,0,1,centre-width/2),(1,0,0,0),(0,1,0,0))).rotate((0,0,cut_angle(cut))).as_original()
    trial=solid-cutter;name=cut.get('name','Cut')
    trial=blend_cut(trial,cutter.original_id(),np.r_[rotation[:,0],0],False,cut.get('blendRims',False),radius=cut.get('outsideRadius',1.5),end_plane=centre+width/2 if not full else None)
    trial=mounting_piece(trial,holes,shank,head,seat,name)
    if holes and not _inside(np.asarray(holes),_room(trial,shank,head,seat,False,edge_clearance=3)).all():
        raise ValueError(f'{name}: the painted cut is too close to a mounting hole. Erase or reposition it.')
    def mesh(body):
        data=body.to_mesh();return trimesh.Trimesh(vertices=data.vert_properties[:,:3],faces=data.tri_verts,process=False)
    before,after=mesh(solid),mesh(trial)
    check_width=float(np.ptp(points[:,0])*.96) if full else width*.998
    checked_rows=mask.any(axis=1)
    if cut.get('blendEnds',False) or cut.get('blendRims',False):
        # Fairing reaches beyond the painted rows: validate that band too.
        padding=min((size-1)//2,int(np.ceil(2*cut.get('outsideRadius',1.5)/pixel_height)))
        checked_rows=np.convolve(checked_rows.astype(int),np.ones(2*padding+1,dtype=int),mode='same')>0
    for offset in np.linspace(-check_width/2,check_width/2,13 if full else 5):
        original=section(before,rotation,centre+offset);remaining=section(after,rotation,centre+offset)
        thin_run=0;last_row=-2
        for row in np.flatnonzero(checked_rows):
            z=z_top-(row+.5)*pixel_height
            if not 0<=z<=depth:continue
            old=intervals(original,z);new=intervals(remaining,z)
            thin=False
            for lo,hi in zip(new[::2],new[1::2]):
                if hi-lo>=3:continue
                # Curved outlines approach zero width at the silhouette. A
                # shallower slice there was already thin before this cut;
                # only flag material reduced from a >=3 mm interval.
                if any(a<=lo+.01 and b>=hi-.01 and b-a>=3 and b-a>hi-lo+.01 for a,b in zip(old[::2],old[1::2])):
                    thin=True
            thin_run=(thin_run+1 if row==last_row+1 else 1) if thin else 0
            last_row=row
            # Brief slivers at a curved brush boundary are fillet transitions,
            # not a persistent thin wall. Reject walls thin over a 3 mm band.
            if thin_run*pixel_height>=3:
                raise ValueError(f'{name}: this stroke leaves a wall thinner than 3 mm. Erase or reduce it.')
    if solid.volume()-trial.volume()<.001:
        raise ValueError(f'{name}: paint over the blue material to make a cut.')
    return trial
