// LANTERNS: a two-player co-op card game about hidden hands. You hold five
// lantern cards facing away from you: you see your partner's hand, never your
// own. Take turns to give a clue, discard a card or play one onto its suit's
// row. Rows must climb 1→5 in order. Pure logic: no DOM, no Firebase, no React.
//
// Round shape (games/{id}/round):
//   phase:      'setup' | 'playing' | 'done'
//   mode:       'full' (5 suits, max 25) | 'short' (4 suits, max 20)
//   deck:       card[] still to draw (top is index 0)
//   hands:      { X: card[], O: card[] }, oldest card last, newest at index 0
//   knowledge:  { X: mark[], O: mark[] } — what each seat has been told about
//               the card in the same slot of their own hand
//   stacks:     number[] — top number laid on each suit's row (0 = empty)
//   discards:   card[]
//   clues, fuses, finalTurns (null until the deck runs out), turn, lastAction
//   result:     { outcome: 'win' | 'loss', reason, score, max } once done
// card = { id, s, n } (s = suit index, n = 1–5); mark = { s, n, notS, notN }
// where s/n are the known suit/number (absent when unknown) and notS/notN are
// bitmasks of ruled-out suits/numbers.

export const SUITS = [
  { key: 'orb', name: 'ORB', glyph: '●' },
  { key: 'peak', name: 'PEAK', glyph: '▲' },
  { key: 'block', name: 'BLOCK', glyph: '■' },
  { key: 'gem', name: 'GEM', glyph: '◆' },
  { key: 'star', name: 'STAR', glyph: '★' },
]
export const MODES = {
  full: { suits: 5, label: 'FULL', desc: '5 suits · up to 25' },
  short: { suits: 4, label: 'SHORT', desc: '4 suits · up to 20' },
}
export const COPIES = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 }
export const HAND_SIZE = 5
export const MAX_CLUES = 8
export const MAX_FUSES = 3
// A score at or above this share of the maximum counts as a team win (it
// adds one to both seats' scores, the Word Co-op precedent).
export const WIN_SHARE = 0.8

export const suitCount = (mode) => (MODES[mode] || MODES.full).suits
export const maxScore = (mode) => suitCount(mode) * 5
export const winThreshold = (mode) => Math.ceil(maxScore(mode) * WIN_SHARE)
export const other = (seat) => (seat === 'X' ? 'O' : 'X')

export function buildDeck(mode) {
  const deck = []
  for (let s = 0; s < suitCount(mode); s++) {
    for (let n = 1; n <= 5; n++) {
      for (let c = 0; c < COPIES[n]; c++) deck.push({ id: deck.length, s, n })
    }
  }
  return deck
}

export function shuffle(list, rng = Math.random) {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const blankMark = () => ({ notS: 0, notN: 0 })

export function dealRound({ mode = 'full', starter = 'X', rng = Math.random } = {}) {
  const safeMode = MODES[mode] ? mode : 'full'
  const deck = shuffle(buildDeck(safeMode), rng)
  const hands = { X: [], O: [] }
  for (let i = 0; i < HAND_SIZE; i++) {
    hands.X.push(deck.shift())
    hands.O.push(deck.shift())
  }
  return {
    phase: 'playing',
    mode: safeMode,
    deck,
    hands,
    knowledge: {
      X: hands.X.map(blankMark),
      O: hands.O.map(blankMark),
    },
    stacks: Array(suitCount(safeMode)).fill(0),
    discards: [],
    clues: MAX_CLUES,
    fuses: 0,
    finalTurns: null,
    turn: starter === 'O' ? 'O' : 'X',
    lastAction: null,
    result: null,
  }
}

// Firebase drops empty arrays and null fields and may hand arrays back as
// numeric-keyed objects: rebuild every array by explicit key so positions
// never shift (knowledge marks must stay beside their cards).
function toArray(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.slice()
  const out = []
  Object.entries(raw).forEach(([k, v]) => {
    const i = parseInt(k, 10)
    if (Number.isInteger(i) && i >= 0) out[i] = v
  })
  return out
}
const present = (list) => list.filter(v => v != null)

const normCard = (c) => ({ id: Number(c?.id) || 0, s: Number(c?.s) || 0, n: Number(c?.n) || 1 })
const normMark = (m) => {
  const out = { notS: Number(m?.notS) || 0, notN: Number(m?.notN) || 0 }
  if (Number.isInteger(m?.s)) out.s = m.s
  if (Number.isInteger(m?.n)) out.n = m.n
  return out
}

export function normalizeRound(raw) {
  if (!raw) return null
  if (raw.phase !== 'playing' && raw.phase !== 'done') return { ...raw }
  const mode = MODES[raw.mode] ? raw.mode : 'full'
  const stacks = Array.from(toArray(raw.stacks), v => Number(v) || 0)
  while (stacks.length < suitCount(mode)) stacks.push(0)
  const hands = { X: present(toArray(raw.hands?.X)).map(normCard), O: present(toArray(raw.hands?.O)).map(normCard) }
  const knowledge = {}
  for (const seat of ['X', 'O']) {
    const marks = toArray(raw.knowledge?.[seat])
    knowledge[seat] = hands[seat].map((_, i) => normMark(marks[i]))
  }
  return {
    ...raw,
    mode,
    deck: present(toArray(raw.deck)).map(normCard),
    hands,
    knowledge,
    stacks: stacks.slice(0, suitCount(mode)),
    discards: present(toArray(raw.discards)).map(normCard),
    clues: Number.isFinite(raw.clues) ? raw.clues : MAX_CLUES,
    fuses: Number.isFinite(raw.fuses) ? raw.fuses : 0,
    finalTurns: Number.isFinite(raw.finalTurns) ? raw.finalTurns : null,
    turn: raw.turn === 'O' ? 'O' : 'X',
    lastAction: raw.lastAction || null,
    result: raw.result || null,
  }
}

export const scoreOf = (round) => (round?.stacks || []).reduce((a, b) => a + (Number(b) || 0), 0)

// Cards that are still worth saving: a card is critical when it is the last
// live copy of a number its row still needs.
export function isCritical(round, card) {
  if (!round || !card) return false
  if ((round.stacks[card.s] || 0) >= card.n) return false
  const discarded = round.discards.filter(c => c.s === card.s && c.n === card.n).length
  return COPIES[card.n] - discarded === 1
}

export const isPlayable = (round, card) => !!card && (round.stacks[card.s] || 0) + 1 === card.n

// The highest score still reachable, given what has been discarded.
export function maxReachable(round) {
  let total = 0
  for (let s = 0; s < round.stacks.length; s++) {
    let top = 5
    for (let n = 1; n <= 5; n++) {
      const gone = round.discards.filter(c => c.s === s && c.n === n).length
      if (gone >= COPIES[n] && n > round.stacks[s]) { top = n - 1; break }
    }
    total += Math.max(round.stacks[s], top)
  }
  return total
}

// Which of the partner's slots a clue would mark. [] means the clue is illegal
// (a clue must point at one card or more).
export function clueTargets(round, target, clue) {
  const hand = round?.hands?.[target] || []
  return hand
    .map((c, i) => ((clue.kind === 'suit' ? c.s === clue.value : c.n === clue.value) ? i : -1))
    .filter(i => i >= 0)
}

export function actionProblem(round, seat, action) {
  if (!round || round.phase !== 'playing') return 'NOT PLAYING'
  if (round.turn !== seat) return 'NOT YOUR TURN'
  if (!action) return 'NO ACTION'
  const hand = round.hands[seat]
  if (action.type === 'clue') {
    if (round.clues <= 0) return 'NO CLUES LEFT — PLAY OR DISCARD'
    if (action.kind !== 'suit' && action.kind !== 'number') return 'BAD CLUE'
    if (action.kind === 'suit' && !(action.value >= 0 && action.value < round.stacks.length)) return 'BAD CLUE'
    if (action.kind === 'number' && !(action.value >= 1 && action.value <= 5)) return 'BAD CLUE'
    if (clueTargets(round, other(seat), action).length === 0) return 'THAT CLUE MARKS NO CARDS'
    return null
  }
  if (action.type === 'discard' || action.type === 'play') {
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= hand.length) return 'PICK A CARD'
    if (action.type === 'discard' && round.clues >= MAX_CLUES) return 'CLUES ARE FULL — CLUE OR PLAY'
    return null
  }
  return 'NO ACTION'
}

function drawInto(next, seat) {
  if (next.deck.length === 0) return
  const card = next.deck.shift()
  next.hands[seat] = [card, ...next.hands[seat]]
  next.knowledge[seat] = [blankMark(), ...next.knowledge[seat]]
  // The last card drawn: each player gets exactly one more turn.
  if (next.deck.length === 0 && next.finalTurns === null) next.finalTurns = 2
}

function finish(next, outcome, reason) {
  const score = scoreOf(next)
  next.phase = 'done'
  next.result = { outcome, reason, score, max: maxScore(next.mode) }
  return next
}

// Applies one action for `seat`. Returns the next round, or null when the
// action is not legal (the caller's transaction then aborts).
export function applyAction(rawRound, seat, action, at = 0) {
  const round = normalizeRound(rawRound)
  if (actionProblem(round, seat, action)) return null
  const next = {
    ...round,
    deck: round.deck.slice(),
    hands: { X: round.hands.X.slice(), O: round.hands.O.slice() },
    knowledge: { X: round.knowledge.X.map(m => ({ ...m })), O: round.knowledge.O.map(m => ({ ...m })) },
    stacks: round.stacks.slice(),
    discards: round.discards.slice(),
  }
  const hadFinal = next.finalTurns !== null
  let last

  if (action.type === 'clue') {
    const target = other(seat)
    const hit = clueTargets(next, target, action)
    next.knowledge[target] = next.knowledge[target].map((mark, i) => {
      const m = { ...mark }
      const bit = 1 << action.value
      if (hit.includes(i)) {
        if (action.kind === 'suit') m.s = action.value
        else m.n = action.value
      } else if (action.kind === 'suit') m.notS |= bit
      else m.notN |= bit
      return m
    })
    next.clues -= 1
    last = { type: 'clue', by: seat, kind: action.kind, value: action.value, slots: hit, at }
  } else {
    const [card] = next.hands[seat].splice(action.slot, 1)
    next.knowledge[seat].splice(action.slot, 1)
    if (action.type === 'discard') {
      next.discards.push(card)
      next.clues = Math.min(MAX_CLUES, next.clues + 1)
      last = { type: 'discard', by: seat, card, slot: action.slot, at }
    } else if (isPlayable(next, card)) {
      next.stacks[card.s] = card.n
      // Completing a row hands back a clue token.
      if (card.n === 5 && next.clues < MAX_CLUES) next.clues += 1
      last = { type: 'play', by: seat, card, slot: action.slot, ok: true, at }
    } else {
      next.discards.push(card)
      next.fuses += 1
      last = { type: 'play', by: seat, card, slot: action.slot, ok: false, at }
    }
    drawInto(next, seat)
  }

  next.lastAction = last
  if (hadFinal) next.finalTurns -= 1
  next.turn = other(seat)

  const score = scoreOf(next)
  const max = maxScore(next.mode)
  if (next.fuses >= MAX_FUSES) return finish(next, 'loss', 'fuses')
  if (score >= max) return finish(next, 'win', 'perfect')
  if (next.finalTurns !== null && next.finalTurns <= 0) {
    return finish(next, score >= winThreshold(next.mode) ? 'win' : 'loss', 'deck')
  }
  // Both hands empty can only happen at the very end; treat it like the deck.
  if (next.hands.X.length === 0 && next.hands.O.length === 0) {
    return finish(next, score >= winThreshold(next.mode) ? 'win' : 'loss', 'deck')
  }
  return next
}

// Evening rating shown with the final score (our own ladder).
export function ratingFor(score, mode) {
  const share = score / maxScore(mode)
  if (share >= 1) return 'A PERFECT FESTIVAL'
  if (share >= WIN_SHARE) return 'THE SKY IS FULL'
  if (share >= 0.6) return 'A BRIGHT EVENING'
  if (share >= 0.4) return 'A WARM GLOW'
  if (share > 0) return 'A FEW SPARKS'
  return 'THE NIGHT STAYED DARK'
}

// Short text for the last action banner.
export function describeAction(action, names = {}) {
  if (!action) return ''
  const who = names[action.by] || action.by
  if (action.type === 'clue') {
    const what = action.kind === 'suit'
      ? `${SUITS[action.value].glyph} ${SUITS[action.value].name}`
      : `${action.value}s`
    const count = action.slots?.length || 0
    return `${who} CLUED ${what} · ${count} CARD${count === 1 ? '' : 'S'}`
  }
  const card = action.card ? `${SUITS[action.card.s].glyph}${action.card.n}` : ''
  if (action.type === 'discard') return `${who} DISCARDED ${card}`
  return action.ok ? `${who} LIT ${card}` : `${who} MISFIRED ${card} · FUSE BURNS`
}
