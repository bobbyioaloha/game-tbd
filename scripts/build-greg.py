"""Build Greg's low-poly, rigid-weight skeletal glTF. No external modeling dependencies."""
import json, math, struct, zlib
from pathlib import Path
out=Path('apps/web/public/models');out.mkdir(parents=True,exist_ok=True)
data=bytearray();views=[];accessors=[]
def blob(raw,target=None):
    while len(data)%4:data.append(0)
    start=len(data);data.extend(raw);v={'buffer':0,'byteOffset':start,'byteLength':len(raw)}
    if target:v['target']=target
    views.append(v);return len(views)-1
def acc(values,n,kind='f',typ=None,bounds=False):
    raw=struct.pack('<'+kind*len(values),*values)
    a={'bufferView':blob(raw,34963 if kind=='H' and n==1 else None),'componentType':{'f':5126,'H':5123}[kind],'count':len(values)//n,'type':typ or {1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'}[n]}
    if bounds:a.update(min=[min(values[i::n]) for i in range(n)],max=[max(values[i::n]) for i in range(n)])
    accessors.append(a);return len(accessors)-1
# A small diffuse atlas with broad painted tonal variation; no normal maps.
palette=[(183,106,61),(208,150,94),(44,51,51),(163,171,164),(228,193,48),(28,30,25),(223,210,167)]
pixels=bytearray()
for y in range(256):
    pixels.append(0)
    for x in range(256):
        c=palette[min(6,x//36)]
        shade=.88+.12*y/255+(((x*13+y*7)%11)-5)*.002
        pixels.extend(int(v*shade) for v in c)
def chunk(name,raw):return struct.pack('>I',len(raw))+name+raw+struct.pack('>I',zlib.crc32(name+raw)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',256,256,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels)))+chunk(b'IEND',b'')
image_view=blob(png)
nodes=[{'name':'Greg'}];joints=[];origins=[];meshes=[]
def bone(name,origin,parent=0):
    absolute=origin if parent==0 else tuple(origin[i]+origins[joints.index(parent)][i] for i in range(3))
    node={'name':name,'translation':list(origin)}
    nodes.append(node);idx=len(nodes)-1;nodes[parent].setdefault('children',[]).append(idx)
    joints.append(idx);origins.append(absolute);return idx
root=bone('pelvis',(0,1.35,0))
def piece(name,center,scale,color,joint=root,segments=12,rings=7):
    origin=origins[joints.index(joint)]
    center=tuple(center[i]+origin[i] for i in range(3))
    points=[]
    for r in range(rings+1):
        phi=math.pi*r/rings
        for s in range(segments):
            theta=2*math.pi*s/segments
            points.append((center[0]+scale[0]*math.sin(phi)*math.cos(theta),center[1]+scale[1]*math.cos(phi),center[2]+scale[2]*math.sin(phi)*math.sin(theta)))
    vertices=[];normals=[];uv=[]
    for r in range(rings):
        for s in range(segments):
            a=r*segments+s;b=r*segments+(s+1)%segments;c=(r+1)*segments+s;d=(r+1)*segments+(s+1)%segments
            for ids in [(a,b,c),(b,d,c)]:
                p,q,t=[points[i] for i in ids]
                u=[q[i]-p[i] for i in range(3)];v=[t[i]-p[i] for i in range(3)]
                normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                length=math.sqrt(sum(v*v for v in normal)) or 1
                for point in [p,q,t]:
                    vertices.extend(point);normals.extend(v/length for v in normal);uv.extend(((color*36+18)/256,.2+.6*r/rings))
    count=len(vertices)//3
    attributes={'POSITION':acc(vertices,3,bounds=True),'NORMAL':acc(normals,3),'TEXCOORD_0':acc(uv,2),'JOINTS_0':acc([joints.index(joint),0,0,0]*count,4,'H'),'WEIGHTS_0':acc([1,0,0,0]*count,4)}
    meshes.append({'name':name,'primitives':[{'attributes':attributes,'material':0}]})
    nodes.append({'name':name,'mesh':len(meshes)-1,'skin':0});nodes[0]['children'].append(len(nodes)-1)
piece('ribcage',(0,.25,0),(.52,.8,.55),0)
piece('throat',(0,.8,.31),(.35,.63,.38),1)
head=bone('head',(0,1.15,.35),root)
piece('skull',(0,.12,.12),(.44,.39,.57),0,head)
piece('long angular muzzle',(0,-.02,.56),(.38,.24,.55),0,head,8,5)
piece('lower jaw',(0,-.22,.53),(.34,.09,.5),1,head,8,4)
for side in [-1,1]:
    piece('small recessed eye',(side*.407,.16,.35),(.023,.036,.065),5,head,6,4)
    piece('nostril',(side*.28,.035,.99),(.027,.025,.028),5,head,6,4)
    leg=bone('leg '+str(side),(side*.43,-.23,-.07),root)
    piece('thigh',(0,-.16,0),(.3,.48,.34),0,leg)
    piece('shin',(0,-.64,.04),(.14,.35,.16),0,leg,8,5)
    piece('foot',(0,-1.01,.23),(.21,.12,.38),0,leg,8,4)
    for toe in [-1,0,1]:piece('toe',(toe*.11,-1.025,.49),(.05,.055,.14),6,leg,6,3)
    arm=bone('arm '+str(side),(side*.44,.56,.3),root)
    piece('upper arm',(side*.06,-.12,.06),(.105,.2,.11),0,arm,8,5)
    piece('forearm',(side*.07,-.25,.19),(.07,.08,.18),0,arm,8,4)
    for finger in [-1,1]:piece('two fingers',(side*.07+finger*.035,-.25,.36),(.025,.035,.08),6,arm,6,3)
    piece('shoulder webbing',(side*.29,.49,.04),(.075,.72,.565),2,root,8,8)
    piece('metal adjuster',(side*.29,.54,.565),(.085,.1,.03),3,root,4,4)
tail=bone('tail',(0,-.05,-.43),root)
piece('tail base',(0,-.02,-.4),(.32,.32,.66),0,tail)
piece('tail length',(0,-.12,-1.12),(.19,.18,.63),0,tail)
piece('tail tip',(0,-.17,-1.69),(.08,.08,.38),0,tail,8,5)
piece('waist webbing',(0,-.1,0),(.55,.10,.57),2,root,12,4)
piece('waist buckle',(0,-.1,.58),(.12,.12,.035),3,root,4,4)
piece('parachute pack',(0,.49,-.49),(.38,.46,.18),2,root,8,6)
piece('inspection tag',(.31,.27,-.69),(.065,.11,.018),4,root,4,4)
# Deliberately beyond the tiny arms, visible from behind.
piece('ripcord mounting',(0,.86,-.64),(.11,.10,.045),3,root,8,4)
piece('yellow ripcord top',(0,.97,-.72),(.13,.035,.035),4,root,8,4)
for side in [-1,1]:piece('yellow ripcord sides',(side*.10,.88,-.72),(.03,.10,.035),4,root,8,4)
piece('yellow ripcord bottom',(0,.80,-.72),(.12,.03,.035),4,root,8,4)
# Stencil 001 as small pale bars on the pack.
for x in [.16,0]:
    for dx,dy,sx,sy in [(-.04,0,.014,.07),(.04,0,.014,.07),(0,.07,.04,.012),(0,-.07,.04,.012)]:
        piece('stencil zero',(x+dx,.48+dy,-.677),(sx,sy,.009),6,root,4,3)
piece('stencil one',(-.15,.48,-.677),(.016,.08,.009),6,root,4,3)
inverse=[]
for x,y,z in origins:inverse.extend([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1])
skin={'joints':joints,'skeleton':root,'inverseBindMatrices':acc(inverse,16)}
def quat(x=0,y=0,z=0):
    c1,c2,c3=math.cos(x/2),math.cos(y/2),math.cos(z/2)
    s1,s2,s3=math.sin(x/2),math.sin(y/2),math.sin(z/2)
    return [s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3]
animations=[]
def anim(name,tracks):
    samplers=[];channels=[]
    for joint,rotations,times in tracks:
        samplers.append({'input':acc(times,1,bounds=True),'output':acc([v for q in rotations for v in q],4),'interpolation':'LINEAR'})
        channels.append({'sampler':len(samplers)-1,'target':{'node':joint,'path':'rotation'}})
    animations.append({'name':name,'samplers':samplers,'channels':channels})
arms=[i for i in joints if nodes[i]['name'].startswith('arm')]
anim('Stand',[(root,[quat(),quat()],[0,1])])
anim('Dive',[(root,[quat(math.pi/2),quat(math.pi/2)],[0,1])])
anim('Brake',[(root,[quat(.85),quat(.85)],[0,1])])
anim('Bank left',[(root,[quat(math.pi/2,z=.3),quat(math.pi/2,z=.3)],[0,1]),(tail,[quat(z=-.3),quat(z=-.3)],[0,1])])
anim('Bank right',[(root,[quat(math.pi/2,z=-.3),quat(math.pi/2,z=-.3)],[0,1]),(tail,[quat(z=.3),quat(z=.3)],[0,1])])
anim('Reach',[(arms[1],[quat(),quat(),quat(2.2),quat(2.3),quat(2.3),quat()],[0,.7,1.8,2.3,3.3,4.4]),(head,[quat(),quat(y=.3),quat(y=.3),quat()],[0,1,3.4,4.4])])
anim('Impact',[(root,[quat(math.pi/2),quat(.8),quat(2),quat(math.pi/2)],[0,.2,.55,1.2])])

# Merge the authored parts into one skinned draw call, retaining all bone weights.
merged={}
for semantic,n,kind in [('POSITION',3,'f'),('NORMAL',3,'f'),('TEXCOORD_0',2,'f'),('JOINTS_0',4,'H'),('WEIGHTS_0',4,'f')]:
    values=[]
    for mesh in meshes:
        a=accessors[mesh['primitives'][0]['attributes'][semantic]]
        view=views[a['bufferView']]
        values.extend(struct.unpack_from('<'+kind*(a['count']*n),data,view['byteOffset']))
    merged[semantic]=acc(values,n,kind,bounds=semantic=='POSITION')
for node in nodes:
    if 'mesh' in node:node.pop('mesh');node.pop('skin')
nodes[0]['children']=[root,len(nodes)]
nodes.append({'name':'Greg mesh','mesh':0,'skin':0})
meshes=[{'name':'Greg','primitives':[{'attributes':merged,'material':0}]}]

gltf={'asset':{'version':'2.0','generator':'Mandatory Safety Exercise / Greg asset builder'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'skins':[skin],'meshes':meshes,'animations':animations,'materials':[{'name':'256px painted diffuse','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1},'doubleSided':True}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987}],'images':[{'bufferView':image_view,'mimeType':'image/png'}],'buffers':[{'byteLength':len(data)}],'bufferViews':views,'accessors':accessors}
raw=json.dumps(gltf,separators=(',',':')).encode()
while len(raw)%4:raw+=b' '
while len(data)%4:data.append(0)
glb=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data
(out/'greg.glb').write_bytes(glb)
print('Greg:',sum(accessors[m['primitives'][0]['attributes']['POSITION']]['count']//3 for m in meshes),'triangles;',len(glb),'bytes;',len(joints),'bones')
