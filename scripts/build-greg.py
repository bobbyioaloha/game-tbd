"""Build Greg's textured mid-poly skeletal glTF. No external modeling dependencies."""
import argparse, json, math, struct, zlib
from pathlib import Path
parser=argparse.ArgumentParser(description='Build the shared dinosaur style and character rig.')
parser.add_argument('--character',choices=('greg','linda','steve','susan'),default='greg')
character=parser.parse_args().character
display_name=character.title()
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
# One embedded atlas: rust skin, pale underside, woven webbing and safety labels.
# Seeded block mottling gives the skin a painted game-asset finish at any LOD.
TILE=256
WIDTH,HEIGHT=1024,768
palette=[(155,83,44),(188,149,97),(43,47,43),(151,158,149),
         (223,174,37),(33,29,24),(219,208,173),(43,47,43),
         (223,174,37),(155,83,44),(155,83,44),(155,83,44)]
if character=='linda':
    palette[0]=(114,85,132);palette[1]=(171,143,165);palette[9]=(83,62,101)
if character=='steve':
    palette[0]=(70,116,105);palette[1]=(147,168,130);palette[9]=(49,78,73)
if character=='susan':
    palette[0]=(177,143, 60)
    palette[1]=(216,197,144);palette[9]=(126,94, 40)
def noise(x,y,seed=0):
    n=((x*374761393+y*668265263+seed*1442695041)&0xffffffff)
    n=((n^(n>>13))*1274126177)&0xffffffff
    return ((n^(n>>16))&65535)/65535
atlas=bytearray(WIDTH*HEIGHT*3)
for y in range(HEIGHT):
    for x in range(WIDTH):
        tile=x//TILE+4*(y//TILE);u=x%TILE;v=y%TILE
        base=palette[tile]
        if tile in (0,1,9,10,11):
            broad=noise(u//34,v//27,3)
            cell=noise(u//7,v//6,7)
            fine=noise(u//2,v//2,11)
            shade=.79+.28*broad+.22*cell+.045*fine
            # Irregular scale edges, kept subtle so the pattern reads at race distance.
            if u%7==0 and cell>.55:shade-=.075
        elif tile in (2,7):
            shade=.87+.09*noise(u//5,v//5,19)+.09*((u+v)%3==0)
        elif tile==3:
            shade=.86+.16*noise(u//16,v//3,2)
        else:shade=.96+.04*noise(u//4,v//4,5)
        offset=(y*WIDTH+x)*3
        atlas[offset:offset+3]=bytes(max(0,min(255,round(c*shade))) for c in base)
def rect(tile,x,y,w,h,color):
    for yy in range(max(0,y),min(TILE,y+h)):
        for xx in range(max(0,x),min(TILE,x+w)):
            offset=(((tile//4)*TILE+yy)*WIDTH+(tile%4)*TILE+xx)*3
            atlas[offset:offset+3]=bytes(color)
glyphs={
 '4':['00010','00110','01010','10010','11111','00010','00010'],
 '0':['01110','11011','11011','11011','11011','11011','01110'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 'D':['11110','10001','10001','10001','10001','10001','11110'],
 'G':['01111','10000','10000','10111','10001','10001','01111'],
 'N':['10001','11001','11001','10101','10011','10011','10001'],
 'O':['01110','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'U':['10001','10001','10001','10001','10001','10001','01110'],
 'Y':['10001','10001','01010','00100','00100','00100','00100'],
 '2':['01110','10001','00001','00010','00100','01000','11111'],
 '1':['00100','01100','00100','00100','00100','00100','01110'],
 'H':['10001','10001','10001','11111','10001','10001','10001'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 'A':['01110','10001','10001','11111','10001','10001','10001'],
 'F':['11111','10000','10000','11110','10000','10000','10000'],
 'L':['10000','10000','10000','10000','10000','10000','11111'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],
 'I':['111','010','010','010','010','010','111'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'K':['10001','10010','10100','11000','10100','10010','10001'],
}
def lettering(tile,text,y,size,color):
    width=sum((len(glyphs[c][0])+1)*size for c in text)-size
    x=(TILE-width)//2
    for c in text:
        for row,line in enumerate(glyphs[c]):
            for col,pixel in enumerate(line):
                if pixel=='1':rect(tile,x+col*size,y+row*size,size,size,color)
        x+=(len(glyphs[c][0])+1)*size
for tile in (7,8):
    for inset in (9,13):
        rect(tile,inset,inset,256-2*inset,2,(167,153,112))
        rect(tile,inset,254-inset,256-2*inset,2,(167,153,112))
        rect(tile,inset,inset,2,256-2*inset,(167,153,112))
        rect(tile,254-inset,inset,2,256-2*inset,(167,153,112))
lettering(7,{'greg':'001','linda':'002','steve':'003','susan':'004'}[character],70,11,(224,218,191))
rect(7,40,177,176,3,(154,155,137))
lettering(8,'FALL',65,7,(32,31,27))
lettering(8,'RISK',125,7,(32,31,27))
for x in range(24,233,24):
    rect(8,x,27,12,13,(32,31,27))
    rect(8,x,216,12,13,(32,31,27))
if character=='linda':
    rect(10,0,0,256,256,(232,223,196))
    lettering(10,'CHECKLIST',22,4,(39,42,39))
    for row in range(4):
        y=77+row*37
        for x0,y0,w,h in [(25,y,20,3),(25,y+18,20,3),(25,y,3,21),(43,y,3,21)]:rect(10,x0,y0,w,h,(47,51,45))
        rect(10,63,y+3,158-row*15,3,(82,87,76))
        rect(10,63,y+11,115,2,(139,143,124))
        if row<3:
            for i in range(7):rect(10,29+i,y+8+i//2,2,2,(46,71,51))
            for i in range(12):rect(10,35+i,y+11-i,2,2,(46,71,51))
    rect(11,0,0,256,256,(224,182,57))
    lettering(11,'HR',40,17,(40,42,38))
    rect(11,25,183,206,4,(40,42,38))
    lettering(11,'002',202,4,(40,42,38))
if character=='steve':
    rect(10,0,0,256,256,(20,37,33))
    lettering(10,'DIAG',22,6,(140,205,167))
    lettering(10,'RETRY',184,5,(216,184,68))
    for x in range(25,231):
        y=117+int(18*math.sin(x*.09))
        rect(10,x,y,2,3,(83,200,143))
    rect(11,0,0,256,256,(224,182,57))
    lettering(11,'IT',23,16,(40,42,38))
    lettering(11,'SUPPORT',156,5,(40,42,38))
    lettering(11,'003',216,4,(40,42,38))
if character=='susan':
    rect(11,0,0,256,256,(224,182,57))
    lettering(11,'FACILITIES',55,4,(40,42,38))
    rect(11,25,125,206,4,(40,42,38))
    lettering(11,'004',167,7,(40,42,38))
pixels=bytearray()
for y in range(HEIGHT):
    pixels.append(0);pixels.extend(atlas[y*WIDTH*3:(y+1)*WIDTH*3])
def chunk(name,raw):return struct.pack('>I',len(raw))+name+raw+struct.pack('>I',zlib.crc32(name+raw)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',WIDTH,HEIGHT,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(pixels)))+chunk(b'IEND',b'')
def texture_uv(color,u,v):
    # Keep filtering within this tile, including its mip-map gutter.
    return ((color%4*TILE+8+240*u)/WIDTH,(color//4*TILE+8+240*v)/HEIGHT)
image_view=blob(png)
nodes=[{'name':display_name}];joints=[];origins=[];meshes=[]
def bone(name,origin,parent=0):
    absolute=origin if parent==0 else tuple(origin[i]+origins[joints.index(parent)][i] for i in range(3))
    node={'name':name,'translation':list(origin)}
    nodes.append(node);idx=len(nodes)-1;nodes[parent].setdefault('children',[]).append(idx)
    joints.append(idx);origins.append(absolute);return idx
root=bone('pelvis',(0,1.35,0))
def emit_piece(name,vertices,normals,uv,joint):
    count=len(vertices)//3
    attributes={'POSITION':acc(vertices,3,bounds=True),'NORMAL':acc(normals,3),'TEXCOORD_0':acc(uv,2),'JOINTS_0':acc([joints.index(joint),0,0,0]*count,4,'H'),'WEIGHTS_0':acc([1,0,0,0]*count,4)}
    meshes.append({'name':name,'primitives':[{'attributes':attributes,'material':0}]})
    nodes.append({'name':name,'mesh':len(meshes)-1,'skin':0});nodes[0]['children'].append(len(nodes)-1)

def piece(name,center,scale,color,joint=root,segments=24,rings=16,boxy=1):
    origin=origins[joints.index(joint)]
    center=tuple(center[i]+origin[i] for i in range(3))
    # Rounded cuboids for gear; ellipsoids for flesh. Both use authored normals.
    if color in (0,1):segments=max(segments,24);rings=max(rings,16)
    def signed(value,power):return math.copysign(abs(value)**power,value)
    points=[];smooth=[]
    for r in range(rings+1):
        phi=math.pi*r/rings
        for side in range(segments):
            theta=2*math.pi*side/segments
            q=(signed(math.sin(phi)*math.cos(theta),boxy),
               signed(math.cos(phi),boxy),
               signed(math.sin(phi)*math.sin(theta),boxy))
            points.append(tuple(center[i]+scale[i]*q[i] for i in range(3)))
            n=[signed(q[i],2/boxy-1)/scale[i] for i in range(3)]
            length=math.sqrt(sum(value*value for value in n))
            smooth.append(tuple(value/length for value in n))
    vertices=[];normals=[];uv=[]
    for r in range(rings):
        for side in range(segments):
            a=r*segments+side;b=r*segments+(side+1)%segments
            c=a+segments;d=b+segments
            for ids in [(a,b,c),(b,d,c)]:
                p,q,t=[points[i] for i in ids]
                u=[q[i]-p[i] for i in range(3)];v=[t[i]-p[i] for i in range(3)]
                n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                if sum(value*value for value in n)<1e-18:continue
                if sum(n[i]*smooth[ids[0]][i] for i in range(3))<0:ids=(ids[0],ids[2],ids[1])
                for index in ids:
                    vertices.extend(points[index]);normals.extend(smooth[index])
                    # Longitude is unwrapped per face to avoid a stretched seam.
                    longitude=side+int(index%segments!=side)
                    u=longitude/segments;v=(index//segments)/rings
                    if color in (0,1):
                        # Keep skin marks similar in size on tiny arms and large thighs.
                        u=.5+(u-.5)*min(1,max(scale[0],scale[2])/.55)
                        v=.5+(v-.5)*min(1,scale[1]/.65)
                    uv.extend(texture_uv(color,u,v))
    emit_piece(name,vertices,normals,uv,joint)


def face_piece(name,center,scale,color,joint,boxy=None,taper=.82):
    """Bevelled, tapered head volume with broad authored planes, not ellipsoids.

    The eight-sided section keeps cheek corners and a flat jaw readable while
    the shorter bevel sections soften the silhouette. Preserve the shared rig.
    """
    origin=origins[joints.index(joint)]
    section=[(-.72,1),(.72,1),(1,.55),(1,-.55),(.72,-1),(-.72,-1),(-1,-.55),(-1,.55)]
    points=[]
    for z,width,height,lift in [(-1,.68,.70,0),(-.60,1,1,0),(.60,taper,.86,-.04),(1,taper*.80,.60,-.08)]:
        for x,y in section:
            points.append((origin[0]+center[0]+x*scale[0]*width,
                           origin[1]+center[1]+(y*height+lift)*scale[1],
                           origin[2]+center[2]+z*scale[2]))
    faces=[]
    for ring in range(3):
        for side in range(8):
            a=ring*8+side;b=ring*8+(side+1)%8
            faces.append((a,b,b+8,a+8))
    faces.extend([tuple(reversed(range(8))),tuple(range(24,32))])
    vertices=[];normals=[];uv=[]
    for face in faces:
        a,b,c=[points[i] for i in face[:3]]
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        midpoint=[sum(points[i][k] for i in face)/len(face)-origin[k]-center[k] for k in range(3)]
        if sum(normal[k]*midpoint[k] for k in range(3))<0:
            face=tuple(reversed(face));normal=[-n for n in normal]
        length=math.sqrt(sum(n*n for n in normal));normal=[n/length for n in normal]
        for i in range(1,len(face)-1):
            for index in (face[0],face[i],face[i+1]):
                point=points[index]
                vertices.extend(point);normals.extend(normal)
                # Consistent planar skin scale; do not stretch a whole tile over each bevel.
                x,y,z=[point[k]-origin[k]-center[k] for k in range(3)]
                uv.extend(texture_uv(color,.5+(z if abs(normal[0])>.5 else x)*.45,.5+y*.55))
    emit_piece(name,vertices,normals,uv,joint)


def limb_piece(name,center,scale,color,joint,segments=None,rings=None,boxy=None):
    """Tapered eight-sided muscle sections with knee/elbow breaks.

    Preserve joint origins, prop attachments and overall reach. Long vertical
    sections narrow at the wrist/ankle; hands and feet use flat bevelled wedges.
    """
    if scale[1]<max(scale[0],scale[2]):
        face_piece(name,center,scale,color,joint,taper=.78)
        return
    origin=origins[joints.index(joint)]
    upper='thigh' in name or 'shoulder' in name or 'upper' in name
    profile=([(-1,.56,.04),(-.48,.78,.10),(.12,1,0),(.65,.87,-.04),(1,.62,0)] if upper else
             [(-1,.60,.08),(-.60,.60,.12),(.30,.82,-.03),(.70,1,-.06),(1,.70,0)])
    section=[(-.70,-1),(.70,-1),(1,-.50),(1,.50),(.70,1),(-.70,1),(-1,.50),(-1,-.50)]
    points=[]
    for y,width,bend in profile:
        for x,z in section:
            points.append((origin[0]+center[0]+x*scale[0]*width,
                           origin[1]+center[1]+y*scale[1],
                           origin[2]+center[2]+(z*width+bend)*scale[2]))
    faces=[]
    for ring in range(len(profile)-1):
        for side in range(8):
            a=ring*8+side;b=ring*8+(side+1)%8
            faces.append((a,b,b+8,a+8))
    faces.extend([tuple(range(8)),tuple(range(32,40))])
    vertices=[];normals=[];uv=[]
    for face in faces:
        a,b,c=[points[i] for i in face[:3]]
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        outward=[sum(points[i][k] for i in face)/len(face)-origin[k]-center[k] for k in range(3)]
        if sum(normal[k]*outward[k] for k in range(3))<0:
            face=tuple(reversed(face));normal=[-n for n in normal]
        length=math.sqrt(sum(n*n for n in normal));normal=[n/length for n in normal]
        for i in range(1,len(face)-1):
            for index in (face[0],face[i],face[i+1]):
                point=points[index];vertices.extend(point);normals.extend(normal)
                x,y,z=[point[k]-origin[k]-center[k] for k in range(3)]
                uv.extend(texture_uv(color,.5+(z if abs(normal[0])>.5 else x)*.65,.5+y*.65))
    emit_piece(name,vertices,normals,uv,joint)

def patch(name,center,size,color,joint=root):
    origin=origins[joints.index(joint)]
    x,y,z=[center[i]+origin[i] for i in range(3)]
    w,h=size
    points=[(x-w/2,y+h/2,z),(x+w/2,y+h/2,z),(x-w/2,y-h/2,z),(x+w/2,y-h/2,z)]
    vertices=[];normals=[];uv=[]
    for i in (0,1,2,1,3,2):
        vertices.extend(points[i]);normals.extend((0,0,-1))
        uv.extend(texture_uv(color,1-i%2,i//2))
    emit_piece(name,vertices,normals,uv,joint)

def transform_parts(start,joint,rotate,offset=(0,0,0)):
    origin=origins[joints.index(joint)]
    for mesh in meshes[start:]:
        attrs=mesh['primitives'][0]['attributes']
        for semantic in ('POSITION','NORMAL'):
            a=accessors[attrs[semantic]];view=views[a['bufferView']]
            values=list(struct.unpack_from('<'+'f'*a['count']*3,data,view['byteOffset']))
            changed=[]
            for i in range(0,len(values),3):
                v=values[i:i+3]
                if semantic=='POSITION':v=[v[k]-origin[k] for k in range(3)]
                v=rotate(*v)
                if semantic=='POSITION':v=[v[k]+origin[k]+offset[k] for k in range(3)]
                changed.extend(v)
            struct.pack_into('<'+'f'*len(changed),data,view['byteOffset'],*changed)
            if semantic=='POSITION':
                a['min']=[min(changed[k::3]) for k in range(3)]
                a['max']=[max(changed[k::3]) for k in range(3)]

def swept_piece(name,controls,color,joint,segments=24,steps=4,reference=(1,0,0)):
    """One capped tube with a Catmull-Rom centerline and authored vertex normals.

    Control points are joint-local (x, y, z, radius). All vertices retain the
    original joint weight, so existing clips and runtime wind keep working.
    """
    def sub(a,b):return tuple(x-y for x,y in zip(a,b))
    def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
    def unit(v):
        length=math.sqrt(sum(x*x for x in v))
        return tuple(x/length for x in v)
    samples=[]
    for i in range(len(controls)-1):
        a,b,c,d=controls[max(0,i-1)],controls[i],controls[i+1],controls[min(len(controls)-1,i+2)]
        for step in range(steps):
            t=step/steps
            sample=[.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(4)]
            sample[3]=max(.003,sample[3])
            samples.append(sample)
    samples.append(controls[-1])
    origin=origins[joints.index(joint)]
    points=[];radials=[]
    for i,sample in enumerate(samples):
        tangent=unit(sub(samples[min(i+1,len(samples)-1)][:3],samples[max(0,i-1)][:3]))
        u=unit(cross(tangent,reference));v=cross(tangent,u)
        for side in range(segments):
            angle=2*math.pi*side/segments
            radial=tuple(math.cos(angle)*u[k]+math.sin(angle)*v[k] for k in range(3))
            points.append(tuple(origin[k]+sample[k]+sample[3]*radial[k] for k in range(3)))
            radials.append(radial)
    faces=[]
    for ring in range(len(samples)-1):
        for side in range(segments):
            a=ring*segments+side;b=ring*segments+(side+1)%segments
            c=a+segments;d=b+segments
            for face in [(a,b,c),(b,d,c)]:
                normal=cross(sub(points[face[1]],points[face[0]]),sub(points[face[2]],points[face[0]]))
                if sum(normal[k]*radials[face[0]][k] for k in range(3))<0:face=(face[0],face[2],face[1])
                faces.append(face)
    # Area-weighted smooth normals only for these new curved surfaces.
    smooth=[[0.,0.,0.] for _ in points]
    for face in faces:
        normal=cross(sub(points[face[1]],points[face[0]]),sub(points[face[2]],points[face[0]]))
        for index in face:
            for k in range(3):smooth[index][k]+=normal[k]
    smooth=[unit(n) for n in smooth]
    for ring,neighbor in [(0,1),(len(samples)-1,len(samples)-2)]:
        center=len(points)
        points.append(tuple(origin[k]+samples[ring][k] for k in range(3)))
        normal=unit(sub(samples[ring][:3],samples[neighbor][:3]))
        smooth.append(normal)
        for side in range(segments):
            a=ring*segments+side;b=ring*segments+(side+1)%segments
            face=(center,a,b)
            n=cross(sub(points[a],points[center]),sub(points[b],points[center]))
            if sum(n[k]*normal[k] for k in range(3))<0:face=(center,b,a)
            faces.append(face)
    vertices=[];normals=[];uv=[]
    for face in faces:
        seam=any(index%segments==0 for index in face) and any(index%segments==segments-1 for index in face)
        for index in face:
            vertices.extend(points[index]);normals.extend(smooth[index])
            uv.extend(texture_uv(color,(1 if seam and index%segments==0 else (index%segments)/segments),min(1,(index//segments)/(len(samples)-1))))
    count=len(vertices)//3
    attributes={'POSITION':acc(vertices,3,bounds=True),'NORMAL':acc(normals,3),'TEXCOORD_0':acc(uv,2),'JOINTS_0':acc([joints.index(joint),0,0,0]*count,4,'H'),'WEIGHTS_0':acc([1,0,0,0]*count,4)}
    meshes.append({'name':name,'primitives':[{'attributes':attributes,'material':0}]})
    nodes.append({'name':name,'mesh':len(meshes)-1,'skin':0});nodes[0]['children'].append(len(nodes)-1)

def back_plate(name,center,width,height,side,joint=root):
    # Broad keratin blades, with a shallow ridge rather than a paper-thin face.
    origin=origins[joints.index(joint)]
    outline=[(-.5,0),(-.60,.34),(-.17,1),(.19,.92),(.58,.30),(.45,0)]
    vertices=[];normals=[];uv=[]
    rings=[]
    for face_side in (-1,1):
        rings.append([(center[0]+side*h*height*.18+face_side*.025,
                       center[1]+h*height,center[2]+z*width) for z,h in outline])
    triangles=[]
    for face_side,ring in zip((-1,1),rings):
        ridge=(center[0]+side*height*.08+face_side*.09,center[1]+height*.44,center[2])
        for i in range(len(ring)):triangles.append((ridge,ring[i],ring[(i+1)%len(ring)]))
    for i in range(len(outline)):
        j=(i+1)%len(outline)
        triangles.extend([(rings[0][i],rings[1][i],rings[0][j]),(rings[1][i],rings[1][j],rings[0][j])])
    for triangle in triangles:
        a,b,c=triangle;u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        midpoint=[sum(p[k] for p in triangle)/3 for k in range(3)]
        outward=[midpoint[0]-center[0]-side*height*.08,midpoint[1]-center[1]-height*.44,midpoint[2]-center[2]]
        if sum(n[k]*outward[k] for k in range(3))<0:triangle=(a,c,b);n=[-x for x in n]
        length=math.sqrt(sum(x*x for x in n))
        for point in triangle:
            vertices.extend(point[k]+origin[k] for k in range(3));normals.extend(x/length for x in n)
            uv.extend(texture_uv(9,.5+(point[2]-center[2])/(width*1.3),.05+.9*(point[1]-center[1])/height))
    emit_piece(name,vertices,normals,uv,joint)

if character=='greg':
    piece('ribcage',(0,.25,0),(.55,.82,.57),0)
    piece('lower belly',(0,-.18,.14),(.47,.46,.43),1)
    piece('throat',(0,.8,.31),(.35,.63,.38),1)
    head=bone('head',(0,1.15,.35),root)
    face_piece('skull',(0,.12,.12),(.46,.41,.57),0,head,boxy=.9)
    face_piece('long angular muzzle',(0,-.02,.56),(.40,.25,.55),0,head,boxy=.8)
    face_piece('lower jaw',(0,-.22,.53),(.355,.105,.5),1,head,boxy=.8)
    face_piece('mouth seam',(0,-.205,.60),(.35,.012,.40),5,head)
    for side in [-1,1]:
        piece('small recessed eye',(side*.431,.19,.35),(.025,.043,.06),5,head,16,10)
        piece('heavy brow',(side*.438,.25,.33),(.028,.027,.115),0,head)
        piece('nostril',(side*.22,.104,1.025),(.024,.018,.024),5,head,12,8)
        leg=bone('leg '+str(side),(side*.43,-.23,-.07),root)
        limb_piece('thigh',(0,-.16,0),(.32,.50,.35),0,leg)
        limb_piece('shin',(0,-.64,.04),(.175,.38,.19),0,leg)
        limb_piece('foot',(0,-1.01,.23),(.23,.145,.38),0,leg,boxy=.85)
        for toe in [-1,0,1]:
            swept_piece('tapered toe claw',[(toe*.12,-1.015,.51,.048),(toe*.12,-1.025,.63,.036),(toe*.12,-1.065,.75,.003)],5,leg,segments=10,steps=3)
        arm=bone('arm '+str(side),(side*.44,.56,.3),root)
        limb_piece('upper arm',(side*.06,-.12,.06),(.125,.22,.13),0,arm)
        limb_piece('forearm',(side*.07,-.25,.19),(.08,.09,.19),0,arm)
        for finger in [-1,1]:
            limb_piece('two fingers',(side*.07+finger*.042,-.25,.37),(.035,.037,.095),0,arm)
            swept_piece('finger claw',[(side*.07+finger*.042,-.25,.43,.024),(side*.07+finger*.045,-.26,.49,.018),(side*.07+finger*.048,-.29,.54,.003)],5,arm,segments=8,steps=3)
        piece('shoulder webbing',(side*.29,.49,.04),(.065,.72,.605),2,root,32,24,boxy=.65)
        piece('metal adjuster',(side*.29,.54,.565),(.082,.10,.035),3,root,16,12,boxy=.3)
        piece('adjuster inset',(side*.29,.54,.600),(.052,.066,.01),2,root,12,8,boxy=.3)
    tail=bone('tail',(0,-.05,-.43),root)
    swept_piece('continuous tapered tail',[
        (0,0,.13,.34),(0,-.025,-.28,.31),(.015,-.11,-.70,.245),
        (.04,-.14,-1.10,.175),(.075,-.07,-1.46,.105),
        (.10,-.01,-1.78,.046),(.105,.05,-1.98,.004),
    ],0,tail)
elif character=='linda':
    piece('stocky ribcage',(0,.02,-.14),(.63,.52,1.00),0)
    piece('pale lower belly',(0,-.23,-.08),(.48,.30,.81),1)
    piece('thick throat',(0,.12,.63),(.43,.39,.44),1)
    head=bone('head',(0,.25,.87),root)
    # A broad, upright shield is Linda's identifying silhouette in the race camera.
    piece('frill shield',(0,.22,-.13),(.78,.73,.14),0,head,32,24)
    piece('frill inset',(0,.25,-.012),(.68,.61,.045),9,head,32,20)
    for index in range(11):
        angle=math.pi*index/10
        piece('scalloped frill rim',(.735*math.cos(angle),.22+.69*math.sin(angle),-.10),(.095,.10,.085),0,head)
    face_piece('broad skull',(0,.025,.25),(.49,.40,.49),0,head,boxy=.9)
    face_piece('cheeks',(0,-.16,.47),(.43,.25,.39),0,head)
    face_piece('lower jaw',(0,-.30,.60),(.32,.095,.31),1,head,boxy=.8)
    face_piece('parrot beak',(0,-.16,.82),(.22,.17,.23),6,head,taper=.50)
    face_piece('mouth seam',(0,-.245,.70),(.29,.012,.24),5,head)
    # Three visibly separate horns, curved forward with the same smooth normals as skin.
    for side in [-1,1]:
        swept_piece('brow horn',[(side*.29,.27,.44,.105),(side*.32,.44,.56,.085),(side*.37,.64,.74,.050),(side*.42,.80,.91,.003)],6,head,segments=16)
        piece('heavy eyelid',(side*.443,.105,.42),(.052,.063,.12),0,head)
        piece('patient eye',(side*.474,.069,.445),(.023,.034,.054),5,head,16,10)
        piece('nostril',(side*.185,-.045,.94),(.022,.018,.02),5,head,12,8)
    swept_piece('nose horn',[(0,.015,.82,.09),(0,.13,.91,.068),(0,.30,1.04,.003)],6,head,segments=16)
    for side in [-1,1]:
        leg=bone('leg '+str(side),(side*.46,-.12,-.76),root)
        limb_piece('hind thigh',(0,-.27,0),(.28,.40,.32),0,leg)
        limb_piece('hind shin',(0,-.77,.035),(.205,.35,.215),0,leg)
        limb_piece('hind foot',(0,-1.09,.14),(.255,.145,.30),0,leg,boxy=.8)
        arm=bone('arm '+str(side),(side*.48,-.10,.61),root)
        limb_piece('front shoulder',(0,-.22,0),(.28,.37,.30),0,arm)
        limb_piece('front shin',(0,-.76,.025),(.20,.38,.21),0,arm)
        limb_piece('front foot',(0,-1.11,.14),(.25,.145,.30),0,arm,boxy=.8)
        for limb,y in [(leg,-1.10),(arm,-1.12)]:
            for toe in [-1,0,1]:limb_piece('ivory toenail',(toe*.14,y,.405),(.062,.06,.08),6,limb,16,10,boxy=.7)
    # The board is strapped to the outside of the right foreleg, so it follows
    # the hoof lift instead of floating or requiring a fifth limb.
    clipboard=bone('clipboard',(.30,-.65,.10),arm)
    start=len(meshes)
    piece('clipboard backing',(0,0,0),(.25,.33,.035),2,clipboard,20,16,boxy=.3)
    patch('HR attendance checklist',(0,0,-.038),(.44,.58),10,clipboard)
    piece('clipboard clip',(0,.30,-.055),(.105,.05,.025),3,clipboard,16,10,boxy=.3)
    # Paper faces diagonally outward and forward for the selection camera.
    transform_parts(start,clipboard,lambda x,y,z:((-x-z)/math.sqrt(2),y,(x-z)/math.sqrt(2)))
    tail=bone('tail',(0,.09,-1.00),root)
    swept_piece('short tapered tail',[(0,0,.10,.34),(0,-.025,-.25,.30),(.035,-.11,-.57,.215),(.07,-.15,-.89,.125),(.10,-.13,-1.18,.053),(.105,-.08,-1.39,.004)],0,tail)

elif character=='steve':
    piece('arched torso',(0,.05,-.20),(.65,.59,1.04),0)
    piece('pale underside',(0,-.22,-.12),(.49,.32,.83),1)
    piece('sloping neck',(0,-.15,.73),(.31,.30,.52),0)
    head=bone('head',(0,-.20,1.10),root)
    face_piece('small low skull',(0,.025,.12),(.30,.27,.38),0,head,boxy=.9)
    face_piece('long muzzle',(0,-.055,.42),(.235,.18,.31),0,head,boxy=.85)
    face_piece('beak',(0,-.06,.65),(.175,.10,.15),6,head,taper=.62)
    face_piece('lower jaw',(0,-.19,.38),(.20,.065,.28),1,head)
    face_piece('mouth seam',(0,-.145,.48),(.19,.01,.21),5,head)
    for side in (-1,1):
        piece('distracted eye',(side*.281,.08,.21),(.022,.043,.06),5,head,16,10)
        piece('heavy eyelid',(side*.270,.135,.20),(.038,.032,.10),0,head)
        piece('nostril',(side*.12,.025,.68),(.018,.017,.014),5,head,12,8)
        leg=bone('leg '+str(side),(side*.46,.03,-.82),root)
        limb_piece('powerful hind thigh',(0,-.27,0),(.31,.44,.34),0,leg)
        limb_piece('long hind shin',(0,-.85,.02),(.20,.39,.22),0,leg)
        limb_piece('hind foot',(0,-1.23,.15),(.25,.145,.30),0,leg,boxy=.8)
        arm=bone('arm '+str(side),(side*.43,-.27,.61),root)
        limb_piece('front shoulder',(0,-.19,0),(.24,.30,.27),0,arm)
        limb_piece('short front shin',(0,-.61,.02),(.18,.29,.20),0,arm)
        limb_piece('front foot',(0,-.93,.13),(.225,.145,.28),0,arm,boxy=.8)
        for limb,y,z in [(leg,-1.24,.42),(arm,-.94,.39)]:
            for toe in (-1,0,1):limb_piece('blunt toenail',(toe*.13,y,z),(.06,.06,.085),6,limb,16,10,boxy=.7)
    for side in (-1,1):
        for index,(z,y,height,width) in enumerate([(.65,.35,.35,.34),(.24,.52,.65,.44),(-.22,.58,.83,.52),(-.70,.48,.72,.48),(-1.12,.23,.43,.36)]):
            back_plate('back plate '+str(side)+' '+str(index),(side*.20,y,z+side*.08),width,height,side)
    diagnostic=bone('diagnostic',(.25,-.53,.11),arm)
    start=len(meshes)
    piece('diagnostic handset',(0,0,0),(.16,.23,.043),2,diagnostic,20,16,boxy=.3)
    patch('diagnostic display',(0,.035,-.045),(.27,.30),10,diagnostic)
    piece('reboot button',(0,-.17,-.052),(.035,.024,.012),4,diagnostic,12,8)
    piece('antenna',(.10,.30,0),(.015,.10,.016),2,diagnostic,12,8)
    transform_parts(start,diagnostic,lambda x,y,z:((-x-z)/math.sqrt(2),y,(x-z)/math.sqrt(2)))
    tail=bone('tail',(0,.09,-1.06),root)
    swept_piece('long spiked tail',[(0,0,.12,.31),(0,-.025,-.32,.26),(.02,-.08,-.76,.18),(.04,-.08,-1.18,.105),(.06,-.01,-1.58,.047),(.08,.06,-1.88,.004)],0,tail)
    for side in (-1,1):
        for index,z in enumerate((-1.03,-1.43)):
            swept_piece('tail spike '+str(side)+' '+str(index),[(side*.08,-.04,z,.073),(side*.30,.065,z-.13,.052),(side*.60,.19,z-.30,.003)],6,tail,segments=16,steps=4,reference=(0,1,0))


else:
    piece('upright pear shaped torso',(0,.12,-.08),(.52,.70,.55),0)
    piece('pale belly',(0,.04,.32),(.40,.59,.20),1)
    swept_piece('long upright neck',[(0,.40,.12,.32),(0,.82,.25,.27),(0,1.15,.30,.22)],0,root)
    head=bone('head',(0,1.12,.30),root)
    face_piece('slender skull',(0,.12,.17),(.29,.30,.40),0,head)
    face_piece('duck bill',(0,-.025,.60),(.28,.09,.27),9,head,taper=1.04)
    face_piece('pale lower jaw',(0,-.12,.43),(.25,.07,.30),1,head)
    face_piece('mouth seam',(0,-.095,.60),(.25,.01,.24),5,head,taper=1.02)
    swept_piece('swept back hollow crest',[(0,.30,.10,.17),(0,.55,-.12,.16),(0,.70,-.40,.13),(0,.70,-.70,.09),(0,.60,-.95,.035)],9,head)
    for side in (-1,1):
        piece('watchful eye',(side*.28,.18,.30),(.022,.038,.055),5,head,16,10)
        piece('decisive brow',(side*.27,.24,.30),(.04,.03,.10),0,head)
        piece('nostril',(side*.20,.035,.70),(.018,.015,.022),5,head,12,8)
        leg=bone('leg '+str(side),(side*.38,-.20,-.14),root)
        limb_piece('strong thigh',(0,-.20,0),(.27,.40,.30),0,leg)
        limb_piece('shin',(0,-.70,.08),(.15,.30,.17),0,leg)
        limb_piece('planted foot',(0,-1.01,.22),(.22,.14,.30),0,leg,boxy=.8)
        for toe in (-1,0,1):limb_piece('blunt hoof',(toe*.12,-1.02,.48),(.055,.055,.075),6,leg,16,10)
        arm=bone('arm '+str(side),(side*.40,.55,.14),root)
        limb_piece('upper forearm',(side*.05,-.20,.04),(.12,.27,.13),0,arm)
        limb_piece('lower forearm',(side*.04,-.40,.18),(.095,.12,.22),0,arm)
        limb_piece('capable hand',(side*.04,-.40,.36),(.12,.09,.12),0,arm)
        piece('shoulder strap',(side*.27,.40,.02),(.06,.60,.57),2,root,32,24,boxy=.65)
    tail=bone('tail',(0,-.12,-.44),root)
    swept_piece('balanced tapered tail',[(0,0,.10,.30),(0,-.08,-.40,.25),(0,-.10,-.85,.17),(0,-.04,-1.30,.08),(0,.06,-1.70,.004)],0,tail)
    carabiner=bone('carabiner',(.42,.05,.40),root)
    swept_piece('service carabiner',[(0,.10,0,.025),(.08,.07,0,.025),(.08,-.09,0,.025),(0,-.13,0,.025),(-.04,-.02,0,.025),(0,.10,0,.025)],3,carabiner,segments=8,reference=(0,0,1))
    piece('tool pouch',(-.54,-.10,.08),(.14,.23,.20),2,root,20,16,boxy=.35)
    piece('pouch flap',(-.60,.05,.10),(.09,.055,.20),9,root,16,12,boxy=.4)
    piece('tool handle',(-.56,.20,.06),(.04,.18,.04),3,root,12,8)
    patch('Facilities badge',(0,.42,.50),(.38,.22),11)

equipment_start=len(meshes)
piece('waist webbing',(0,-.1,0),(.56,.085,.595),2,root,32,16,boxy=.7)
piece('waist buckle',(0,-.1,.58),(.12,.095,.04),3,root,16,12,boxy=.3)
piece('buckle inset',(0,-.1,.621),(.081,.057,.012),2,root,12,8,boxy=.3)
piece('parachute pack',(0,.49,-.53),(.38,.46,.22),2,root,32,24,boxy=.35)
piece('pack flap',(0,.80,-.744),(.345,.115,.025),2,root,24,12,boxy=.3)
if character!='steve':patch('inspection warning',(-.22,.66,-.779),(.16,.17),8)
# Deliberately beyond the tiny arms, visible from behind.
piece('ripcord mounting',(0,.86,-.78),(.11,.10,.045),3,root,8,4)
piece('yellow ripcord top',(0,.97,-.83),(.13,.035,.035),4,root,8,4)
for side in [-1,1]:piece('yellow ripcord sides',(side*.10,.88,-.83),(.03,.10,.035),4,root,8,4)
piece('yellow ripcord bottom',(0,.80,-.83),(.12,.03,.035),4,root,8,4)
# Exposed cable has a readable service loop and terminates at the pack guide.
swept_piece('ripcord cable',[
    (0,.80,-.84,.024),(.07,.73,-.90,.024),(.24,.72,-.91,.024),
    (.38,.79,-.88,.024),(.40,.90,-.81,.024),(.29,.90,-.74,.024),
],3,root,segments=8,reference=(0,0,1))
piece('ripcord cable guide',(.29,.90,-.74),(.055,.055,.065),2,root,8,5)

if character!='steve':patch('personnel number',(0,.35,-.755),(.40,.26),7)
if character=='linda':
    # Rotate the complete pack onto the quadruped's back, labels facing up.
    transform_parts(equipment_start,root,lambda x,y,z:(x,-z,y),(0,0,-.46))
    for z in (-.48,.44):
        piece('quadruped belly strap',(0,.015,z),(.655,.535,.065),2,root,32,24,boxy=.75)
    start=len(meshes)
    patch('Human resources badge',(0,0,0),(.33,.28),11)
    transform_parts(start,root,lambda x,y,z:(-z,y,x),(.66,.11,-.24))

if character=='steve':
    # Side-mounted pack and counterweight pouch leave the dorsal plates clear.
    transform_parts(equipment_start,root,lambda x,y,z:(-z,y,x),(.22,-.18,-.26))
    for z in (-.52,.34):piece('belly webbing',(0,.04,z),(.675,.605,.065),2,root,32,24,boxy=.75)
    piece('counterweight tool pouch',(-.70,.17,-.24),(.12,.24,.30),2,root,20,16,boxy=.35)
    start=len(meshes)
    patch('IT support badge',(0,0,0),(.44,.38),11)
    transform_parts(start,root,lambda x,y,z:(-z,y,x),(.986,.15,-.26))

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
if character in ('greg','susan'):
    anim('Stand',[(root,[quat(),quat()],[0,1])])
    greg_falling=[]
    for joint in joints:
        name=nodes[joint]['name']
        if name.startswith('arm ') or name.startswith('leg '):
            side=int(name.split()[-1])
            rotation=quat(-.15 if name.startswith('arm ') else .12,z=side*(.90 if name.startswith('arm ') else .62))
            greg_falling.append((joint,[rotation,rotation],[0,1]))
    anim('Dive',[(root,[quat(math.pi/2),quat(math.pi/2)],[0,1])]+greg_falling)
    anim('Brake',[(root,[quat(.85),quat(.85)],[0,1])]+greg_falling)
    anim('Bank left',[(root,[quat(math.pi/2,z=.3),quat(math.pi/2,z=.3)],[0,1]),(tail,[quat(z=-.3),quat(z=-.3)],[0,1])]+greg_falling)
    anim('Bank right',[(root,[quat(math.pi/2,z=-.3),quat(math.pi/2,z=-.3)],[0,1]),(tail,[quat(z=.3),quat(z=.3)],[0,1])]+greg_falling)
    if character=='greg':
        anim('Reach',[(arms[1],[quat(),quat(),quat(2.2),quat(2.3),quat(2.3),quat()],[0,.7,1.8,2.3,3.3,4.4]),(head,[quat(),quat(y=.3),quat(y=.3),quat()],[0,1,3.4,4.4])])
    else:
        equipment_tracks=[
            (arms[1],[quat(),quat(-.3,z=-.5),quat(-.45,z=-.6),quat(-.2,z=-.3),quat(),quat()],[0,.45,.75,1.15,1.7,3.8]),
            (arms[0],[quat(),quat(-.25,z=.5),quat(-.4,z=.65),quat(),quat()],[0,.35,.7,1.25,3.8]),
            (carabiner,[quat(),quat(z=.25),quat(),quat()],[0,1.15,1.6,3.8]),
            (head,[quat(),quat(.18,y=.2),quat(.12,y=.2),quat(),quat(y=-.4),quat(),quat()],[0,.4,1.4,1.9,2.6,3.2,3.8]),
            ([i for i in joints if nodes[i]['name']=='leg 1'][0],[quat(),quat(-.12),quat(),quat()],[0,1.65,1.9,3.8]),
        ]
        anim('Equipment check',equipment_tracks)
        anim('Reach',equipment_tracks)
    anim('Impact',[(root,[quat(math.pi/2),quat(.8),quat(2),quat(math.pi/2)],[0,.2,.55,1.2])])
else:
    # Linda already stands horizontally. Pitching her like upright Greg would
    # point her nose at the ground; her freefall pose is a small forward lean.
    anim('Stand',[(root,[quat(),quat()],[0,1])])
    falling_limbs=[]
    for joint in joints:
        name=nodes[joint]['name']
        if name.startswith('arm ') or name.startswith('leg '):
            side=int(name.split()[-1])
            rotation=quat(-.35 if name.startswith('arm ') else .30,z=side*.65)
            falling_limbs.append((joint,[rotation,rotation],[0,1]))
    anim('Dive',[(root,[quat(.10),quat(.10)],[0,1])]+falling_limbs)
    anim('Brake',[(root,[quat(-.12),quat(-.12)],[0,1])]+falling_limbs)
    anim('Bank left',[(root,[quat(.10,z=.22),quat(.10,z=.22)],[0,1])]+falling_limbs)
    anim('Bank right',[(root,[quat(.10,z=-.22),quat(.10,z=-.22)],[0,1])]+falling_limbs)
    if character=='linda':
        checklist_tracks=[
            (arms[1],[quat(),quat(),quat(-1.10),quat(-1.10),quat(-1.10),quat(-1.10),quat(),quat()],[0,.6,1.5,2.2,3.0,3.6,4.4,5.2]),
            (head,[quat(),quat(),quat(.20,y=.30),quat(.30,y=.30),quat(.17,y=.30),quat(y=-.15),quat(),quat()],[0,.6,1.5,2.2,2.7,3.6,4.4,5.2]),
            (clipboard,[quat(),quat(),quat(z=-.12),quat(z=-.12),quat(),quat()],[0,.6,1.5,3.6,4.4,5.2]),
        ]
        anim('Checklist',checklist_tracks)
        anim('Reach',checklist_tracks)
    else:
        # Two quick pokes, a long troubleshooting pause, then a pleased head lift.
        diagnostic_tracks=[
            (arms[1],[quat(),quat(),quat(-.95),quat(-.95),quat(-.95),quat(),quat()],[0,.5,1.25,3.8,4.3,5.0,5.6]),
            (arms[0],[quat(),quat(),quat(-.65,z=1.0),quat(-.75,z=1.2),quat(-.65,z=1.0),quat(-.75,z=1.2),quat(),quat()],[0,1.1,1.5,1.7,1.95,2.15,2.65,5.6]),
            (head,[quat(),quat(.16,y=.24),quat(.29,y=.24),quat(.13,y=.24),quat(.27,y=.24),quat(.16,y=.24),quat(-.12,y=-.16),quat(),quat()],[0,1.1,1.7,1.95,2.15,2.7,3.9,5.0,5.6]),
            (diagnostic,[quat(),quat(),quat(z=.10),quat(z=-.09),quat(),quat(z=-.09),quat(),quat()],[0,1.4,1.55,1.7,1.95,2.15,2.4,5.6]),
        ]
        anim('Diagnostics',diagnostic_tracks)
        anim('Reach',diagnostic_tracks)
    anim('Impact',[(root,[quat(.10),quat(.25),quat(-.08),quat(.10)],[0,.2,.55,1.2])])

# Merge the authored parts into one skinned draw call, retaining all bone weights.
merged={}
for semantic,n,kind in [('POSITION',3,'f'),('NORMAL',3,'f'),('TEXCOORD_0',2,'f'),('JOINTS_0',4,'H'),('WEIGHTS_0',4,'f')]:
    values=[]
    for mesh in meshes:
        a=accessors[mesh['primitives'][0]['attributes'][semantic]]
        view=views[a['bufferView']]
        values.extend(struct.unpack_from('<'+kind*(a['count']*n),data,view['byteOffset']))
    merged[semantic]=acc(values,n,kind,bounds=semantic=='POSITION')
# Share identical vertices instead of shipping three copies for every triangle.
layout=[('POSITION',3,'f'),('NORMAL',3,'f'),('TEXCOORD_0',2,'f'),('JOINTS_0',4,'H'),('WEIGHTS_0',4,'f')]
columns={}
for semantic,n,kind in layout:
    a=accessors[merged[semantic]];view=views[a['bufferView']]
    columns[semantic]=struct.unpack_from('<'+kind*a['count']*n,data,view['byteOffset'])
unique={};indices=[];compact={semantic:[] for semantic,_,_ in layout}
for row in range(accessors[merged['POSITION']]['count']):
    key=tuple(value for semantic,n,_ in layout for value in columns[semantic][row*n:(row+1)*n])
    if key not in unique:
        unique[key]=len(unique)
        for semantic,n,_ in layout:compact[semantic].extend(columns[semantic][row*n:(row+1)*n])
    indices.append(unique[key])
assert len(unique)<65536,'Greg exceeds the 16-bit vertex budget'
for semantic,n,kind in layout:merged[semantic]=acc(compact[semantic],n,kind,bounds=semantic=='POSITION')
mesh_indices=acc(indices,1,'H')

for node in nodes:
    if 'mesh' in node:node.pop('mesh');node.pop('skin')
nodes[0]['children']=[root,len(nodes)]
nodes.append({'name':display_name+' mesh','mesh':0,'skin':0})
meshes=[{'name':display_name,'primitives':[{'attributes':merged,'indices':mesh_indices,'material':0}]}]

# Keep only buffers referenced by the final mesh, skin and animation clips.
# The builder's temporary per-part attributes are intentionally not shipped.
used=set(merged.values())|{skin['inverseBindMatrices'],mesh_indices}
for animation in animations:
    for sampler in animation['samplers']:used.update((sampler['input'],sampler['output']))
old_data,old_views,old_accessors=data,views,accessors
data=bytearray();views=[];accessors=[]
image_view=blob(png)
remap={}
for index in sorted(used):
    a=dict(old_accessors[index]);view=old_views[a['bufferView']]
    a['bufferView']=blob(old_data[view['byteOffset']:view['byteOffset']+view['byteLength']],view.get('target'))
    remap[index]=len(accessors);accessors.append(a)
for semantic,index in merged.items():merged[semantic]=remap[index]
skin['inverseBindMatrices']=remap[skin['inverseBindMatrices']]
meshes[0]['primitives'][0]['indices']=remap[mesh_indices]
for animation in animations:
    for sampler in animation['samplers']:
        sampler['input']=remap[sampler['input']];sampler['output']=remap[sampler['output']]

gltf={'asset':{'version':'2.0','generator':'Mandatory Safety Exercise / Greg asset builder'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'skins':[skin],'meshes':meshes,'animations':animations,'materials':[{'name':'Greg painted skin and woven equipment atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1},'doubleSided':True}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987}],'images':[{'bufferView':image_view,'mimeType':'image/png'}],'buffers':[{'byteLength':len(data)}],'bufferViews':views,'accessors':accessors}
raw=json.dumps(gltf,separators=(',',':')).encode()
while len(raw)%4:raw+=b' '
while len(data)%4:data.append(0)
glb=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data
(out/(character+'.glb')).write_bytes(glb)
print(display_name+':',len(indices)//3,'triangles;',len(glb),'bytes;',len(joints),'bones')
