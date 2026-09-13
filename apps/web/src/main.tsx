import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const GamePage = lazy(() => import('./pages/GamePage').then(module => ({default: module.GamePage})));
const GenerationLabPage = lazy(() => import('./pages/GenerationLabPage').then(module => ({default: module.GenerationLabPage})));

function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const lab = route === '#/dev/generation';
  return <>
    {lab && <header className="developer-header">
      <a className="brand" href="#/">↘ SKYFALL<span> / DEVELOPMENT LAB</span></a>
      <nav aria-label="Developer navigation"><a href="#/">Play game</a><a href="#/dev/generation" aria-current="page">Generation lab</a></nav>
      <span className="badge">● DEVELOPMENT</span>
    </header>}
    <Suspense key={lab ? 'lab' : 'game'} fallback={<p className="page-loading" role="status">Loading {lab ? 'generation lab' : 'game'}…</p>}>
      {lab ? <GenerationLabPage/> : <GamePage/>}
    </Suspense>
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
