import {
  RACE_EVENT_LIMITS, SAFETY_DRILL_LIMITS,
  type DrillActor, type DrillCurrent, type DrillSnapshot, type EventVector,
  type RaceEventEffect, type RaceEventSnapshot, type SafetyDrillRecipe,
} from '@sky/shared';
import { closestDrillPoint } from '../race-events/drill-runtime';
import { length, subtract } from '../race-events/math';
import { observationFeedback } from './observation-feedback';

export type EffectFeedback = {
  tone:'warning'|'neutral'|'danger'|'benefit';
  title:string;
  detail:string;
  meter?:{label:string;value:number};
  controls?:{action:'steer'|'release-steering';detail:string};
};

const steer=(detail:string):NonNullable<EffectFeedback['controls']>=>({action:'steer',detail});
const clampFraction=(value:number)=>Math.max(0,Math.min(1,value));
const currentPriority:Record<DrillCurrent['kind'],number>={eddy:0,fast:1,flow:2};
const containsCapsule=(position:EventVector,capsule:{from:EventVector;to:EventVector;radius:number})=>
  length(subtract(position,closestDrillPoint(position,capsule.from,capsule.to)))<=capsule.radius;

/** A cue's approach range only selects useful text; it never changes contact or force bounds. */
function nearbyActor(position:EventVector,actor:DrillActor) {
  return length(subtract(position,actor.position))<=SAFETY_DRILL_LIMITS.approachRadius
    ||(actor.telegraph!==undefined&&containsCapsule(position,{...actor.telegraph,radius:actor.radius+RACE_EVENT_LIMITS.racerRadius}));
}
function echoAhead(position:EventVector,actor:DrillActor) {
  const ahead=position[1]-actor.position[1];
  return actor.kind==='echo'&&ahead>=-actor.radius&&ahead<=SAFETY_DRILL_LIMITS.bandLengthMeters
    &&Math.hypot(position[0]-actor.position[0],position[2]-actor.position[2])<=SAFETY_DRILL_LIMITS.approachRadius;
}

function stampedeFeedback(recipe:Extract<SafetyDrillRecipe,{family:'stampede'}>,drill:DrillSnapshot|undefined,position:EventVector):EffectFeedback {
  const actors=drill?.actors??[],nearby=actors.filter(actor=>nearbyActor(position,actor));
  const warning=(drill?.warningSeconds??0)>0;
  if(!warning&&recipe.reaction==='charge'&&nearby.some(actor=>actor.state==='warning'&&actor.telegraph))return {
    tone:'warning',title:'CHARGE DIRECTION LOCKED',detail:'A nearby charge has committed to the marked line. Steer clear before it launches.',
    controls:steer('Dodge the marked line'),
  };
  if(!warning&&recipe.reaction==='charge'&&nearby.some(actor=>actor.state==='charging'))return {
    tone:'danger',title:'CHARGE NEARBY',detail:'The charge keeps its direction. Steer clear of its path and body.',
    controls:steer('Clear the charging body'),
  };
  if(!warning&&recipe.modifier==='draft'&&actors.some(actor=>actor.state!=='warning'&&actor.wake&&containsCapsule(position,actor.wake)))return {
    tone:'benefit',title:'IN THE WAKE · FASTER FALL',detail:'The cyan wake speeds your descent. Follow it while keeping clear of the body.',
    controls:steer('Stay in the cyan wake'),
  };
  if(!warning&&recipe.reaction==='scatter'&&nearby.some(actor=>actor.state==='scattering'))return {
    tone:'neutral',title:'HERD SCATTERING · FIND THE GAP',detail:'The bodies move apart along fixed paths. Steer through the opening they leave.',
    controls:steer('Aim through the opening'),
  };
  if(!warning&&recipe.reaction==='scatter'&&nearby.some(actor=>actor.state==='warning'&&actor.telegraph))return {
    tone:'warning',title:'HERD ABOUT TO SCATTER',detail:'The marked paths show where nearby bodies will move. Wait for an opening and steer through it.',
    controls:steer('Keep clear of the marked paths'),
  };
  const action:Record<typeof recipe.reaction,Pick<EffectFeedback,'title'|'detail'|'controls'>>={
    charge:{title:'BAIT A CHARGE · THEN DODGE',detail:'Approaching a body starts its warning. Once its direction is marked, steer off that line.',controls:steer('Dodge after the warning')},
    scatter:{title:'APPROACH · OPEN A GAP',detail:'Nearby bodies warn, then scatter away. Avoid the bodies and follow the opening.',controls:steer('Find the gap between bodies')},
    steady:recipe.modifier==='draft'
      ?{title:'FOLLOW THE CYAN WAKES',detail:'Cyan wakes speed your descent. The bodies still knock you away, so leave space.',controls:steer('Aim for a wake, clear of the body')}
      :recipe.formation==='convoy'
        ?{title:'CONVOY · KEEP CLEAR OF THE BODIES',detail:'The convoy descends together. Steer around its bodies to avoid being knocked away.',controls:steer('Pass between the convoy bodies')}
        :{title:'CROSSING HERD · FIND A GAP',detail:'Bodies cross the course and knock you away on contact. Steer through the spaces between them.',controls:steer('Aim between the bodies')},
  };
  return {tone:warning?'warning':'neutral',...action[recipe.reaction]};
}

function rapidsFeedback(recipe:Extract<SafetyDrillRecipe,{family:'rapids'}>,drill:DrillSnapshot|undefined,position:EventVector):EffectFeedback {
  const warning=(drill?.warningSeconds??0)>0;
  // Match the runtime's single winning capsule, including overlap and id priority.
  const current=drill?.currents.filter(current=>containsCapsule(position,current))
    .sort((a,b)=>currentPriority[a.kind]-currentPriority[b.kind]||a.id-b.id)[0];
  if(!warning&&current&&current.strength>0) {
    const cues:Record<DrillCurrent['kind'],EffectFeedback>={
      eddy:{tone:'warning',title:'IN AN EDDY · SLOWER FALL',detail:'This green pocket pushes upward. Steer into the flowing current to resume a faster descent.',controls:steer('Leave the green eddy')},
      fast:{tone:'benefit',title:'IN THE FAST CURRENT',detail:'This narrow current accelerates you along its path. Follow the bend to stay in it.',controls:steer('Follow the narrow current')},
      flow:{tone:'benefit',title:'RIDING THE CURRENT',detail:'The current pushes you along its path. Steer with the bend to stay in the flow.',controls:steer('Follow the current')},
    };
    return cues[current.kind];
  }
  return {tone:warning?'warning':'neutral',title:recipe.layout==='forked'?'WIDE FLOW OR FAST SHORTCUT':'ENTER THE FLOWING CURRENT',
    detail:(recipe.layout==='forked'?'The narrow branch pushes faster. Steer along your chosen current.':'Steer into the current and follow its bends.')
      +(recipe.modifier==='eddies'?' Green eddies slow your fall.':recipe.flow==='pulsing'?' Its push rises and falls in pulses.':''),
    controls:steer('Aim into the flowing current')};
}

function v4Feedback(recipe:SafetyDrillRecipe,event:RaceEventSnapshot,position:EventVector,racerId:string):EffectFeedback|null {
  const drill=event.drill,warning=(drill?.warningSeconds??0)>0;
  switch(recipe.family) {
    case 'stampede': return stampedeFeedback(recipe,drill,position);
    case 'rapids': return rapidsFeedback(recipe,drill,position);
    case 'pinball': return {
      tone:warning?'warning':'neutral',title:warning?'BUMPERS INCOMING · AIM YOUR CONTACT':'AIM THE BOUNCE · STEER TO RECOVER',
      detail:recipe.bounce==='springy'?'Bumper contact launches you outward. Aim an edge for a sideways bounce, then steer toward open space.':'Bumpers redirect your approach. Aim your contact, then steer toward open space after a rebound.',
      controls:steer('Aim your contact or take a gap'),
    };
    case 'buddy': {
      const tether=drill?.tethers?.find(tether=>tether.racerIds.includes(racerId));
      if(!tether)return {tone:'neutral',title:'NO BUDDY TETHER ON YOU',detail:'Other paired racers are linked. Keep racing; there is no tether pulling you.',controls:steer('Steer freely')};
      if(warning)return {tone:'warning',title:'BUDDY LINK INCOMING',detail:'The line shows your paired racer. Stay close across the course to keep the tether from pulling.',controls:steer('Stay near your buddy')};
      if(tether.active&&tether.tension>0)return {
        tone:'warning',title:'TETHER PULLING · CLOSE THE GAP',detail:'The line pulls you toward your buddy across the course. Steer toward them to reduce the stretch.',
        meter:{label:'TETHER PULL',value:clampFraction(tether.tension)},controls:steer('Move toward your buddy'),
      };
      return {tone:'neutral',title:tether.active?'BUDDY LINK · NO PULL':'BUDDY LINK · SLACK PHASE',
        detail:tether.active?'The tether is not pulling now. Keep close across the course so it stays loose.':'The tether is resting between pulses. Close the gap before it tightens.',
        controls:steer('Stay near your buddy')};
    }
    case 'orbit': {
      const field=drill?.orbits?.find(field=>field.active
        &&Math.hypot(position[0]-field.position[0],position[2]-field.position[2])<=field.radius
        &&Math.abs(position[1]-field.position[1])<=field.height/2);
      // Field membership is visible; a racer's capture/release state is not in this snapshot.
      return {tone:warning||field?'warning':'neutral',title:field?'INSIDE THE ORBIT FIELD':'ORBIT FIELD · PLAN YOUR EXIT',
        detail:field?'If the orbit pulls you around, steer outward to escape. A capture also releases automatically after a short orbit.':'The ring marks a field that can bend your route. Steer outside it, or enter and steer outward to escape.',
        controls:steer('Steer outward to leave the ring')};
    }
    case 'reconstruction': {
      const ahead=drill?.actors.filter(actor=>echoAhead(position,actor))??[];
      const forming=ahead.some(actor=>actor.state==='warning');
      return {tone:warning||forming?'warning':'neutral',title:forming?'COPIES FORMING AHEAD · CHANGE LANES':ahead.length?'COPIES AHEAD · DODGE THE TRAIL':'RECENT PATHS BECOME OBSTACLES',
        detail:forming?'Warning copies are harmless until they solidify. Change lanes before reaching them; placed copies stay fixed.':
          'Copies of '+(recipe.pattern==='mirror'?'mirrored ':'')+'recent paths appear farther down the course. Steer around the marked copies; they stay fixed after placement.',
        controls:steer('Dodge the copies ahead')};
    }
    case 'observation': {
      const cue=observationFeedback(event,racerId);
      if(!cue)return null;
      const tone:Record<typeof cue.state,EffectFeedback['tone']>={warning:'warning',clear:'neutral',resting:'benefit',watched:'warning',moving:'danger',penalty:'danger',protected:'benefit'};
      const release=cue.watching||cue.state==='warning';
      return {tone:tone[cue.state],title:cue.title,detail:cue.detail,
        ...((cue.state==='moving'||cue.state==='watched')?{meter:{
          label:cue.state==='moving'?'SIDEWAYS MOVEMENT · PENALTY BUILDING':'STRAIGHT FALL · NO PENALTY',
          value:clampFraction(cue.exposureFraction)}}:{}),
        controls:release?{action:'release-steering',detail:'Fall straight · let drift settle'}:steer('Steer in blue or outside cones')};
    }
    default: {const unsupported:never=recipe;throw new Error('Unsupported safety drill: '+unsupported);}
  }
}

function v3Feedback(effect:RaceEventEffect,event:RaceEventSnapshot,position:EventVector):EffectFeedback {
  const distance=length(subtract(position,event.position));
  switch(effect.type) {
    case 'gravityWell': return distance<effect.radiusMeters
      ?{tone:'warning',title:'VORTEX BENDING YOUR ROUTE',detail:'The vortex pulls sideways into a broad orbit. Keep steering toward open lanes as you fall.',controls:steer('Steer toward open lanes')}
      :{tone:'neutral',title:'OUTSIDE THE VORTEX',detail:'Entering the field bends your route into an orbit. Keep clear or prepare to steer through the pull.',controls:steer('Watch the field boundary')};
    case 'protectiveZone': return distance<=effect.radiusMeters
      ?{tone:'benefit',title:'IN THE SAFE SLIPSTREAM',detail:(effect.descentAcceleration>0?'Obstacle protection and faster descent are':'Obstacle protection is')+' active here. Weapons still work; steer toward your next pickup.',controls:steer('Stay in the field for protection')}
      :{tone:'neutral',title:'ENTER THE SAFE SLIPSTREAM',detail:'The field blocks obstacle hits while you are inside. Steer into it to gain protection; weapons still work.',controls:steer('Aim into the protective field')};
    case 'repulsionBurst': return {
      tone:'warning',title:'SHOCKWAVE · STEER TO RECOVER',detail:'The expanding wave pushes each racer outward once. If it reaches you, steer back toward an open lane.',controls:steer('Correct sideways drift')};
    case 'debrisShower': {
      const incoming=event.debris.some(particle=>particle.collidable&&particle.position[1]>=position[1]
        &&particle.position[1]-position[1]<=SAFETY_DRILL_LIMITS.approachRadius
        &&Math.hypot(position[0]-particle.position[0],position[2]-particle.position[2])<=RACE_EVENT_LIMITS.debrisRadius+RACE_EVENT_LIMITS.racerRadius+4);
      return {tone:incoming?'danger':'warning',title:incoming?'ROCKS OVERHEAD · CHANGE LANES':'DEBRIS WAVES · KEEP DODGING',
        detail:'Large rocks keep their launch direction. Change lanes to dodge; small fragments are harmless.',controls:steer('Dodge the large rocks')};
    }
    default: {const unsupported:never=effect;throw new Error('Unsupported race event: '+unsupported);}
  }
}

/** Read-only guidance: no timing, movement writes, or claims based on cumulative impacts. */
export function effectFeedback(event:RaceEventSnapshot,position:EventVector,racerId='0'):EffectFeedback|null {
  if(event.phase!=='active'||!event.instance)return null;
  const spec=event.instance.spec;
  return spec.version===4?v4Feedback(spec.drill,event,position,racerId):v3Feedback(spec.effect,event,position);
}
