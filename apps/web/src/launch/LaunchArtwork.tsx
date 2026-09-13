import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Mesh, OrthographicCamera, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { launchFrustum } from './launch-framing';
import './launch-artwork.css';

export const ORIGINAL_ARTWORK = '/images/falling-standards.png';
export const LAUNCH_STILL = '/images/launch-scene.png';
export const ARTWORK_DESCRIPTION = 'Falling Standards. Short arms. Long incident reports. Four dinosaur trainees skydive past a refrigerator and sofa toward a forest landing target.';
const ORIGINAL_DESCRIPTION = 'Falling Standards. Your continued existence is mandatory. Four dinosaur trainees skydive past a refrigerator and sofa toward a forest landing target.';
type Framing = 'reference' | 'launch';
type ViewControls = {yaw: number; pitch: number; pointerX: number; pointerY: number; reset: number};
type LaunchArtworkProps = {
  framing?: Framing;
  reservedBottom?: number;
  motion?: boolean;
  reference?: boolean;
  reset?: number;
  onUnavailable?: () => void;
  onReady?: () => void;
};

class SceneBoundary extends Component<{children: ReactNode; onError: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function useArtworkReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

function CameraRig({controls, motion, framing, reservedBottom}: {controls: RefObject<ViewControls>; motion: boolean; framing: Framing; reservedBottom: number}) {
  const {camera, size} = useThree();
  const centerY = useRef(0);
  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return;
    if (framing === 'launch') {
      const bounds = launchFrustum(size.width, size.height, reservedBottom);
      camera.left = bounds.left;
      camera.right = bounds.right;
      // The helper describes world bounds; the camera frustum is relative to
      // its orbit center. Subtracting the center avoids applying it twice.
      camera.top = bounds.top - bounds.centerY;
      camera.bottom = bounds.bottom - bounds.centerY;
      centerY.current = bounds.centerY;
    } else {
      camera.left = -16;
      camera.right = 16;
      camera.top = 16 * size.height / Math.max(1, size.width);
      camera.bottom = -camera.top;
      centerY.current = 0;
    }
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, framing, reservedBottom]);
  useFrame(() => {
    const view = controls.current;
    const limit = (framing === 'launch' ? 3 : 15) * Math.PI / 180;
    const clamp = (value: number) => Math.max(-limit, Math.min(limit, value));
    const yaw = clamp(view.yaw + (motion ? view.pointerX * 0.018 : 0));
    const pitch = clamp(view.pitch + (motion ? view.pointerY * 0.012 : 0));
    camera.position.set(32 * Math.sin(yaw) * Math.cos(pitch), centerY.current + 32 * Math.sin(pitch), 32 * Math.cos(yaw) * Math.cos(pitch));
    camera.up.set(0, 1, 0);
    camera.lookAt(0, centerY.current, 0);
  });
  return null;
}

type FloatingObject = {object: Object3D; y: number; zRotation: number};
function Artwork({motion, controls, onReady}: {motion: boolean; controls: RefObject<ViewControls>; onReady: () => void}) {
  const gltf = useLoader(GLTFLoader, '/models/launch-preview.glb');
  const model = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { if (material.transparent) material.depthWrite = false; });
    });
    return scene;
  }, [gltf]);
  const objects = useMemo(() => ['Greg', 'Linda', 'Steve', 'Susan', 'Refrigerator', 'Sofa', 'Satellite']
    .map(name => model.getObjectByName(name))
    .filter((object): object is Object3D => !!object)
    .map(object => ({object, y: object.position.y, zRotation: object.rotation.z} satisfies FloatingObject)), [model]);
  const elapsed = useRef(0);
  const lastReset = useRef(controls.current.reset);
  const renderedFrames = useRef(0);
  useFrame((_, delta) => {
    // Frame callbacks run before rendering. The second callback means the
    // loaded model has completed one render, so revealing the canvas is safe.
    if (renderedFrames.current < 2) {
      renderedFrames.current++;
      if (renderedFrames.current === 2) onReady();
    }
    if (lastReset.current !== controls.current.reset) {
      elapsed.current = 0;
      lastReset.current = controls.current.reset;
    }
    if (motion) elapsed.current += Math.min(delta, 0.05);
    objects.forEach(({object, y, zRotation}, index) => {
      object.position.y = y + (motion ? Math.sin(elapsed.current * 0.55 + index * 1.2) * 0.065 : 0);
      object.rotation.z = zRotation + (motion ? Math.sin(elapsed.current * 0.4 + index) * 0.009 : 0);
    });
  });
  // Loader-owned geometry and authored materials stay cached when menus change.
  return <primitive object={model} dispose={null}/>;
}

function ContextWatcher({onError}: {onError: () => void}) {
  const {gl} = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onError(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onError]);
  return null;
}

export function LaunchArtwork({framing = 'reference', reservedBottom = 0, motion = false, reference = false, reset = 0, onUnavailable, onReady}: LaunchArtworkProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [webglReady, setWebglReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const reducedMotion = useArtworkReducedMotion();
  const controls = useRef<ViewControls>({yaw: 0, pitch: 0, pointerX: 0, pointerY: 0, reset});
  const drag = useRef<{id: number; x: number; y: number; yaw: number; pitch: number} | null>(null);
  const assetReady = useCallback(() => setReady(true), []);
  const fail = useCallback(() => setFailed(true), []);
  const animate = motion && !reducedMotion;
  const clampOrbit = (angle: number) => {
    const limit = (framing === 'launch' ? 3 : 15) * Math.PI / 180;
    return Math.max(-limit, Math.min(limit, angle));
  };
  useEffect(() => {
    // Canvas fallback children mount even when WebGL succeeds. Probe first,
    // then release the temporary GPU context before creating the real scene.
    let context: WebGL2RenderingContext | null = null;
    try {
      context = document.createElement('canvas').getContext('webgl2');
      if (context) setWebglReady(true);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    controls.current = {yaw: 0, pitch: 0, pointerX: 0, pointerY: 0, reset};
  }, [reset]);
  useEffect(() => { if (failed) onUnavailable?.(); }, [failed, onUnavailable]);
  useEffect(() => { if (ready && !failed) onReady?.(); }, [ready, failed, onReady]);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (reference || failed || !ready || event.button !== 0) return;
    event.currentTarget.focus({preventScroll: true});
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, yaw: controls.current.yaw, pitch: controls.current.pitch};
    controls.current.pointerX = controls.current.pointerY = 0;
    setDragging(true);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (reference || failed || !ready) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (drag.current?.id === event.pointerId) {
      controls.current.yaw = clampOrbit(drag.current.yaw - (event.clientX - drag.current.x) / bounds.width * 0.7);
      controls.current.pitch = clampOrbit(drag.current.pitch + (event.clientY - drag.current.y) / bounds.height * 0.45);
    } else {
      controls.current.pointerX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
      controls.current.pointerY = 1 - (event.clientY - bounds.top) / bounds.height * 2;
    }
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const showStill = reference || failed;
  const loading = !reference && !failed && !ready;

  return <div className={'launch-artwork' + (dragging ? ' is-dragging' : '') + (reference || failed ? ' is-still' : '') + (loading ? ' is-loading' : '')}
    role="group" aria-label={reference ? ORIGINAL_DESCRIPTION : ARTWORK_DESCRIPTION} tabIndex={reference || failed || !ready ? -1 : 0}
    onKeyDown={event => {
      if (reference || failed || !ready || event.altKey || event.ctrlKey || event.metaKey) return;
      const step = Math.PI / 180 * 2;
      if (event.key === 'ArrowLeft') controls.current.yaw = clampOrbit(controls.current.yaw - step);
      else if (event.key === 'ArrowRight') controls.current.yaw = clampOrbit(controls.current.yaw + step);
      else if (event.key === 'ArrowUp') controls.current.pitch = clampOrbit(controls.current.pitch + step);
      else if (event.key === 'ArrowDown') controls.current.pitch = clampOrbit(controls.current.pitch - step);
      else return;
      event.preventDefault();
    }}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}
    onPointerLeave={() => { controls.current.pointerX = controls.current.pointerY = 0; }}>
    {showStill && <img className="launch-artwork-still" style={{height: framing === 'launch' ? 'calc(100% - ' + Math.max(0, reservedBottom) + 'px)' : '100%', objectPosition: framing === 'launch' ? 'center top' : 'center'}}
      src={reference ? ORIGINAL_ARTWORK : LAUNCH_STILL} alt={reference ? ORIGINAL_DESCRIPTION : ARTWORK_DESCRIPTION}/>}
    {!failed && webglReady && <div className="launch-artwork-canvas" style={{visibility: showStill || !ready ? 'hidden' : 'visible'}}>
      <SceneBoundary onError={fail}>
        <Canvas flat orthographic dpr={[1, 1.75]} camera={{position: [0, 0, 32], near: 0.1, far: 300}}
          frameloop={hidden || reference ? 'never' : 'always'} gl={{antialias: true, alpha: false}}
          fallback={<p>Falling Standards launch artwork.</p>}>
          <color attach="background" args={['#58a3ef']}/>
          <ambientLight intensity={0.8} color="#d2e7ff"/>
          <directionalLight position={[12, 15, 20]} intensity={2} color="#fff5db"/>
          <CameraRig controls={controls} motion={animate} framing={framing} reservedBottom={reservedBottom}/>
          <ContextWatcher onError={fail}/>
          <Suspense fallback={null}><Artwork controls={controls} motion={animate} onReady={assetReady}/></Suspense>
        </Canvas>
      </SceneBoundary>
    </div>}
    {loading && <div className="launch-artwork-loading" style={{bottom: framing === 'launch' ? Math.max(0, reservedBottom) : 0}} role="status" aria-live="polite" aria-atomic="true">
      <span className="launch-artwork-spinner" aria-hidden="true"/>
      <span>Loading…</span>
    </div>}
    {!reference && failed && <p className={framing === 'launch' ? 'launch-artwork-sr-status' : 'launch-artwork-status'} role="status">Showing the launch illustration.</p>}
  </div>;
}
