import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTERS } from './characters';

type Asset = {
  nodes: {name?:string;children?:number[]}[];
  animations: {name:string;channels:{target:{node:number;path:string}}[]}[];
};
function asset(name:string):Asset {
  const bytes=readFileSync(new URL(`../../public/models/${name}.glb`,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
}
test('every equipped roster personality resolves to an exported animation',()=>{
  for(const character of CHARACTERS){
    if(!character.model)continue;
    const model=asset(character.model);
    assert.ok(model.animations.some(clip=>clip.name===character.introPose),character.name);
    for(const name of ['Stand','Dive','Brake','Bank left','Bank right','Impact'])
      assert.ok(model.animations.some(clip=>clip.name===name),`${character.name}: ${name}`);
  }
});
test('Linda carries her checklist with the animated right foreleg',()=>{
  const model=asset('linda');
  const board=model.nodes.findIndex(node=>node.name==='clipboard');
  const foreleg=model.nodes.findIndex(node=>node.name==='arm 1');
  assert.ok(board>=0&&foreleg>=0);
  assert.ok(model.nodes[foreleg].children?.includes(board));
  const intro=model.animations.find(clip=>clip.name==='Checklist')!;
  assert.ok(intro.channels.some(channel=>channel.target.node===foreleg));
  assert.ok(intro.channels.some(channel=>model.nodes[channel.target.node].name==='head'));
});

test('Steve carries his diagnostic device and animates both forelegs during troubleshooting',()=>{
  const model=asset('steve');
  const device=model.nodes.findIndex(node=>node.name==='diagnostic');
  const right=model.nodes.findIndex(node=>node.name==='arm 1');
  assert.ok(device>=0&&right>=0);
  assert.ok(model.nodes[right].children?.includes(device));
  const intro=model.animations.find(clip=>clip.name==='Diagnostics')!;
  for(const name of ['arm -1','arm 1','head','diagnostic'])
    assert.ok(intro.channels.some(channel=>model.nodes[channel.target.node].name===name),name);
});
test('Greg spreads all four limbs during freefall and banking',()=>{
  const model=asset('greg');
  for(const name of ['Dive','Brake','Bank left','Bank right']){
    const clip=model.animations.find(clip=>clip.name===name)!;
    for(const limb of ['arm -1','arm 1','leg -1','leg 1'])
      assert.ok(clip.channels.some(channel=>model.nodes[channel.target.node].name===limb),`${name}: ${limb}`);
  }
});
