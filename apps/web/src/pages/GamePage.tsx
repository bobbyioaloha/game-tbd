import { useState } from 'react';
import { MovementTest } from '../game/MovementTest';
import { CreationDemoPage } from './CreationDemoPage';

export function GamePage() {
  const [view, setView] = useState<'movement' | 'creation'>('movement');
  return <>
    <div className="game-test-tabs" aria-label="Game test views">
      <button aria-pressed={view === 'movement'} onClick={() => setView('movement')}>Movement test</button>
      <button aria-pressed={view === 'creation'} onClick={() => setView('creation')}>Voice / creation demo</button>
    </div>
    {view === 'movement' ? <MovementTest/> : <CreationDemoPage/>}
  </>;
}