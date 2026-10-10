// @ts-check
export const PIG_TARGET = 100

// ---------------------------------------------------------------------------
// Fair dice (anti-cheat)
// ---------------------------------------------------------------------------
// Two things must hold in a room: no player can choose a face, and no player
// can know a face before deciding to ROLL or BANK (in Pig that choice is the
// whole game).
//
// 1. A shared seed neither player controls, from a coin flip
//    (pigSeedProtocol.js): X commits H(seedA), O publishes seedB, X reveals
//    seedA, diceSeed = H(seedA : seedB).
// 2. A roll is a request, `diceRoll = { i, by, at }`, where `at` is the
//    SERVER's timestamp for the write (the rules require at === now). The
//    faces are H(diceSeed : i : at), so they don't exist until the request
//    is on the server: the seed alone predicts nothing. The rules keep a
//    pending request from being replaced, cancelled or followed by a BANK,
//    so seeing the faces never lets the roller back out.
// 3. Either client resolves the request in a transaction (resolvePendingRoll),
//    and both re-derive the faces to check the result (Game.jsx).
//
// Faces use rejection sampling on the hash bytes (a byte of 252 or more is
// skipped), so all six faces are exactly equally likely.

function randomSeedHex(bytes = 16) {
  const buf = new Uint8Array(bytes)
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(buf)
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256)
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('')
}

import { sha256hex, sha256fallback } from './sha256'

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

// The faces of roll `index` requested at server time `at`: the bytes of
// H("pig-roll" : seed : index : at), skipping any byte >= 252 so each face is
// exactly 1/6. A hash that runs out of usable bytes (odds about 1e-60) is
// extended with a counter.
export function rollFaces(seedHex, index, at, count = 1) {
  const faces = []
  for (let n = 0; faces.length < count; n++) {
    const hex = sha256fallback(`pig-roll:${seedHex}:${index}:${at}${n ? `:${n}` : ''}`)
    for (let i = 0; i < hex.length && faces.length < count; i += 2) {
      const byte = parseInt(hex.slice(i, i + 2), 16)
      if (byte < 252) faces.push(1 + (byte % 6))
    }
  }
  return faces
}

export const rollFace = (seedHex, index, at) => rollFaces(seedHex, index, at, 1)[0]
export const rollFacePair = (seedHex, index, at) => rollFaces(seedHex, index, at, 2)

// The room's roll request when it is still waiting to be resolved, else null.
export function pendingRoll(game) {
  const req = game?.diceRoll
  if (!req || typeof req !== 'object') return null
  if (req.i !== (game.diceRollIndex ?? 0)) return null
  if (!Number.isFinite(req.at) || (req.by !== 'X' && req.by !== 'O')) return null
  return req
}

// The room after resolving its pending roll, for a runTransaction update
// function: undefined (abort) when nothing is pending or the request no
// longer fits the room. `isBig` picks PIG BIG's two dice.
export function resolvePendingRoll(cur, { isBig = false } = {}) {
  const req = pendingRoll(cur)
  if (!req || !cur.diceSeed || cur.status !== 'playing' || cur.currentTurn !== req.by) return undefined
  const applied = isBig
    ? applyDiceBigMove(cur, 'roll', req.by, rollFacePair(cur.diceSeed, req.i, req.at))
    : applyDiceMove(cur, 'roll', req.by, rollFace(cur.diceSeed, req.i, req.at))
  if (!applied) return undefined
  return { ...cur, ...applied.updates }
}

// Does the room's last resolved roll match its request? null when there is
// nothing to check (no seed yet, or no roll since the request was made).
export function lastRollMatches(game, { isBig = false } = {}) {
  const idx = (game?.diceRollIndex ?? 0) - 1
  if (!game?.diceSeed || idx < 0 || game.diceLast == null) return null
  const req = game.diceRoll
  if (!req || req.i !== idx || !Number.isFinite(req.at)) return false
  const expected = isBig ? rollFacePair(game.diceSeed, idx, req.at) : rollFace(game.diceSeed, idx, req.at)
  return JSON.stringify(expected) === JSON.stringify(game.diceLast)
}

// ---------------------------------------------------------------------------
// Legacy random roll (used by the demo bot / single-player — no anti-cheat
// needed against a bot).
// ---------------------------------------------------------------------------
export function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

// Pig Big — two dice, only snake eyes bust
export function applyDiceBigMove(game, action, symbol, facePair) {
  if (symbol !== 'X' && symbol !== 'O') return null
  if (action !== 'roll' && action !== 'bank') return null
  const opponent = symbol === 'X' ? 'O' : 'X'
  const turnScore = game.diceTurnScore ?? 0
  const myScore = (symbol === 'X' ? game.diceScoreX : game.diceScoreO) ?? 0
  const seed = game.diceSeed ?? null
  const rollIndex = game.diceRollIndex ?? 0
  const rollTrail = Array.isArray(game.diceRolls) ? game.diceRolls : []
  if (action === 'roll') {
    let d1, d2
    if (Array.isArray(facePair)) [d1, d2] = facePair
    else if (seed) return null
    else { d1 = rollDie(); d2 = rollDie() }
    const isDoubleOne = d1 === 1 && d2 === 1
    const sum = d1 + d2
    const updates = { diceLast: [d1, d2], diceRolls: [...rollTrail, [d1, d2]], diceRollIndex: rollIndex + 1 }
    if (isDoubleOne) {
      updates.diceTurnScore = 0
      updates.diceRolls = []
      updates.currentTurn = opponent
      return { updates, result: null }
    }
    updates.diceTurnScore = turnScore + sum
    updates.currentTurn = symbol
    return { updates, result: null }
  }
  // action === 'bank' — a zero turn score has nothing to bank; refuse rather
  // than let it pass the turn for free (mirrors applyDiceMove's guard).
  if (turnScore === 0) return null
  const newScore = myScore + turnScore
  const scoreKey = symbol === 'X' ? 'diceScoreX' : 'diceScoreO'
  const win = newScore >= PIG_TARGET
  return { updates: { [scoreKey]: newScore, diceTurnScore: 0, diceRolls: [], diceLast: null, currentTurn: opponent }, result: win ? { winner: symbol } : null }
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
// `face` (optional) is the fair face for this roll — supplied by
// resolvePendingRoll (from the shared seed and the request's server time) in
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
      // No fair face supplied but a seed exists: refuse rather than fall
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

  // action === 'bank' — a zero turn score has nothing to bank; refuse rather
  // than let it pass the turn for free.
  if (turnScore === 0) return null

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