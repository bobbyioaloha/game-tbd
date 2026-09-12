import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { fitModelToDiameter } from './model-presentation';
import { RACE_CREATION_MODEL_DIAMETER, RACE_CREATION_PICKUP_RADIUS } from '../game/race-event-config';

test('tiny and offset meshes are centred and consistently sized inside the game pickup halo',()=>{
  for(const size of [0.05,1,6]) {
    const geometry=new BoxGeometry(size,size*0.4,size*0.7),material=new MeshBasicMaterial();
    try {
      const parent=new Group(),model=new Group(),mesh=new Mesh(geometry,material);
      parent.position.set(50,-2100,-20);parent.rotation.set(0.3,0.8,0.1);
      mesh.position.set(3,-2,1);mesh.rotation.set(0.2,0.4,0.7);
      model.add(mesh);parent.add(model);
      fitModelToDiameter(model,RACE_CREATION_MODEL_DIAMETER);
      const firstPosition=model.position.clone(),firstScale=model.scale.clone();
      fitModelToDiameter(model,RACE_CREATION_MODEL_DIAMETER);
      assert.ok(model.position.distanceTo(firstPosition)<1e-8,'fitting is stable on replay');
      assert.ok(model.scale.distanceTo(firstScale)<1e-8);
      // Inspect in the pickup's coordinate system, independent of its world position.
      parent.position.set(0,0,0);parent.rotation.set(0,0,0);parent.updateWorldMatrix(true,true);
      const bounds=new Box3().setFromObject(model);
      assert.ok(bounds.getCenter(new Vector3()).length()<1e-8);
      assert.ok(Math.abs(bounds.getSize(new Vector3()).length()-RACE_CREATION_MODEL_DIAMETER)<1e-8);
      assert.ok(bounds.getSize(new Vector3()).length()/2<RACE_CREATION_PICKUP_RADIUS);
    } finally {geometry.dispose();material.dispose();}
  }
});
