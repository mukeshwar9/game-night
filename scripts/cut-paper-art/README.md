# Cut paper game art

`npm run art:cutpaper` draws every game's CUT PAPER tile in headless Chromium and writes, per game,
`public/game-art/cutpaper/<type>.webp` (a 320 px still) and `<type>-loop.webp` (twelve 320 px drawings side by
side, played with `steps(12)` over one second while the tile is on screen), plus `sources.json`, a hash of everything that draws
them. `src/lib/cutPaperArt.test.js` fails when a scene changes without a regenerate.

- `vendor/` holds two files from cth9191/animate (MIT, pinned, see `vendor/README.md`): its core drawing kit and
  its cut-paper kit (`cut`, `face`, `person`, patterns, grain). animate is not an app dependency.
- `head.js`, `driver.js` are the page glue; `scenes/_common.js` has the shared helpers (`world`, `ground`,
  `critter`, `paperDisc`, `letters`, …); `scenes/*.js` hold one `SCENES.<type> = (p) => { … }` per game, in
  540×540 tile space. `p` is the loop phase in [0, 1): `p = 0` is the key pose (the still), and every motion
  must be a whole number of cycles per loop (`wave(p, k)`, `hopY(p, amp, k)`) so the strip wraps.
- Everything is seeded (no `Math.random`, no clocks) and there is no installed-font text: letters come from the
  stroke table in `src/lib/artGlyphs.js`, which TOON uses too.
- Review: `npm run art:cutpaper -- --batch=board-a` (or `--only=sos,gomoku`; batches are in
  `scripts/game-art-batches.mjs`), then `npm run art:sheet -- --batch=board-a --out=sheet.png` for a contact
  sheet of CUT PAPER next to TOON at 128 / 56 / 28 px on any theme (`--theme=mono`, `--t=0.4` seeks the toon loops).
- A partial run rewrites `sources.json` for the scene files as they are now, so finish with a full
  `npm run art:cutpaper` before committing.
