# Avatars

One character, two framings. The code is `src/lib/avatarKit/`; the component is `src/components/Avatar.jsx`; the editor is `src/components/AvatarPicker.jsx`.

- **Wire format:** `K1` plus one base-36 character per field (23 fields, 25 characters), stored where the old avatar string lived. Each character indexes an append-only catalog in `catalog.js`; `catalog.test.js` pins the head of every list. Decoding is total.
- **Framings:** `view="bust"` (head and shoulders) for chips, seat cards and lists; `view="hero"` (full body, poses, pet) for the profile and Playground. Sizes snap to 24 / 48 / 72 / 96 so each art pixel is a whole number of screen pixels.
- **Colour:** fixed RGB ramps in `palette.js`, never theme tokens, so a look is identical in every theme. Premium ramps palette-cycle.
- **Premium flags:** every part carries `tier` (`free`, `earn` = unlocked by play and never sold, `pass`, `pack` + `pack` id). Nothing is gated yet; the editor only badges them. `premiumItems(look)` lists what a look wears.
- **Legacy strings:** old humanoid ids migrate on the fly through `migrate.js`; the 27 critters keep their 8x8 sprites (CLASSIC tab) in the fixed palette. Stored strings are rewritten only when the player saves in the editor.
- **Adding a part:** append it to its catalog in `art.js` (grid legend in `compose.js`), give it a `tier`, run `npm test`. Never reorder or delete.
- **Art sheets:** the PNGs here come from `node scripts/avatar-sheet.mjs <out.png> --catalog=<field> --view=bust|hero --scale=3`; `--random=N [--premium]` renders random looks.
