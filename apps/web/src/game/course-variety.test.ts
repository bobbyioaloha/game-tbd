import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFuelRings, makeCourse, seededRandom, obstacleKindsAtDepth, obstacleHit } from './race-course';
import { PracticeRace, FINISH_DEPTH } from './practice-race';
import { planRival } from './rival-planner';
import { landingTerrain, riverCenter } from './landing-terrain';

test('fresh seeds change junk and all pipe routes; identical seeds replay exactly',()=>{
  const a=makeCourse(seededRandom(31)),b=makeCourse(seededRandom(97));
  assert.deepEqual(a,makeCourse(seededRandom(31)));
  assert.notDeepEqual(a.filter(o=>o.kind==='duct'),b.filter(o=>o.kind==='duct'));
  assert.notDeepEqual(a.filter(o=>o.kind!=='duct'),b.filter(o=>o.kind!=='duct'));
});
test('100 courses retain altitude themes, open pipes and bounded route offsets',()=>{
  const seen=new Set<string>();
  for(let seed=0;seed<100;seed++){
    const course=makeCourse(seededRandom(seed));
    const rings=makeFuelRings(course,seededRandom(seed+1000));
    for(const ring of rings)for(const o of course){
      if(Math.abs(o.position[1]-ring.position[1])<=(o.kind==='duct'?30:14))
        assert.ok(Math.hypot(o.position[0]-ring.position[0],o.position[2]-ring.position[2])>(o.kind==='duct'?20:13));
    }
    const ducts=course.filter(o=>o.kind==='duct');
    assert.equal(ducts.length,9);
    for(const obstacle of course){
      seen.add(obstacle.kind);
      const [x,y,z]=obstacle.position;
      assert.ok(Math.abs(x)<=30&&Math.abs(z)<=30&&y<0&&y>-FINISH_DEPTH);
      if(obstacle.kind!=='duct'){
        assert.ok(obstacleKindsAtDepth(-y).includes(obstacle.kind));
        for(const duct of ducts)if(Math.abs(y-duct.position[1])<28)
          assert.ok(Math.hypot(x-duct.position[0],z-duct.position[2])>=18);
      }else{
        assert.equal(obstacleHit([x,y+11,z],[x,y-11,z],obstacle,0),null);
        const next=ducts.find(d=>d.id===obstacle.id+1);
        if(next&&(next.id-1000)%3!==0){
          assert.ok(Math.hypot(next.position[0]-x,next.position[2]-z)<=3.00001);
          assert.equal(y-next.position[1],24);
        }
      }
    }
  }
  assert.equal(seen.size,10);
});
test('rival maneuver choices persist briefly, vary with seed, and defer to hazards',()=>{
  const a=new PracticeRace(false,()=>.1),b=new PracticeRace(false,()=>.8);
  planRival(a,a.racers[2]);planRival(b,b.racers[2]);
  assert.notDeepEqual(a.racers[2].wander,b.racers[2].wander);
  const wander=[...a.racers[2].wander];
  a.elapsed=.4;planRival(a,a.racers[2]);assert.deepEqual(a.racers[2].wander,wander);
  const rival=a.racers[1],p=a.snapshot(rival).position;
  rival.controller.setFallSpeed(30);
  a.obstacles=[{id:99,kind:'crate',position:[p[0],-12,p[2]],rotation:[0,0,0],active:true,hitAt:-1}];
  assert.equal(planRival(a,rival),true);
  assert.ok(Math.hypot(rival.target[0]-p[0],rival.target[1]-p[2])>5);
});
test('landing target stays level and river runs outside the playable landing square',()=>{
  for(let x=-42;x<=42;x+=7)for(let z=-42;z<=42;z+=7){
    assert.ok(landingTerrain(x,z).height<=0);
    assert.ok(landingTerrain(x,z).river>100);
  }
  for(const z of [-2000,-500,0,500,2000]){
    assert.equal(landingTerrain(riverCenter(z),z).height,-2);
    assert.equal(landingTerrain(riverCenter(z),z).river,0);
  }
  assert.ok(landingTerrain(1500,1500).height>100);
});
