import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

// Fixed seeds keep authored scenery independent of gameplay randomness.
export function sceneryNoise(x:number,z:number):number {
  const hash=(a:number,b:number)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
  return (hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+(hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;
}
export function wornSurface(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#d6d2c6';ctx.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=4)for(let x=0;x<256;x+=4){
    const n=sceneryNoise(x*.17,y*.17),tone=Math.round(154+n*84);
    ctx.fillStyle=`rgb(${tone},${tone-3},${tone-8})`;ctx.fillRect(x,y,4,4);
    if(n<.24){ctx.fillStyle='#766958';ctx.fillRect(x,y,2,10);}
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=RepeatWrapping;
  return texture;
}
export function cargoLabel(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=320;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#d8b94d';ctx.fillRect(0,0,256,320);
  ctx.fillStyle='#242821';
  for(let x=-40;x<300;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+22,0);ctx.lineTo(x+52,30);ctx.lineTo(x+30,30);ctx.fill();}
  ctx.textAlign='center';ctx.font='bold 35px Arial';ctx.fillText('AIRBORNE',128,91);ctx.fillText('LOAD',128,133);
  ctx.font='bold 62px Arial';ctx.fillText('!',128,209);
  ctx.fillStyle='#ddd9c8';ctx.fillRect(12,242,232,64);ctx.fillStyle='#242821';ctx.font='bold 27px Arial';ctx.fillText('INSPECTED',128,282);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;return texture;
}
