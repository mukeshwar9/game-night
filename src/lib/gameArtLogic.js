// Pure facts about the generated game art, shared by the app and by the build
// scripts (no imports: scripts/cut-paper-art/ loads this file under plain Node).

// Cut paper (scripts/cut-paper-art/, `npm run art:cutpaper`) writes, per game,
// public/game-art/cutpaper/<type>.webp (the still, STILL px square) and
// <type>-loop.webp (LOOP_FRAMES drawings of LOOP_PX px side by side, played
// with steps() over LOOP_MS: 12 drawings in one second, the paper re-wobbling at animate's 12 fps).
export const CUT_PAPER = { still: 320, loopPx: 320, loopFrames: 12, loopMs: 1000 }

export const cutPaperStillUrl = (type) => `/game-art/cutpaper/${type}.webp`
export const cutPaperLoopUrl = (type) => `/game-art/cutpaper/${type}-loop.webp`

// The eight sample scenes (scripts/cut-paper-art/scenes/samples.js) tell a story inside the loop, so their
// still is the drawing where the story reads best — the sixth of twelve — and the strip, once loaded,
// carries on from there; every other scene's still is the first drawing.
export const CUT_PAPER_STILL_AT = Object.fromEntries(
  ['puckrush', 'yacht', 'stickyfingers', 'fenderbender', 'firstcut', 'quiver', 'sidekick', 'tictactoe'].map(t => [t, 0.5]),
)
export const cutPaperStillAt = (type) => CUT_PAPER_STILL_AT[type] ?? 0
