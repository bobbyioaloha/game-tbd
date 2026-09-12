import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { GamePage } from './pages/GamePage';
import { GenerationLabPage } from './pages/GenerationLabPage';
import './styles.css';
function App() {
  const [page,setPage] = useState<'lab'|'game'|'generation'>('generation');
  return <><header><a className="brand" href="/">↘ SKYFALL<span> / DEVELOPMENT LAB</span></a><nav>
    <button className={page==='generation'?'active':''} onClick={()=>setPage('generation')}>Generation lab</button>
    <button className={page==='lab'?'active':''} onClick={()=>setPage('lab')}>Fixtures</button>
    <button className={page==='game'?'active':''} onClick={()=>setPage('game')}>Game</button>
  </nav><span className="badge">● MOCK PROVIDERS</span></header>
    {page==='generation' ? <GenerationLabPage/> : page==='lab' ? <PlaygroundPage/> : <GamePage/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
