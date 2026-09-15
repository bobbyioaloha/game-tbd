import type { Item } from './race-course';
import type { initialRaceHud } from './RaceScene';

function ItemIcon({item}:{item:Item|null}){
  return <svg viewBox="0 0 64 64" aria-hidden="true">
    {item==='parachute'?<g stroke="#ddd4b5" strokeWidth="2.5" strokeLinejoin="round">
      <path d="m10 28 16 25h12l16-25M23 29l6 24m12-24-6 24" fill="none"/>
      <path fill="#d8d2b9" d="M7 29C8 14 18 7 32 7s24 7 25 22l-10-3-10 3-10-3-10 3Z"/>
      <path fill="#be9d42" stroke="none" d="M32 8c-9 4-13 10-15 21l10-3c0-8 1-13 5-18m0 0c9 4 13 10 15 18l-10 3c0-11-1-16-5-21"/>
      <rect x="25" y="51" width="14" height="9" rx="1" fill="#a78b48"/>
      <path d="M29 52v7m6-7v7" stroke="#394a48"/>
    </g>:item==='bubbleWrap'?<g stroke="#cbd9d1" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M17 13h35v39H17" fill="#a9c3c1"/>
      <ellipse cx="17" cy="32" rx="10" ry="21" fill="#dae5dc"/>
      <ellipse cx="17" cy="32" rx="4" ry="11" fill="#405953"/>
      {[23,33,43].flatMap(x=>[20,31,42].map(y=><circle key={x+','+y} cx={x+3} cy={y} r="3.3" fill="#e6eee3" strokeWidth="1"/>))}
      <path d="M49 13h7v39h-7" fill="#bba55f" stroke="none"/>
    </g>:item==='airCanister'?<g stroke="#3c4c48" strokeWidth="2.5" strokeLinejoin="round">
      <path d="M27 11h10v8H27Z" fill="#929d8a"/>
      <path d="M23 9h18M32 5v8" fill="none" stroke="#bc6b51" strokeWidth="4"/>
      <path d="M18 23q0-7 14-7t14 7v29q0 7-14 7t-14-7Z" fill="#c5ad50"/>
      <path d="M18 26h28M18 49h28" fill="none" strokeWidth="4"/>
      <rect x="25" y="31" width="14" height="13" rx="1" fill="#e2dcc2" stroke="none"/>
      <path d="m28 39 4-5 4 5m-4-5v8" fill="none" strokeWidth="2"/>
      <circle cx="45" cy="18" r="7" fill="#e6e2cc"/><path d="m45 18 3-3" strokeWidth="2"/>
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
    {!paused&&!hud.feedback&&hud.itemKey==='parachute'&&hud.finish===null&&<div className="aim-hint">{selected?<>{selected.locked?'LOCKED':'ACQUIRING'} · {selected.name}<br/>{selected.locked?useKey+' · Launch parachute':'Keep the rival near the middle'}</>:<>Bring a rival near the middle to lock · {useKey} launches straight without a lock</>}</div>}
    {hud.finish===null&&<div className={'play-item '+(hud.itemKey?'loaded':'')} aria-label={'Held item: '+hud.item}>
      <ItemIcon item={hud.itemKey}/><div><small>HELD ITEM</small><strong>{hud.item}</strong><span>{hud.itemKey?<><kbd className="hud-key">{useKey}</kbd>{hud.itemKey==='parachute'?(hud.look?'Launch upward':'Launch downward'):hud.itemKey==='bubbleWrap'?'Wrap for protection':'Release emergency air'}</>:'Collect a striped box'}</span></div>
    </div>}
    {!paused&&hud.feedback&&<div className="race-feedback" role="status" key={hud.feedback}>{hud.feedback}</div>}
    </div>
    {hud.finish===null&&<div className="flight-tools">
      <div className="safety-label">BOOST & DODGE</div><label><kbd className="hud-key">{boostKey}</kbd> BOOST<progress aria-label="Boost fuel" value={hud.fuel} max={4}/></label>
      <span>{hud.fuel.toFixed(1)} / 4.0 s {hud.boost?' · BOOSTING':''}</span>
      <strong><kbd className="hud-key">{dodgeKey}</kbd>{hud.dodgeCooldown>0?'DODGE '+hud.dodgeCooldown.toFixed(1)+'s':'DODGE READY'}</strong>
    </div>}
    {!paused&&hud.threat&&<div role="status" className={'threat-warning '+(hud.threat==='PARACHUTE INCOMING'?'incoming':'')}>
      <span className="threat-arrow" style={{transform:'rotate('+hud.threatAngle+'deg)'}}>↑</span>
      <div><strong>{hud.threat}</strong><small>{hud.threatDistance} · {hud.dodgeCooldown>0?'Dodge ready in '+hud.dodgeCooldown.toFixed(1)+'s':dodgeKey+' · DODGE TO EVADE'}</small></div>
    </div>}
  </>;
}
