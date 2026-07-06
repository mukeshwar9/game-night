export const PIG_TARGET = 100

// ---------------------------------------------------------------------------
// Deterministic dice (anti-cheat)
// ---------------------------------------------------------------------------
// A single client rolling with Math.random() can silently re-roll until a
// favourable face appears. To prevent that, rolls are derived from a shared
// seed that neither player alone controls, via a coin-flipping protocol:
//
//   1. X generates seedA (16 random bytes), writes diceSeedCommitX = H(seedA).
//   2. O generates seedB (16 random bytes), writes diceSeedB in the clear.
//   3. X reveals seedA → diceSeedRevealX.
//   4. Both compute diceSeed = H(seedA : seedB).
//
// Every roll is then die[i] = 1 + (firstByte(H(diceSeed : "pig-roll:" : i)) mod 6),
// a fixed sequence neither side could pre-search (seedB is hidden from X
// until after diceSeedCommitX is on the wire; seedA is hidden from O until
// after diceSeedB is on the wire). The rolling client computes the next
// face from the seed — it cannot re-roll — and the opponent recomputes the
// same value on snapshot.

function randomSeedHex(bytes = 16) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Hex-encoded random seed (16 bytes / 32 hex chars).
export function generateSeedHex() {
  return randomSeedHex(16)
}

// Commitment hash for a seed (caller stores this in Firebase before revealing).
export async function commitSeed(seedHex) {
  return sha256hex('pig-commit:' + seedHex)
}

// Combine the two contributed seeds into the shared roll seed.
export async function deriveSeed(seedAHex, seedBHex) {
  return sha256hex('pig-seed:' + seedAHex + ':' + seedBHex)
}

// Derive a deterministic die face from the shared seed + monotonic roll index.
// Pure (no async, no DOM) so it can be unit-tested synchronously by computing
// the hash via a tiny inline SHA-256? — no: crypto.subtle is async-only. To
// keep applyDiceMove synchronous (it returns {updates,result} directly), we
// precompute the roll inside applyDiceMove via asyncumm… see below.
//
// Implementation note: applyDiceMove stays sync by reading `game.diceRolls`
// (the mover's client precomputes the next face via rollDieIndexedAsync and
// passes it through). The opponent recomputes the same face from
// diceSeed+diceRollIndex and flags a mismatch.
export async function rollFaceAsync(seedHex, index) {
  const h = await sha256hex('pig-roll:' + seedHex + ':' + index)
  // Use the first 2 hex chars (one byte) → 0..255 → mod 6 → 1..6
  return 1 + (parseInt(h.slice(0, 2), 16) % 6)
}

// Synchronous verification helper for the opponent: re-derive the face from
// the known seed and an index, compare against the claimed face. Async because
// it uses crypto.subtle.
export async function verifyFaceAsync(seedHex, index, claimedFace) {
  const expected = await rollFaceAsync(seedHex, index)
  return expected === claimedFace
}

// ---------------------------------------------------------------------------
// Legacy random roll (used by the demo bot / single-player — no anti-cheat
// needed against a bot).
// ---------------------------------------------------------------------------
export function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

// Move application for PIG (push-your-luck dice). Synchronous so it composes
// with the generic BotBoardDemo harness (and Game.jsx's applyMove path).
// action: 'roll' | 'bank'
//   'roll' — rolls a die. On a 1 the turn score is wiped and the turn flips;
//            otherwise the roll is added to the at-risk turn score.
//   'bank' — adds the turn score to the mover's banked score, resets the turn
//            score and diceLast, and flips the turn. A banked total ≥ 100 wins.
// game must carry: diceScoreX, diceScoreO, diceTurnScore, currentTurn.
//                 For deterministic rolls: diceSeed, diceRollIndex.
// `face` (optional) is the precomputed deterministic face for this roll index
// — supplied by Game.jsx (computed via rollFaceAsync from the shared seed) for
// real multiplayer. When omitted, falls back to rollDie() (Math.random),
// which is the legacy/bot/demo path where anti-cheat isn't needed.
// Returns { updates, result } or null for an invalid action.
export function applyDiceMove(game, action, symbol, face) {
  if (symbol !== 'X' && symbol !== 'O') return null
  if (action !== 'roll' && action !== 'bank') return null

  const opponent = symbol === 'X' ? 'O' : 'X'
  const turnScore = game.diceTurnScore ?? 0
  const myScore = (symbol === 'X' ? game.diceScoreX : game.diceScoreO) ?? 0
  const seed = game.diceSeed ?? null
  const rollIndex = game.diceRollIndex ?? 0
  const rollTrail = Array.isArray(game.diceRolls) ? game.diceRolls : []

  if (action === 'roll') {
    let die
    if (face != null) {
      die = face
    } else if (seed) {
      // No precomputed face supplied but a seed exists: refuse rather than fall
      // back to insecure Math.random() in a real multiplayer game.
      return null
    } else {
      die = rollDie()
    }
    const nextRollIndex = rollIndex + 1
    if (die === 1) {
      // Bust: lose the at-risk points and pass the dice.
      return {
        updates: {
          diceLast: 1,
          diceTurnScore: 0,
          diceRolls: [],
          diceRollIndex: nextRollIndex,
          currentTurn: opponent,
        },
        result: null,
      }
    }
    // Safe roll: bank it into the at-risk pile, keep rolling.
    return {
      updates: {
        diceLast: die,
        diceTurnScore: turnScore + die,
        diceRolls: [...rollTrail, die],
        diceRollIndex: nextRollIndex,
        currentTurn: symbol,
      },
      result: null,
    }
  }

  // action === 'bank'
  const newScore = myScore + turnScore
  const scoreKey = symbol === 'X' ? 'diceScoreX' : 'diceScoreO'
  const win = newScore >= PIG_TARGET
  return {
    updates: {
      [scoreKey]: newScore,
      diceTurnScore: 0,
      diceRolls: [],
      diceLast: null,
      currentTurn: opponent,
    },
    result: win ? { winner: symbol } : null,
  }
}