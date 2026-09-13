import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Float32BufferAttribute, PlaneGeometry, type Group } from 'three';
import type { PlayerSnapshot } from './player-controller';
import { sceneryNoise } from './scenery-materials';
import { landingTerrain } from './landing-terrain';
import { FINISH_DEPTH } from './practice-race';

export function PrehistoricEarth({snapshot}:{snapshot:()=>PlayerSnapshot}){
  const root=useRef<Group>(null);
  const geometry=useMemo(()=>{
    const mesh=new PlaneGeometry(24000,24000,256,256);mesh.rotateX(-Math.PI/2);
    const position=mesh.getAttribute('position'),colors:number[]=[];
    const forest=new Color('#527c51'),upland=new Color('#879088'),water=new Color('#5599b6'),wetland=new Color('#8bbd4b'),haze=new Color('#a2c9ec');
    for(let i=0;i<position.count;i++){
      const x=position.getX(i),z=position.getZ(i),sample=landingTerrain(x,z);
      position.setY(i,Math.hypot(x,z)<390?-3:sample.height);
      const color=forest.clone().lerp(upland,Math.max(0,(sample.height-40)/400));
      if(sample.river<80)color.lerp(wetland,1-sample.river/80);
      if(Math.hypot(x,z)>400&&sample.river<48)color.copy(water);
      const slope=(landingTerrain(x-70,z-90).height-sample.height)/160;
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
