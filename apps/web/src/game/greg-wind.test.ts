import test from 'node:test';
import assert from 'node:assert/strict';
import { GregWind } from './greg-wind';
test('wind joints freeze on pause, reset on restart, and stay bounded at extreme speeds',()=>{
  const wind=new GregWind();wind.step(0,0);
  for(let i=1;i<=1200;i++)wind.step(i/120,500);
  assert.ok(wind.angles.some(value=>Math.abs(value)>.01));
  assert.ok(wind.angles.every(value=>Math.abs(value)<=.5));
  const paused=[...wind.angles];wind.step(10,500);assert.deepEqual(wind.angles,paused);
  wind.step(0,0);assert.deepEqual(wind.angles,[0,0,0,0,0]);
});
test('wind has comparable motion at 30, 60 and 120 fps',()=>{
  const results=[30,60,120].map(rate=>{
    const wind=new GregWind();wind.step(0,0);
    for(let i=1;i<=rate*3;i++)wind.step(i/rate,45);
    return [...wind.angles];
  });
  for(let i=0;i<5;i++)assert.ok(Math.max(...results.map(r=>r[i]))-Math.min(...results.map(r=>r[i]))<.025);
});
