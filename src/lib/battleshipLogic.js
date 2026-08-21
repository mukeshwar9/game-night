// battleshipLogic.js — pure core for BATTLESHIP, the platform's first
// hidden-information game. No Firebase, no React.
//
// Trust model (docs/prds/battleship.md): fleets never touch Firebase until the
// game ends. Each client commits `hash(serializeFleet(fleet) + salt)` at
// ready-up; the defender grades incoming shots from its LOCAL fleet; at reveal
// both fleets publish { fleet, salt } and verifyTranscript re-grades every
// shot. Accepted residual holes: mid-battle lies are caught only at reveal
// (game voids in the honest player's favor); a refuser-to-reveal loses by
// forfeit after a grace window.

import { verifyReveal } from './commit'

export const GRID_SIZE = 10
export const CELL_COUNT = GRID_SIZE * GRID_SIZE // 100

// Fixed canonical order — serializeFleet depends on it.
export const FLEET_SPEC = [
  { ship: 'carrier', size: 5 },
  { ship: 'battleship', size: 4 },
  { ship: 'cruiser', size: 3 },
  { ship: 'submarine', size: 3 },
  { ship: 'destroyer', size: 2 },
]

export const SHIP_CELLS = FLEET_SPEC.reduce((n, s) => n + s.size, 0) // 17

const rowOf = cell => Math.floor(cell / GRID_SIZE)
const colOf = cell => cell % GRID_SIZE

// ---------------------------------------------------------------------------
// shipCells — occupied indices for one ship from its top-left cell.
// ---------------------------------------------------------------------------
export function shipCells(size, orient, cell) {
  const cells = []
  for (let i = 0; i < size; i++) {
    cells.push(orient === 'h' ? rowOf(cell) * GRID_SIZE + colOf(cell) + i : cell + i * GRID_SIZE)
  }
  return cells
}

// ---------------------------------------------------------------------------
// validateFleet — null when legal, else a reason string. Ships may touch.
// ---------------------------------------------------------------------------
export function validateFleet(fleet) {
  if (!fleet || typeof fleet !== 'object') return 'missing fleet'
  const seen = new Set()
  for (const { ship, size } of FLEET_SPEC) {
    const entry = fleet[ship]
    if (!entry) return `${ship} missing`
    const { orient, cell } = entry
    if (orient !== 'h' && orient !== 'v') return `${ship} bad orient`
    if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return `${ship} bad cell`
    const cells = shipCells(size, orient, cell)
    if (orient === 'h' && colOf(cell) + size > GRID_SIZE) return `${ship} overflows right`
    if (orient === 'v' && rowOf(cell) + size > GRID_SIZE) return `${ship} overflows bottom`
    for (const c of cells) {
      if (seen.has(c)) return `${ship} overlaps another ship`
      seen.add(c)
    }
  }
  if (seen.size !== SHIP_CELLS) return 'wrong cell count'
  return null
}

// ---------------------------------------------------------------------------
// serializeFleet / parseFleet — the canonical commitment payload. Fixed order,
// so identical fleets always serialize identically regardless of key order.
// ---------------------------------------------------------------------------
export function serializeFleet(fleet) {
  return FLEET_SPEC
    .map(({ ship }) => `${ship}:${fleet[ship].orient}:${fleet[ship].cell}`)
    .join(';')
}

export function parseFleet(str) {
  const parts = String(str).split(';')
  if (parts.length !== FLEET_SPEC.length) throw new Error('malformed fleet string')
  const fleet = {}
  for (let i = 0; i < parts.length; i++) {
    const [ship, orient, cellStr] = parts[i].split(':')
    if (ship !== FLEET_SPEC[i].ship) throw new Error('ships out of canonical order')
    const cell = Number(cellStr)
    if ((orient !== 'h' && orient !== 'v') || !Number.isInteger(cell)) {
      throw new Error(`malformed entry for ${ship}`)
    }
    fleet[ship] = { orient, cell }
  }
  if (validateFleet(fleet)) throw new Error('parsed fleet is invalid')
  return fleet
}

// ---------------------------------------------------------------------------
// randomFleet — valid random placement using rng() only (seedable).
// ---------------------------------------------------------------------------
export function randomFleet(rng = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const fleet = {}
    let ok = true
    const taken = new Set()
    for (const { ship, size } of FLEET_SPEC) {
      let placed = false
      for (let tries = 0; tries < 300 && !placed; tries++) {
        const orient = rng() < 0.5 ? 'h' : 'v'
        const maxRow = orient === 'h' ? GRID_SIZE : GRID_SIZE - size + 1
        const maxCol = orient === 'h' ? GRID_SIZE - size + 1 : GRID_SIZE
        const r = Math.floor(rng() * maxRow)
        const c = Math.floor(rng() * maxCol)
        const cell = r * GRID_SIZE + c
        const cells = shipCells(size, orient, cell)
        if (cells.some(x => taken.has(x))) continue
        cells.forEach(x => taken.add(x))
        fleet[ship] = { orient, cell }
        placed = true
      }
      if (!placed) { ok = false; break }
    }
    if (ok && !validateFleet(fleet)) return fleet
  }
  throw new Error('randomFleet failed to place') // unreachable in practice
}

// ---------------------------------------------------------------------------
// gradeShot — PURE. Shared verbatim by the defender's grader and the reveal
// verifier so they can never diverge. Returns null for repeat/out-of-range
// shots (client blocks them anyway — this is the backstop).
// priorShots: array of { cell } (results not needed here).
// ---------------------------------------------------------------------------
export function gradeShot(fleet, cell, priorShots = []) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT) return null
  if (priorShots.some(s => s.cell === cell)) return null
  const hitShip = Object.keys(fleet).find(ship => {
    const { orient, cell: start } = fleet[ship]
    const size = FLEET_SPEC.find(s => s.ship === ship).size
    return shipCells(size, orient, start).includes(cell)
  })
  if (!hitShip) return 'miss'
  const { orient, cell: start } = fleet[hitShip]
  const size = FLEET_SPEC.find(s => s.ship === hitShip).size
  const remaining = shipCells(size, orient, start)
    .filter(c => c !== cell && !priorShots.some(s => s.cell === c))
  return remaining.length === 0 ? `sunk:${hitShip}` : 'hit'
}

// ---------------------------------------------------------------------------
// allSunk / remainingShips — battle end check + UI silhouettes.
// shots: array of { cell }.
// ---------------------------------------------------------------------------
export function allSunk(fleet, shots = []) {
  return Object.keys(fleet).every(ship => {
    const { orient, cell } = fleet[ship]
    const size = FLEET_SPEC.find(s => s.ship === ship).size
    return shipCells(size, orient, cell).every(c => shots.some(s => s.cell === c))
  })
}

export function remainingShips(fleet, shots = []) {
  return FLEET_SPEC.map(({ ship, size }) => {
    const { orient, cell } = fleet[ship]
    const cells = shipCells(size, orient, cell)
    return { ship, size, sunk: cells.every(c => shots.some(s => s.cell === c)) }
  })
}

// ---------------------------------------------------------------------------
// pickShot — demo-bot targeting. HUNT/TARGET: extend any live hit cluster
// (linear continuation preferred), else parity-weighted random hunt.
// shots: array of { cell, result }. Pure given rng.
// ---------------------------------------------------------------------------
export function pickShot(shots = [], rng = Math.random) {
  const shotCells = new Set(shots.map(s => s.cell))
  const open = []
  for (let c = 0; c < CELL_COUNT; c++) if (!shotCells.has(c)) open.push(c)
  if (!open.length) return null

  // Live hits = hits whose ship isn't sunk yet (approximation: a hit with no
  // 'sunk:<ship>' result recorded after it on that ship — safe demo heuristic:
  // treat every hit as live unless ALL neighbors of the cluster are shot).
  const liveHits = shots.filter(s => s.result === 'hit').map(s => s.cell)
  if (liveHits.length) {
    // Prefer extending a line: find an un-shot neighbor of any live hit that
    // continues a 2+ horizontal/vertical run first.
    const lineTargets = []
    for (const h of liveHits) {
      const r = rowOf(h), c = colOf(h)
      const pairs = [
        [r, c - 1, r, c + 1], [r - 1, c, r + 1, c],
      ]
      for (const [r1, c1, r2, c2] of pairs) {
        const a = r1 >= 0 && r1 < GRID_SIZE && c1 >= 0 && c1 < GRID_SIZE ? r1 * GRID_SIZE + c1 : -1
        const b = r2 >= 0 && r2 < GRID_SIZE && c2 >= 0 && c2 < GRID_SIZE ? r2 * GRID_SIZE + c2 : -1
        const aShot = a >= 0 && shotCells.has(a)
        const bShot = b >= 0 && shotCells.has(b)
        if (aShot && !bShot && b >= 0) lineTargets.push(b)
        if (bShot && !aShot && a >= 0) lineTargets.push(a)
      }
    }
    const usable = lineTargets.filter(t => !shotCells.has(t))
    if (usable.length) return usable[Math.floor(rng() * usable.length)]

    // Plain adjacency to any live hit.
    const adjacents = []
    for (const h of liveHits) {
      const r = rowOf(h), c = colOf(h)
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue
        const n = nr * GRID_SIZE + nc
        if (!shotCells.has(n)) adjacents.push(n)
      }
    }
    if (adjacents.length) return adjacents[Math.floor(rng() * adjacents.length)]
  }

  // Hunt: parity cells (checkerboard) 70% of the time.
  const parity = open.filter(c => (rowOf(c) + colOf(c)) % 2 === 0)
  const pool = parity.length && rng() < 0.7 ? parity : open
  return pool[Math.floor(rng() * pool.length)]
}

// ---------------------------------------------------------------------------
// verifyTranscript — the reveal-time referee. Re-grades EVERY recorded shot
// against the revealed fleet IN TRANSCRIPT ORDER (each shot graded against
// only the shots before it — grading is sequential, so 'hit' before the
// sinking shot must not retroactively become 'sunk'). Any divergence voids
// the game in the honest player's favor.
// shots: array of { cell, result } in chronological (pushId) order.
// ---------------------------------------------------------------------------
export async function verifyTranscript(revealedFleet, salt, committedHash, shots = []) {
  let serialized
  try {
    serialized = serializeFleet(revealedFleet)
  } catch {
    return { ok: false, reason: 'fleet' }
  }
  const commitmentOk = await verifyReveal(committedHash, serialized, salt)
  if (!commitmentOk) return { ok: false, reason: 'commitment' }
  if (validateFleet(revealedFleet)) return { ok: false, reason: 'fleet' }
  const prior = []
  for (const shot of shots) {
    const expected = gradeShot(revealedFleet, shot.cell, prior)
    if (expected !== shot.result) return { ok: false, reason: 'transcript' }
    prior.push({ cell: shot.cell })
  }
  return { ok: true }
}
