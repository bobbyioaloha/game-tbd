import type { Item } from './race-course';
import type { Position } from './player-controller';
import type { Projectile } from './practice-race';

// Percentages are parachute / air canister / bubble wrap, evaluated at collection time.
export const POSITION_ITEM_ODDS = [
  [10,35,55], [20,50,30], [45,40,15], [65,25,10],
] as const;
export function itemForPlace(place:number,roll:number):Item {
  const [parachute,airCanister]=POSITION_ITEM_ODDS[Math.max(0,Math.min(3,place-1))];
  const percent=roll*100;
  return percent<parachute?'parachute':percent<parachute+airCanister?'airCanister':'bubbleWrap';
}

// Each targeted projectile gets one reaction roll, never a new roll each frame.
export class RivalDodgeReaction {
  private reactions=new Map<number,{at:number;attempt:boolean;handled:boolean}>();
  update(owner:number,position:Position,shots:Projectile[],now:number,readyAt:number,random:()=>number):boolean {
    const incoming=shots.filter(shot=>shot.target===owner&&shot.expires>now);
    const ids=new Set(incoming.map(shot=>shot.id));
    for(const id of this.reactions.keys())if(!ids.has(id))this.reactions.delete(id);
    for(const shot of incoming){
      const close=Math.hypot(...shot.position.map((value,axis)=>value-position[axis]))<28;
      if(!close)continue;
      if(!this.reactions.has(shot.id))this.reactions.set(shot.id,{
        at:now+0.18+random()*0.17,attempt:random()<0.55,handled:false,
      });
      const reaction=this.reactions.get(shot.id)!;
      if(reaction.handled||now<reaction.at)continue;
      reaction.handled=true;
      if(reaction.attempt&&now>=readyAt)return true;
    }
    return false;
  }
}
