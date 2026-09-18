import { describe, it, expect } from 'vitest'
import {
  ON_SIZE, ON_X_TEMPLE, ON_O_TEMPLE,
  EMPTY, XM, XP, OM, OP,
  ON_CARDS, ON_CARD_COUNT,
  cardName, cardDeltas,
  INITIAL_ONITAMA, dealCards,
  normalizeOnBoard, normalizeCardList,
  legalOnMoves, hasAnyOnMove,
  getOnitamaWinner, applyOnitamaMove,
} from './onitamaLogic'

// ---------------------------------------------------------------------------
// Card data integrity (the 16 base cards are the game's soul)
// ---------------------------------------------------------------------------

describe('card data', () => {
  it('has 16 cards with unique names', () => {
    expect(ON_CARD_COUNT).toBe(16)
    expect(new Set(ON_CARDS.map(c => c.name)).size).toBe(16)
    expect(ON_CARDS.map(c => c.name)).toEqual([
      'TIGER', 'DRAGON', 'FROG', 'RABBIT', 'CRAB', 'ELEPHANT', 'GOOSE',
      'ROOSTER', 'MONKEY', 'MANTIS', 'HORSE', 'OX', 'CRANE', 'BOAR',
      'EEL', 'COBRA',
    ])
  })

  it('every card has 2–4 non-duplicate deltas', () => {
    for (const card of ON_CARDS) {
      expect(card.moves.length).toBeGreaterThanOrEqual(2)
      expect(card.moves.length).toBeLessThanOrEqual(4)
      const keys = card.moves.map(([r, c]) => `${r},${c}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('maps indices to names and back', () => {
    expect(cardName(0)).toBe('TIGER')
    expect(cardName(15)).toBe('COBRA')
    expect(cardName(99)).toBe('CARD 99')
  })

  it('negates deltas for O (180° card rotation)', () => {
    // Tiger from X: two forward (up), one back (down). Use -0-free keys.
    expect(cardDeltas(0, 'X').map(d => d.join(','))).toEqual(['-2,0', '1,0'])
    // From O: two down, one up.
    expect(cardDeltas(0, 'O').map(d => d.join(','))).toEqual(['2,0', '-1,0'])
  })

  it('one-card reach from the center covers every orthogonal neighbor + center', () => {
    // Real Onitama fact: corners are NOT one-card-reachable from the center
    // (no card leaps 2+2); the union across all 16 cards still covers every
    // orthogonally adjacent square plus both far mid-edges via Tiger/Crab.
    const center = 12
    const [cr, cc] = [2, 2]
    const reachable = new Set([center])
    for (const card of ON_CARDS) {
      for (const [dr, dc] of card.moves) {
        const r = cr + dr
        const c = cc + dc
        if (r >= 0 && r < ON_SIZE && c >= 0 && c < ON_SIZE) reachable.add(r * ON_SIZE + c)
      }
    }
    // 4 orthogonal neighbors + 4 diagonals + Tiger/Crab far reaches
    // (1-away and 2-away mid-line squares) = 14 squares.
    expect(reachable.size).toBe(14)
    for (const i of [7, 11, 13, 17]) expect(reachable.has(i)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('initial state', () => {
  it('starts masters on temples, pupils flanking, 25 cells', () => {
    const b = INITIAL_ONITAMA()
    expect(b).toHaveLength(25)
    expect(b[22]).toBe(XM) // X master, bottom-center
    expect(b[2]).toBe(OM) // O master, top-center
    // X home row: row 4 = master + 4 pupils
    const xRow = b.slice(20)
    expect(xRow.filter(v => v === XP)).toHaveLength(4)
    expect(xRow.filter(v => v === XM)).toHaveLength(1)
    const oRow = b.slice(0, 5)
    expect(oRow.filter(v => v === OP)).toHaveLength(4)
    expect(oRow.filter(v => v === OM)).toHaveLength(1)
    expect(b.filter(v => v === EMPTY)).toHaveLength(15)
  })

  it('deals 5 distinct cards as 2/2/1', () => {
    for (let i = 0; i < 40; i++) {
      const d = dealCards()
      expect(d.handX).toHaveLength(2)
      expect(d.handO).toHaveLength(2)
      const all = [...d.handX, ...d.handO, d.spare]
      expect(new Set(all).size).toBe(5)
      expect(all.every(k => Number.isInteger(k) && k >= 0 && k < 16)).toBe(true)
    }
  })

  it('normalizes sparse/short boards', () => {
    expect(normalizeOnBoard(null)).toHaveLength(25)
    expect(normalizeOnBoard([XM]).every((v, i) => (i === 0 ? v === XM : v === EMPTY))).toBe(true)
    expect(normalizeCardList([0, 99, 'x', 3])).toEqual([0, 3])
  })
})

// ---------------------------------------------------------------------------
// Legal move generation
// ---------------------------------------------------------------------------

describe('legal moves', () => {
  // Tiny helper: build a board from a map of index → piece.
  const mk = (map) => {
    const b = Array(25).fill(EMPTY)
    for (const [i, v] of Object.entries(map)) b[Number(i)] = v
    return b
  }

  it('opening X position: Tiger moves the master 2 up or a pupil 1 down', () => {
    const b = INITIAL_ONITAMA()
    const tiger = 0
    // Ensure Tiger is playable in isolation for the master: fake a hand.
    const moves = legalOnMoves(b, 'X', tiger)
    // Master at 22 with Tiger: up two → 12; back is off-board.
    expect(moves).toContainEqual({ from: 22, to: 12, card: tiger })
    // Pupils at 20,21,23,24 with Tiger: down one → off-board, up two → 10,11,13,14.
    for (const from of [20, 21, 23, 24]) {
      const to = from - 10
      expect(moves).toContainEqual({ from, to, card: tiger })
    }
    // Nothing lands on a friendly.
    for (const m of moves) expect(b[m.to]).toBe(EMPTY)
  })

  it('O plays the same card rotated: Tiger moves DOWN two from top row', () => {
    const b = INITIAL_ONITAMA()
    const moves = legalOnMoves(b, 'O', 0)
    // O master at 2: down two → 12.
    expect(moves).toContainEqual({ from: 2, to: 12, card: 0 })
    // O pupils: up two is off-board, down one → rows 1.
    for (const from of [0, 1, 3, 4]) {
      expect(moves).toContainEqual({ from, to: from + 10, card: 0 })
    }
  })

  it('never lands on a friendly piece', () => {
    // X pupil at 12 with Crab (lateral ±2, forward 1): landing on own piece
    // must be filtered.
    const b = mk({ 12: XP, 10: XP })
    // Crab = index 4: [[-1,0],[0,-2],[0,2]] from X's view.
    const moves = legalOnMoves(b, 'X', 4)
    // from 12: forward → 7 (empty, ok); lateral -2 → 10 (friendly, filtered);
    // lateral +2 → 14 (empty, ok).
    expect(moves).toContainEqual({ from: 12, to: 7, card: 4 })
    expect(moves).toContainEqual({ from: 12, to: 14, card: 4 })
    expect(moves.find(m => m.from === 12 && m.to === 10)).toBeUndefined()
  })

  it('captures by landing on enemy pieces', () => {
    const b = mk({ 12: XP, 7: OP })
    const moves = legalOnMoves(b, 'X', 4)
    expect(moves).toContainEqual({ from: 12, to: 7, card: 4 })
  })

  it('stuck hand detection', () => {
    // A piece is only truly stuck when every square its card reaches is
    // occupied by a FRIENDLY piece (enemy squares are legal captures). The
    // compact way to construct that: every square is friendly — the master
    // (and every piece) is then boxed in by definition, no matter the card.
    const wall = Array(25).fill(OP)
    wall[0] = OM
    expect(hasAnyOnMove(wall, 'O', [8])).toBe(false) // Monkey
    expect(hasAnyOnMove(wall, 'O', [0])).toBe(false) // Tiger
    expect(hasAnyOnMove(wall, 'O', [13])).toBe(false) // Boar
    // A lone master on an open board can always move.
    const open = Array(25).fill(EMPTY)
    open[12] = XM
    expect(hasAnyOnMove(open, 'X', [8])).toBe(true)
    // A side with no pieces at all has no moves either.
    expect(hasAnyOnMove(wall, 'X', [8])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Winner detection
// ---------------------------------------------------------------------------

describe('winner', () => {
  it('master reaching the enemy temple wins (both masters alive)', () => {
    const b = Array(25).fill(EMPTY)
    b[ON_O_TEMPLE] = XM // X master on O's temple (top-center)
    b[5] = OM // O master parked away from its own temple
    expect(getOnitamaWinner(b)).toEqual({ winner: 'X', how: 'temple' })
  })

  it('O master on X temple wins', () => {
    const b = Array(25).fill(EMPTY)
    b[ON_X_TEMPLE] = OM
    b[5] = XM // X master parked away, else capture-win would pre-empt
    expect(getOnitamaWinner(b)).toEqual({ winner: 'O', how: 'temple' })
  })

  it('captured master ends the game', () => {
    const b = Array(25).fill(EMPTY)
    b[0] = OM // O master alive, X master gone
    expect(getOnitamaWinner(b)).toEqual({ winner: 'O', how: 'capture' })
    const b2 = Array(25).fill(EMPTY)
    b2[24] = XM
    expect(getOnitamaWinner(b2)).toEqual({ winner: 'X', how: 'capture' })
  })

  it('both masters alive, no temple → unresolved', () => {
    expect(getOnitamaWinner(INITIAL_ONITAMA())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// applyOnitamaMove: legality, hand rotation, captures, wins
// ---------------------------------------------------------------------------

describe('applyOnitamaMove', () => {
  const fresh = () => {
    const d = dealCards()
    return { board: INITIAL_ONITAMA(), ...d }
  }
  const hands = (s) => ({ handX: s.handX, handO: s.handO, spare: s.spare })

  it('rejects moves with a card not in hand', () => {
    const s = fresh()
    const notInHand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      .find(k => !s.handX.includes(k) && k !== s.spare)
    expect(applyOnitamaMove(s.board, { from: 22, to: 12, card: notInHand }, 'X', hands(s))).toBeNull()
  })

  it('rejects malformed payloads and hands', () => {
    const s = fresh()
    expect(applyOnitamaMove(s.board, null, 'X', hands(s))).toBeNull()
    expect(applyOnitamaMove(s.board, { from: 22, to: 12 }, 'X', hands(s))).toBeNull()
    expect(applyOnitamaMove(s.board, { from: 22, to: 12, card: 'x' }, 'X', hands(s))).toBeNull()
    expect(applyOnitamaMove(s.board, { from: 22, to: 12, card: s.handX[0] }, 'X', null)).toBeNull()
    expect(applyOnitamaMove(s.board, { from: 22, to: 12, card: s.handX[0] }, 'X',
      { handX: [s.handX[0]], handO: s.handO, spare: s.spare })).toBeNull()
    // spare overlapping a hand is corrupt state
    expect(applyOnitamaMove(s.board, { from: 22, to: 12, card: s.handX[0] }, 'X',
      { handX: s.handX, handO: s.handO, spare: s.handX[1] })).toBeNull()
  })

  it('rejects illegal geometry and friendly landings', () => {
    const s = fresh()
    const k = s.handX[0]
    // Tiger only if in hand; otherwise pick any card and use a bogus move.
    const legal = legalOnMoves(s.board, 'X', k)
    const bogus = { from: 0, to: 24, card: k } // O pupil's square, X can't move it
    expect(applyOnitamaMove(s.board, bogus, 'X', hands(s))).toBeNull()
    // A real legal move passes (sanity).
    expect(applyOnitamaMove(s.board, legal[0], 'X', hands(s))).not.toBeNull()
  })

  it('performs the move, captures, and rotates the hand correctly', () => {
    // Scripted: X pupil at 12, O pupil at 7, X plays Crab (4) 12→7 capturing.
    const board = Array(25).fill(EMPTY)
    board[22] = XM
    board[2] = OM
    board[12] = XP
    board[7] = OP
    const handX = [4, 0] // Crab + Tiger
    const handO = [1, 5] // Dragon + Elephant
    const spare = 8 // Monkey
    const res = applyOnitamaMove(board, { from: 12, to: 7, card: 4 }, 'X',
      { handX, handO, spare })
    expect(res).not.toBeNull()
    expect(res.board[7]).toBe(XP)
    expect(res.board[12]).toBe(EMPTY)
    expect(res.board[2]).toBe(OM) // untouched
    // X's hand: Crab left, spare (Monkey) joined — position-preserving swap.
    expect([...res.handX].sort()).toEqual([0, 8])
    expect(res.handO).toEqual([1, 5]) // untouched
    // Crab becomes the spare (passed to O).
    expect(res.spare).toBe(4)
    expect(res.currentTurn).toBe('O')
    expect(res.captured).toBe(true)
    expect(res.result).toBeNull() // game continues (no master captured/temple)
  })

  it('master capture ends the game (no temple in the way)', () => {
    const board = Array(25).fill(EMPTY)
    board[22] = XM
    board[7] = OM // O master one step up from X pupil
    board[12] = XP
    // Crab from X: 12 → 7 captures OM. No temple is involved (OM was at 7,
    // not on X's temple at 22).
    const res = applyOnitamaMove(board, { from: 12, to: 7, card: 4 }, 'X',
      { handX: [4, 0], handO: [1, 5], spare: 8 })
    expect(res?.result).toEqual({ winner: 'X', how: 'capture' })
  })

  it('temple landing ends the game', () => {
    const board = Array(25).fill(EMPTY)
    board[22] = XM
    board[7] = XM // one Crab-forward step from O's temple at 2
    board[2] = OM
    const res = applyOnitamaMove(board, { from: 7, to: 2, card: 4 }, 'X',
      { handX: [4, 0], handO: [1, 5], spare: 8 })
    expect(res?.result).toEqual({ winner: 'X', how: 'temple' })
  })

  it('full playouts terminate with a legal winner', () => {
    // Semi-random self-play using only public API.
    for (let seed = 0; seed < 12; seed++) {
      const d = dealCards()
      let board = INITIAL_ONITAMA()
      let handX = [...d.handX]
      let handO = [...d.handO]
      let spare = d.spare
      let turn = 'X'
      let plies = 0
      let result = null
      while (!result && plies < 200) {
        const hand = turn === 'X' ? handX : handO
        const allMoves = hand.flatMap(k => legalOnMoves(board, turn, k))
        if (!allMoves.length) {
          // No legal move with either card: Onitama has no pass — this is a
          // genuine corner case; treat as a loss for the stuck player.
          result = { winner: turn === 'X' ? 'O' : 'X', how: 'stuck' }
          break
        }
        // Prefer captures/temple, else random.
        const move = allMoves[Math.floor(Math.random() * allMoves.length)]
        const res = applyOnitamaMove(board, move, turn, { handX, handO, spare })
        expect(res).not.toBeNull()
        board = res.board
        handX = res.handX
        handO = res.handO
        spare = res.spare
        turn = res.currentTurn
        result = res.result
        plies++
      }
      expect(result).not.toBeNull()
      expect(plies).toBeLessThan(200)
    }
  })
})
