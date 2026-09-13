import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Shape, ShaderMaterial, type Group, type Mesh } from 'three';
import type { PlayerSnapshot } from './player-controller';

// An authored placeholder, independent of generated collectible visuals.
export function StarfishDiver({color = '#ff9875',motion}: {color?: string;motion?:()=>{time:number;speed:number}}) {
  const body=useRef<Mesh>(null),original=useRef<Float32Array|null>(null),lastTime=useRef(-1);
  useFrame(()=>{
    if(!body.current||!motion)return;
    const {time,speed}=motion();
    if(time===lastTime.current)return;
    lastTime.current=time;
    const attribute=body.current.geometry.getAttribute('position');
    if(!original.current)original.current=Float32Array.from(attribute.array);
    const base=original.current,amount=Math.min(1,speed/60);
    for(let i=0;i<attribute.count;i++){
      const x=base[i*3],y=base[i*3+1],z=base[i*3+2],radius=Math.hypot(x,y);
      const arm=Math.max(0,(radius-0.5)/1.2);
      const wave=Math.sin(time*(4+amount*10)+Math.atan2(y,x)*5);
      attribute.setXYZ(i,x-y*wave*arm*amount*0.04,y+x*wave*arm*amount*0.04,z+wave*arm*amount*0.25);
    }
    attribute.needsUpdate=true;body.current.geometry.computeVertexNormals();
  });
  const shape = useMemo(() => {
    const star = new Shape();
    for (let i = 0; i < 10; i++) {
      const angle = Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 1.55 : 0.65;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
    }
    star.closePath();
    return star;
  }, []);
  return <group>
    <mesh ref={body} rotation={[-Math.PI/2,0,0]}>
      <extrudeGeometry args={[shape, {depth: 0.25, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2, steps: 1}]}/>
      <meshStandardMaterial color={color} roughness={0.7}/>
    </mesh>
    {[-0.23,0.23].map(x => <mesh key={x} position={[x,0.4,-0.35]}>
      <sphereGeometry args={[0.09,12,8]}/><meshStandardMaterial color="#233148"/>
    </mesh>)}
  </group>;
}


const clouds=Array.from({length:32},(_,i)=>({
  x:Math.sin(i*2.4)*(65+i%5*24),z:Math.cos(i*2.4)*(65+i%5*24),
  depth:i*47%600,scale:38+i%6*9,
}));
const wrap=(value:number,span:number)=>((value%span)+span)%span;
const cloudVertex=`varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const cloudFragment=`
varying vec2 vUv;
uniform float opacity;
uniform float seed;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.07+13.1;a*=.5;}return n;}
void main(){
vec2 p=vUv*5.0+seed;
float n=fbm(p);
float edge=1.0-smoothstep(.22,.51,length((vUv-.5)*vec2(1.,1.15)));
float density=smoothstep(.28,.70,n)*edge;
float light=clamp(.70+fbm(p+vec2(-.25,.4))*.30,0.,1.);
vec3 color=mix(vec3(.54,.60,.66),vec3(.96,.96,.91),light);
gl_FragColor=vec4(color,density*opacity);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}
`;

// Distance-driven layers freeze with the race. Transparent feathered density
// replaces the old opaque clusters of spheres; there is no extra simulation.
export function CloudField({snapshot}:{snapshot:()=>PlayerSnapshot}){
  const field=useRef<Group>(null);
  const materials=useMemo(()=>clouds.map((_,i)=>new ShaderMaterial({
    vertexShader:cloudVertex,fragmentShader:cloudFragment,
    uniforms:{opacity:{value:.65},seed:{value:i*7.13}},transparent:true,depthWrite:false,side:2,
  })),[]);
  useEffect(()=>()=>materials.forEach(material=>material.dispose()),[materials]);
  useFrame(()=>{
    const y=snapshot().position[1];
    field.current?.children.forEach((cloud,i)=>{
      const relative=wrap(-y-clouds[i].depth,600)-560;
      cloud.position.set(clouds[i].x,relative,clouds[i].z);
      materials[i].uniforms.opacity.value=.76*Math.min(1,Math.max(0,(-relative-8)/65))*Math.min(1,(relative+560)/70);
    });
  });
  return <group ref={field}>{clouds.map((cloud,i)=><group key={i}>
    {[0,1].map(layer=><mesh key={layer} position={[layer*9,layer*7,layer*-8]} rotation={[-Math.PI/2,0,i*1.7]} scale={[cloud.scale,cloud.scale*.8,1]} material={materials[i]}>
      <planeGeometry args={[1,1]}/>
    </mesh>)}
  </group>)}</group>;
}
