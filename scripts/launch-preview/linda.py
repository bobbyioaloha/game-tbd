"""Launch-preview-only Linda, with authored anatomy and a two-handed grip.

The game model and animations remain untouched.  Its body is baked into the
reference tumble, while these bent forelegs and gripping hands are posed for
the readable, camera-facing checklist in the launch illustration.
"""
from pathlib import Path
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from dinosaurs import _basis, _cube, _evaluate_pose, _label, _solid, _text

ROOT = Path(__file__).resolve().parents[2]


def _tube(parent, name, controls, material, skin=False, sides=12, steps=3):
    """A single capped, tapered mesh with continuous bends and atlas UVs."""
    samples = []
    for i in range(len(controls) - 1):
        a, b, c, d = (controls[max(0, i - 1)], controls[i],
                      controls[i + 1], controls[min(len(controls) - 1, i + 2)])
        for j in range(steps):
            t = j / steps
            q = [.5 * (2 * b[k] + (-a[k] + c[k]) * t
                       + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t
                       + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t)
                 for k in range(4)]
            q[3] = max(.008, q[3])
            samples.append(q)
    samples.append(controls[-1])
    points = []
    for i, q in enumerate(samples):
        before = Vector(samples[max(0, i - 1)][:3])
        after = Vector(samples[min(len(samples) - 1, i + 1)][:3])
        tangent = (after - before).normalized()
        reference = Vector((0, 1, 0))
        if abs(tangent.dot(reference)) > .92:
            reference = Vector((0, 0, 1))
        u = tangent.cross(reference).normalized()
        v = tangent.cross(u).normalized()
        for side in range(sides):
            theta = 2 * math.pi * side / sides
            points.append(Vector(q[:3]) + q[3] * (math.cos(theta) * u + math.sin(theta) * v))
    faces = []
    for ring in range(len(samples) - 1):
        for side in range(sides):
            a = ring * sides + side
            b = ring * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(samples) - 1) * sides + i for i in range(sides)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(material)
    mesh.update()
    if skin:
        uv = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            for index in poly.loop_indices:
                co = mesh.vertices[mesh.loops[index].vertex_index].co
                # The same first atlas tile as Linda's stocky purple torso.
                u = .12 + ((co.x * .25 + co.y * .20) % .76)
                v = .12 + ((co.z * .25 + co.y * .16) % .76)
                uv.data[index].uv = ((8 + 240 * u) / 1024, 1 - (8 + 240 * v) / 768)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    for poly in mesh.polygons:
        poly.use_smooth = True
    return obj


def _body():
    before = set(bpy.data.objects)
    old_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / "apps/web/public/models/linda.glb"))
    imported = set(bpy.data.objects) - before
    actions = set(bpy.data.actions) - old_actions
    arm = next(o for o in imported if o.type == "ARMATURE")
    pose = _evaluate_pose(arm, next(a for a in actions if a.name.split(".")[0] == "Dive"))
    arm.animation_data_clear()
    for bone in arm.pose.bones:
        bone.matrix_basis = pose[bone.name]
    bpy.context.view_layer.update()
    src = next(o for o in imported if o.type == "MESH" and "mesh" in o.name.lower())
    groups = {g.name: g.index for g in src.vertex_groups}
    members = {name: {v.index for v in src.data.vertices
                     if any(g.group == index and g.weight > .5 for g in v.groups)}
               for name, index in groups.items()}
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(src.evaluated_get(dg),
                                        preserve_all_data_layers=True, depsgraph=dg)
    # Use one UV layer name for the body and hands so compaction preserves the atlas.
    mesh.uv_layers.active.name = "UVMap"
    mesh.transform(src.matrix_world)
    # Three-quarter dorsal view: the pack turns toward the camera while the
    # head travels lower-right, instead of presenting a long vertical flank.
    basis = _basis((.60, .28, -.75), (-.38, -.90, -.40))
    mesh.transform(basis.to_4x4())
    for side in (-1, 1):
        indices = members["leg " + str(side)]
        pivot = basis @ (arm.matrix_world @ arm.pose.bones["leg " + str(side)].head)
        direction = sum((mesh.vertices[i].co - pivot for i in indices), Vector()).normalized()
        raised = Vector((side * .16 - .05, -.10 if side == -1 else .12, 1)).normalized()
        rotation = direction.rotation_difference(raised)
        for index in indices:
            mesh.vertices[index].co = pivot + rotation @ (mesh.vertices[index].co - pivot)
        # Turn the raised toes upward, with soles toward the camera.  A soft
        # ankle transition keeps the two hind feet attached to their shins.
        bone = arm.pose.bones["leg " + str(side)]
        deformation = arm.matrix_world @ bone.matrix @ arm.data.bones[bone.name].matrix_local.inverted()
        old_ankle = basis @ (deformation @ Vector((side * .46, .725, .35)))
        ankle = pivot + rotation @ (old_ankle - pivot)
        orientation = rotation.to_matrix() @ basis @ deformation.to_3x3()
        old_toe = (orientation @ Vector((0, -1, 0))).normalized()
        old_normal = (orientation @ Vector((0, 0, -1))).normalized()
        old_frame = Matrix((old_toe.cross(old_normal).normalized(), old_toe, old_normal)).transposed()
        toe = Vector((0, -.05, 1)).normalized()
        normal = Vector((0, -1, -.05)).normalized()
        bend = Matrix((toe.cross(normal).normalized(), toe, normal)).transposed() @ old_frame.inverted()
        for index in indices:
            influence = max(0, min(1, (.55 - src.data.vertices[index].co.z) / .20))
            if influence:
                original = mesh.vertices[index].co.copy()
                mesh.vertices[index].co = original.lerp(ankle + bend @ (original - ankle), influence)
    removed = members["arm -1"] | members["arm 1"] | members["clipboard"]
    coords = [v.co for v in mesh.vertices if v.index not in removed]
    low = Vector(tuple(min(v[i] for v in coords) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in coords) for i in range(3)))
    scale = min(5.7 / (high.x - low.x), 6.4 / (high.z - low.z))
    center = (low + high) / 2 + Vector((.18 / scale, 0, 0))
    shoulders = {
        side: (basis @ (arm.matrix_world @ arm.pose.bones["arm " + str(side)].head) - center) * scale
        for side in (-1, 1)
    }
    for vertex in mesh.vertices:
        vertex.co = (vertex.co - center) * scale
    # Delete both old straight forelegs and their strapped-on prop, including
    # their vertices; leave the torso, frill, horns, back legs and equipment.
    # The reference's raised hind feet have dark claws, separate from her
    # ivory facial horns. This material override affects only the preview.
    dark_claw = _solid("Linda charcoal claws", (.025, .017, .022))
    mesh.materials.append(dark_claw)
    uv = mesh.uv_layers.active.data
    leg_vertices = members["leg -1"] | members["leg 1"]
    for polygon in mesh.polygons:
        if all(i in leg_vertices for i in polygon.vertices) and all(
                .50 < uv[i].uv.x < .75 and .333 < uv[i].uv.y < .667
                for i in polygon.loop_indices):
            polygon.material_index = len(mesh.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in removed], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    root = bpy.data.objects.new("Linda", None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (-11.2, -1, 3)
    obj = bpy.data.objects.new("Linda reference tumble body", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = root
    _label(root, obj, "02")
    skin = mesh.materials[0]
    for material in mesh.materials:
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Roughness"].default_value = .74
    return root, skin, shoulders


def _clipboard(root):
    group = bpy.data.objects.new("Linda checklist held in both hands", None)
    bpy.context.scene.collection.objects.link(group)
    group.parent = root
    group.location = (2.30, -1.80, -.02)
    # Positive Y tilt is clockwise from the authored launch camera.
    group.rotation_euler[1] = math.radians(15)
    board = _solid("Clipboard warm wood", (.23, .12, .065))
    paper = _solid("Checklist paper", (.96, .92, .81))
    ink = _solid("Checklist ink", (.025, .031, .032))
    metal = _solid("Checklist clip metal", (.36, .4, .43))
    _cube(group, "Clipboard board", (0, 0, 0), (1.52, .14, 2.18), board)
    _cube(group, "Checklist sheet", (0, -.09, 0), (1.31, .025, 1.96), paper)
    _cube(group, "Clipboard steel clip", (0, -.15, 1.02), (.43, .12, .20), metal)
    heading = _text(group, "CHECKLIST", .20, (0, -.125, .69), ink, "Checklist heading")
    heading.rotation_euler = (math.pi / 2, 0, 0)
    for i in range(4):
        z = .3 - i * .36
        for x, zz, w, h in [(-.44, z, .20, .024), (-.44, z - .18, .20, .024),
                            (-.53, z - .09, .024, .18), (-.35, z - .09, .024, .18)]:
            _cube(group, "Checklist box %d" % (i + 1), (x, -.115, zz), (w, .015, h), ink)
        _cube(group, "Checklist ruled line", (.11, -.115, z - .10), (.65, .014, .018), ink)
    return group


def _hand(board, side, z, skin, claw):
    name = "left-edge" if side == -1 else "right-edge"
    _tube(board, "Linda " + name + " connected palm", [
        (side * .855, .07, z - .065, .093),
        (side * .853, .005, z + .015, .101),
        (side * .830, -.035, z + .080, .077),
    ], skin, True)
    for i in range(3):
        zz = z + (i - 1) * .100
        _tube(board, "Linda " + name + " curled finger %d" % (i + 1), [
            (side * .85, .01, zz, .051),
            (side * .87, -.095, zz + .02, .055),
            (side * .80, -.165, zz + .03, .047),
            (side * .755, -.180, zz + .017, .041),
        ], skin, True, sides=10)
        _tube(board, "Linda " + name + " pointed claw %d" % (i + 1), [
            (side * .773, -.181, zz + .026, .047),
            (side * .708, -.193, zz + .002, .033),
            (side * .652, -.156, zz - .060, .008),
        ], claw, sides=7, steps=2)
    # A small opposing hook presses the back edge.  It is deliberately tucked
    # behind the board rather than making a human thumb silhouette on the face.
    _tube(board, "Linda " + name + " opposing hook digit", [
        (side * .852, .020, z + .055, .050),
        (side * .754, .105, z + .050, .037),
        (side * .690, .102, z - .010, .022),
    ], skin, True, sides=8)
    _tube(board, "Linda " + name + " rear hook claw", [
        (side * .720, .106, z + .018, .025),
        (side * .680, .085, z - .023, .012),
        (side * .680, .070, z - .043, .008),
    ], claw, sides=7, steps=2)


def build_linda():
    """Return the static launch-only Linda root in Blender scene coordinates."""
    root, skin, shoulders = _body()
    board = _clipboard(root)
    claw = _solid("Linda charcoal claws", (.025, .017, .022))
    rotation = board.rotation_euler.to_matrix()
    grip = lambda point: Vector(board.location) + rotation @ Vector(point)
    near_wrist = grip((-.855, .07, -.045))
    far_wrist = grip((.855, .07, -.535))
    _tube(root, "Linda near shoulder elbow and forearm", [
        (*shoulders[-1], .29),
        (*shoulders[-1].lerp(near_wrist, .37), .25),
        (*shoulders[-1].lerp(near_wrist, .70), .165),
        (*near_wrist, .094),
    ], skin, True, sides=16, steps=4)
    _tube(root, "Linda far shoulder elbow and forearm", [
        (*shoulders[1], .28),
        (*shoulders[1].lerp(far_wrist, .38) + Vector((0, .35, -.14)), .22),
        (*shoulders[1].lerp(far_wrist, .72) + Vector((0, .50, -.12)), .15),
        (*far_wrist, .093),
    ], skin, True, sides=16, steps=4)
    _hand(board, -1, .02, skin, claw)
    _hand(board, 1, -.47, skin, claw)
    print("DINO Linda: authored body with preview-only two-handed clipboard pose")
    return root
