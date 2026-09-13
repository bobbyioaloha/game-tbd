import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Float32BufferAttribute, PlaneGeometry, type Group } from 'three';
import type { PlayerSnapshot } from './player-controller';
import { sceneryNoise } from './scenery-materials';
import { FINISH_DEPTH } from './practice-race';

function land(x:number,z:number){
  const broad=sceneryNoise(x/1900+8,z/1900+19);
  const ridge=Math.pow(1-Math.abs(sceneryNoise(x/850,z/850)*2-1),3);
  const river=Math.abs(x-1800*Math.sin(z/2400)-700*Math.sin(z/730));
  const channel=1-Math.min(1,river/460);
  const coast=sceneryNoise(x/3800+40,z/3800)-.14;
  const height=Math.max(-24,(broad*.55+ridge*.45)*560-65-channel*260);
  // Low central basin leaves the actual landing mat unobstructed.
  const basin=Math.min(1,Math.max(0,Math.hypot(x,z)-180)/1400);
  return {height:Math.hypot(x,z)<180?-.2:coast<0?-28:height*basin,river,coast,broad};
}
export function PrehistoricEarth({snapshot}:{snapshot:()=>PlayerSnapshot}){
  const root=useRef<Group>(null);
  const geometry=useMemo(()=>{
    const mesh=new PlaneGeometry(24000,24000,180,180);mesh.rotateX(-Math.PI/2);
    const position=mesh.getAttribute('position'),colors:number[]=[];
    const forest=new Color('#4c933e'),upland=new Color('#b8965c'),water=new Color('#29a8b6'),wetland=new Color('#8bbd4b'),haze=new Color('#a2c9ec');
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),z=position.getZ(i),sample=land(x,z);
      position.setY(i,sample.height);
      const color=forest.clone().lerp(upland,Math.max(0,(sample.height-40)/400));
      if(sample.river<360)color.lerp(wetland,1-sample.river/360);
      if(Math.hypot(x,z)>180&&(sample.height<0||sample.coast<0))color.copy(water);
      const slope=(land(x-70,z-90).height-sample.height)/160;
      color.multiplyScalar(Math.max(.66,Math.min(1.15,.9+slope*.3))*(.86+sceneryNoise(x/85,z/85)*.25));
      color.lerp(haze,.05+Math.min(.22,Math.hypot(x,z)/35000));
      colors.push(color.r,color.g,color.b);
    }
    mesh.setAttribute('color',new Float32BufferAttribute(colors,3));mesh.computeVertexNormals();return mesh;
  },[]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  useFrame(()=>{if(root.current)root.current.position.y=-FINISH_DEPTH-snapshot().position[1];});
  return <group ref={root}>
    <mesh geometry={geometry}><meshBasicMaterial vertexColors fog={false}/></mesh>
  </group>;
}
