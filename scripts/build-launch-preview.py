"""Rebuild the isolated Blender launch-screen study.

Run from the repository root with Blender 5.2:
  blender --background --factory-startup --python scripts/build-launch-preview.py
Add -- --render to also render art/launch-preview.png.
The original artwork and gameplay character assets are never overwritten.
"""
import bpy
import math
import random
import shutil
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'scripts' / 'launch-preview'))
from title import build_title
from dinosaurs import build_dinosaurs

OUT = ROOT / 'art'
OUT.mkdir(exist_ok=True)
RNG = random.Random(614)


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def rgba(color):
    return tuple(linear(int(color[i:i+2], 16) / 255) for i in (0, 2, 4)) + (1,)


def material(name, color, metal=0, rough=.65, unlit=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if unlit:
        nodes = mat.node_tree.nodes
        nodes.remove(bsdf)
        rgb = nodes.new('ShaderNodeRGB')
        rgb.outputs[0].default_value = rgba(color)
        # A color socket directly into Surface is Blender's glTF unlit graph.
        mat.node_tree.links.new(rgb.outputs[0], nodes.get('Material Output').inputs['Surface'])
    return mat


def group(name, location=(0, 0, 0), rotation=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = tuple(math.radians(x) for x in rotation)
    return obj


def box(name, location, scale, mat, bevel=.04, parent=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler = tuple(math.radians(x) for x in rotation)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Small manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        mod.affect = 'EDGES'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.parent = parent
    return obj


def mesh(name, vertices, faces, mats, parent=None, indices=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    for mat in mats:
        data.materials.append(mat)
    if indices:
        for poly, index in zip(data.polygons, indices):
            poly.material_index = index
    return obj


def label(name, body, location, width, height, mat, parent, align='CENTER'):
    data = bpy.data.curves.new(name, 'FONT')
    data.body = body
    data.align_x = align
    data.align_y = 'CENTER'
    data.size = 1
    data.extrude = .001
    data.resolution_u = 4
    for fontpath in [Path('C:/Windows/Fonts/arialbd.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]:
        if fontpath.exists():
            data.font = bpy.data.fonts.load(str(fontpath))
            break
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.parent = parent
    data.materials.append(mat)
    bpy.context.view_layer.update()
    # Measure glyphs in local XY, independently of their rotated parent.
    # World-space bounds would scale text incorrectly on the tumbling props.
    coords = [Vector(corner) for corner in obj.bound_box]
    obj.scale.x = width / max(.01, max(c.x for c in coords) - min(c.x for c in coords))
    obj.scale.y = height / max(.01, max(c.y for c in coords) - min(c.y for c in coords))
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    obj.select_set(False)
    return obj


def refrigerator():
    root = group('Refrigerator', (11.05, 0, 4.55), (8, 22, 23))
    enamel = material('Warm aged fridge enamel', 'e6e2d8', rough=.48)
    door = material('Cream refrigerator door', 'fff8e8', rough=.42)
    edge = material('Fridge rubber door seals', '585852')
    handle = material('Brushed refrigerator handles', 'a5a6a1', metal=.62, rough=.32)
    rust = material('Small worn enamel chips', 'c2a37d')
    ink = material('Office label black', '172330')
    yellow = material('Safety notice yellow', 'ffd127')
    root['reference'] = 'Upper right: two-door office fridge, LUNCH LOCKER sticker and sticky notes.'
    box('Fridge cabinet', (0, 0, 0), (3.2, 1.76, 4.95), enamel, .08, root)
    box('Freezer seal', (0, -.905, 1.42), (3.16, .12, 1.82), edge, .015, root)
    box('Freezer door', (0, -1.00, 1.44), (3.10, .16, 1.75), door, .04, root)
    box('Main door seal', (0, -.905, -.97), (3.16, .12, 2.90), edge, .015, root)
    box('Main refrigerator door', (0, -1.00, -.98), (3.10, .16, 2.83), door, .04, root)
    for x, z, height in [(-1.20, -.14, 1.25), (-1.2, 1.23, .68)]:
        for dz in [-height / 2, height / 2]:
            box('Handle fixing', (x, -1.17, z + dz), (.17, .19, .14), handle, .025, root)
        box('Fridge pull handle', (x, -1.30, z), (.13, .15, height), handle, .04, root)
    for x in [-1.16, 1.16]:
        box('Fridge foot', (x, .14, -2.55), (.32, .64, .19), edge, .025, root)
    box('Lunch notice border', (.56, -1.098, -.78), (1.05, .015, 1.42), ink, .012, root)
    box('Lunch notice', (.56, -1.112, -.78), (.95, .012, 1.32), yellow, .005, root)
    box('Lunchbox icon', (.56, -1.129, -.47), (.47, .012, .34), ink, .025, root)
    box('Lunchbox handle top', (.56, -1.132, -.215), (.24, .012, .045), ink, .005, root)
    for x in [.44, .68]:
        box('Lunchbox handle side', (x, -1.132, -.27), (.04, .012, .12), ink, .005, root)
    for x in [.47, .65]:
        box('Lunchbox straps', (x, -1.14, -.47), (.035, .008, .29), yellow, 0, root)
    label('LUNCH lettering', 'LUNCH', (.56, -1.132, -.90), .74, .20, ink, root)
    label('LOCKER lettering', 'LOCKER', (.56, -1.132, -1.18), .79, .19, ink, root)
    for color, x, z, tilt in [('6bc5df', -.26, 1.72, -12), ('fa879e', 1.03, 1.68, 8), ('f3d53c', -.61, -.76, -8)]:
        note = group('Fridge sticky note', (x, -1.105, z), (0, tilt, 0))
        note.parent = root
        note_mat = material('Sticky note ' + color, color)
        box('Paper note', (0, 0, 0), (.39, .015, .48), note_mat, 0, note)
        box('Note folded corner', (.12, -.012, -.17), (.13, .012, .12), door, 0, note, (0, 20, 0))
        for line in range(3):
            box('Handwritten office reminder', (0, -.012, .02 - line * .065), (.20 - .03 * (line % 2), .007, .016), ink, 0, note)
    for i in range(72):
        x, z = RNG.uniform(-1.48, 1.48), RNG.uniform(-2.30, 2.30)
        if abs(z - .49) < .12 or (x > -.10 and -1.51 < z < .01):
            continue
        box('Enamel wear', (x, -1.093, z), (RNG.uniform(.02, .09), .006, RNG.uniform(.035, .14)), rust, 0, root, (0, RNG.uniform(-40, 40), 0))
    return root


def sofa():
    root = group('Sofa', (3.58, 2.4, -1.12), (22, 27, -13))
    fabric = material('Sofa burnt orange upholstery', 'b85134')
    cushions = material('Couch cushions orange', 'd86d47')
    seam = material('Couch piping', 'e88c64')
    wood = material('Couch dark wooden feet', '493c32')
    yellow = material('Couch inventory tag yellow', 'ffcf26')
    ink = material('Couch inventory tag border', '5f3d21')
    box('Couch base', (0, 0, -.46), (2.72, 1.16, .62), fabric, .06, root)
    box('Upholstered couch back', (0, .43, .38), (2.72, .33, 1.14), fabric, .07, root)
    for x in [-.84, 0, .84]:
        box('Couch back pillow', (x, .20, .35), (.81, .36, .91), cushions, .07, root, (9, 0, 0))
        box('Couch seat pillow', (x, -.11, -.08), (.80, .90, .23), cushions, .035, root)
        box('Seat piping front', (x, -.57, -.035), (.73, .022, .024), seam, .009, root)
    for x in [-1.34, 1.34]:
        box('Couch rolled arm', (x, -.05, .11), (.27, 1.15, .67), fabric, .07, root)
    for x in [-1.12, 1.12]:
        for y in [-.35, .38]:
            box('Couch wooden foot', (x, y, -.90), (.17, .16, .34), wood, .01, root)
    box('Couch inventory border', (.88, -.594, -.45), (.36, .012, .40), ink, .008, root)
    box('Couch inventory yellow square', (.88, -.604, -.45), (.30, .010, .34), yellow, .004, root)
    return root


def satellite():
    root = group('Satellite', (7.82, 3.5, 7.45), (16, 20, -13))
    silver = material('Satellite foil silver', 'b5c6d5', metal=.7, rough=.4)
    pale = material('Satellite foil highlights', 'eef0e1', metal=.35)
    solar = material('Satellite midnight blue cells', '072c63', metal=.42, rough=.32)
    grid = material('Satellite copper traces', 'b69b6f', metal=.45)
    yellow = material('Satellite gold sensor', 'ffd522', metal=.35)
    box('Satellite body', (0, 0, 0), (.90, .64, .78), silver, .15, root)
    box('Satellite yellow sensor', (0, -.39, 0), (.36, .11, .38), yellow, .01, root)
    for x in [-1.28, 1.28]:
        box('Solar boom', (x / 2, 0, 0), (1.16, .11, .10), silver, .01, root)
        box('Solar panel frame', (x, 0, 0), (1.35, .095, .75), silver, .015, root)
        box('Solar blue panels', (x, -.06, 0), (1.31, .024, .71), solar, 0, root)
        for col in range(1, 5):
            box('Solar cell column', (x - .655 + col * .262, -.076, 0), (.009, .007, .71), grid, 0, root)
        box('Solar cell row', (x, -.076, 0), (1.31, .007, .008), grid, 0, root)
    for z in [-.83, .83]:
        box('Vertical solar boom', (0, 0, z / 2), (.08, .09, .64), silver, .01, root)
        box('Small solar panel', (0, 0, z), (.47, .07, .51), solar, 0, root)
        box('Small cell row', (0, -.041, z), (.47, .007, .008), grid, 0, root)
        box('Small cell column', (0, -.041, z), (.008, .007, .51), grid, 0, root)
    for x, z in [(-.36, .41), (.42, -.36), (.39, .38), (-.42, -.35)]:
        box('Satellite angled foil fin', (x, 0, z), (.32, .3, .24), pale, .06, root, (0, 26, 17))
    return root


def papers():
    root = group('Loose paperwork')
    white = material('Loose paper ivory', 'fffbea')
    ink = material('Paper pink printed lines', 'd3a7a1')
    for n, (x, z, angle, scale) in enumerate([(-7.57, 2.02, -25, .65), (-9.48, .63, 13, .30)]):
        paper = group('Falling loose checklist ' + str(n), (x, 1.4, z), (0, angle, 10))
        paper.parent = root
        box('Paper sheet', (0, 0, 0), (scale, .012, scale * .78), white, 0, paper)
        for i in range(7):
            box('Checklist print', (.02, -.013, scale * (.27 - i * .075)), (scale * .71, .005, .007), ink, 0, paper)
    return root


def noise2(w, h, seed, cells):
    rng = np.random.default_rng(seed)
    data = rng.random((cells + 1, cells + 1))
    x = np.linspace(0, cells - .001, w)
    y = np.linspace(0, cells - .001, h)
    xx, yy = np.meshgrid(x, y)
    ix, iy = xx.astype(int), yy.astype(int)
    fx, fy = xx - ix, yy - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    return ((1-fx) * (1-fy) * data[iy, ix] + fx * (1-fy) * data[iy, ix+1]
            + (1-fx) * fy * data[iy+1, ix] + fx * fy * data[iy+1, ix+1])


def image_material(name, pixels, transparent=True):
    h, w = pixels.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.pixels.foreach_set(pixels.astype(np.float32).ravel())
    img.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    output = nodes.new('ShaderNodeOutputMaterial')
    if transparent:
        trans = nodes.new('ShaderNodeBsdfTransparent')
        mix = nodes.new('ShaderNodeMixShader')
        mat.node_tree.links.new(tex.outputs['Alpha'], mix.inputs[0])
        mat.node_tree.links.new(trans.outputs[0], mix.inputs[1])
        mat.node_tree.links.new(tex.outputs['Color'], mix.inputs[2])
        mat.node_tree.links.new(mix.outputs[0], output.inputs[0])
        mat.surface_render_method = 'BLENDED'
    else:
        mat.node_tree.links.new(tex.outputs['Color'], output.inputs[0])
    mat.use_backface_culling = False
    return mat


def card(name, x, y, z, width, height, mat, angle=0):
    obj = mesh(name, [(-width/2, 0, -height/2), (width/2, 0, -height/2),
                      (width/2, 0, height/2), (-width/2, 0, height/2)], [(0, 1, 2, 3)], [mat])
    uv = obj.data.uv_layers.new(name='UVMap')
    for loop, co in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = co
    obj.location = (x, y, z)
    obj.rotation_euler.y = math.radians(angle)
    return obj


def environment():
    # A procedural sky and separately placed cloud layers retain parallax.
    # No part of the reference PNG is used as a scene texture.
    h, w = 128, 256
    t = np.linspace(0, 1, h)[:, None, None]
    bottom, top = np.array([.48, .75, 1.]), np.array([.08, .38, .86])
    pixels = np.ones((h, w, 4))
    pixels[:, :, :3] = bottom[None, None, :] * (1-t) + top[None, None, :] * t
    sky = image_material('Procedural cobalt blue sky', pixels, False)
    card('Far blue sky', 0, 24, 0, 65, 42, sky)

    palettes = [material('Distant valley blue ' + str(i), color, unlit=True) for i, color in enumerate([
        '92bfe4', '8dbbdf', '87b9df', '83b5dd', '83b2d9', '9bc5e5', '8dbde1', '7fafd6', 'a0c8e7'])]
    verts, faces, colors = [], [], []
    cols, rows = 180, 88
    for j in range(rows):
        for i in range(cols):
            x = -24 + i * .28
            z = 2.1 - j * .155
            if j == 0:
                z += .43 * math.sin(i * .26) + .12 * math.sin(i * 1.4) + RNG.uniform(-.08, .11)
            else:
                x += RNG.uniform(-.10, .10)
                z += RNG.uniform(-.06, .06)
            verts.append((x, 17 + RNG.uniform(-.7, .7), z))
    for j in range(rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            faces += [(a, a+1, a+cols), (a+1, a+cols+1, a+cols)]
            colors += [RNG.randrange(len(palettes)), RNG.randrange(len(palettes))]
    mesh('Faceted distant mountain valley', verts, faces, palettes, indices=colors)

    # Continue the exact lower boundary for the taller launch composition.
    # A separate RNG leaves every reviewed tree, cloud and prop unchanged.
    extension_rng = random.Random(20260914)
    extension_verts = list(verts[-cols:])
    extension_faces, extension_colors = [], []
    extension_rows = 98
    for j in range(1, extension_rows):
        for i in range(cols):
            x = -24 + i * .28 + extension_rng.uniform(-.10, .10)
            z = 2.1 - (rows - 1 + j) * .155 + extension_rng.uniform(-.06, .06)
            extension_verts.append((x, 17 + extension_rng.uniform(-.7, .7), z))
    for j in range(extension_rows - 1):
        for i in range(cols - 1):
            a = j * cols + i
            extension_faces += [(a, a+1, a+cols), (a+1, a+cols+1, a+cols)]
            extension_colors += [extension_rng.randrange(len(palettes)), extension_rng.randrange(len(palettes))]
    mesh('Lower valley extension for launch controls', extension_verts,
         extension_faces, palettes, indices=extension_colors)

    # Small bounded pine silhouettes make the far-away training valley readable.
    tree_mats = [material('Aerial forest ' + str(i), c, unlit=True) for i, c in enumerate(['699ebf', '80acbe', 'a1bdc4', '78a7c4'])]
    verts, faces, colors = [], [], []
    for i in range(6200):
        x, z = RNG.uniform(-5, 21), RNG.uniform(-12, -.3)
        size = .012 + .074 * min(1, abs(z) / 9) * RNG.uniform(.5, 1.5)
        start = len(verts)
        verts += [(x-size, 15.1, z-size), (x+size, 15.1, z-size), (x, 15.0, z+size*2.8), (x, 14.9, z-size)]
        faces += [(start, start+1, start+2), (start+1, start+3, start+2)]
        index = RNG.randrange(4)
        colors += [index, (index + 1) % 4]
    mesh('Tiny trees far below the falling coworkers', verts, faces, tree_mats, indices=colors)
    extension_verts, extension_faces, extension_colors = [], [], []
    for i in range(7500):
        x, z = extension_rng.uniform(-5, 21), extension_rng.uniform(-26.2, -12)
        size = .012 + .074 * extension_rng.uniform(.5, 1.5)
        start = len(extension_verts)
        extension_verts += [(x-size, 15.1, z-size), (x+size, 15.1, z-size),
                            (x, 15.0, z+size*2.8), (x, 14.9, z-size)]
        extension_faces += [(start, start+1, start+2), (start+1, start+3, start+2)]
        index = extension_rng.randrange(4)
        extension_colors += [index, (index + 1) % 4]
    mesh('Lower forest extension for launch controls', extension_verts,
         extension_faces, tree_mats, indices=extension_colors)
    concrete = material('Distant training landing pad', 'dae5e8', unlit=True)
    pad_center = material('Landing pad inset', '9db6d0', unlit=True)
    pad_mark = material('Landing pad center mark', 'f5f0dd', unlit=True)
    pad = group('Distant training landing zone', (2.65, 14.2, -6.0), (0, -11, 0))
    box('Square concrete landing zone', (0, 0, 0), (2.45, .04, 1.18), concrete, 0, pad)
    box('Square inset', (0, -.05, 0), (1.06, .025, .57), pad_center, 0, pad)
    box('Pad target', (0, -.08, 0), (.33, .02, .18), pad_mark, 0, pad)

    cloud_mats = []
    for seed in range(4):
        w, h = 512, 320
        xx, zz = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
        fbm = sum(noise2(w, h, 28+seed+n*31, 4*2**n) / 2**n for n in range(6)) / 1.96875
        # Rounded overlapping lobes with fine, irregular vapor edges.
        envelope = np.zeros_like(xx)
        for cx, cz, sx, sz in [(-.46, -.10, .40, .44), (-.18, .17, .38, .56), (.18, .12, .43, .52), (.48, -.12, .36, .38)]:
            envelope = np.maximum(envelope, np.exp(-(((xx-cx) / sx)**2 + ((zz-cz) / sz)**2) * 1.6))
        density = (fbm * .66 + envelope * .77 - .53) * 5.0
        alpha = np.clip(density, 0, 1)
        alpha = alpha * alpha * (3-2*alpha)
        alpha *= np.clip((1-np.abs(xx))*8, 0, 1) * np.clip((1-np.abs(zz))*7, 0, 1)
        light = np.clip(.77 + zz * .18 + fbm * .31, .66, 1)
        pixels = np.ones((h, w, 4))
        pixels[:, :, 0] = light * .96
        pixels[:, :, 1] = light * .98
        pixels[:, :, 2] = np.minimum(1, light * 1.02)
        pixels[:, :, 3] = alpha * .97
        cloud_mats.append(image_material('Procedural billowing cloud ' + str(seed), pixels))
    clouds = [
        (-14, 9, 6.9, 11, 8, -19), (-16, 8, 1.5, 10, 12, 20),
        (-13, 8.5, -5.9, 13, 14, -24), (-7, 9.5, -8.8, 13, 9, 4),
        (-5.0, 11, -.35, 9, 6, -10), (1, 11, .8, 7, 5, -20),
        (13, 12, .9, 11, 6, 2), (15.5, 8.5, -4.5, 8, 11, -20),
        (8.5, 10, -9.5, 12, 4, 0), (3.6, 10, 7.7, 5, 2, -6),
        (-8.8, 11, 7.6, 8, 2.8, 15), (6.8, 11, 3.5, 6, 2.6, 0),
        (-1.4, 11, -5.0, 5, 2.7, 14), (8.6, 11, -2.8, 4, 2.6, 0),
        (13, 11, 7.7, 6, 3.6, 0), (-18, 11, -9, 10, 7, 0)]
    for i, (x, y, z, width, height, angle) in enumerate(clouds):
        card('Cloud layer %02d' % i, x, y, z, width, height, cloud_mats[i % 4], angle)

    w = h = 256
    xx, zz = np.meshgrid(np.linspace(-1, 1, w), np.linspace(-1, 1, h))
    radius = np.sqrt(xx**2 + zz**2)
    theta = np.arctan2(zz, xx)
    glow = np.exp(-radius*6) * .48 + np.exp(-(radius/.13)**2)
    rays = (np.abs(np.cos(theta*8))**28) * np.exp(-radius*5) * .8
    pixels = np.ones((h, w, 4))
    pixels[:, :, :3] = (1, .92, .72)
    pixels[:, :, 3] = np.clip(glow + rays, 0, 1) * np.clip((1-radius)*5, 0, 1)
    card('Sun glint upper right', 14.9, 6.8, 7.04, 5.5, 5.5, image_material('Warm sun flare', pixels))


def compact(root):
    # Keep artist-friendly named moving groups, but merge small mesh parts.
    bpy.ops.object.select_all(action='DESELECT')
    children = [obj for obj in root.children_recursive if obj.type == 'MESH']
    if not children:
        return
    for child in children:
        child.select_set(True)
    bpy.context.view_layer.objects.active = children[0]
    bpy.ops.object.join()
    combined = bpy.context.object
    world = combined.matrix_world.copy()
    combined.parent = root
    combined.matrix_world = world
    combined.name = root.name + ' / modeled geometry'
    for empty in list(root.children_recursive):
        if empty.type == 'EMPTY' and not empty.children:
            bpy.data.objects.remove(empty, do_unlink=True)


def lighting_and_camera():
    scene = bpy.context.scene
    world = bpy.data.worlds.new('Bright blue atmospheric fill')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.56, .72, 1, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .75
    scene.world = world
    bpy.ops.object.light_add(type='SUN', location=(10, -10, 12))
    sun = bpy.context.object
    sun.name = 'Warm upper-right sunlight'
    sun.rotation_euler = (math.radians(35), math.radians(-25), math.radians(-35))
    sun.data.energy = 2.0
    sun.data.angle = .13
    sun.data.color = (1, .93, .78)
    bpy.ops.object.light_add(type='AREA', location=(-10, -12, 4))
    fill = bpy.context.object
    fill.name = 'Cloud bounce fill'
    fill.rotation_euler = (Vector((0, 0, 0))-fill.location).to_track_quat('-Z', 'Y').to_euler()
    fill.data.energy = 1600
    fill.data.shape = 'DISK'
    fill.data.size = 15
    bpy.ops.object.camera_add(location=(0, -32, 0))
    camera = bpy.context.object
    camera.name = 'ReferenceCamera'
    camera.rotation_euler = (math.pi/2, 0, 0)
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 32
    camera.data.lens = 48
    camera.data.clip_end = 150
    camera['reference_image'] = 'apps/web/public/images/falling-standards.png'
    camera['composition'] = '1670 × 942. X ±16, Z ±9.025. Fixed reference camera; preview orbit is bounded.'
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1670
    scene.render.resolution_y = 942
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / 'launch-preview.png')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    environment()
    roots = [build_title(), refrigerator(), sofa(), satellite(), papers()]
    roots += build_dinosaurs(bpy.data.objects["Distant training landing zone"].location)
    for root in roots:
        compact(root)
    lighting_and_camera()
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.scene['artist_notes'] = 'Blender-built 3D study of falling-standards.png; separate review preview. Procedural sky/clouds, modeled title/props, posed existing dinosaur models.'
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'launch-preview.blend'))
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'apps/web/public/models/launch-preview.glb'),
                              export_format='GLB', export_animations=False,
                              export_cameras=True, export_lights=False,
                              export_yup=True, export_apply=True)
    print('LAUNCH_EXPORT', len(bpy.data.objects), 'objects', sum(len(m.polygons) for m in bpy.data.meshes), 'polygons')
    if '--render' in sys.argv:
        bpy.ops.render.render(write_still=True)
        shutil.copyfile(OUT / 'launch-preview.png', ROOT / 'apps/web/public/images/launch-scene.png')


if __name__ == '__main__':
    main()
