import test from 'node:test';
import assert from 'node:assert/strict';
import { safetyDrillFixtures, SAFETY_DRILL_LIMITS, RACE_EVENT_LIMITS, type EventRacer, type EventVector, type SafetyDrillRecipe } from '@sky/shared';
import { SafetyDrillRuntime, closestDrillPoint } from './drill-runtime';
import { RaceEventRuntime } from './runtime';
import { add, length, subtract } from './math';
import { FreefallController } from '../game/freefall-controller';

const racer=(id:string,position:EventVector=[0,0,0],velocity:EventVector=[0,-30,0]):EventRacer=>({id,position,velocity,finished:false});
const stationary=(racers:readonly EventRacer[])=>racers.map(racer=>({id:racer.id,from:racer.position,to:racer.position}));
const recipe=(index=0)=>safetyDrillFixtures[index].spec.drill;
function activated(index=0,racers=[racer('creator')],seed=42) {
  const runtime=new RaceEventRuntime();
  runtime.spawn({instanceId:'drill',creatorId:'creator',spec:safetyDrillFixtures[index].spec,position:[0,0,0],seed});
  runtime.prepareStep(1/120,racers);runtime.resolveContacts(stationary(racers));
  assert.equal(runtime.getSnapshot().phase,'active');
  return runtime;
}

test('drills keep first eligible contact, a finite shared lifetime, and reset clears every field',()=>{
  const runtime=activated(3,[racer('creator',[0,4,0]),racer('rival')]);
  assert.equal(runtime.getSnapshot().triggererId,'rival');
  for(let tick=0;tick<1201;tick++) {
    const racers=[racer('creator',[0,-tick/4,0]),racer('rival',[0,-tick/4,0])];
    const inputs=runtime.prepareStep(1/120,racers);runtime.resolveContacts(stationary(racers));
    assert.deepEqual(inputs.creator,inputs.rival,'the creator and triggerer follow identical spatial rules');
  }
  assert.equal(runtime.getSnapshot().phase,'expired');
  assert.equal(runtime.getSnapshot().drill,undefined);
  assert.ok(runtime.getSnapshot().impact?.drill);
  runtime.reset();
  assert.equal(runtime.getSnapshot().impact?.drill,undefined);
  assert.equal(runtime.getSnapshot().drill,undefined);
});

test('seeded shared course bands are bounded, independent of input order, and do not follow racers',()=>{
  const racers=Array.from({length:8},(_,index)=>racer(String(index),[0,-index*300,0]));
  const a=new SafetyDrillRuntime(recipe(),42,racers);
  const b=new SafetyDrillRuntime(recipe(),42,[...racers].reverse());
  assert.deepEqual(a.getSnapshot(),b.getSnapshot());
  assert.equal(a.getSnapshot().actors.length,SAFETY_DRILL_LIMITS.maxActors);
  const rapids=new SafetyDrillRuntime(recipe(3),42,racers);
  assert.ok(rapids.getSnapshot().currents.length<=SAFETY_DRILL_LIMITS.maxCurrents);
  const geometry=()=>rapids.getSnapshot().currents.map(({strength,...field})=>field);
  const original=geometry();
  const inputs=rapids.prepareStep(2,1/120,[racer('teleported',[900,-9000,900])]);
  assert.deepEqual(geometry(),original);
  assert.deepEqual(inputs.teleported.acceleration,[0,0,0]);
  assert.notDeepEqual(a.getSnapshot().actors,new SafetyDrillRuntime(recipe(),99,racers).getSnapshot().actors);
});

test('charge commits once after its warning; scatter instead opens the same approach lane',()=>{
  const base:SafetyDrillRecipe={family:'stampede',formation:'split',direction:'right',reaction:'charge',modifier:'none'};
  const charging=new SafetyDrillRuntime(base,7,[racer('creator')]);
  const scattering=new SafetyDrillRuntime({...base,reaction:'scatter'},7,[racer('creator')]);
  const initial=charging.getSnapshot().actors[0];
  const approach=racer('creator',[0,initial.position[1]+14,initial.position[2]],[0,0,0]);
  for(const runtime of [charging,scattering])runtime.prepareStep(1,1/120,[approach]);
  assert.equal(charging.getSnapshot().actors[0].state,'warning');
  const atWarning=charging.getSnapshot().actors[0].position;
  for(const runtime of [charging,scattering])runtime.prepareStep(2,1/120,[approach]);
  const charged=charging.getSnapshot().actors[0],scattered=scattering.getSnapshot().actors[0];
  assert.equal(charged.state,'charging');assert.equal(scattered.state,'scattering');
  assert.ok(Math.abs(charged.position[0])<Math.abs(atWarning[0]),'charging closes the approach lane');
  assert.ok(Math.abs(scattered.position[0])>Math.abs(atWarning[0]),'scattering opens the approach lane');
  const velocity=charged.velocity,reactions=charging.getImpact().reactions;
  charging.prepareStep(3,1/120,[racer('creator',[100,100,100])]);
  assert.deepEqual(charging.getSnapshot().actors[0].velocity,velocity,'the charge never homes after commitment');
  charging.prepareStep(4,1/120,[approach]);
  assert.equal(charging.getImpact().reactions,reactions,'approaching twice does not retrigger committed actors');
});

test('only entering the visible wake earns a draft; protection blocks bodies but does not grant immunity to everyone',()=>{
  const runtime=new SafetyDrillRuntime(recipe(2),42,[racer('creator')]);
  runtime.prepareStep(2,1/120,[]);
  const actor=runtime.getSnapshot().actors[0],wake=actor.wake!;
  const racers=[racer('inside',wake.position),racer('outside',add(wake.position,[0,0,wake.radius+1]))];
  const inputs=runtime.prepareStep(2,1/120,racers);
  assert.equal(inputs.inside.acceleration[1],-SAFETY_DRILL_LIMITS.draftAcceleration);
  assert.deepEqual(inputs.outside.acceleration,[0,0,0]);
  const protectedRacer={...racer('protected',actor.position),protected:true},exposed=racer('exposed',actor.position);
  const kicks=runtime.resolveContacts(stationary([protectedRacer,exposed]),[protectedRacer,exposed]);
  assert.equal(kicks.has('protected'),false);assert.ok(kicks.has('exposed'));
  assert.equal(runtime.getImpact().blockedCollisions.protected,1);
  assert.equal(runtime.getImpact().collisions.exposed,1);
  runtime.resolveContacts(stationary([exposed]),[exposed]);
  assert.equal(runtime.getImpact().collisions.exposed,1,'each body contacts each racer at most once');
});

test('rapids have continuous capsule routes, a narrower stronger shortcut, and an actual braking eddy',()=>{
  const runtime=new SafetyDrillRuntime(recipe(3),9,[racer('creator')]);
  const currents=runtime.getSnapshot().currents;
  for(const pathId of [0,1]) {
    const path=currents.filter(current=>current.pathId===pathId);
    for(let index=1;index<path.length;index++)assert.deepEqual(path[index-1].to,path[index].from);
  }
  const normal=currents.filter(current=>current.kind==='flow')[3];
  const fast=currents.filter(current=>current.kind==='fast')[3];
  const eddy=currents.find(current=>current.kind==='eddy')!;
  const racers=[racer('normal',normal.position),racer('fast',fast.position),racer('eddy',eddy.position),racer('outside',[35,-140,35])];
  assert.ok(fast.radius<normal.radius);
  const warning=runtime.prepareStep(0.5,1/120,racers);
  assert.ok(Object.values(warning).every(input=>length(input.acceleration)===0));
  const inputs=runtime.prepareStep(2,1/120,racers);
  assert.ok(inputs.fast.acceleration[1]<inputs.normal.acceleration[1]);
  assert.ok(inputs.eddy.acceleration[1]>0);
  assert.deepEqual(inputs.outside.acceleration,[0,0,0]);
  for(const input of Object.values(inputs))assert.ok(length(input.acceleration)<=RACE_EVENT_LIMITS.maxAcceleration);
  assert.ok(runtime.getImpact().currentSeconds.fast>0);
});

test('following a current changes real controller progress compared with steering outside it',()=>{
  const drill=new SafetyDrillRuntime(recipe(3),7,[racer('creator')]);
  const normal=drill.getSnapshot().currents.filter(current=>current.kind==='flow');
  function trace(follow:boolean) {
    const controller=new FreefallController(36,follow?normal[0].from[0]:35,follow?normal[0].from[2]:35);
    controller.setFallSpeed(30);
    const runtime=new SafetyDrillRuntime(recipe(3),7,[racer('creator')]);
    for(let tick=0;tick<840;tick++) {
      const snapshot=controller.getSnapshot(),velocity=controller.getWorldVelocity();
      const current=normal.reduce((nearest,field)=>length(subtract(snapshot.position,closestDrillPoint(snapshot.position,field.from,field.to)))<length(subtract(snapshot.position,closestDrillPoint(snapshot.position,nearest.from,nearest.to)))?field:nearest);
      const target=closestDrillPoint(add(snapshot.position,[0,-10,0]),current.from,current.to);
      const inputs=runtime.prepareStep((tick+1)/120,1/120,[racer('creator',snapshot.position,velocity)]);
      controller.step(1/120,follow?{x:(target[0]-snapshot.position[0])*0.6,z:(target[2]-snapshot.position[2])*0.6}:{x:0,z:0},
        {fallSpeedMultiplier:1,eventInput:inputs.creator});
    }
    return {depth:-controller.getSnapshot().position[1],report:runtime.getImpact()};
  }
  const follow=trace(true),outside=trace(false);
  assert.ok(follow.report.currentSeconds.creator>2);
  assert.equal(outside.report.currentSeconds.creator,undefined);
  assert.ok(follow.depth>outside.depth+30,'riding the route produces a material race-position advantage');
});

test('drill snapshots do not create a second clock and invalid recipes are rejected at entry',()=>{
  const runtime=activated();const before=runtime.getSnapshot();
  assert.deepEqual(runtime.getSnapshot(),before);
  assert.throws(()=>new SafetyDrillRuntime({...recipe(),strength:900},0,[]));
});


test('same hippo mesh produces different decisions: charge punishes a straight fall while a timed dodge avoids it',()=>{
  function trace(index:number,dodge:boolean) {
    const controller=new FreefallController(36,0,0);controller.setFallSpeed(30);
    const runtime=new RaceEventRuntime();
    runtime.spawn({instanceId:'trace',creatorId:'creator',spec:safetyDrillFixtures[index].spec,position:[0,0,0],seed:42});
    for(let tick=0;tick<1202;tick++) {
      const snapshot=controller.getSnapshot();
      const racers=[racer('creator',snapshot.position,controller.getWorldVelocity())];
      const inputs=runtime.prepareStep(1/120,racers);
      const motion=controller.step(1/120,{x:dodge&&tick>170&&tick<290?1:0,z:0},{fallSpeedMultiplier:1,eventInput:inputs.creator});
      runtime.resolveContacts([{id:'creator',from:motion.previousPosition,to:motion.position}]);
    }
    return {depth:-controller.getSnapshot().position[1],report:runtime.getSnapshot().impact!.drill!};
  }
  assert.deepEqual(safetyDrillFixtures[0].spec.appearance,safetyDrillFixtures[1].spec.appearance);
  const charge=trace(0,false),dodged=trace(0,true),scatter=trace(1,false);
  assert.ok(charge.report.collisions.creator>=1);
  assert.equal(dodged.report.collisions.creator,undefined);
  assert.equal(scatter.report.collisions.creator,undefined);
  assert.ok(scatter.report.reactions>0);
  assert.ok(dodged.depth>charge.depth+20,'avoiding the committed charge preserves a material lead');
});


test('convoy directions mirror lateral motion while preserving descent and alternating rows',()=>{
  const actors=(direction:'left'|'right'|'alternating')=>{
    const runtime=new SafetyDrillRuntime({family:'stampede',formation:'convoy',direction,reaction:'steady',modifier:'draft'},42,[racer('creator')]);
    const origins=runtime.getSnapshot().actors.map(actor=>actor.position);
    runtime.prepareStep(2,1/120,[]);
    return runtime.getSnapshot().actors.map((actor,index)=>({offset:subtract(actor.position,origins[index]),velocity:actor.velocity}));
  };
  const left=actors('left'),right=actors('right'),alternating=actors('alternating');
  for(let index=0;index<left.length;index++){
    assert.equal(left[index].offset[0],-right[index].offset[0]);
    assert.equal(left[index].velocity[0],-right[index].velocity[0]);
    assert.equal(left[index].offset[1],right[index].offset[1]);
    assert.equal(left[index].velocity[1],right[index].velocity[1]);
    assert.deepEqual(alternating[index],Math.floor(index/4)%2?right[index]:left[index]);
  }
});


test('every supported recipe combination stays within actor, current, and force budgets',()=>{
  const recipes:SafetyDrillRecipe[]=[];
  for(const direction of ['left','right','alternating'] as const) {
    for(const modifier of ['none','draft'] as const) {
      for(const formation of ['line','split'] as const) {
        for(const reaction of ['steady','charge','scatter'] as const) {
          recipes.push({family:'stampede',formation,direction,reaction,modifier});
        }
      }
      recipes.push({family:'stampede',formation:'convoy',direction,reaction:'steady',modifier});
    }
  }
  for(const layout of ['winding','forked','alternating'] as const) {
    for(const flow of ['steady','pulsing'] as const) {
      for(const modifier of ['none','eddies'] as const)recipes.push({family:'rapids',layout,flow,modifier});
    }
  }
  for(const layout of ['staggered','funnel'] as const)for(const bounce of ['springy','ricochet'] as const)recipes.push({family:'pinball',layout,bounce});
  for(const pairing of ['nearest','crossfield'] as const)for(const tether of ['elastic','pulsing'] as const)recipes.push({family:'buddy',pairing,tether});
  for(const direction of ['clockwise','counterclockwise'] as const)for(const pull of ['gentle','clingy'] as const)recipes.push({family:'orbit',direction,pull});
  for(const pattern of ['trail','mirror'] as const)for(const cadence of ['steady','bursts'] as const)recipes.push({family:'reconstruction',pattern,cadence});
  for(const scan of ['sweep','alternating'] as const)for(const temperament of ['patient','strict'] as const)recipes.push({family:'observation',scan,temperament});
  assert.equal(recipes.length,74);
  const racers=Array.from({length:16},(_,index)=>racer(String(index),[index%2?15:-15,-Math.floor(index/4)*150,0]));
  for(const recipe of recipes) {
    const runtime=new SafetyDrillRuntime(recipe,42,racers);
    for(let tick=0;tick<=120;tick++) {
      const inputs=runtime.prepareStep(tick/12,1/12,racers);
      const snapshot=runtime.getSnapshot();
      assert.ok(snapshot.actors.length<=SAFETY_DRILL_LIMITS.maxActors);
      assert.ok(snapshot.currents.length<=SAFETY_DRILL_LIMITS.maxCurrents);
      assert.ok((snapshot.tethers?.length??0)<=SAFETY_DRILL_LIMITS.maxTethers);
      assert.ok((snapshot.orbits?.length??0)<=SAFETY_DRILL_LIMITS.maxOrbits);
      assert.ok((snapshot.observers?.length??0)<=SAFETY_DRILL_LIMITS.maxObservers);
      assert.equal(snapshot.currents.length>0,recipe.family==='rapids');
      for(const actor of snapshot.actors) {
        assert.ok(actor.position.every(Number.isFinite));
        assert.ok(actor.velocity.every(Number.isFinite));
      }
      for(const input of Object.values(inputs)) {
        assert.ok(input.acceleration.every(Number.isFinite));
        assert.ok(length(input.acceleration)<=RACE_EVENT_LIMITS.maxAcceleration);
        assert.ok(length(input.velocityDelta)<=RACE_EVENT_LIMITS.maxVelocityDelta);
      }
    }
  }
});
