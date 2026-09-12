import { useState } from 'react';
import { raceEventFixtures, raceEventPreset, type RaceEventCreation } from '@sky/shared';
import { EventSandbox } from './EventSandbox';
import { EventGenerationControls } from './EventGenerationControls';
import './events.css';
export function EventLabPage() {
  const [spec,setSpec]=useState<RaceEventCreation>(raceEventFixtures[0].spec);
  const [busy,setBusy]=useState(false),[fixturePrompt,setFixturePrompt]=useState(raceEventFixtures[0].prompt);
  const [revision,setRevision]=useState(0);
  const load=(creation:RaceEventCreation)=>{setSpec(creation);setRevision(value=>value+1);};
  return <main className="lab event-lab">
    <span className="eyebrow">SHARED RACE EVENTS / ISOLATED SANDBOX</span>
    <h1>One creation. Everyone reacts.</h1>
    <p>Any racer can trigger the object. Explore four world effects with local fixtures or a generated creation.</p>
    <div className="event-fixtures" aria-label="Local event fixtures">{raceEventFixtures.map(fixture=><button key={fixture.spec.id}
      aria-pressed={spec.id===fixture.spec.id} disabled={busy} onClick={()=>{setFixturePrompt(fixture.prompt);load(fixture.spec);}}>
      <strong>{raceEventPreset(fixture.spec.effect.type).label}</strong><span>{fixture.spec.displayName}</span>
    </button>)}</div>
    <div className="event-layout">
      <EventSandbox key={revision} spec={spec}/>
      <EventGenerationControls onCreation={load} onBusy={setBusy} fixturePrompt={fixturePrompt}/>
    </div>
    <details className="json-inspector"><summary>Inspect validated event creation</summary><pre>{JSON.stringify(spec,null,2)}</pre></details>
    <p className="event-integration-note">This sandbox uses the reusable event runtime. The main race keeps its current gameplay until its movement adapter is connected.</p>
  </main>;
}
