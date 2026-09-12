import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlaygroundPage } from './pages/PlaygroundPage';
import { GamePage } from './pages/GamePage';
import './styles.css';
function App(){
  const [page,setPage]=useState<'lab'|'game'>('lab');
  return <><header><a className="brand" href="/">↘ SKYFALL<span> / DEVELOPMENT LAB</span></a><nav><button className={page==='lab'?'active':''} onClick={()=>setPage('lab')}>Playground</button><button className={page==='game'?'active':''} onClick={()=>setPage('game')}>Game</button></nav><span className="badge">● MOCK MODE</span></header>{page==='lab'?<PlaygroundPage/>:<GamePage/>}</>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
