// @ts-check
// Onitama (Shimada & Hoppe, 2014) — pure logic, no DOM/Firebase/React.
// 5×5 board. Each player: 1 master (k) + 4 pupils (p), lined up on their home
// row. Five movement cards are dealt from the 16-card base deck: 2 to X, 2 to
// O, 1 face-up spare. A card shows the moves RELATIVE TO THE MOVER'S OWN
// PERSPECTIVE — i.e. O plays the same card rotated 180° (verified against the
// onitamalib reference engine: `delta = -raw_delta` for the second player).
// On your turn: pick one of your two cards, move any of your pieces per that
// card, capture by landing on the enemy — then YOUR used card rotates to your
// opponent and the spare becomes yours. Cards therefore never leave play and
// hands stay 2/2 with one spare forever.
//
// Win: capture the enemy master, OR march your master onto the enemy temple
// (the center square of their home row). Draws are impossible (masters can
// always capture or be captured; no repetition rule needed at this scale).
//
// Firebase footprint is tiny: board (25), four hands, spare, currentTurn.

export const ON_SIZE = 5
export const ON_CELL_COUNT = 25

export const ON_X_TEMPLE = 22 // bottom-center — X's home temple (XM starts here; O wins by reaching it)
export const ON_O_TEMPLE = 2 // top-center — O's home temple (OM starts here; X wins by reaching it)

export const EMPTY = ''
export const XM = 'Xk' // X master
export const XP = 'Xp' // X pupil
export const OM = 'Ok' // O master
export const OP = 'Op' // O pupil

export const isMaster = (v) => v === XM || v === OM
export const ownerOf = (v) => (v === XM || v === XP ? 'X' : v === OM || v === OP ? 'O' : null)

export function rowColOf(i) {
  return [Math.floor(i / ON_SIZE), i % ON_SIZE]
}
export function indexOf(r, c) {
  return r * ON_SIZE + c
}

// ─── The 16 base movement cards ──────────────────────────────────────────────
// Patterns are stored in X's perspective: X moves UP the board (row
// decreases), so "forward" = negative row delta. Every pattern is mirrored
// (negated) when played by O. All 16 verified against the onitamalib engine
// (jackadamson/onitama, cards.rs) — CardSet::Base, in its canonical order.

export const ON_CARDS = [
  // 0 Tiger: big leap forward, one step back
  { name: 'TIGER', moves: [[-2, 0], [1, 0]] },
  // 1 Dragon: wide V, four diagonal reaches
  { name: 'DRAGON', moves: [[-1, -2], [1, -1], [-1, 2], [1, 1]] },
  // 2 Frog: three lateral hops (left-leaning)
  { name: 'FROG', moves: [[0, -2], [-1, -1], [1, 1]] },
  // 3 Rabbit: three lateral hops (right-leaning)
  { name: 'RABBIT', moves: [[-1, 1], [0, 2], [1, -1]] },
  // 4 Crab: sidewinder — straight out both sides, one forward step
  { name: 'CRAB', moves: [[-1, 0], [0, -2], [0, 2]] },
  // 5 Elephant: two forward diagonals + two sidesteps
  { name: 'ELEPHANT', moves: [[-1, -1], [-1, 1], [0, -1], [0, 1]] },
  // 6 Goose: forward-left, forward, back-right
  { name: 'GOOSE', moves: [[-1, -1], [-1, 0], [1, 1]] },
  // 7 Rooster: forward-right, forward, back-left
  { name: 'ROOSTER', moves: [[-1, 1], [-1, 0], [1, -1]] },
  // 8 Monkey: all four diagonals
  { name: 'MONKEY', moves: [[-1, -1], [-1, 1], [1, -1], [1, 1]] },
  // 9 Mantis: two forward diagonals + straight back
  { name: 'MANTIS', moves: [[-1, -1], [-1, 1], [1, 0]] },
  // 10 Horse: forward, left, back
  { name: 'HORSE', moves: [[-1, 0], [0, -1], [1, 0]] },
  // 11 Ox: forward, right, back
  { name: 'OX', moves: [[-1, 0], [0, 1], [1, 0]] },
  // 12 Crane: one forward step, both back diagonals
  { name: 'CRANE', moves: [[-1, 0], [1, -1], [1, 1]] },
  // 13 Boar: forward + both sidesteps
  { name: 'BOAR', moves: [[-1, 0], [0, -1], [0, 1]] },
  // 14 Eel: sidestep + two back diagonals (left)
  { name: 'EEL', moves: [[0, -1], [1, -1], [-1, 1]] },
  // 15 Cobra: sidestep + two back diagonals (right)
  { name: 'COBRA', moves: [[0, 1], [1, 1], [-1, -1]] },
]

export const ON_CARD_COUNT = ON_CARDS.length

export function cardName(k) {
  return ON_CARDS[k]?.name ?? `CARD ${k}`
}

// Move deltas as [row, col] from the given player's perspective. O's moves
// are X's negated (the reference engine rotates the card 180° for player two).
export function cardDeltas(k, symbol) {
  const card = ON_CARDS[k]
  if (!card) return []
  const sign = symbol === 'X' ? 1 : -1
  return card.moves.map(([dr, dc]) => [dr * sign, dc * sign])
}

// ─── Setup & shuffle ────────────────────────────────────────────────────────

export function INITIAL_ONITAMA() {
  const board = Array(ON_CELL_COUNT).fill(EMPTY)
  // X home row is the BOTTOM (row 4); O's is the TOP (row 0). X marches up.
  board[ON_X_TEMPLE] = XM
  for (let c = 0; c < ON_SIZE; c++) {
    if (c !== 2) board[20 + c] = XP
  }
  board[ON_O_TEMPLE] = OM
  for (let c = 0; c < ON_SIZE; c++) {
    if (c !== 2) board[c] = OP
  }
  return board
}

// Deal a random 5-card spread: 2 to X, 2 to O, 1 spare. Returns the four
// plain arrays (no Firebase involved) — the caller persists them.
export function dealCards() {
  const deck = ON_CARDS.map((_, i) => i)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return {
    handX: deck.slice(0, 2),
    handO: deck.slice(2, 4),
    spare: deck[4],
  }
}

export function normalizeOnBoard(rawBoard) {
  const board = Array.isArray(rawBoard) ? rawBoard : []
  return Array.from({ length: ON_CELL_COUNT }, (_, i) => board[i] ?? EMPTY)
}

export function normalizeCardList(v) {
  const arr = Array.isArray(v) ? v : []
  return arr.filter(k => Number.isInteger(k) && k >= 0 && k < ON_CARD_COUNT)
}

// ─── Legal moves ────────────────────────────────────────────────────────────

// All (from, to) pairs the mover can legally play with card k. A move must
// stay on the board, follow one of the card's deltas, not land on a friendly
// piece. Landing on an enemy piece captures it.
export function legalOnMoves(board, symbol, k) {
  const b = normalizeOnBoard(board)
  const deltas = cardDeltas(k, symbol)
  const out = []
  for (let from = 0; from < ON_CELL_COUNT; from++) {
    if (ownerOf(b[from]) !== symbol) continue
    const [fr, fc] = rowColOf(from)
    for (const [dr, dc] of deltas) {
      const r = fr + dr
      const c = fc + dc
      if (r < 0 || r >= ON_SIZE || c < 0 || c >= ON_SIZE) continue
      const to = indexOf(r, c)
      if (ownerOf(b[to]) === symbol) continue
      out.push({ from, to, card: k })
    }
  }
  return out
}

// Does `symbol` have at least one legal move with any card in their hand?
export function hasAnyOnMove(board, symbol, hand) {
  const h = normalizeCardList(hand)
  return h.some(k => legalOnMoves(board, symbol, k).length > 0)
}

// ─── Winner detection ───────────────────────────────────────────────────────
// Returns null while unresolved, else { winner }:
//   - master captured (the captured master is simply gone from the board)
//   - master reached the enemy temple
// Temple goal: X (bottom row, marching up) wins by standing on O's temple
// (top-center, ON_O_TEMPLE); O wins by standing on X's temple (bottom-center).

export function getOnitamaWinner(rawBoard) {
  const board = normalizeOnBoard(rawBoard)
  // X marches UP, so X wins standing on O's temple (top-center); vice versa.
  if (board[ON_O_TEMPLE] === XM) return { winner: 'X', how: 'temple' }
  if (board[ON_X_TEMPLE] === OM) return { winner: 'O', how: 'temple' }
  if (!board.includes(XM)) return { winner: 'O', how: 'capture' }
  if (!board.includes(OM)) return { winner: 'X', how: 'capture' }
  return null
}

// ─── Apply a move ───────────────────────────────────────────────────────────
// Payload { from, to, card }. Returns null if illegal. On success:
//   { board, handX, handO, spare, currentTurn, result }
// — the complete Firebase updates shape for this game.
//
// Card rotation: the played card leaves the mover's hand; the spare joins it.
// The played card becomes the new spare AND flips sides — physically the
// mover passes the card to the opponent, so the opponent's future hand
// includes it. Net effect on the card pool: unchanged (2/2/1 always).
export function applyOnitamaMove(rawBoard, move, symbol, hands) {
  const board = normalizeOnBoard(rawBoard)
  const { from, to, card } = move ?? {}
  if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isInteger(card)) return null
  const rawHandX = normalizeCardList(hands?.handX)
  const rawHandO = normalizeCardList(hands?.handO)
  const rawSpare = hands?.spare
  if (!Number.isInteger(rawSpare) || rawSpare < 0 || rawSpare >= ON_CARD_COUNT) return null
  if (rawHandX.length !== 2 || rawHandO.length !== 2) return null
  if (rawHandX.includes(rawSpare) || rawHandO.includes(rawSpare)) return null

  const ownHand = symbol === 'X' ? rawHandX : rawHandO
  if (!ownHand.includes(card)) return null

  const legal = legalOnMoves(board, symbol, card)
  if (!legal.some(m => m.from === from && m.to === to)) return null

  const next = [...board]
  const captured = ownerOf(next[to]) === (symbol === 'X' ? 'O' : 'X')
  next[from] = EMPTY
  // The moved piece keeps its identity (master stays master).
  next[to] = board[from]

  const handX = [...rawHandX]
  const handO = [...rawHandO]
  const spare = rawSpare
  if (symbol === 'X') {
    handX[handX.indexOf(card)] = spare
  } else {
    handO[handO.indexOf(card)] = spare
  }
  // The played card becomes the spare — passed across the table.
  const nextSpare = card

  const result = getOnitamaWinner(next)
  return {
    board: next,
    handX,
    handO,
    spare: nextSpare,
    currentTurn: symbol === 'X' ? 'O' : 'X',
    captured: captured || undefined,
    result,
  }
}
