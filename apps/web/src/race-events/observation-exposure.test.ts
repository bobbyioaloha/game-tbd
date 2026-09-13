import test from 'node:test';
import assert from 'node:assert/strict';
import type { DrillObserver, EventRacer, EventVector, RacerSegment } from '@sky/shared';
import { ObservationDrill } from './observation-drill';
import { insideObservationCone } from './drill-mechanics';
import { add, scale } from './math';

const racer=(id:string,position:EventVector=[0,0,0]):EventRacer=>({id,position,velocity:[6,-30,0],finished:false});
const makeDrill=(racers=[racer('watched')])=>new ObservationDrill({family:'observation',scan:'alternating',temperament:'strict'},1,racers);
const inCone=(observer:DrillObserver,distance=25)=>add(observer.position,scale(observer.direction,distance));
function step(drill:ObservationDrill,age:number,dt:number,segment:RacerSegment) {
  const watched=racer(segment.id,segment.from);
  drill.prepareStep(age,dt,[watched]);
  return drill.resolveContacts([segment],[watched]);
}

test('inspection grace excludes time after the swept finish fraction',()=>{
  const drill=makeDrill(),position=inCone(drill.getSnapshot().observers![0]);
  const segment={id:'watched',from:position,to:position};
  for(let tick=0;tick<14;tick++)assert.equal(step(drill,1+tick/120,1/120,segment).size,0);
  assert.equal(step(drill,1+14/120,1/120,{...segment,endFraction:0.01}).size,0,
    '14 ticks plus one percent of a tick remain below the 0.12-second grace');
  assert.deepEqual(drill.getImpact().observationFlags,{});
});

test('a brief cone crossing earns only actual exposure, not a whole simulation tick',()=>{
  const drill=makeDrill(),observer=drill.getSnapshot().observers![0];
  const inside=inCone(observer),stationary={id:'watched',from:inside,to:inside};
  for(let tick=0;tick<14;tick++)step(drill,1+tick/120,1/120,stationary);
  // Only the final tenth of this segment enters the top of the cone.
  const from=inCone(observer,-9),to=inCone(observer,1);
  assert.equal(step(drill,1+14/120,1/120,{id:'watched',from,to}).size,0);
  assert.deepEqual(drill.getImpact().observationFlags,{});
});

test('overlapping observation cones count the union of exposed time once',()=>{
  const drill=makeDrill([racer('a'),racer('b',[0,-91,0])]);
  drill.prepareStep(1,1/120,[]);
  const observers=drill.getSnapshot().observers!;
  const position=observers.flatMap(observer=>[20,30,40,50,60,70].map(distance=>inCone(observer,distance)))
    .find(position=>observers.filter(observer=>insideObservationCone(position,observer)).length>=2);
  assert.ok(position,'fixture has overlapping shared inspection fields');
  const segment={id:'watched',from:position,to:position};
  for(let tick=0;tick<5;tick++)assert.equal(step(drill,1+tick*0.02,0.02,segment).size,0);
  assert.equal(step(drill,1.1,0.03,segment).size,1,'one 0.13-second exposure produces one flag');
  assert.equal(drill.getImpact().observationFlags.watched,1);
});
