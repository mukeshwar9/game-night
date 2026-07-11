// Trust-model note (see docs/prds/pairs.md §Trust model): pairsDeck is written to Firebase
// in full, in the clear, at game creation. Any client that inspects the live RTDB
// subscription (dev tools / Firebase console / REST) can read every face's location for
// the rest of the round. This is an accepted, documented leak (same honest-client tier as
// every other board game) — it is NOT the bundle-leak caveat (PAIRS_FACES itself is public
// and meant to be); it's specifically the per-game *shuffle order* that leaks early.

export const PAIRS_SIZE = 6
export const PAIRS_CELL_COUNT = 36
export const PAIRS_TOTAL_PAIRS = 18
export const PAIRS_CLINCH = 10

export const PAIRS_FACES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard', 'ninja',
  'crown', 'dino', 'heart', 'frog', 'star', 'mushroom', 'bolt', 'moon', 'fish',
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Plain Math.random() shuffle at creation time — same sanctioned pattern as
// generateVmPattern (src/lib/visualMemoryLogic.js) and generateChimpLayout: these are
// symmetric-information/simultaneous-reveal games with no anti-cheat need for a seeded
// or server-verifiable RNG (contrast with Pig's diceSeed commit-reveal, which exists
// because Pig rolls are asymmetric turn-by-turn stakes). Not reproducible/testable by
// exact output — tests assert structure (counts), not a specific shuffle.
export function generatePairsDeck() {
  return shuffle([...PAIRS_FACES, ...PAIRS_FACES])
}

// Array-or-Firebase-numeric-object tolerance, same shape as normalizeVmArray /
// normalizeSimonSequence in the existing memory games.
export function normalizePairsDeck(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

export function normalizePairsFlipped(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  return Object.keys(raw).map(Number).sort((a, b) => a - b).map(k => raw[k])
}

// Returns { winner: 'X'|'O'|'draw' } or null. Called unconditionally after every move
// (same pattern as getSosWinner/getDotsAndBoxesWinner) — cheap no-op when not yet decided.
export function getPairsWinner(board) {
  const xCells = board.filter(c => c === 'X').length
  const oCells = board.filter(c => c === 'O').length
  if (xCells / 2 >= PAIRS_CLINCH) return { winner: 'X' }
  if (oCells / 2 >= PAIRS_CLINCH) return { winner: 'O' }
  if (xCells + oCells === PAIRS_CELL_COUNT) return { winner: 'draw' } // always 9–9 here
  return null
}

// Pure move application. board/deck are already-normalized string[36]; flipped is an
// already-normalized number[] (0–2 entries). index is the tapped cell (0–35). symbol is
// the mover ('X'|'O').
//
// Returns null if illegal:
//   - index out of range
//   - board[index] already claimed
//   - index already in `flipped` (can't re-tap your own held card or a stale mismatch card)
// ("game finished" is NOT re-checked here — Game.jsx's handleMove already refuses to call
// applyMove at all once game.status !== 'playing', and the BotBoardDemo harness in
// src/pages/Demo.jsx applies the identical guard — see Logic details for why this branch
// needs no code here.)
//
// Returns { board, flipped, turnStays, matched } otherwise:
//   - flipped.length !== 1 (0 fresh, or 2 leftover-mismatch-to-clear): first tap of the
//     turn → { board (unchanged), flipped: [index], turnStays: true, matched: false }
//   - flipped.length === 1 (second tap): compare deck[j] vs deck[index]
//       match    → { board: <both cells set to symbol>, flipped: null, turnStays: true, matched: true }
//       mismatch → { board (unchanged), flipped: [j, index], turnStays: false, matched: false }
export function applyPairsMove(board, deck, flipped, index, symbol) {
  if (index < 0 || index >= PAIRS_CELL_COUNT) return null
  if (board[index]) return null
  if (flipped.includes(index)) return null

  if (flipped.length !== 1) {
    return { board, flipped: [index], turnStays: true, matched: false }
  }

  const [j] = flipped
  if (deck[j] === deck[index]) {
    const newBoard = [...board]
    newBoard[j] = symbol
    newBoard[index] = symbol
    return { board: newBoard, flipped: null, turnStays: true, matched: true }
  }

  return { board, flipped: [j, index], turnStays: false, matched: false }
}

// ---------------------------------------------------------------------------
// Bot (used only by the local /demo harness — see Demo.jsx wiring below).
// ---------------------------------------------------------------------------

const RECALL_P = 0.45          // 2nd-flip: chance the bot correctly plays the known twin
const FIRST_FLIP_SETUP_P = 0.15 // 1st-flip: see implementation note below

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function legalCellsExcluding(board, exclude) {
  const out = []
  for (let i = 0; i < PAIRS_CELL_COUNT; i++) {
    if (board[i] === '' && !exclude.includes(i)) out.push(i)
  }
  return out
}

function pickFirstFlip(board, deck, flipped) {
  const legal = legalCellsExcluding(board, flipped)
  if (!legal.length) return null
  if (Math.random() < FIRST_FLIP_SETUP_P) {
    // "Deliberate" first flip: pick a still-unclaimed face and flip one of its two
    // copies. IMPLEMENTATION NOTE: because Pairs always claims both copies of a face
    // in the same instant (never one-claimed/one-not), every legal cell's twin is,
    // by construction, always also legal. So this branch and the plain-random branch
    // below are currently statistically indistinguishable — grouping by face first
    // doesn't change the distribution. Implemented as two distinct code paths anyway
    // for spec fidelity and because a future variant (e.g. odd face counts, a "burn a
    // card" power-up) could break that invariant and make this branch meaningful.
    const faces = [...new Set(legal.map(i => deck[i]))]
    const face = pickRandom(faces)
    const cells = legal.filter(i => deck[i] === face)
    return pickRandom(cells)
  }
  return pickRandom(legal)
}

function pickSecondFlip(board, deck, flipped) {
  const held = flipped[0]
  const legal = legalCellsExcluding(board, [held])
  if (!legal.length) return null // defensive; can't happen mid-game (see Logic details)
  if (Math.random() < RECALL_P) {
    const heldFace = deck[held]
    const twin = legal.find(i => deck[i] === heldFace)
    if (twin !== undefined) return twin
  }
  return pickRandom(legal)
}

// gameView: the demo harness's local game-state object (already has real arrays for
// board/pairsDeck/pairsFlipped, never raw Firebase snapshot shape — see Demo.jsx wiring).
// symbol is accepted for call-site parity with pickBotMove(type, game, botSymbol) →
// demoBots.js's `case 'pairs': return computePairsBotMove(game, botSymbol)` dispatch, but
// unused by the algorithm itself (Pairs' flip legality is symmetric for both players).
// `void symbol` below is a deliberate no-op so ESLint's no-unused-vars (args: 'after-used'
// in this repo's eslint.config.js) doesn't flag the final parameter.
export function computePairsBotMove(gameView, symbol) {
  void symbol
  const board = gameView.board || []
  const deck = normalizePairsDeck(gameView.pairsDeck)
  const flipped = normalizePairsFlipped(gameView.pairsFlipped)
  if (flipped.length === 1) return pickSecondFlip(board, deck, flipped)
  return pickFirstFlip(board, deck, flipped)
}
