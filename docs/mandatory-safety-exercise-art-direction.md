# Mandatory Safety Exercise

## Art direction and Three.js implementation handoff

**Status:** Design vision, partially implemented. See [the current character guide](dinosaur-art-direction.md) for shipped assets; scene ideas and acceptance targets below are not a feature-completion list.
**Audience:** Artists, animators, and contributors developing the game's visual identity
**Runtime:** Three.js through React Three Fiber  
**Working title:** *Mandatory Safety Exercise*

## One-sentence pitch

Four serious-looking dinosaurs complete a compulsory workplace freefall exercise using visibly inadequate safety equipment while calmly avoiding inspected refrigerators, sofas, satellites, and other airborne hazards.

The tone is a dry institutional training film inside an ambitious early-2000s console game.

## The central joke

The player is a Tyrannosaurus wearing a regulation safety harness whose emergency ripcord is mounted just beyond the reach of its tiny arms. The T. rex understands the problem and keeps trying to perform the procedure correctly. It never smiles, panics, or acknowledges how absurd the design is.

Supporting jokes should reinforce the same premise:

- A triceratops falls upside down while consulting a checklist attached to its harness.
- Every dinosaur wears identical institutional equipment with inspection tags and identification numbers.
- A tumbling refrigerator carries an official `AIRBORNE LOAD - INSPECTED` label.
- The HUD begins at `INCIDENTS  0` and quietly increments after collisions.
- Tiny workers far below drag the landing mat in the same wrong direction.

Use one primary gag and no more than two supporting gags in a view. Empty sky is essential to readability and comic timing.

## Tone and non-goals

Target an adult-friendly party-game tone: dry, physical, competitive, and matter-of-fact. Humor comes from procedural confidence colliding with terrible planning.

Avoid:

- cute mascot faces, large eyes, smiles, and baby proportions;
- frantic cartoon reactions or mugging toward the camera;
- random clutter used as a substitute for a joke;
- grimdark equipment, weapons, injury, or gore;
- photoreal documentary dinosaurs;
- glossy modern mobile-game rendering;
- CRT curvature, scanlines, VHS noise, or other nostalgia overlays.

## Visual pillars

### Credible dinosaurs, aggressively simplified

Each species must be recognizable from silhouette alone. Proportions should feel adult and broadly plausible, but anatomy should be reduced to economical planes suitable for a PS2-era character model. Do not add human hands or expressive eyebrows. Pose and timing carry the performance.

| Racer | Color | Freefall behavior | Comic function |
| --- | --- | --- | --- |
| Tyrannosaurus | Burnt orange | Stable but poor at operating equipment | Cannot reach its own ripcord |
| Triceratops | Slate purple | Tends to invert nose-first | Continues following the checklist |
| Stegosaurus | Oxidized teal | Rolls like an unstable leaf | Corrects continuously without success |
| Parasaurolophus | Mustard | Crest catches crosswinds | Looks controlled until a gust rotates it |

### Bureaucratic equipment

Harnesses should look standardized, inexpensive, and barely adequate - not heroic or tactical. Use charcoal webbing, square metal buckles, white stencil numbers, and small safety-yellow inspection tags. Avoid decorative straps, armor, pouches, and gadgets.

The T. rex ripcord is the most important prop. It must be bright safety yellow, mounted between the shoulder blades, clearly visible from the chase camera, and only a few centimeters beyond the character's reach.

### Authentic PS2-era construction

The target is an ambitious console game from roughly 2003-2005, not pixel art and not modern rendering with a retro filter.

Use:

- visibly faceted low-poly geometry and angular joints;
- small hand-painted diffuse textures;
- vertex or Lambert-style lighting;
- broad baked shadow shapes and limited specular response;
- linear blue distance fog;
- layered cloud cards and low-poly cloud volumes;
- mild color banding or ordered dithering where useful;
- slightly soft internal resolution with clean upscaling.

Avoid PBR microdetail, skin pores, complex normal maps, subsurface scattering, cinematic volumetrics, ray tracing, and deliberately broken PS1-style vertex wobble.

### Vast, uncluttered sky

Most of the frame should remain open sky. Use petrol blue, large white and blue-gray cloud banks, and cool haze below. The landing mat should look worryingly small and distant.

Limit the visible obstacle set to roughly three large objects. A refrigerator, faded coral sofa, and satellite are enough for the first slice. Do not add floating islands, fantasy cities, balloons, gift boxes, glowing rings, confetti, or amusement-park scenery.

## Camera

Use a third-person chase camera close behind and slightly above the player. The T. rex should fill much of the lower third while leaving its shoulders, tiny arms, harness, and ripcord readable.

Starting guidance:

- field of view near the current race camera's 65 degrees;
- player below center so the route remains visible;
- rivals distributed across distinct screen regions;
- scale changes and motion used to convey falling speed;
- modest camera lag instead of constant shake;
- short impact impulses only.

The joke must remain readable when the HUD is hidden.

## HUD

Keep the existing race information but style it as an underfunded institutional safety display:

- position, such as `2 / 4`;
- distance to landing, such as `1,240 m`;
- rival silhouette markers with distance gaps;
- one small inventory slot;
- a quiet `INCIDENTS  0` counter.

`MANDATORY DESCENT EXERCISE` may appear briefly before the race and then fade. Leaving a large banner on screen would over-explain the premise.

Use flat navy panels, white bitmap-like lettering, thin safety-yellow accents, and slightly aliased edges. It should feel functional rather than futuristic.

## Three.js rendering recipe

Three.js is fully capable of this direction. The main challenges are asset construction and animation, not renderer capability.

| Area | Recommendation |
| --- | --- |
| Internal resolution | Start near 960 x 540, or use a React Three Fiber DPR around 0.75-1 |
| Anti-aliasing | Test disabled or low-cost MSAA; retain slightly crunchy silhouettes |
| Color | sRGB output with restrained or no cinematic tone mapping |
| Character material | `MeshLambertMaterial` or a simple diffuse shader with vertex colors |
| Character texture | One 256 x 256 diffuse atlas; use 512 x 512 only if necessary |
| Filtering | Bilinear-style filtering, anisotropy 1, conservative mip use |
| Lighting | One directional key plus low ambient fill |
| Fog | Linear blue fog; the current approximate 80-250 range is a useful start |
| Clouds | Alpha-tested cards plus a limited number of low-poly clusters |
| Post-processing | Optional quantization, ordered dithering, and restrained sun bloom |
| Shadows | Painted or blob shadows where needed; avoid modern soft-shadow cost |

The PS2 quality must come primarily from models, textures, lighting, fog, and animation. A fullscreen filter cannot make modern high-poly assets convincing.

## Working asset budgets

- Hero dinosaur: approximately 4,000-8,000 triangles.
- Rival dinosaur: approximately 3,000-6,000 triangles.
- Harness: included in the character budget where practical.
- Large obstacle: approximately 300-1,500 triangles.
- Character texture: one 256 x 256 diffuse atlas; no required normal map.
- Visible racers: four in the first slice.
- Simultaneous large obstacles: three.
- Dynamic draw calls: comfortably below roughly 150.
- Performance target: stable 60 fps on a mid-range laptop at reduced internal resolution.

The existing 10,000-triangle procedural power-up budget remains separate and should not expand during this work.

## Animation requirements

Animation determines whether the premise works. The minimum T. rex set is:

1. Neutral controlled dive.
2. Left and right steering banks.
3. Air-brake pose.
4. Ripcord reach attempt.
5. Collision flail.
6. Composed recovery.

The ripcord sequence needs dry timing:

1. The T. rex notices the handle without changing expression.
2. One arm reaches back and stops short.
3. The torso rotates slightly to gain a few centimeters.
4. The handle remains unreachable.
5. The dinosaur calmly resumes the prescribed dive posture.

Do not run this as a frantic continuous loop. Trigger it at selected moments so the joke does not wear out.

Use skeletal animation in a rigged glTF and play clips through Three.js `AnimationMixer` or React Three Fiber helpers. Gameplay movement and collision must remain independent of the rendered skeleton.

## Repository touchpoints and boundaries

The project already contains the necessary structure:

- `apps/web/src/game/RaceScene.tsx`: race scene, follow camera, lighting, fog, racer placement, and fixed-step integration.
- `apps/web/src/game/skydiving-scenery.tsx`: current `StarfishDiver` placeholder and clouds; natural home for the first visual replacement.
- `apps/web/src/game/RaceObjects.tsx`: refrigerator, sofa, satellite, item boxes, and rings.
- `apps/web/src/game/MovementTest.tsx`: projected rival markers and race HUD data.
- `apps/web/src/game/movement-test.css`: DOM HUD styling.
- `apps/web/src/game/freefall-controller.ts`: movement behavior.

Respect the existing architecture:

- Do not move player input or position integration into `creation-loop.ts`.
- Do not add a second frame loop or a physics engine for ragdoll comedy.
- Keep obstacle and collectible collision independent of appearance.
- Preserve shared contracts and generation behavior.
- Do not implicitly wire experimental lab behavior into the main race.

## Recommended first vertical slice

Build only enough to prove the tone:

1. One low-poly rigged T. rex with the final harness and ripcord placement.
2. Neutral dive, steering, collision, and ripcord-reach animations.
3. One refrigerator obstacle with an inspection label.
4. Existing camera, movement, sky, and collision behavior.
5. Restyled position, distance, rival markers, and `INCIDENTS  0`.
6. One distant landing mat.

Do not build the full roster until this slice proves that the tiny-arms joke reads while the player is steering.

## Acceptance checklist

- [ ] A new viewer understands within three seconds that the T. rex cannot reach its safety handle.
- [ ] The T. rex reads as an adult dinosaur, not a baby mascot.
- [ ] Expressions remain neutral or mildly frustrated.
- [ ] The PS2 look comes from asset construction and lighting, not a nostalgia overlay.
- [ ] Players, hazards, and clouds remain separable at reduced resolution.
- [ ] The HUD is legible without dominating the sky.
- [ ] No more than three large obstacles compete for attention.
- [ ] The ripcord animation reads from the normal chase camera.
- [ ] Collision does not depend on the character mesh.
- [ ] The existing single fixed-step race loop is preserved.
- [ ] The vertical slice reaches the frame-rate target before roster expansion.

## Decisions after the slice

- Is the ripcord a harmless recurring action, a once-per-race objective, or part of the finish sequence?
- Does `INCIDENTS` affect score, or is it purely a deadpan counter?
- Should every species have an equipment failure, or should some humor come only from aerodynamics?
- How much low-resolution softness can the game tolerate before rival markers suffer?

The first review should focus on silhouette, animation timing, and whether the central joke reads during play. Texture polish and additional content come later.
