# Prehistoric Precautions scenery

The approved title artwork is [prehistoric-precautions.png](../apps/web/public/images/prehistoric-precautions.png). It was created and iteratively edited with ImageGen from the supplied dinosaur skydiving image. Preserve the title, tagline, enlarged refrigerator and centered sofa. The title page uses the complete image without cropping, plus an accessible **Commence Training** button and expandable controls. The button opens personnel selection, then the existing mock/voice briefing. The toolbar title returns to the opening screen and cancels pending voice work.

## Training obstacles and placement

The course has nine prop silhouettes plus ventilation pipes, with authored collision volumes in `race-course.ts` and appearance in `RaceObjects.tsx`:

- Upper course (depth < 1,100 m): satellite, reentry training capsule, strapped equipment crate.
- Middle course (1,100–2,200 m): weather balloon, capsule, crate, caution barrier.
- Lower course (> 2,200 m): refrigerator, sofa, traffic cone, extinguisher, barrier, crate.

The duck, toilet, piano and rock are removed. Metal/cargo props share worn surfaces and inspection labels; cones, barriers and extinguishers use recognizable safety colors. These game-native meshes require no downloaded models or paid generation at runtime.

Each reset seeds fresh obstacle positions, orientations and types, pipe entry depths and directions, item boxes and open-air fuel rings. Props retain horizontal separation; junk and pickups remain clear of pipe passages. Three pipe routes retain three 24 m sections with 3 m horizontal offsets, an open center and two double-fuel rewards. Course, fuel-ring and rival decision streams are separate from item draws and shared-event randomness. Fixed input seeds reproduce a run for regression testing.

## Landing valley

`landing-terrain.ts` supplies shared surface heights and a winding river east of the landing square. `PrehistoricEarth` renders the 24 km forested valley and mountain ridges. `LandingClearing` adds a cream 84 m square pad, a gray square target and light center, matching the title artwork. The existing 72 m race lane fits within the pad. Finish timing and movement remain unchanged.

The near ground and distant terrain use the same height function. Trees avoid the river and use two instanced meshes with a fixed scenery seed; ferns use another instanced draw. Forest materials bypass short-range obstacle fog so distant trees retain their green silhouettes. The old sandy circle and pond are replaced by the artwork-inspired valley. `SafetyInspection` retains the three human inspectors, clipboards, tent and inspection sign. After landing, the inspectors approach the player; their cosmetic animation pauses with the race. Scenery does not collide or move racers.

CloudField uses 32 recycled, feathered procedural cloud banks. The upper course has thinner cloud cover, becoming denser through descent. Position and opacity derive from player depth, so pause freezes them. Rendering retains the sole RaceScene simulation clock.

## Rivals

Rivals commit to seeded maneuver targets for 2–5 seconds, with cautious, opportunistic and bold risk preferences. Reachable items and safe pipe routes outrank idle wandering; bolder rivals try to pass alongside nearby racers. Forecast endpoints respect actual steering speed, collision penalties favor avoidance, and decision intervals vary rather than updating in lockstep. Each rival has a separate random stream. No speed advantage, teleportation or extra physics integrator is introduced.

## Checks

Run `bun run build`, `bun run typecheck`, and `bun run test`. `course-variety.test.ts` covers reproducible seeds, 100 course layouts, altitude pools, pipe clearances, ring placement, rival commitments and terrain bounds. Play multiple fresh races to assess obstacle readability, AI pressure, pause/restart, and landing presentation. Use mock-only development.

### Verification of this revision

Build, typecheck, all 281 tests and `git diff --check` passed. Three full seeded simulations (0.12, 0.44, 0.79) finished with every racer; rival finishes ranged from 113.0 to 125.3 seconds, with 0–2 incidents per rival. In-app browser checks covered the title at narrow and desktop widths, personnel selection, mock-only briefing, fresh races, pause/resume, dodge, restart, and a complete landing with all racers finished. Chrome was unavailable through the browser tools, so desktop Chrome/Edge and microphone capture were not manually rechecked. No paid calls were made.
