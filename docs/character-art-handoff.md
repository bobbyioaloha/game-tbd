# Historical reference: personnel selection and Greg first pass

This records the initial Greg-only implementation. Character counts, model geometry, camera settings, and UI details below are historical, not the current game. Greg, Linda, and Steve are now playable. Use [the current character art guide](dinosaur-art-direction.md) for rebuild commands and contribution guidance.

## Original handoff

Game opens Personnel selection as a HUD overlay within MovementTest’s persistent game viewport and Canvas. All four participants are enabled: Greg (Tyrannosaurus), Linda (Triceratops), Steve (Stegosaurus), and Susan (Parasaurolophus). Player and opponent visuals follow the selected roster. See dinosaur-art-direction.md for the current models and introductions.

Inspect Greg is an in-game toolbar action. The personnel HUD provides rotation, zoom, pause/replay and procedure clips. Selection and inspection render Preview and GregModel behind the HUD in the same Canvas used by RaceScene. Setup is a paused in-game overlay, not a page or below-game dashboard. Entering personnel/inspection pauses and cancels voice work; Begin exercise resets the race and shows EXERCISE COMMENCING IN... with a three-second countdown before releasing movement. Restart follows the same flow. Navigation or loss of focus cancels the pending countdown. The race camera follows directly 16 m above Greg, looking straight down without a horizontal viewing offset. Look-up retains the reverse view; landing keeps the wide overview.

Greg is an original procedural low-poly first pass, not a final sculpt. Rebuild the checked-in asset with python3 scripts/build-greg.py. The GLB has 3,640 triangles, seven bones with rigid vertex weights, one merged skinned mesh, a generated 256px diffuse atlas, and Stand/Dive/Reach/Brake/Bank left/Bank right/Impact clips. GregModel converts its material to Lambert shading. Selection automatically loops Reach with Greg facing left (-90 degrees), adding a 1.5-second rest between attempts. Selection has no procedure controls; inspection retains manual clips; the race uses Dive with existing outer steering/impact transforms. Refinement should focus on silhouette, harness readability and arm reach before expanding the roster.

No gameplay integration runs in the model. RaceScene retains the sole fixed-step integration. Collider sizes and controls are unchanged. Incidents increment only on actual obstacle/projectile impacts, respect existing immunity, and reset in PracticeRace.reset; they do not affect score.

The HUD uses flat navy panels, monospace labels, and safety-yellow accents. Existing items, voice and generation functions remain intact. Further camera tuning, obstacle reskinning, final texture painting, full skeletal gameplay animation blending, and a measured 60fps performance review remain future art work.

Cosmetic wind: GregWind drives bounded damped springs on the arms, legs and tail, layered after the authored pose. Race elapsed time freezes it on pause and rewinds it on restart. Speed controls gust strength; no forces or collision changes reach gameplay. Viewer flight poses use the same wind solver. HUD now uses industrial yellow/black edging, caution signal words, PPE labels and off-white safety placards.
