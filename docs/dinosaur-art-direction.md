# Dinosaur character assets

Greg, Linda and Steve share rounded mid-poly forms, authored smooth normals, block-mottled skin, a pale underside, dark woven safety harnesses, ivory or dark claws, a yellow ripcord handle with exposed cable, and readable employee-number / FALL RISK patches. Keep their awkward office-worker personalities and distinct species silhouettes.

- Greg: rust Tyrannosaurus, tiny arms, long tapered tail, employee 001.
- Linda: purple Triceratops, broad scalloped frill, two brow horns and one nose horn, four planted feet, horizontal torso, dorsal parachute pack, short tail, HR badge and foreleg-mounted checklist, employee 002.
- Steve: teal quadrupedal Stegosaurus, shorter forelegs, taller hips, small low head, two staggered rows of plates, four tail spikes, side-mounted pack clearing the plates, IT badge and foreleg diagnostic device, employee 003.
- Next: Susan (ochre Parasaurolophus, 004).

## Rebuild

Run from the repository root:

```sh
python3 scripts/build-greg.py --character greg
python3 scripts/build-greg.py --character linda
python3 scripts/build-greg.py --character steve
```

The builder shares texture-atlas generation, equipment, mesh packing, and animation clips. Each GLB embeds its atlas and contains one indexed skinned mesh. Preserve the seven base animation names and the limb/tail bone names used by the runtime. Keep shading consistent across the entire animal; do not force flat shading in the loader.

Greg, Linda and Steve are playable. Selection puts the chosen identity in player slot 0, then fills rival slots with the remaining roster in order. Models, HUD names and colors follow that lineup; collision and movement are unchanged. Restart retains the chosen character. Susan remains a placeholder rival until equipped. All previews default to a left-facing three-quarter view (-37 degrees), with manual inspection rotation available.

Inspect front, rear and exported Dive animation in Blender, then check the game camera. Build/typecheck/tests are offline and never require live generation. Blender inspection files are editable review copies; the builder remains the reproducible source of the committed GLBs.

## Selection personalities

- **Greg — anxious rule-follower (implemented):** repeatedly attempts the unreachable ripcord with his tiny arm. The existing Reach clip is his selection introduction. Dive, Brake and banking spread his hindlegs and tiny arms into a belly-down falling silhouette; standing and Reach remain unchanged.
- **Linda — procedural optimist (implemented):** stands on four legs, lifts the checklist strapped to her right foreleg, reads it, nods, briefly surveys the room and returns the hoof to the floor. Checklist is a dedicated looping selection clip; Reach remains a compatibility alias. Her horizontal rest pose uses a slight forward lean for Dive, rather than Greg's quarter-turn.
- **Steve — distracted troubleshooter (implemented):** raises a diagnostic device, taps it twice, waits, then gives a pleased head lift. IT SUPPORT badge and diagnostic device. Delayed reactions and little bursts of attention.
- **Susan — practical, impatient caretaker (planned with her model):** tightens a strap, checks a carabiner, plants a foot and waits for everyone else. FACILITIES badge and small tool pouch. Efficient, decisive motion with an impatient final glance.

Each character needs a distinct rhythm and prop interaction, not simply the same idle on a different mesh. Linda's paper is physically attached to a foreleg bone and her intro returns to the rest pose before the loop pause. The roster previews all equipped characters; the start button names the selected player.
