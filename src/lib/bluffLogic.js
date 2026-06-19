export const DICE_PER_PLAYER = 5
export const FACES = 6

// Count how many dice across the given cup(s) show `face`.
// When onesWild is true, every 1 counts toward any face (except when the
// queried face IS 1 — then only the literal 1s count, never doubled).
export function countFace(dice, face, onesWild = true) {
  let count = 0
  for (const d of dice) {
    if (d === face) count++
    else if (onesWild && face !== 1 && d === 1) count++
  }
  return count
}

// A bid is { qty, face }. A new bid is legal only if it strictly raises the
// previous one: more dice at the same-or-any face, OR the same quantity at a
// higher face. (Classic Perudo without the "switch to ones" special rule.)
export function isBidHigher(prev, next) {
  if (!next || next.qty < 1 || next.face < 1 || next.face > FACES) return false
  if (!prev) return next.qty >= 1
  if (next.qty > prev.qty) return true
  if (next.qty === prev.qty && next.face > prev.face) return true
  return false
}

// Roll `n` dice locally (each 1..FACES). Used client-side only.
export function rollDice(n = DICE_PER_PLAYER) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(Math.floor(Math.random() * FACES) + 1)
  }
  return out
}

// Resolve a LIAR call against a bid and both cups.
// Returns { actual, bidMet, loser } where loser is the symbol that loses a die:
//  - if the bid is met (actual >= bid.qty) the CALLER loses
//  - otherwise the BIDDER loses
// `caller` / `bidder` are 'X' | 'O'.
export function resolveChallenge({ bid, diceX, diceO, caller, bidder, onesWild = true }) {
  const all = [...diceX, ...diceO]
  const actual = countFace(all, bid.face, onesWild)
  const bidMet = actual >= bid.qty
  const loser = bidMet ? caller : bidder
  return { actual, bidMet, loser }
}
