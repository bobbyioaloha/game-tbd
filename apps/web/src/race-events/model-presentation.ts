import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three';

/** Fit visuals around the pickup centre, independent of parent/world transforms. */
export function fitModelToDiameter(model:Object3D,diameter:number):void {
  if(!Number.isFinite(diameter)||diameter<=0)throw new Error('Invalid model diameter.');
  model.position.set(0,0,0);
  model.scale.setScalar(1);
  model.updateWorldMatrix(true,true);

  const inverse=new Matrix4().copy(model.matrixWorld).invert();
  const transform=new Matrix4(),partBounds=new Box3(),bounds=new Box3();
  model.traverse(part=>{
    if(!(part instanceof Mesh))return;
    part.geometry.computeBoundingBox();
    if(!part.geometry.boundingBox)return;
    transform.multiplyMatrices(inverse,part.matrixWorld);
    bounds.union(partBounds.copy(part.geometry.boundingBox).applyMatrix4(transform));
  });
  if(bounds.isEmpty())return;

  const centre=bounds.getCenter(new Vector3());
  // The bounding-box diagonal keeps every vertex inside this presentation sphere,
  // including long or off-centre generated shapes, at any rotation.
  const scale=diameter/Math.max(bounds.getSize(new Vector3()).length(),0.001);
  model.scale.setScalar(scale);
  model.position.copy(centre.multiplyScalar(-scale));
}
