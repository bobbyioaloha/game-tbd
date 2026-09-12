import { Vector3, type Camera } from 'three';

// Preserve direction across the eye plane without dividing by zero.
export function projectRivalMarker(world:Vector3,camera:Camera) {
  const view=world.clone().applyMatrix4(camera.matrixWorldInverse);
  const behind=view.z>=0;
  view.z=-Math.max(Math.abs(view.z),0.001);
  const projected=view.applyMatrix4(camera.projectionMatrix);
  const edge=behind||Math.abs(projected.x)>0.85||Math.abs(projected.y)>0.8||projected.z>1||projected.z< -1;
  let x=projected.x,y=projected.y;
  if(edge) {
    if(Math.abs(x)+Math.abs(y)<0.01)y=1;
    const scale=Math.max(Math.abs(x)/0.8,Math.abs(y)/0.75,0.001);
    x/=scale;y/=scale;
  }
  return {left:50+x*50,top:50-y*50,angle:Math.atan2(x,y)*180/Math.PI,edge};
}
