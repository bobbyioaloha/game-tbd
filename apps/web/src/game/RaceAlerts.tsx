import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const AlertTarget = createContext<HTMLElement | null>(null);
const AlertMount = createContext<(element: HTMLDivElement | null) => void>(() => {});

export function RaceAlertProvider({children}: {children: ReactNode}) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <AlertMount.Provider value={setTarget}><AlertTarget.Provider value={target}>{children}</AlertTarget.Provider></AlertMount.Provider>;
}

export function RaceAlertDock() {
  const mount = useContext(AlertMount);
  return <div ref={mount} className="race-alert-dock" aria-label="Race alerts" role="region" tabIndex={0}/>;
}

/** Screen messages share a bottom dock; world-space markers stay in the scene. */
export function RaceAlert({children}: {children: ReactNode}) {
  const target = useContext(AlertTarget);
  return target ? createPortal(children, target) : null;
}
