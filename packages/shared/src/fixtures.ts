import { PowerUpSpecSchema, type Primitive } from './schema.js';
const part = (type:Primitive['type'], position:Primitive['position'], scale:Primitive['scale'], color:string, rotation:Primitive['rotation']=[0,0,0]):Primitive => ({type,position,scale,color,rotation});
export const fixtures = [
  {
    version:1, id:'jellyfish-umbrella', displayName:'Jellyfish umbrella',
    description:'Float softly. Fall at half speed for eight seconds.',
    appearance:{primitives:[
      part('sphere',[0,0.65,0],[2.8,0.9,2.8],'#b99aff'),
      part('cylinder',[0,-0.5,0],[0.12,1.6,0.12],'#f1d4ff'),
      ...[-0.85,0.85].flatMap(x => [-0.65,0.65].map(z => part('cylinder',[x,-0.4,z],[0.1,1.5,0.1],'#77e5ee'))),
    ]},
    effects:[{type:'reduceFallSpeed',multiplier:0.5,durationSeconds:8}],
  },
  {
    version:1, id:'ghost-cloak', displayName:'Ghost cloak',
    description:'Slip past danger. Become invulnerable for five seconds.',
    appearance:{primitives:[
      part('cone',[0,-0.25,0],[2.1,2.4,1.5],'#cceef2'),
      part('sphere',[0,0.9,0],[1.15,1.2,1.1],'#eafcff'),
      part('sphere',[-0.22,1,0.49],[0.14,0.24,0.1],'#182947'),
      part('sphere',[0.22,1,0.49],[0.14,0.24,0.1],'#182947'),
    ]},
    effects:[{type:'invulnerability',durationSeconds:5}],
  },
  {
    version:1, id:'angry-sun', displayName:'Angry sun',
    description:'Make some space. Clear obstacles within twelve meters.',
    appearance:{primitives:[
      part('sphere',[0,0,0],[1.8,1.8,1.8],'#ffbb38'),
      ...Array.from({length:8},(_,i) => {
        const angle=i*Math.PI/4;
        return part('cone',[Math.sin(angle)*1.35,Math.cos(angle)*1.35,0],[0.45,0.7,0.45],'#ff7438',[0,0,-angle > -Math.PI ? -angle : 2*Math.PI-angle]);
      }),
      part('box',[-0.32,0.26,0.85],[0.4,0.1,0.1],'#532b35',[0,0,-0.3]),
      part('box',[0.32,0.26,0.85],[0.4,0.1,0.1],'#532b35',[0,0,0.3]),
      part('box',[0,-0.3,0.89],[0.45,0.1,0.1],'#532b35'),
    ]},
    effects:[{type:'clearNearbyObstacles',radiusMeters:12}],
  },
].map(spec => PowerUpSpecSchema.parse(spec));
