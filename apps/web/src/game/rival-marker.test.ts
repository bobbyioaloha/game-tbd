import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectRivalMarker } from './rival-marker';

const camera=new PerspectiveCamera(65,16/9,0.1,5000);
camera.updateMatrixWorld();

test('rival markers remain finite and on screen across the eye plane',()=>{
  for(const z of [-0.001,0,0.001,10])for(const x of [-10,0,10]){
    const marker=projectRivalMarker(new Vector3(x,0,z),camera);
    assert.equal(marker.edge,true);
    assert.ok(Number.isFinite(marker.angle));
    assert.ok(marker.left>=10-1e-8&&marker.left<=90+1e-8);
    assert.ok(marker.top>=12.5-1e-8&&marker.top<=87.5+1e-8);
  }
});
test('crossing behind the camera preserves arrow direction',()=>{
  for(const x of [-10,10]){
    const before=projectRivalMarker(new Vector3(x,3,-0.001),camera);
    const after=projectRivalMarker(new Vector3(x,3,0.001),camera);
    assert.deepEqual(before,after);
  }
});
test('visible rivals retain perspective placement without mutating position',()=>{
  const world=new Vector3(1,2,-20),original=world.clone();
  const projected=world.clone().project(camera);
  const marker=projectRivalMarker(world,camera);
  assert.equal(marker.edge,false);
  assert.equal(marker.left,50+projected.x*50);
  assert.equal(marker.top,50-projected.y*50);
  assert.deepEqual(world,original);
});
