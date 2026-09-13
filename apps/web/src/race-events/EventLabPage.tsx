import { useState } from 'react';
import { safetyDrillFixtures, raceEventFixtures, encounterLabel, type RaceEncounter } from '@sky/shared';
import { EventSandbox } from './EventSandbox';
import { EventGenerationControls } from './EventGenerationControls';
import './events.css';

export function EventLabPage() {
  const [spec,setSpec]=useState<RaceEncounter>(safetyDrillFixtures[0].spec);
  const [busy,setBusy]=useState(false),[fixturePrompt,setFixturePrompt]=useState(safetyDrillFixtures[0].prompt);
  const [revision,setRevision]=useState(0);
  const load=(creation:RaceEncounter)=>{setSpec(creation);setRevision(value=>value+1);};
  return <main className="lab event-lab">
    <span className="eyebrow">SAFETY DEPARTMENT / DRILL REHEARSAL</span>
    <h1>Report a hazard. Reproduce the concern.</h1>
    <p>Try three identical hippos with different behavior, then compare a herd with a river. Local fixtures and replay are free; everyone faces the same drill.</p>
    <div className="event-fixtures" aria-label="Local safety drill fixtures">{safetyDrillFixtures.map(fixture=><button key={fixture.spec.id}
      aria-pressed={spec.id===fixture.spec.id} disabled={busy} onClick={()=>{setFixturePrompt(fixture.prompt);load(fixture.spec);}}>
      <strong>{fixture.spec.displayName}</strong><span>{fixture.spec.description}</span>
    </button>)}</div>
    <details className="event-legacy"><summary>Legacy event fixtures (v3 regression)</summary>
      <div className="event-fixtures" aria-label="Legacy event fixtures">{raceEventFixtures.map(fixture=><button key={fixture.spec.id}
        aria-pressed={spec.id===fixture.spec.id} disabled={busy} onClick={()=>load(fixture.spec)}>
        <strong>{encounterLabel(fixture.spec)}</strong><span>{fixture.spec.displayName}</span>
      </button>)}</div>
    </details>
    <div className="event-layout">
      <EventSandbox key={revision} spec={spec}/>
      <EventGenerationControls onCreation={load} onBusy={setBusy} fixturePrompt={fixturePrompt}/>
    </div>
    <details className="json-inspector"><summary>Inspect validated creation and behavior recipe</summary><pre>{JSON.stringify(spec,null,2)}</pre></details>
    <p className="event-integration-note">This rehearsal uses the main race's event runtime with scripted racers. Its controls never move the racers in the actual game.</p>
  </main>;
}
