import { RaceEventCreationSchema, raceEventPreset, type RaceEventType } from './race-events.js';
import type { PrimitiveAppearance } from './creation.js';
import type { Primitive } from './schema.js';
const part=(type:Primitive['type'],position:Primitive['position'],scale:Primitive['scale'],color:string):Primitive =>
  ({type,position,scale,color,rotation:[0,0,0]});
const examples:{type:RaceEventType;prompt:string;name:string;brief:string;parts:Primitive[]}[] = [
  {type:'gravityWell',prompt:'hungry purple planet',name:'Hungry Purple Planet',
    brief:'A purple spherical planet with a wide black mouth, two tiny cyan eyes, and a flat gold equatorial ring made from a cylinder.',
    parts:[part('sphere',[0,0,0],[2.4,2.4,2.4],'#793ef0'),part('sphere',[0,-0.1,1.05],[1.2,0.7,0.3],'#151126'),
      part('sphere',[-0.45,0.5,1],[0.3,0.3,0.3],'#7dffff'),part('sphere',[0.45,0.5,1],[0.3,0.3,0.3],'#7dffff'),part('cylinder',[0,0,0],[3.3,0.12,3.3],'#f3bc57')]},
  {type:'debrisShower',prompt:'exploding popcorn machine',name:'Exploding Popcorn Machine',
    brief:'A red box popcorn machine with a pale yellow window, four cream popcorn balls above it, and a wide red roof.',
    parts:[part('box',[0,-0.3,0],[1.7,1.9,1.2],'#d93754'),part('box',[0,-0.1,0.65],[1.3,1.1,0.1],'#ffdf94'),part('box',[0,0.7,0],[2,0.25,1.5],'#ff5872'),
      ...[-0.7,-0.2,0.3,0.8].map((x,i)=>part('sphere',[x,1.1+(i%2)*0.4,0],[0.5,0.5,0.5],'#fff4c2'))]},
  {type:'repulsionBurst',prompt:'angry orange sun',name:'Angry Orange Sun',
    brief:'A round orange sun with two dark slanted-looking eyes and eight chunky yellow rays around its silhouette.',
    parts:[part('sphere',[0,0,0],[1.8,1.8,1.8],'#ff812e'),part('box',[-0.35,0.2,0.8],[0.3,0.12,0.15],'#3a1628'),part('box',[0.35,0.2,0.8],[0.3,0.12,0.15],'#3a1628'),
      ...Array.from({length:8},(_,i)=>part('sphere',[Math.cos(i*Math.PI/4)*1.2,Math.sin(i*Math.PI/4)*1.2,0],[0.6,0.6,0.3],'#ffd35a'))]},
  {type:'protectiveZone',prompt:'gentle blue jellyfish',name:'Gentle Blue Jellyfish',
    brief:'A wide soft blue jellyfish bell above four thin dangling cyan tentacles, with two round navy eyes at the front.',
    parts:[part('sphere',[0,0.6,0],[2.6,1.4,2],'#79caff'),...[-0.8,-0.25,0.25,0.8].map(x=>part('cylinder',[x,-0.7,0],[0.14,1.6,0.14],'#8ffff4')),
      part('sphere',[-0.4,0.5,0.9],[0.2,0.25,0.2],'#173264'),part('sphere',[0.4,0.5,0.9],[0.2,0.25,0.2],'#173264')]},
];
export const raceEventFixtures=examples.map(example=>{
  const preset=raceEventPreset(example.type);
  const appearance:PrimitiveAppearance={type:'primitives',primitives:example.parts};
  return {prompt:example.prompt,design:{displayName:example.name,visualBrief:example.brief,effectType:example.type},
    spec:RaceEventCreationSchema.parse({version:3,id:'event-'+example.type,displayName:example.name,
      description:preset.description,appearance,effect:preset.effect})};
});
export function mockRaceEventForText(text:string) {
  const normalized=text.trim().toLowerCase().replace(/\s+/g,' ');
  return raceEventFixtures.find(item=>[item.prompt,item.design.displayName,item.design.visualBrief].some(value=>value.toLowerCase()===normalized));
}
