# Race scenery

Floating junk keeps its authored silhouettes and collision bounds, with a shared seeded worn surface, warm industrial colors, terracotta upholstery and cargo inspection labels. `scenery-materials.ts` builds the two shared canvas textures; `RaceObjects.tsx` owns their lifetime. No downloaded or paid assets are required.

CloudField uses 32 recycled cloud banks, each with two feathered procedural density planes. Their positions and fades derive from the player snapshot, so pausing freezes the scenery. Shader materials are allocated once and disposed on unmount. Clouds remain outside the central flight corridor and do not collide.

PrehistoricEarth is one 24 km terrain mesh with baked vertex colors for forest, exposed ridges, wetlands and river/coastal water. It follows the race floating origin at the finish plane. A level central basin joins the sandy landing clearing to the surrounding forest. Its atmospheric coloring bypasses the short obstacle fog range so the ground remains visible from the start; the camera far plane includes the terrain.

These are game-native procedural assets. Blender is an optional future authoring route for bespoke prop silhouettes, not a runtime dependency. Preserve obstacle collision rules, course placement and the sole RaceScene simulation loop when iterating on visuals.

LandingClearing adds instanced green and lavender forest crowns, a turquoise pond with a sandy bank, rocks and a purple safety-inspection canopy. Three high-vis inspectors approach the player after landing and animate clipboards on a presentation-only clock that respects pause. The ground camera frames the standing dinosaur and inspectors; the results panel reports an incident-based inspection verdict. Race finish timing, player snapshots and collision rules remain owned by PracticeRace.


## Landing and aircraft polish

The landing ground is one radial mesh: sand, grass and inset pond are vertex colors, so no almost-coplanar discs compete in the distance. The large terrain is recessed 12 m beneath the local clearing. Race cameras use a 2 m near plane in freefall and 1 m on the ground for better depth precision; the selection camera restores 0.1 m / 100 m clipping.

Forest trunk/branch geometry and layered canopies are merged into two reusable instanced meshes. Fern beds add one instanced draw call. Inspectors have tapered uniforms, helmets, noses, reflective bands and clipboards. The pitched inspection canopy, sign and stacked equipment establish the station.

PlaneCabin is the in-game personnel selection and setup setting: benches, windows, structural ribs, floor rails, a departure sign and an open rear ramp. The standalone inspection station remains available. No Blender runtime or new downloaded textures are needed; any future Blender GLB should use similarly bounded triangle/material counts and instancing for repeated vegetation.
