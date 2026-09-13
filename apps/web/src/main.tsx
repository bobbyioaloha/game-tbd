import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import './styles.css';

const GamePage = lazy(() => import('./pages/GamePage').then(module => ({default: module.GamePage})));
const GenerationLabPage = import.meta.env.DEV
  ? lazy(() => import('./pages/GenerationLabPage').then(module => ({default: module.GenerationLabPage})))
  : null;

function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const lab = import.meta.env.DEV && route === '#/dev/generation';
  return <>
    {lab && <header className="developer-header">
      <a className="brand" href="#/">↘ FALLING STANDARDS<span> / DEVELOPMENT LAB</span></a>
      <nav aria-label="Developer navigation"><a href="#/">Play game</a><a href="#/dev/generation" aria-current="page">Generation lab</a></nav>
      <span className="badge">● DEVELOPMENT</span>
    </header>}
    <Suspense key={lab ? 'lab' : 'game'} fallback={<p className="page-loading" role="status">Loading {lab ? 'generation lab' : 'game'}…</p>}>
      {lab && GenerationLabPage ? <GenerationLabPage/> : <GamePage/>}
    </Suspense>
    <Analytics mode={import.meta.env.DEV ? 'development' : 'production'}/>
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
