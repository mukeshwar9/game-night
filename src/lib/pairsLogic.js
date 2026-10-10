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
// PAIRS 4×4 (`pairs4`): 8 pairs drawn from the faces, first to 5 clinches.
export const PAIRS_QUICK_SIZE = 4
export const PAIRS_QUICK_CELL_COUNT = 16

// 'sword' replaced 'ninja', whose silhouette was nearly the ghost's (decks dealt
// before the swap still name 'ninja'; pairsFaces.js keeps its colour and name).
export const PAIRS_FACES = [
  'invader', 'robot', 'ghost', 'alien', 'skull', 'cat', 'ufo', 'wizard', 'sword',
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
export function generatePairsDeck(pairCount = PAIRS_TOTAL_PAIRS) {
  const faces = pairCount >= PAIRS_FACES.length ? PAIRS_FACES : shuffle(PAIRS_FACES).slice(0, pairCount)
  return shuffle([...faces, ...faces])
}

// Pairs needed to clinch: a strict majority of the board's pairs (10 of 18, 5 of 8).
export function pairsClinch(cellCount) {
  return Math.floor(cellCount / 4) + 1
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
  const clinch = pairsClinch(board.length)
  if (xCells / 2 >= clinch) return { winner: 'X' }
  if (oCells / 2 >= clinch) return { winner: 'O' }
  if (xCells + oCells === board.length) return { winner: 'draw' } // 9–9 (6×6) or 4–4 (4×4)
  return null
}

// Pure move application. board/deck are already-normalized string[36]; flipped is an
// already-normalized number[] (0–2 entries). index is the tapped cell (0–35). symbol is
// the mover ('X'|'O').
//
// Returns null if illegal:
//   - index out of range
//   - board[index] already claimed
//   - index is your own currently-held first pick (flipped.length === 1 && flipped[0] === index)
// A *leftover mismatch* pair (flipped.length === 2, from the previous player's failed
// attempt) is NOT "held" by anyone — those two cards flip back face-down at the start of
// the next turn, so tapping either of them (or any other face-down cell) is a legal first
// flip for the new turn. Without this, the two mismatched cards were permanently dead —
// unflippable by every subsequent player — which is the bug this contract fixes.
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
  if (index < 0 || index >= board.length) return null
  if (board[index]) return null
  if (flipped.length === 1 && flipped[0] === index) return null

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
// Bot (used only by the local /demo harness — BotBoardDemo + demoBots.js).
// ---------------------------------------------------------------------------
//
// The bot plays from memory, like a person: it only knows faces that have been
// turned face up, remembers each one with probability `recall`, and forgets it
// after `forgetAfter` flips. The old bot read the whole deck — 45% of its second
// flips went straight to a twin it had never seen, so a player with perfect
// memory still lost 4–10 and the CPU felt like it was cheating.
//
// Measured (posture C, 400 simulated games per level, 2026-10-02) against a
// scripted player with perfect memory: that player wins 100% vs EASY, 74% vs
// NORMAL and 50% vs HARD (HARD never forgets, so it plays the same strategy).
// Real players forget, so every level plays harder than these numbers suggest.
// pairsLogic.test.js re-runs a smaller version of the simulation. Tune `recall` first.
export const PAIRS_BOT_LEVELS = {
  easy:   { recall: 0.7,  forgetAfter: 12 },
  normal: { recall: 0.95, forgetAfter: 40 },
  hard:   { recall: 1,    forgetAfter: Infinity },
}

const levelOf = d => PAIRS_BOT_LEVELS[d] ?? PAIRS_BOT_LEVELS.normal

// The bot's notes after a card at `index` is turned face up (by anyone), at flip
// number `at`. Pure: returns a new memory object (or the same one when the bot
// failed to take it in).
export function observePairsFlip(memory, index, face, at, difficulty = 'normal', rand = Math.random) {
  if (face == null || rand() >= levelOf(difficulty).recall) return memory ?? {}
  return { ...(memory ?? {}), [index]: { face, at } }
}

// Unclaimed cards the bot still remembers at flip number `now`, as index → face.
function knownCards(memory, board, now, difficulty) {
  const { forgetAfter } = levelOf(difficulty)
  const known = {}
  for (const [k, v] of Object.entries(memory ?? {})) {
    const i = Number(k)
    if (board[i] === '' && now - v.at <= forgetAfter) known[i] = v.face
  }
  return known
}

function pickFrom(arr, rand) { return arr[Math.floor(rand() * arr.length)] }

// gameView: the demo harness's local game state (board, pairsDeck, pairsFlipped,
// plus the bot's own pairsBotMemory and pairsFlipCount). Returns a cell index or null.
export function computePairsBotMove(gameView, symbol, difficulty = 'normal', rand = Math.random) {
  void symbol // flip legality is the same for both seats
  const board = gameView.board || []
  const flipped = normalizePairsFlipped(gameView.pairsFlipped)
  const now = gameView.pairsFlipCount ?? 0
  const known = knownCards(gameView.pairsBotMemory, board, now, difficulty)
  const legal = []
  for (let i = 0; i < board.length; i++) if (board[i] === '' && !flipped.includes(i)) legal.push(i)
  if (!legal.length) return null
  const unknown = legal.filter(i => known[i] === undefined)

  if (flipped.length === 1) {
    // Second flip: the held card's face is on the table for everyone to see.
    const face = normalizePairsDeck(gameView.pairsDeck)[flipped[0]]
    const twin = legal.find(i => known[i] === face)
    if (twin !== undefined) return twin
    return pickFrom(unknown.length ? unknown : legal, rand)
  }

  // First flip: cash in a remembered pair, otherwise turn up something new.
  const seen = {}
  for (const i of legal) {
    const f = known[i]
    if (f === undefined) continue
    if (seen[f] !== undefined) return seen[f]
    seen[f] = i
  }
  return pickFrom(unknown.length ? unknown : legal, rand)
}
