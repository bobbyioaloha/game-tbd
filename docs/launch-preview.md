# Blender launch screen

The main launch screen uses the approved Blender scene inspired by `apps/web/public/images/falling-standards.png`, with the tagline **Short arms. Long incident reports**. The original image is retained unchanged and remains available through the development preview's Reference control.

Run the ordinary mock development server from the repository root:

```sh
bun run dev
```

Open [the game](http://127.0.0.1:5173/#/) for the integrated launch screen. **Commence Training** sits over an extension of the landscape below the approved character composition. The camera reserves 104 screen pixels for that action, so resizing keeps Greg and the landing platform above it. Music and Training essentials remain available beneath the scene. Launch motion is subtle, respects reduced-motion preferences, and stops in hidden tabs; leaving the title unmounts its renderer.

The shared renderer is [LaunchArtwork](../apps/web/src/launch/LaunchArtwork.tsx), and [LaunchScreen](../apps/web/src/launch/LaunchScreen.tsx) supplies the action and existing menu controls. [Camera framing](../apps/web/src/launch/launch-framing.ts) fits the artwork above the action dock without changing character proportions.

[The interactive study](http://127.0.0.1:5173/#/dev/launch) remains development-only; its inspection toolbar is omitted from production builds. The shared renderer and its public assets are included in production.

- **Artwork view** returns to the authored composition and turns motion off.
- Drag the artwork or use arrow keys while it is focused to inspect the depth. Orbit is limited to 15 degrees in either direction.
- **Reference** shows the original illustration at the same aspect ratio.
- **Motion** enables small drifting movements and pointer parallax. The default is a still composition; system reduced-motion preferences disable this option.
- The updated Blender still, `apps/web/public/images/launch-scene.png`, is the loading and WebGL/asset-error fallback. The training button remains usable while the scene loads or if 3D is unavailable.

## Editable source and rebuilding

Open [the Blender scene](../art/launch-preview.blend) to inspect or edit the composition. Its images and fonts are packed. [The rendered still](../art/launch-preview.png) uses the same authored camera.

The reproducible source is [scripts/build-launch-preview.py](../scripts/build-launch-preview.py), with [title geometry](../scripts/launch-preview/title.py), [dinosaur poses](../scripts/launch-preview/dinosaurs.py), and [the Linda clipboard grip](../scripts/launch-preview/linda.py). The title is actual extruded, beveled mesh geometry with colored facets; props are modeled geometry. Sky and clouds use procedural textures placed at different depths. Greg uses an upright pose and uniform scale without vertical flattening. Susan and Steve face the authored finish marker, with their baked snout directions aimed from the eyes at its position while rotating around the neck joints. Steve uses a uniform height limit to keep his receding pose proportional in the composition. Linda uses a three-quarter back view and dedicated bent forearms, small palms, and three short digits with tapered dark claws gripping each edge of the clipboard. These character adaptations exist only in the launch artwork; the gameplay models and their builder are unchanged. The original PNG is used by the comparison UI, never as a texture on the 3D artwork. A separate terrain and forest extension supplies the lower landscape without changing the reviewed character poses or existing environment.

From the repository root, using Blender 5.2 (the version used for this study):

```sh
blender --background --factory-startup --python scripts/build-launch-preview.py -- --render
```

The builder writes:

- `art/launch-preview.blend` — editable, packed Blender scene.
- `art/launch-preview.png` — rendered reference-camera still (with `--render`).
- `apps/web/public/models/launch-preview.glb` — self-contained browser asset.
- `apps/web/public/images/launch-scene.png` — copy of the rendered still for browser loading/fallback (with `--render`).

On Windows, Blender may be invoked by its full executable path. For a WSL checkout, pass the script's `\\wsl.localhost\Ubuntu-24.04\home\elizabeth\game-tbd\scripts\build-launch-preview.py` path to Windows Blender. Repository build/typecheck/test commands still run inside WSL.

The camera is orthographic, matching the illustration's 1670 × 942 frame: Blender X runs right, Z runs up, and the camera sits at `(0, -32, 0)`. The GLB exporter converts that to the browser's Y-up coordinates. The composition fits a 32-unit width. The background intentionally uses shallow layers suitable for the bounded inspection orbit.

The study preserves the reference's title hierarchy, palette, cast, office props, and approximate layout. Dinosaur anatomy follows the existing game assets, so it is a 3D interpretation rather than a pixel-identical reconstruction of the illustration.
