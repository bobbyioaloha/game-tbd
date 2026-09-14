import type { Item } from './race-course';
import type { initialRaceHud } from './RaceScene';

function ItemIcon({item}:{item:Item|null}){
  return <svg viewBox="0 0 64 64" aria-hidden="true">
    {item==='umbrella'?<g fill="none" stroke="#caa9ff" strokeWidth="4" strokeLinecap="round">
      <path fill="#b99aff" d="M8 30a24 24 0 0 1 48 0c-5-4-9-4-14 0-6-4-13-4-20 0-5-4-9-4-14 0Z"/>
      <path d="M32 30v19q0 10 10 6M16 33v12m32-12v12M23 34v17"/>
    </g>:item==='cloak'?<g>
      <path fill="#e2f6ff" stroke="#b79bff" strokeWidth="3" d="M13 53V27a19 19 0 0 1 38 0v26l-10-6-9 7-9-7Z"/>
      <ellipse cx="25" cy="28" rx="4" ry="6" fill="#253851"/><ellipse cx="39" cy="28" rx="4" ry="6" fill="#253851"/>
    </g>:item==='sun'?<g stroke="#ffb336" strokeWidth="4" strokeLinecap="round">
      {Array.from({length:8},(_,i)=><path key={i} transform={'rotate('+i*45+' 32 32)'} d="M32 3v7"/>)}
      <circle cx="32" cy="32" r="18" fill="#ffbd38"/><path stroke="#593548" d="m21 26 8 3m14-3-8 3M26 41q6-7 12 0"/>
    </g>:<g fill="none" stroke="#6a859d" strokeWidth="3"><rect x="12" y="12" width="40" height="40" rx="9" strokeDasharray="5 5"/><path d="M23 32h18"/></g>}
  </svg>;
}
export function RaceOverlay({hud,paused,useKey,boostKey,dodgeKey}:{hud:typeof initialRaceHud;paused:boolean;useKey:string;boostKey:string;dodgeKey:string}){
  const selected=hud.markers.find(marker=>marker.selected);
  return <>
    <div className="incident-counter"><span className="safety-label">SAFETY RECORD</span>INCIDENTS <strong>{hud.incidents}</strong></div>
    <div className="race-tracker" aria-label="Race progress and standings">
      <strong>PERSONNEL IN TRANSIT ↓</strong>
      <div className="race-tracker-course" aria-hidden="true">
        <span className="tracker-start">START</span><span className="tracker-finish">FINISH</span>
        {[...hud.standings].sort((a,b)=>a.id-b.id).map(racer=><div key={racer.id} className="tracker-marker" style={{top:(racer.progress*100)+'%'}}>
          <span className={'tracker-dot '+(racer.id===0?'you':'')} style={{left:(10+racer.id*13)+'px',background:racer.color}}/>{racer.id===0&&<span className="tracker-you">YOU →</span>}
        </div>)}
      </div>
      <ol>{hud.standings.map(racer=><li key={racer.id} className={racer.id===0?'you':''}>
        <span style={{color:racer.color}}>{racer.place}. {racer.name}</span>
        <small>{racer.finished?'FIN':racer.id===0?'YOU':Math.abs(racer.gap)<1?'Level':Math.round(Math.abs(racer.gap))+'m '+(racer.gap>0?'ahead':'back')}</small>
      </li>)}</ol>
    </div>
    {!paused&&hud.finish===null&&<svg className={'speed-lines '+(hud.boost?'boosting':'')} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      style={{opacity:Math.max(0,Math.min(0.85,(hud.speed-8)/65+(hud.boost?0.25:0)))}}>
      {Array.from({length:32},(_,i)=>{
        const a=i*Math.PI/16,inner=35+(i%3)*3;
        return <line key={i} x1={50+Math.cos(a)*inner} y1={50+Math.sin(a)*inner} x2={50+Math.cos(a)*75} y2={50+Math.sin(a)*75}
          style={{animationDelay:(i%7)*-0.11+'s',animationDuration:(hud.boost?0.3:0.7)+'s'}}/>;
      })}
    </svg>}
    {!paused&&hud.markers.map(marker=><div key={marker.id} className={'jet-target '+(marker.selected?'selected ':'')+(marker.locked?'locked':'')}
      style={{left:marker.left+'%',top:marker.top+'%',color:marker.selected?(marker.locked?'#8cff9a':'#ffe175'):marker.color}}>
      {marker.edge?<span className="jet-edge" style={{transform:'rotate('+marker.angle+'deg)'}}>↑</span>:<svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M3 15V3h12m18 0h12v12m0 18v12H33m-18 0H3V33" fill="none" stroke="currentColor" strokeWidth="2"/>
        {marker.selected&&<circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={(marker.progress*126)+' 126'} transform="rotate(-90 24 24)"/>}
      </svg>}
      {marker.selected&&<div className={'jet-label '+(marker.left>65?'on-left':'')}><strong>{marker.locked?'LOCKED':'ACQUIRING'} · {marker.name}</strong><small>{marker.gap}</small></div>}
    </div>)}
    <div className="item-hud">
    {!paused&&!hud.feedback&&hud.itemKey==='umbrella'&&hud.finish===null&&<div className="aim-hint">{selected?<>{selected.locked?'LOCKED':'ACQUIRING'} · {selected.name}<br/>{selected.locked?useKey+' · Fire missile':'Keep the rival near the middle'}</>:<>Bring a rival near the middle to lock · {useKey} fires straight without a lock</>}</div>}
    {hud.finish===null&&<div className={'play-item '+(hud.itemKey?'loaded':'')} aria-label={'Held item: '+hud.item}>
      <ItemIcon item={hud.itemKey}/><div><small>HELD ITEM</small><strong>{hud.item}</strong><span>{hud.itemKey?<><kbd className="hud-key">{useKey}</kbd>{hud.itemKey==='umbrella'?(hud.look?'Fire upward':'Fire downward'):'Use item'}</>:'Collect a striped box'}</span></div>
    </div>}
    {!paused&&hud.feedback&&<div className="race-feedback" role="status" key={hud.feedback}>{hud.feedback}</div>}
    </div>
    {hud.finish===null&&<div className="flight-tools">
      <div className="safety-label">BOOST & DODGE</div><label><kbd className="hud-key">{boostKey}</kbd> BOOST<progress aria-label="Boost fuel" value={hud.fuel} max={4}/></label>
      <span>{hud.fuel.toFixed(1)} / 4.0 s {hud.boost?' · BOOSTING':''}</span>
      <strong><kbd className="hud-key">{dodgeKey}</kbd>{hud.dodgeCooldown>0?'DODGE '+hud.dodgeCooldown.toFixed(1)+'s':'DODGE READY'}</strong>
    </div>}
    {!paused&&hud.threat&&<div role="status" className={'threat-warning '+(hud.threat==='MISSILE INCOMING'?'incoming':'')}>
      <span className="threat-arrow" style={{transform:'rotate('+hud.threatAngle+'deg)'}}>↑</span>
      <div><strong>{hud.threat}</strong><small>{hud.threatDistance} · {hud.dodgeCooldown>0?'Dodge ready in '+hud.dodgeCooldown.toFixed(1)+'s':dodgeKey+' · DODGE TO EVADE'}</small></div>
    </div>}
  </>;
}
