"""Blender-authored polygon lettering for the Falling Standards launch study.

build_title() creates editable meshes only, with X right, Z up, camera toward +Y.
"""
import math
import random
import bpy
import bmesh


def material(name, color):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    rgb = tuple(int(color[i:i + 2], 16) / 255 for i in (0, 2, 4))
    linear = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Roughness'].default_value = .68
    return mat


# Clipped, deliberately irregular cartoon glyphs, including counter loops.
GLYPHS = {
 'F': [[(.04,0),(0,.96),(.95,1),(1,.96),(1,.73),(.49,.72),(.49,.57),(.89,.59),(.92,.55),(.92,.36),(.49,.33),(.49,.05)]],
 'A': [[(0,.03),(.24,.97),(.73,1),(1,.03),(.69,0),(.64,.19),(.35,.17),(.30,0)],[(.43,.43),(.56,.44),(.50,.70)]],
 'L': [[(.02,1),(.51,1),(.51,.29),(.98,.31),(1,.04),(.04,0),(0,.04)]],
 'I': [[(.05,0),(0,.96),(.06,1),(.94,1),(1,.95),(.98,.02)]],
 'N': [[(0,.02),(0,.97),(.05,1),(.33,.99),(.65,.50),(.64,.99),(.98,.96),(1,.03),(.65,0),(.34,.50),(.36,.01)]],
 'G': [[(.21,0),(.03,.17),(0,.73),(.20,.95),(.43,1),(.80,.94),(1,.78),(.98,.58),(.65,.64),(.57,.74),(.44,.73),(.34,.63),(.34,.31),(.48,.22),(.65,.24),(.65,.37),(.51,.39),(.51,.55),(1,.48),(1,.08),(.72,0)]],
 'S': [[(0,.11),(.04,.37),(.36,.35),(.36,.24),(.59,.25),(.61,.36),(.05,.60),(0,.70),(.02,.87),(.20,1),(.78,.97),(.98,.84),(.96,.65),(.62,.66),(.62,.76),(.38,.77),(.35,.68),(.92,.46),(1,.35),(.98,.13),(.78,0),(.23,.01)]],
 'T': [[(0,.98),(.97,1),(1,.70),(.67,.69),(.65,.02),(.34,0),(.32,.69),(.01,.67)]],
 'D': [[(0,.99),(.64,1),(.96,.81),(1,.24),(.76,.02),(.02,0)],[(.38,.27),(.60,.30),(.63,.66),(.54,.73),(.37,.73)]],
 'R': [[(0,0),(0,.99),(.65,1),(.96,.81),(.96,.58),(.76,.43),(1,.08),(.68,0),(.38,.36),(.37,.01)],[(.38,.56),(.60,.58),(.60,.71),(.53,.77),(.38,.76)]],
}


def polygon(name, rings, parent, mat, depth=.08, bevel=0, location=(0,0,0), offset=0):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '2D'
    curve.resolution_u = 1
    curve.fill_mode = 'BOTH'
    curve.extrude = depth / 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 0
    curve.offset = offset
    for ring in rings:
        spline = curve.splines.new('POLY')
        spline.points.add(len(ring) - 1)
        for point, (x, z) in zip(spline.points, ring):
            point.co = (x,z,0,1)
        spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.rotation_euler = (math.pi/2,0,0)
    obj.location = location
    curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def facets(obj, mats, seed):
    for mat in mats:
        obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    modifier = obj.modifiers.new('Editable carved face triangles', 'TRIANGULATE')
    modifier.quad_method = 'BEAUTY'
    modifier.ngon_method = 'BEAUTY'
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Subdivide the flat cap, retaining the authored silhouette and counters.
    # Small, softly varied patches match the image's mottled carved surfaces.
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    mesh.normal_update()
    front_edges = {edge for face in mesh.faces if face.normal.z > .98 for edge in face.edges}
    bmesh.ops.subdivide_edges(mesh, edges=list(front_edges), cuts=3, use_grid_fill=True)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    rng = random.Random(seed)
    for face in obj.data.polygons:
        if face.normal.z > .98 and rng.random() < .48:
            face.material_index = 1 + rng.randrange(len(mats))


def glyph(parent, character, x, z, width, height, angle, palette, index):
    rings = [[((px-.5)*width,(pz-.5)*height) for px,pz in ring] for ring in GLYPHS[character]]
    letter = bpy.data.objects.new(f'Title / {index:02d} {character}', None)
    bpy.context.collection.objects.link(letter)
    letter.parent = parent
    letter.location = (x,0,z)
    letter.rotation_euler.y = math.radians(-angle)
    polygon(f'{index:02d} {character} navy extrusion',rings,letter,palette['navy'],.34,.085,(.025,-.77,-.045),.125)
    polygon(f'{index:02d} {character} dark inner outline',rings,letter,palette['ink'],.20,.042,(0,-1,0),.035)
    polygon(f'{index:02d} {character} bevel underside',rings,letter,palette['edge'],.12,.045,(.005,-1.16,-.055))
    front = polygon(f'{index:02d} {character} carved colored face',rings,letter,palette['front'],.095,.034,(0,-1.28,.006))
    facets(front,palette['facets'],index*773)


def tagline(parent, mat):
    curve = bpy.data.curves.new('Title / incident report tagline','FONT')
    curve.body = 'Short arms. Long incident reports'
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = 1
    curve.extrude = .009
    curve.bevel_depth = .002
    curve.bevel_resolution = 0
    curve.resolution_u = 3
    for path in [r'C:\Windows\Fonts\arialbd.ttf','/mnt/c/Windows/Fonts/arialbd.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try:
            curve.font = bpy.data.fonts.load(path)
            break
        except RuntimeError:
            continue
    obj = bpy.data.objects.new('Title / incident report tagline',curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = (.12,-1.43,1.86)
    obj.rotation_euler = (math.pi/2,0,0)
    curve.materials.append(mat)
    bpy.context.view_layer.update()
    bounds = list(obj.bound_box)
    obj.scale.x = 9.8/max(max(v[0] for v in bounds)-min(v[0] for v in bounds),.001)
    obj.scale.y = .49/max(max(v[1] for v in bounds)-min(v[1] for v in bounds),.001)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)


def build_title():
    """Return parent Empty containing the extruded logo, stripes, seal and text."""
    root = bpy.data.objects.new('FALLING STANDARDS / sculpted title',None)
    bpy.context.collection.objects.link(root)
    root['role'] = 'Blender-authored editable extruded logo'
    navy = material('Title / navy outer extrusion','082952')
    ink = material('Title / midnight contour','03152D')
    gold = material('Title / sunny gold','FFD037')
    cream = material('Title / warm ivory','FFF0D6')
    gold_palette = {'navy':navy,'ink':ink,'edge':material('Title / amber bevel','D48405'),'front':gold,
                    'facets':[material('Title / gold facet light','FFD43F'),material('Title / gold facet pale','FFD649'),material('Title / gold facet warm','FEC92F')]}
    cream_palette = {'navy':navy,'ink':ink,'edge':material('Title / sand bevel','BBA07A'),'front':cream,
                     'facets':[material('Title / ivory facet warm','FAEACE'),material('Title / ivory facet pale','FFF3DD'),material('Title / ivory facet golden','FCECD1')]}
    contour = [(-6.68,1.30),(-6.97,1.91),(-7.03,3),(-6.98,3.96),(-6.58,4.44),(-5.82,4.61),(-6,6.81),(-5.79,7.03),(-3.67,7.45),(-3.48,7.21),(-2.34,7.34),(-2.12,7.14),(-.96,7.32),(-.73,7.08),(-.40,7.30),(.78,7.31),(1.01,7.08),(1.20,7.29),(2.44,7.20),(3.31,7.16),(4.36,6.95),(4.68,7.13),(6.13,6.87),(6.39,6.50),(6.27,4.71),(7.03,4.44),(7.33,4.13),(7.36,2.05),(6.94,1.28),(3.35,1.55),(-3.19,1.57)]
    polygon('Title / fitted navy silhouette',[contour],root,navy,.28,.06,(0,-.35,0))
    polygon('Title / caution divider rail',[[(-5.23,4.31),(6.07,4.29),(6.13,4.83),(-4.90,4.91)]],root,ink,.13,.025,(0,-1.02,0))
    for index in range(11):
        x=-4.94+index
        if abs(x+.02)<.67:
            continue
        polygon(f'Title / upper caution stripe {index+1:02d}',[[(x,4.38),(x+.48,4.38),(x+.89,4.81),(x+.39,4.81)]],root,gold,.034,.012,(0,-1.16,0))
    falling = [('F',-4.79,5.94,2,2.34,5),('A',-2.85,6.09,1.86,1.93,3),('L',-1.15,6.14,1.40,1.97,1),('L',.39,6.18,1.42,1.97,0),('I',1.69,6.16,.72,1.97,-1),('N',3.15,6.10,1.80,1.98,-3),('G',5.22,5.89,1.83,1.95,-6)]
    for index,(char,x,z,width,height,angle) in enumerate(falling):
        glyph(root,char,x,z,width,height,angle,gold_palette,index+1)
    standards = [('S',-5.83,3.35,1.62,2.14,3),('T',-4.33,3.30,1.37,1.83,1),('A',-2.96,3.29,1.56,1.82,1),('N',-1.42,3.30,1.44,1.82,0),('D',.14,3.31,1.43,1.79,0),('A',1.72,3.29,1.55,1.82,-1),('R',3.29,3.27,1.50,1.85,-1),('D',4.81,3.23,1.46,1.88,-2),('S',6.30,3.24,1.56,2.13,-5)]
    for index,(char,x,z,width,height,angle) in enumerate(standards):
        glyph(root,char,x,z,width,height,angle,cream_palette,index+8)
    polygon('Title / tagline plaque',[[(-5.35,1.45),(-5.63,2.12),(5.83,2.09),(5.54,1.42),(1.60,1.65),(-1.76,1.65)]],root,ink,.12,.035,(0,-1.21,0))
    for side in (-1,1):
        for index in range(2):
            x=(5.56+index*.66)*side
            polygon(f'Title / footer caution {side} {index}',[[(x-.23,1.58),(x+.12,1.56),(x+.44,1.92),(x+.10,1.95)]],root,gold,.035,.01,(0,-1.22,0))
    tagline(root,material('Title / tagline warm white','FFFDF2'))
    circle=[(.09+math.cos(i*2*math.pi/12)*.76,4.65+math.sin(i*2*math.pi/12)*.75) for i in range(12)]
    polygon('Title / footprint navy medallion',[circle],root,ink,.16,.035,(0,-1.38,0))
    footprint=[(-.04,4.05),(-.21,4.16),(-.29,4.39),(-.48,4.63),(-.49,4.82),(-.58,4.96),(-.43,4.87),(-.37,4.93),(-.27,4.80),(-.15,4.59),(-.10,4.62),(-.09,5.02),(-.04,5.10),(-.03,5.27),(.05,5.19),(.11,5.07),(.13,4.94),(.15,4.61),(.23,4.58),(.38,4.82),(.52,4.95),(.50,4.80),(.59,4.84),(.55,4.66),(.43,4.52),(.34,4.22),(.18,4.06)]
    polygon('Title / golden three toe dinosaur footprint',[footprint],root,gold,.075,.025,(.08,-1.54,0))
    return root
