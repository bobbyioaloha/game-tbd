import test from 'node:test';
import assert from 'node:assert/strict';
import { followCameraAxis } from './camera-follow';

test('camera follows from the first movement frame and maintains a small trail',()=>{
  for(const rate of [30,60,120]){
    let camera=0,player=0;
    for(let i=0;i<rate*2;i++){
      player+=20/rate;camera=followCameraAxis(camera,player,1/rate);
      assert.ok(camera>0&&camera<player);
      assert.ok(player-camera<2.1);
    }
    const gap=player-camera;
    for(let i=0;i<rate/2;i++)camera=followCameraAxis(camera,player,1/rate);
    assert.ok(player-camera<gap*0.01);
  }
});
test('camera smoothing is independent of frame rate and never overshoots',()=>{
  const results=[30,60,120].map(rate=>{
    let position=-10;
    for(let i=0;i<rate;i++){
      const next=followCameraAxis(position,5,1/rate);
      assert.ok(next>=position&&next<=5);position=next;
    }
    return position;
  });
  assert.ok(Math.max(...results)-Math.min(...results)<1e-10);
  assert.equal(followCameraAxis(2,5,0),2);
  assert.equal(followCameraAxis(2,5,-1),2);
});
test('camera responds immediately when steering reverses without waiting for a dead zone',()=>{
  const forward=followCameraAxis(0,2,1/60);
  const reverse=followCameraAxis(forward,-2,1/60);
  assert.ok(forward>0);assert.ok(reverse<forward&&reverse>-2);
});
