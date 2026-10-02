# Avatars

One character, two framings. The code is `src/lib/avatarKit/`; the component is `src/components/Avatar.jsx`; the editor is `src/components/AvatarPicker.jsx`, shown full screen by `AvatarStudio.jsx` (and inline in first run), with its state rules in `src/lib/avatarEditorLogic.js`. Pets have their own sheet, `PetPicker.jsx`; both overlays open through `src/lib/avatarStudioUi.js`.

- **Wire format:** `K1` plus one base-36 character per field (23 fields, 25 characters), stored where the old avatar string lived. Each character indexes an append-only catalog in `catalog.js`; `catalog.test.js` pins the head of every list. Decoding is total.
- **Framings:** `view="bust"` (head and shoulders) for chips, seat cards and lists; `view="hero"` (full body, poses, pet) for the profile and Playground. Sizes snap to 24 / 48 / 72 / 96 (144 for the editor preview) so each art pixel is a whole number of screen pixels.
- **Colour:** fixed RGB ramps in `palette.js`, never theme tokens, so a look is identical in every theme. Premium ramps palette-cycle.
- **Premium flags:** every part carries `tier` (`free`, `earn` = unlocked by play and never sold, `pass`, `pack` + `pack` id). Pass and pack items are gated through `avatarGate.js` when monetization is on; the editors let a player try a locked item on (preview only, never saved) with UNLOCK opening the paywall. `premiumItems(look)` lists what a look wears.
- **Legacy strings:** old humanoid ids migrate on the fly through `migrate.js`; the 27 critters keep their 8x8 sprites (CLASSIC tab) in the fixed palette. Stored strings are rewritten only when the player saves in the editor.
- **Adding a part:** append it to its catalog in `art.js` (grid legend in `compose.js`), give it a `tier`, run `npm test`. Never reorder or delete.
- **Art sheets:** the PNGs here come from `node scripts/avatar-sheet.mjs <out.png> --catalog=<field> --view=bust|hero --scale=3`; `--random=N [--premium]` renders random looks.
