import { GregWind } from './greg-wind';
import { Suspense, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AnimationMixer, LoopOnce, LoopRepeat, Mesh, MeshLambertMaterial, Quaternion, Euler } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type GregPose = 'Stand' | 'Dive' | 'Reach' | 'Brake' | 'Bank left' | 'Bank right' | 'Impact';
type GregProps={loop?:boolean;pose?:GregPose;paused?:boolean;time?:()=>number;wind?:()=>{time:number;speed:number}};
function LoadedGreg({pose='Stand',paused=false,time,wind,loop=false}:GregProps) {
  const gltf=useLoader(GLTFLoader,'/models/greg.glb');
  const {model,materials}=useMemo(()=>{
    const model=clone(gltf.scene);
    const materials:MeshLambertMaterial[]=[];
    model.traverse(object=>{
      if(object instanceof Mesh) {
        const source=Array.isArray(object.material)?object.material[0]:object.material;
        const material=new MeshLambertMaterial({map:source.map,color:source.color,flatShading:true});
        materials.push(material);object.material=material;
      }
    });
    return {model,materials};
  },[gltf]);
  const mixer=useMemo(()=>new AnimationMixer(model),[model]);
  const airflow=useMemo(()=>new GregWind(),[model]);
  const joints=useMemo(()=>['arm_-1','arm_1','leg_-1','leg_1','tail'].map(name=>{const bone=model.getObjectByName(name);return {bone,base:bone?.quaternion.clone()??new Quaternion()};}),[model]);
  const offset=useMemo(()=>new Quaternion(),[]),euler=useMemo(()=>new Euler(),[]);
  useEffect(()=>{
    const clip=gltf.animations.find(clip=>clip.name===pose);
    if(!clip)return;
    const playback=loop?clip.clone():clip;
    if(loop)playback.duration+=1.5; // A composed pause between attempts.
    const action=mixer.clipAction(playback);
    action.reset().setLoop(loop?LoopRepeat:LoopOnce,loop?Infinity:1);action.clampWhenFinished=!loop;action.play();
    return ()=>{action.stop();if(loop)mixer.uncacheClip(playback);};
  },[gltf,mixer,pose,loop]);
  useEffect(()=>()=>{mixer.stopAllAction();mixer.uncacheRoot(model);materials.forEach(material=>material.dispose());},[mixer,model,materials]);
  useFrame((_,delta)=>{
    joints.forEach(({bone,base})=>bone?.quaternion.copy(base));
    if(time)mixer.setTime(time());else if(!paused)mixer.update(Math.min(delta,0.1));
    joints.forEach(joint=>{if(joint.bone)joint.base.copy(joint.bone.quaternion);});
    if(wind){
      const state=wind(),angles=airflow.step(state.time,state.speed);
      joints.forEach(({bone},index)=>{
        if(!bone)return;
        euler.set(index===4?angles[index]*.4:angles[index],index===4?angles[index]:0,index<2?angles[index]*.4:0);
        bone.quaternion.multiply(offset.setFromEuler(euler));
      });
    }
  });
  return <primitive object={model}/>;
}
export function GregModel(props:GregProps) {
  return <Suspense fallback={null}><LoadedGreg {...props}/></Suspense>;
}
