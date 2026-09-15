"""Bake posed launch-screen dinosaurs from the authored game models."""
from pathlib import Path
import math
import bpy
from mathutils import Vector, Matrix, Quaternion

ROOT = Path(__file__).resolve().parents[2]

def _evaluate_pose(arm, action):
    arm.animation_data_create()
    arm.animation_data.use_nla = False
    arm.animation_data.action = action
    arm.animation_data.action_slot = action.slots[0]
    bpy.context.scene.frame_set(8)
    bpy.context.view_layer.update()
    return {b.name: b.matrix_basis.copy() for b in arm.pose.bones}

def _basis(forward, up):
    f = Vector(forward).normalized()
    u = Vector(up)
    u = (u - f * u.dot(f)).normalized()
    r = f.cross(u).normalized()
    return Matrix((r, -f, u)).transposed()

def _dinosaur(name, forward, up, target, width, depth, upright=False, max_height=None, top_right=None, aim_at=None):
    before = set(bpy.data.objects)
    old_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "apps/web/public/models" / (name.lower()+".glb")))
    imported = set(bpy.data.objects) - before
    actions = list(set(bpy.data.actions) - old_actions)
    arm = next(o for o in imported if o.type == "ARMATURE")
    stand = _evaluate_pose(arm, next(a for a in actions if a.name.split(".")[0] == "Stand"))
    dive = _evaluate_pose(arm, next(a for a in actions if a.name.split(".")[0] == "Dive"))
    arm.animation_data_clear()
    for b in arm.pose.bones:
        b.matrix_basis = stand[b.name] if upright and b.name == "pelvis" else dive[b.name]
    bpy.context.view_layer.update()
    src = next(o for o in imported if o.type == "MESH" and "mesh" in o.name.lower())
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    mesh.transform(src.matrix_world)
    basis = _basis(forward,up)
    head_bone=arm.pose.bones["head"]
    head_pivot=basis @ (arm.matrix_world @ head_bone.head)
    head_deform=arm.matrix_world @ head_bone.matrix @ arm.data.bones["head"].matrix_local.inverted()
    # Authored eye-to-beak axes include the slope of each animal's snout.
    # Nominal -Y alone makes their visible beaks point below the finish.
    nose_axis,eye_offset={
        "Steve": ((0,-.59,-.14),(0,-.21,.08)),
        "Susan": ((0,-.57,-.205),(0,-.30,.18)),
    }.get(name,((0,-1,0),(0,0,0)))
    nose_direction=(basis @ (head_deform.to_3x3() @ Vector(nose_axis))).normalized()
    eye_point=basis @ (head_deform @ (arm.data.bones["head"].head_local+Vector(eye_offset)))
    # Only the baked preview mesh changes; the authored game rig stays intact.
    groups = {group.name: group.index for group in src.vertex_groups}
    members = {name: [v.index for v in src.data.vertices if any(g.group == idx and g.weight > .5 for g in v.groups)] for name,idx in groups.items()}
    if name in ("Greg","Susan"):
        pivot = arm.matrix_world @ arm.pose.bones["tail"].head
        indices = members["tail"]
        tip = max((mesh.vertices[i].co - pivot for i in indices), key=lambda v:v.length_squared).normalized()
        extension = 2.15 if name == "Greg" else 1.4
        for i in indices:
            offset = mesh.vertices[i].co - pivot
            mesh.vertices[i].co += tip * offset.dot(tip) * (extension-1)
    if name == "Steve":
        uv=mesh.uv_layers.active.data
        plates=set()
        brown=_solid("Steve chestnut dorsal plates",(.18,.105,.067))
        mesh.materials.append(brown)
        for poly in mesh.polygons:
            if all(.25 < uv[i].uv.x < .5 and 0 < uv[i].uv.y < .333 for i in poly.loop_indices):
                plates.update(poly.vertices)
                poly.material_index=len(mesh.materials)-1
        for i in plates:
            mesh.vertices[i].co.z += max(0,src.data.vertices[i].co.z-1.65)*.5
    mesh.transform(basis.to_4x4())
    if name in ("Greg","Susan"):
        for side in (-1,1):
            limb = "leg "+str(side)
            pivot = basis @ (arm.matrix_world @ arm.pose.bones[limb].head)
            indices = members[limb]
            # Open both hind legs toward the viewer in a relaxed skydive.
            mean = sum((mesh.vertices[i].co-pivot for i in indices),Vector()) / len(indices)
            direction = Vector((side*.8-.35,-.28,-1) if name == "Greg" else (.75+side*.2,-.15,-.8)).normalized()
            rotation = mean.normalized().rotation_difference(direction)
            for i in indices:
                mesh.vertices[i].co = pivot + rotation @ (mesh.vertices[i].co-pivot)
            if name == "Greg":
                deformation=arm.matrix_world @ arm.pose.bones[limb].matrix @ arm.data.bones[limb].matrix_local.inverted()
                ankle_before=basis @ (deformation @ Vector((side*.43,.01,.31)))
                ankle=pivot+rotation @ (ankle_before-pivot)
                normal=(rotation @ (basis @ (deformation.to_3x3() @ Vector((0,0,1))))).normalized()
                toe=(rotation @ (basis @ (deformation.to_3x3() @ Vector((0,-1,0))))).normalized()
                old_right=toe.cross(normal).normalized()
                old_frame=Matrix((old_right,toe,normal)).transposed()
                new_frame=Matrix((Vector((-1,0,0)),Vector((0,0,-1)),Vector((0,-1,0)))).transposed()
                bend=new_frame @ old_frame.inverted()
                for i in indices:
                    rest_z=src.data.vertices[i].co.z
                    influence=max(0,min(1,(.58-rest_z)/.27))
                    if influence:
                        original=mesh.vertices[i].co.copy()
                        curved=ankle+bend @ (original-ankle)
                        mesh.vertices[i].co=original.lerp(curved,influence)
    coords=[v.co for v in mesh.vertices]
    low=Vector((min(v.x for v in coords),min(v.y for v in coords),min(v.z for v in coords)))
    high=Vector((max(v.x for v in coords),max(v.y for v in coords),max(v.z for v in coords)))
    scale=width/(high.x-low.x)
    if max_height is not None:
        # Frame the upright anatomy with uniform scale, never flatten the body.
        scale=min(scale,max_height/(high.z-low.z))
    center=(low+high)/2
    for v in mesh.vertices:
        v.co=(v.co-center)*scale
    for o in imported:
        bpy.data.objects.remove(o,do_unlink=True)
    root=bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(root)
    root.location=(target[0],depth,target[1])
    if top_right is not None:
        root.location.x=top_right[0]-(high.x-low.x)*scale/2
        root.location.z=top_right[1]-(high.z-low.z)*scale/2
    if aim_at is not None:
        # Rotate around the neck while aiming from the eyes to the marker.
        # Recompute the ray as the eye position moves with the neck turn.
        pivot=(head_pivot-center)*scale
        eye_offset=(eye_point-center)*scale-pivot
        finish_direction=(Vector(aim_at)-root.location-pivot).normalized()
        turn=nose_direction.rotation_difference(finish_direction)
        for _ in range(4):
            eye_origin=root.location+pivot+turn @ eye_offset
            finish_direction=(Vector(aim_at)-eye_origin).normalized()
            turn=nose_direction.rotation_difference(finish_direction)
        for i in members["head"]:
            mesh.vertices[i].co=pivot+turn @ (mesh.vertices[i].co-pivot)
        root["finish_target"]=list(aim_at)
        root["snout_direction"]=list(finish_direction)
        root["snout_origin"]=list(root.location+pivot+turn @ eye_offset)
    obj=bpy.data.objects.new(name+" posed mesh",mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent=root
    _label(root,obj,{"Greg":"01","Linda":"02","Steve":"03","Susan":"04"}[name])
    if name == "Steve":
        # Keep his preview pack patch proportional when the receding pose is
        # fitted by height instead of stretching its foreshortened silhouette.
        fit_ratio=(high.x-low.x)*scale/width
        for child in root.children:
            if child != obj:
                child.location *= fit_ratio
                child.scale *= fit_ratio
    # A touch of specular lets the original hand-painted atlas retain its texture.
    for mat in mesh.materials:
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type=="BSDF_PRINCIPLED":
                    n.inputs["Roughness"].default_value=.74
    print("DINO",name,"width",(high.x-low.x)*scale,"height",(high.z-low.z)*scale)
    return root

def _solid(name,color):
    mat=bpy.data.materials.get(name)
    if not mat:
        mat=bpy.data.materials.new(name)
        mat.diffuse_color=(*color,1)
        mat.use_nodes=True
        mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value=(*color,1)
        mat.node_tree.nodes.get("Principled BSDF").inputs["Roughness"].default_value=.72
    return mat

def _text(parent,body,size,location,material,name):
    curve=bpy.data.curves.new(name,"FONT")
    curve.body=body
    curve.align_x="CENTER";curve.align_y="CENTER"
    curve.size=size;curve.extrude=.008
    font_path=Path("C:/Windows/Fonts/arialbd.ttf")
    if font_path.exists():
        curve.font=bpy.data.fonts.load(str(font_path),check_existing=True)
    obj=bpy.data.objects.new(name,curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent=parent;obj.location=location
    obj.data.materials.append(material)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj

def _label(root,obj,number):
    if root.name == "Steve":
        _cube(root,"Steve visible pack patch",(-.35,-1.4,.38),(.82,.08,.58),_solid("Pack dark webbing",(.017,.024,.025)))
        label=_text(root,number,.46,(-.35,-1.455,.38),_solid("Launch ivory",(1,.98,.9)),"Steve reference personnel number")
        label.rotation_euler=(math.pi/2,0,0)
        return
    mesh=obj.data
    uv=mesh.uv_layers.active.data
    patch=[]
    for poly in mesh.polygons:
        if all(.75 < uv[i].uv.x < 1 and .333 < uv[i].uv.y < .667 for i in poly.loop_indices):
            patch.append(poly)
    if not patch:
        if root.name == "Steve":
            _cube(root,"Steve visible pack patch",(-.35,-1,.38),(.82,.08,.58),_solid("Pack dark webbing",(.017,.024,.025)))
            label=_text(root,number,.46,(-.35,-1.055,.38),_solid("Launch ivory",(1,.98,.9)),"Steve reference personnel number")
            label.rotation_euler=(math.pi/2,0,0)
        return
    indices=set(i for poly in patch for i in poly.vertices)
    coords=[mesh.vertices[i].co for i in indices]
    center=sum(coords,Vector())/len(coords)
    n=(coords[1]-coords[0]).cross(coords[2]-coords[0]).normalized()
    if n.y>0:n=-n
    right=Vector((0,0,1)).cross(n).normalized()
    up=n.cross(right).normalized()
    height=max((co-center).dot(up) for co in coords)-min((co-center).dot(up) for co in coords)
    # Clear the legacy mirrored three-digit atlas number on this preview only.
    for poly in patch:
        for i in poly.loop_indices:
            uv[i].uv=(.774,.355)
    label=_text(root,number,height*1.04,center+n*.025,_solid("Launch ivory",(1,.98,.9)),root.name+" reference personnel number")
    label.rotation_euler=Matrix((right,up,n)).transposed().to_euler()

def _cube(parent,name,location,dimensions,material):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,0))
    obj=bpy.context.object;obj.name=name;obj.parent=parent
    obj.location=location;obj.dimensions=dimensions
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(material)
    bevel=obj.modifiers.new("Soft manufactured edges","BEVEL");bevel.width=.035;bevel.segments=2
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj

def build_dinosaurs(finish_target):
    from linda import build_linda
    finish=Vector(finish_target)
    susan=Vector((11.8,2,-1.75))
    steve=Vector((9.0,4,-5.0))
    return [
        _dinosaur("Greg",(.75,.64,-.14),(.31,-.36,.88),(-6.6,-3.9),18.0,-3,True,max_height=10.0,top_right=(.40,.98)),
        build_linda(),
        _dinosaur("Susan",finish-susan,(-.65,-.67,-.25),(susan.x,susan.z),7.0,susan.y,True,aim_at=finish),
        _dinosaur("Steve",finish-steve,(.05,-.65,.78),(steve.x,steve.z),5.5,steve.y,max_height=4.4,aim_at=finish),
    ]
