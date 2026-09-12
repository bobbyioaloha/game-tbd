import type { EventVector } from '@sky/shared';
export const add=(a:EventVector,b:EventVector):EventVector=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export const subtract=(a:EventVector,b:EventVector):EventVector=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
export const scale=(a:EventVector,s:number):EventVector=>[a[0]*s,a[1]*s,a[2]*s];
export const length=(a:EventVector)=>Math.hypot(...a);
export const dot=(a:EventVector,b:EventVector)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const clampLength=(a:EventVector,max:number)=>length(a)>max?scale(a,max/length(a)):a;
export const direction=(a:EventVector):EventVector=>length(a)<1e-8?[0,1,0]:scale(a,1/length(a));
export const finiteVector=(a:EventVector)=>a.length===3&&a.every(Number.isFinite);
/** First segment/sphere contact in [0,1], not closest approach. */
export function contactTime(from:EventVector,to:EventVector,center:EventVector,radius:number):number|undefined {
  const offset=subtract(from,center),delta=subtract(to,from);
  const c=dot(offset,offset)-radius*radius;
  if(c<=0)return 0;
  const a=dot(delta,delta);if(a<1e-12)return undefined;
  const b=2*dot(offset,delta),discriminant=b*b-4*a*c;
  if(discriminant<0)return undefined;
  const t=(-b-Math.sqrt(discriminant))/(2*a);
  return t>=0&&t<=1?t:undefined;
}
export function seededRandom(seed:number) {
  let value=(seed>>>0)||0x9e3779b9;
  return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};
}
