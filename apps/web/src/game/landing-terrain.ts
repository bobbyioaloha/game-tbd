import { sceneryNoise } from './scenery-materials';
export const riverCenter=(z:number)=>240+90*Math.sin(z/400)+50*Math.sin(z/1700);
export function landingTerrain(x:number,z:number){
  const radius=Math.hypot(x,z),river=Math.abs(x-riverCenter(z));
  const basin=Math.min(1,Math.max(0,(radius-110)/650));
  const ridge=Math.pow(1-Math.abs(sceneryNoise(x/650+4,z/650+7)*2-1),3);
  const foothills=(sceneryNoise(x/230,z/230)*55+ridge*480+140*Math.min(1,Math.max(0,(radius-500)/700)))*basin;
  const valley=Math.min(1,Math.max(0,(river-65)/420));
  const height=radius<58?-.15:river<48?-2:Math.max(-.15,foothills*valley);
  return {height,river};
}
