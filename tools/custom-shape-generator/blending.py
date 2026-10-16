"""Round Boolean cut joins with local surface fairing."""
import heapq
import numpy as np
import manifold3d as m


def cubic_field(points,spacing):
    """Prepare C2 interpolation of constraints in physical space.

    Sparse lattice coefficients avoid dependence on triangle density. The
    interpolation stencil is reused by each geometry-validity iteration.
    """
    coordinate=(points-points.min(axis=0))/spacing+2
    cell=np.floor(coordinate).astype(np.int64);fraction=coordinate-cell
    dimensions=cell.max(axis=0)+4
    stride=np.array([dimensions[1]*dimensions[2],dimensions[2],1],dtype=np.int64)
    keys=[];weights=[]
    for x in (0,1):
        for y in (0,1):
            for z in (0,1):
                corner=np.array([x,y,z])
                keys.append((cell+corner)@stride)
                weights.append(np.prod(np.where(corner,fraction,1-fraction),axis=1))
    unique,inverse=np.unique(np.concatenate(keys),return_inverse=True)
    weights=np.concatenate(weights)
    total=np.bincount(inverse,weights=weights,minlength=len(unique))
    basis=np.stack(((1-fraction)**3,(3*fraction**3-6*fraction**2+4),(-3*fraction**3+3*fraction**2+3*fraction+1),fraction**3),axis=1)/6
    indices=[];interpolation=[]
    for x in range(4):
        for y in range(4):
            for z in range(4):
                key=(cell+np.array([x-1,y-1,z-1]))@stride
                index=np.searchsorted(unique,key);clipped=np.minimum(index,len(unique)-1)
                weight=basis[:,x,0]*basis[:,y,1]*basis[:,z,2]
                weight*=((index<len(unique))&(unique[clipped]==key)&(total[clipped]>1e-20))
                indices.append(clipped);interpolation.append(weight)
    indices=np.stack(indices,axis=1);interpolation=np.stack(interpolation,axis=1)
    interpolation/=np.maximum(interpolation.sum(axis=1)[:,None],1e-20)
    def evaluate(values):
        coefficients=np.bincount(inverse,weights=np.tile(values,8)*weights,minlength=len(unique))/np.maximum(total,1e-20)
        return np.sum(coefficients[indices]*interpolation,axis=1)
    return evaluate


def edge_pairs(faces,vertex_count):
    """Closed meshes have two halfedges per edge; sort scalar keys once."""
    directed=np.stack((faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]),axis=1).reshape((-1,2))
    keys=directed.min(axis=1).astype(np.uint64)*vertex_count+directed.max(axis=1)
    order=np.argsort(keys)
    return directed[order[::2]],(order//3).reshape((-1,2))


def cut_extrusion(section,width,round_end=False,radius=1.5):
    """A rolling 1.5 mm radius where a partial cutter ends, not a square cap."""
    if not round_end or radius<=0:return section.extrude(width)
    radius=min(radius,width*.4)
    for _ in range(4):
        inset=section.offset(-radius,m.JoinType.Round,2,32).simplify(.005)
        if inset.area()>1e-6:break
        radius*=.5
    else:
        raise ValueError('This cut is too small for an end radius. Widen the painted area or turn off the end blend.')
    # Raster circles can contain microscopic concavities. Clearing only those
    # negligible dents lets the native convex Minkowski path do this in ms.
    hull=inset.hull()
    if hull.area()-inset.area()<=inset.area()*.001:inset=hull
    # Sweeping a ball over the inset end face gives a true rounded stop.
    # The straight section ends at the tangent point of that radius.
    core=inset.extrude(.001).translate((0,0,width-radius-.001))
    cap=core.minkowski_sum(m.Manifold.sphere(radius,32))
    return section.extrude(width-radius)+cap


def blend_cut(trial,cutter_id,tangent,blend_ends=True,blend_rims=True,radius=1.5,end_plane=None):
    if radius<=0 or (not blend_ends and not blend_rims):return trial
    mesh=trial.to_mesh();cut_vertices=[]
    for i,original in enumerate(mesh.run_original_id):
        if original==cutter_id:
            cut_vertices.extend(mesh.tri_verts[mesh.run_index[i]//3:mesh.run_index[i+1]//3].ravel())
    if not cut_vertices:return trial
    points=mesh.vert_properties[np.unique(cut_vertices),:3]
    low=points.min(axis=0)-radius*3;high=points.max(axis=0)+radius*3
    region=m.Manifold.cube(tuple(high-low)).translate(tuple(low)).as_original()
    # Artificial crop faces are excluded from seam detection. An unchanged
    # overlap outside the fairing band prevents coincident internal join faces.
    patch=trial ^ region
    overlap=min(radius*.25,.25)
    inner=m.Manifold.cube(tuple(high-low-2*overlap)).translate(tuple(low+overlap))
    remainder=trial-inner
    rounded=_blend_surface(patch,cutter_id,tangent,blend_ends,blend_rims,radius,end_plane,region.original_id())
    result=(remainder+rounded).simplify(.002)
    # STL and the preview use float32 positions. Let Manifold collapse any
    # sub-precision triangles after rounding, before those vertices are exported.
    return m.Manifold(result.to_mesh())


def _blend_surface(trial,cutter_id,tangent,blend_ends,blend_rims,radius,end_plane,boundary_id):
    if not blend_ends and not blend_rims:return trial
    # Remove sub-0.02 mm tessellation detail before locally fairing the join;
    # otherwise long, very thin triangles amplify refinement work enormously.
    tolerance=.002 if end_plane is not None else .02
    mesh=trial.simplify(tolerance).to_mesh64();vertices=np.asarray(mesh.vert_properties[:,:3],dtype=float);faces=np.asarray(mesh.tri_verts)
    cut_faces=np.zeros(len(faces),dtype=bool)
    boundary_faces=np.zeros(len(faces),dtype=bool)
    for i,original in enumerate(mesh.run_original_id):
        if original==cutter_id:cut_faces[mesh.run_index[i]//3:mesh.run_index[i+1]//3]=True
        if original==boundary_id:boundary_faces[mesh.run_index[i]//3:mesh.run_index[i+1]//3]=True
    normals=np.cross(vertices[faces[:,1]]-vertices[faces[:,0]],vertices[faces[:,2]]-vertices[faces[:,0]])
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
    caps=cut_faces&(np.abs(normals@tangent)>.99)
    edges,pairs=edge_pairs(faces,len(vertices))
    a,b=pairs.T
    join=cut_faces[a]!=cut_faces[b]
    end_join=(caps[a]!=caps[b])&(join|(cut_faces[a]&cut_faces[b]))
    # A rounded partial stop can intersect the original outside edge too.
    # Include that convex join instead of shielding the whole end plane.
    rim_join=join if end_plane is not None else join&~(caps[a]|caps[b])
    selected=((blend_ends&end_join)|(blend_rims&rim_join))&~(boundary_faces[a]|boundary_faces[b])
    selected&=np.sum(normals[a]*normals[b],axis=1)<=.995
    selected&=vertices[edges,2].max(axis=1)>.01
    seeds=np.unique(edges[selected])
    if not len(seeds):return trial
    neighbors=[[] for _ in vertices]
    lengths=np.linalg.norm(vertices[edges[:,0]]-vertices[edges[:,1]],axis=1)
    for (a,b),length in zip(edges,lengths):
        neighbors[a].append((b,length));neighbors[b].append((a,length))
    distance=np.full(len(vertices),float(np.ptp(vertices,axis=0).sum()+radius*4))
    distance[list(seeds)]=0;queue=[(0.,i) for i in seeds];heapq.heapify(queue)
    while queue:
        d,a=heapq.heappop(queue)
        if d!=distance[a]:continue
        for b,length in neighbors[a]:
            candidate=d+length
            if candidate<distance[b]:distance[b]=candidate;heapq.heappush(queue,(candidate,b))
    # Refine straight triangles before fairing. The extra distance channel
    # limits all edits to the selected cut joins, including on long flat faces.
    properties=np.ascontiguousarray(np.column_stack((vertices,distance)),dtype=np.float64)
    # Larger radii must not create increasingly coarse transition facets.
    spacing=min(radius,1.5)
    refined=m.Manifold(m.Mesh64(properties,np.array(faces,dtype=np.uint64,order='C',copy=True))).refine_to_length(spacing).to_mesh64()
    vertices=np.array(refined.vert_properties[:,:3],dtype=float,copy=True)
    faces=np.asarray(refined.tri_verts,dtype=np.uint32)
    distance=np.array(refined.vert_properties[:,3],dtype=float)
    # Refinement may split a geometric vertex at a property seam. Weld its
    # declared copies before fairing so both sides move together (including
    # the denser STL tessellation).
    merged=np.arange(len(vertices),dtype=np.uint32)
    merged[np.asarray(refined.merge_from_vert,dtype=int)]=np.asarray(refined.merge_to_vert,dtype=np.uint32)
    while not np.array_equal(merged,merged[merged]):merged=merged[merged]
    faces=merged[faces]
    np.minimum.at(distance,merged,distance.copy())
    influence=np.clip(1-distance/(radius*2),0,1)
    influence=influence**3*(influence*(influence*6-15)+10)
    influence[vertices[:,2]<=.01]=0
    # Distance from the selected outside joins confines fairing to the rim;
    # the rounded cutter's interior remains untouched beyond that band.
    edges,pairs=edge_pairs(faces,len(vertices))
    # Only evaluate the small band that can move. The rest of the refined
    # mesh stays fixed; checking its triangles on every pass wastes most time.
    all_vertices,all_faces=vertices,faces
    active_faces=np.any(influence[faces]>0,axis=1)
    pairs=pairs[np.any(active_faces[pairs],axis=1)]
    face_ids=np.unique(pairs)
    vertex_ids=np.unique(faces[face_ids])
    vertex_map=np.full(len(vertices),-1,dtype=int);vertex_map[vertex_ids]=np.arange(len(vertex_ids))
    face_map=np.full(len(faces),-1,dtype=int);face_map[face_ids]=np.arange(len(face_ids))
    pairs=face_map[pairs]
    edges=edges[np.any(influence[edges]>0,axis=1)]
    edges=vertex_map[edges]
    faces=vertex_map[faces[face_ids]]
    vertices=vertices[vertex_ids].copy();influence=influence[vertex_ids]
    lengths=np.linalg.norm(vertices[edges[:,0]]-vertices[edges[:,1]],axis=1)
    weights=1/np.maximum(lengths,.02);totals=np.zeros(len(vertices))
    np.add.at(totals,edges[:,0],weights);np.add.at(totals,edges[:,1],weights)
    reference=np.cross(vertices[faces[:,1]]-vertices[faces[:,0]],vertices[faces[:,2]]-vertices[faces[:,0]])
    reference_area=np.sum(reference*reference,axis=1)
    unit=reference/np.maximum(np.linalg.norm(reference,axis=1)[:,None],1e-12)
    min_dot=np.minimum(np.sum(unit[pairs[:,0]]*unit[pairs[:,1]],axis=1),0)-.001
    original_vertices=vertices.copy()
    for _ in range(max(6,int(np.ceil(6*radius/spacing)))):
        average=np.zeros_like(vertices)
        np.add.at(average,edges[:,0],vertices[edges[:,1]]*weights[:,None])
        np.add.at(average,edges[:,1],vertices[edges[:,0]]*weights[:,None])
        delta=average/np.maximum(totals[:,None],1e-12)-vertices
        vertices+=delta*(influence*.5)[:,None]
    # Validate the final displacement with continuous physical constraints;
    # isolated frozen vertices would introduce creases between the two radii.
    delta=vertices-original_vertices
    field=None
    factor=np.ones(len(vertices))
    for _ in range(64):
        proposed=original_vertices+delta*factor[:,None]
        normals=np.cross(proposed[faces[:,1]]-proposed[faces[:,0]],proposed[faces[:,2]]-proposed[faces[:,0]])
        invalid=np.sum(normals*reference,axis=1)<=reference_area*.01
        unit=normals/np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
        folds=np.sum(unit[pairs[:,0]]*unit[pairs[:,1]],axis=1)<min_dot
        invalid[pairs[folds].ravel()]=True
        if not invalid.any():break
        # Limit the displacement over a physical neighborhood. A fixed number
        # of graph hops collapses to almost zero width on the skinny Boolean
        # triangles, leaving stationary spikes amongst displaced vertices.
        affected=original_vertices[np.unique(faces[invalid])]
        nearest=np.full(len(vertices),np.inf)
        for start in range(0,len(affected),32):
            difference=original_vertices[:,None,:]-affected[None,start:start+32,:]
            nearest=np.minimum(nearest,np.sum(difference*difference,axis=2).min(axis=1))
        taper=np.clip(1-np.sqrt(nearest)/radius,0,1)
        taper=taper**3*(taper*(taper*6-15)+10)
        if field is None:field=cubic_field(original_vertices,max(.25,min(radius/3,1)))
        factor*=1-.5*field(taper)
    else:proposed=original_vertices
    vertices=proposed
    all_vertices[vertex_ids]=vertices
    result=m.Manifold(m.Mesh64(np.ascontiguousarray(all_vertices,dtype=np.float64),np.ascontiguousarray(all_faces,dtype=np.uint64))).simplify(tolerance)
    if result.status()!=m.Error.NoError or result.volume()<=0:
        raise ValueError('This blend cannot fit here. Reduce the cut or turn off blending for this cut.')
    return result
