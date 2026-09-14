import type { RaceEventSnapshot } from '@sky/shared';

export type ObservationFeedback = {
  state:'warning'|'clear'|'resting'|'watched'|'moving'|'penalty'|'protected';
  title:string;
  detail:string;
  exposureFraction:number;
  watching:boolean;
};

/** Read the inspection's measured state; presentation never times or applies a penalty. */
export function observationFeedback(event:RaceEventSnapshot,racerId='0'):ObservationFeedback|null {
  if(event.phase!=='active'||event.instance?.spec.version!==4||event.instance.spec.drill.family!=='observation')return null;
  const drill=event.drill,local=drill?.observations?.[racerId];
  const base={exposureFraction:local?.exposureFraction??0,watching:local?.watching??false};
  if(local&&local.cooldownSeconds>0)return {...base,state:local.penaltyBlocked?'protected':'penalty',
    title:local.penaltyBlocked?'PROTECTION BLOCKED THE PENALTY':'FLAGGED FOR SIDEWAYS MOVEMENT',
    detail:local.penaltyBlocked?'Your protection stopped the shove. Hold your course in red light.':'The shove slows your fall. Hold your course in red light.'};
  if((drill?.warningSeconds??0)>0)return {...base,state:'warning',title:'INSPECTION INCOMING',
    detail:'Red light checks sideways movement. Falling straight is allowed.'};
  if(local?.watching) {
    if(local.protected)return {...base,state:'protected',title:'IN THE LIGHT · PROTECTED',
      detail:'Protection blocks inspection shoves. Hold your course when it ends.'};
    if(local.moving)return {...base,state:'moving',title:'RELEASE STEERING',
      detail:'You are moving sideways in red light. Let any remaining drift settle.'};
    return {...base,state:'watched',title:'YOU ARE WATCHED · HOLD COURSE',
      detail:'You are falling straight. Keep steering released to avoid a shove.'};
  }
  if(local?.warning)return {...base,state:'warning',title:'LIGHT TURNING RED · HOLD COURSE',
    detail:'Release steering before the red light starts watching you.'};
  if(drill?.observers?.length&&drill.observers.every(observer=>!observer.watching&&!observer.warning))return {...base,
    state:'resting',title:'BLUE LIGHT · STEER NOW',detail:'Inspectors are resting. Change lanes before the light turns red.'};
  return {...base,state:'clear',title:'OUTSIDE THE RED LIGHT',
    detail:'Steer outside red cones. Hold your course when the light reaches you.'};
}
