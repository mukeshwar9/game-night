// Pure facts about the generated game art, shared by the app and by the build
// scripts (no imports: scripts/cut-paper-art/ loads this file under plain Node).

// Cut paper (scripts/cut-paper-art/, `npm run art:cutpaper`) writes, per game,
// public/game-art/cutpaper/<type>.webp (the still, STILL px square) and
// <type>-loop.webp (LOOP_FRAMES drawings of LOOP_PX px side by side, played
// with steps() over LOOP_MS).
export const CUT_PAPER = { still: 320, loopPx: 224, loopFrames: 6, loopMs: 900 }

export const cutPaperStillUrl = (type) => `/game-art/cutpaper/${type}.webp`
export const cutPaperLoopUrl = (type) => `/game-art/cutpaper/${type}-loop.webp`
