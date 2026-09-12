# Race playground handoff

## Scope and entry points

Game → Movement test is a local four-racer prototype: one human and three simulated opponents. It is separate from the CreationDemoPage and generation lab. Race items use existing fixture visuals; voice generation is not connected to this race.

- MovementTest.tsx owns keyboard events, rebinding, pause/reset, and the React HUD.
- RaceScene.tsx advances PracticeRace at 120 fixed steps per second and owns the camera and screen-space target selection.
- practice-race.ts owns standings, combat, pickups, boost fuel, dodge, and finish state.
- freefall-controller.ts owns movement integration; rival-planner.ts chooses AI routes.
- race-course.ts defines authored obstacles and colliders independently from their visuals.
- RaceObjects.tsx and skydiving-scenery.tsx render the world; RaceOverlay.tsx renders HUD graphics.
- target-lock.ts owns the pure lock acquisition state.

Do not wire generation into the race by modifying creation-loop.ts to update player motion. Coordinate integration through the existing controller/creation-host boundaries in controls-handoff.md.

## Defaults

WASD steers; I looks upward with reversed horizontal steering; J uses an item; K brakes; U spends boost fuel; L dodges; Escape pauses. Letter controls are rebindable for the session. Blur or hiding the tab pauses and clears pending actions. Space remains reserved for voice.

The arena is 72 × 72 m and the finish is 3,600 m below the start. Normal terminal speed is 30 m/s, boost speed is 60 m/s, and lateral steering is 20 m/s. Three rings each add two seconds of boost fuel, capped at four seconds. Dodge lasts 0.35 seconds with 0.25 seconds of protection and a 2.5-second cooldown.

Boxes grant jellyfish umbrella (homing slow projectile after lock), ghost cloak (five seconds of protection), or angry sun (a stationary 3D blast lasting 2.5 seconds). Sun protection is temporary: lingering in the blast after protection ends can cause damage, but each explosion damages each opponent at most once.

## Audit fixes

- On-screen key instructions reflect rebound controls.
- Touching a sun blast while protected no longer grants immunity to that blast for its entire lifetime.
- Expired projectiles are skipped before movement and damage processing.
- Regression coverage includes these combat cases as well as existing movement, targeting, pickups, AI, finish, boost, dodge, and progress-tracker tests.

## Verification and manual smoke test

Run from the repository root with the installed Bun and supported Node runtime:

    bun run build
    bun run typecheck
    bun run test
    git diff --check

Before pushing, manually check Game → Movement test:

1. Start, steer to each boundary, brake, pause/resume, and restart.
2. Rebind use/boost/dodge/look and confirm the displayed help and actions agree.
3. Collect a box, acquire a target, fire up/down, and dodge a jellyfish.
4. Trigger sun near a rival; confirm the sphere remains visible and hazardous, then expires.
5. Collect fuel, boost, and confirm braking preserves remaining fuel.
6. Confirm the left tracker, live rank/gaps, and finish results; check at a narrow window size.
7. Switch back to the creation demo and generation lab to confirm their views still work.

Browser testing is left to the user. Automated checks do not establish visual quality or browser performance. Vite reports a large bundle warning; this prototype still mounts all course models and uses visibility culling, so lower-end device performance needs a manual check.

Include the new gameplay modules and test files when staging; tracked-file-only staging would omit required imports. The unrelated untracked .vscode directory is outside this gameplay change. No shared contracts, server generation code, dependencies, or lockfiles were changed by this audit.
