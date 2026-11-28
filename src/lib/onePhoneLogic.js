// ONE PHONE front door: "how many of you are here?" then only the games that
// work on one phone for that many people. Pure registry filtering, no DOM,
// Firebase or React. `supportsLocalPlay` stays the authority on eligibility;
// this module only adds the player range of each eligible game.

// The tiles on the door. `n` is the head count the list is filtered by; "5+"
// asks for five, the largest group any one-phone game is checked against.
export const COUNT_OPTIONS = [
  { n: 2, label: '2' },
  { n: 3, label: '3' },
  { n: 4, label: '4' },
  { n: 5, label: '5+' },
]

// Smallest and largest group a game's one-phone mode takes. A turn-based board
// is always exactly two; a custom game with a pass-and-play page takes its
// lobby minimum up to `localMaxPlayers` (or its online maximum when it sets none).
export function localPlayerRange(cfg) {
  if (!cfg) return { min: 2, max: 2 }
  if (!cfg.nPlayer) return { min: 2, max: cfg.localMaxPlayers ?? 2 }
  const min = Math.max(2, cfg.minPlayers ?? 2)
  const max = cfg.localMaxPlayers ?? cfg.maxPlayers ?? min
  return { min, max: Math.max(min, max) }
}

// Parse the `?n=` query value; anything but a known tile is "not chosen yet".
export function parseCount(raw) {
  const n = Number(raw)
  return COUNT_OPTIONS.some(o => o.n === n) ? n : null
}

// Games from `games` that run on one phone for exactly `count` people, in the
// registry's order. `canLocal` is `supportsLocalPlay` (passed in so this file
// stays free of the registry's component imports and testable alone).
export function gamesForCount(games, count, canLocal) {
  return games.filter(g => {
    if (!canLocal(g.type)) return false
    const { min, max } = localPlayerRange(g)
    return count >= min && count <= max
  })
}

// How many games each tile would open, for the sub-line under the number.
export function countsByTile(games, canLocal) {
  return Object.fromEntries(COUNT_OPTIONS.map(o => [o.n, gamesForCount(games, o.n, canLocal).length]))
}
