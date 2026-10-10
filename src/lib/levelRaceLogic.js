// Shared resolution for "both players race the same level" duels (Chimp Test,
// Visual Memory). A level resolves only once BOTH players have an outcome for it:
// cleared it (`done`) or slipped (`fail`, the wrong cell, or -1 for a level that
// ran out of time). Erring first used to hand the round straight to the
// opponent, so the safest play was to let them tap first.
//   both cleared                → { type: 'advance' }
//   one cleared, one slipped    → { type: 'win', winner } (the one who cleared)
//   both slipped                → more correct taps wins; then the lower total
//                                 clear time across earlier levels; then
//                                 { type: 'replay' } (same level, new deal)
//   anyone still playing        → { type: 'pending' }
export function resolveLevelRace({ doneX, doneO, failX, failO, progressX = 0, progressO = 0, timeX = 0, timeO = 0 }) {
  const outX = doneX ? 'done' : failX != null ? 'fail' : null
  const outO = doneO ? 'done' : failO != null ? 'fail' : null
  if (!outX || !outO) return { type: 'pending' }
  if (outX === 'done' && outO === 'done') return { type: 'advance' }
  if (outX === 'done') return { type: 'win', winner: 'X' }
  if (outO === 'done') return { type: 'win', winner: 'O' }
  if (progressX !== progressO) return { type: 'win', winner: progressX > progressO ? 'X' : 'O' }
  if (timeX !== timeO) return { type: 'win', winner: timeX < timeO ? 'X' : 'O' }
  return { type: 'replay' }
}

// Lead-in before a duel level's reveal, so both players are looking when it starts
// (the old clock started on join, and a switch had already burned the reveal).
export const LEVEL_COUNTDOWN_MS = 3000
