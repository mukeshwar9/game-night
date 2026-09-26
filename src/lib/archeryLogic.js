// Archery stores only bounded integer aim inputs. Wind, impact, WA scoring,
// turn order and tie-breaks are replayed identically on every client.
export const ARCHERY_SEATS = ['X', 'O', 'A', 'B']
export const ARROWS_PER_END = 3
export const ARCHERY_FORMATS = {
  quick: { label: 'QUICK', distances: [30, 50, 70], ends: 3 },
  standard: { label: 'STANDARD', distances: [18, 30, 50, 70], ends: 4 },
  marathon: { label: 'MARATHON', distances: [18, 30, 50, 70, 70, 70], ends: 6 },
}
const RING_MM = 61
const X_RING_MM = 30

export function archeryFormat(id = 'standard') {
  return ARCHERY_FORMATS[id] ? id : 'standard'
}

export function scoreArrow(ax, ay) {
  const radiusSq = ax * ax + ay * ay
  let score = 0
  for (let ring = 10; ring >= 1; ring--) {
    const edge = RING_MM * (11 - ring)
    if (radiusSq <= edge * edge) { score = ring; break }
  }
  return { score, x: radiusSq <= X_RING_MM * X_RING_MM }
}

export function idealDrawForDistance(distance) {
  if (distance <= 18) return 680
  if (distance <= 30) return 760
  if (distance <= 50) return 850
  return 940
}

export function arrowResult({ ax = 0, ay = 0, dr = 850, wind = 0, sway = 0, distance = 50 } = {}) {
  // Draw length is the power control; undershooting or overdrawing lifts/drops
  // the arrow relative to the distance-specific sight band.
  const drawOffset = Math.round((idealDrawForDistance(distance) - dr) * 0.55)
  const x = Math.round(ax + wind + sway)
  const y = Math.round(ay + drawOffset)
  return { ax: x, ay: y, ...scoreArrow(x, y) }
}

function hashSeed(seed, index) {
  let x = (Number(seed) | 0) ^ Math.imul(index + 1, 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) >>> 0
}

// Integer millimetres; drift scales with distance and has a predictable
// shorter flight at a fuller draw.
export function windForShot(seed, shotIndex, distance = 50, dr = 850) {
  const signed = (hashSeed(seed, shotIndex) % 201) - 100
  const flightScale = Math.max(35, 100 - Math.floor((dr - 500) / 10))
  return Math.round(signed * distance * flightScale / 10000)
}

export function shotResult(shot, index, seed, distance = shot?.distance ?? 50) {
  return arrowResult({
    ...shot,
    distance,
    wind: shot?.wind ?? windForShot(seed, shot?.shotIndex ?? index, distance, shot?.dr),
  })
}

export function normalizeShots(value) {
  if (Array.isArray(value)) return value.map(shot => shot ?? null)
  if (!value || typeof value !== 'object') return []
  const entries = Object.entries(value).filter(([key]) => /^\d+$/.test(key))
  if (!entries.length) return []
  const shots = Array(Math.max(...entries.map(([key]) => Number(key))) + 1).fill(null)
  for (const [key, shot] of entries) shots[Number(key)] = shot ?? null
  return shots
}

export function seatOrder(seatSymbols = {}) {
  const values = Array.isArray(seatSymbols) ? seatSymbols : Object.values(seatSymbols)
  return ARCHERY_SEATS.filter(symbol => values.includes(symbol))
}

export function arrowTurn(shotCount, seats, format = 'standard') {
  const order = seats.length ? seats : ARCHERY_SEATS.slice(0, 2)
  const ends = ARCHERY_FORMATS[archeryFormat(format)].ends
  const shotsPerEnd = ARROWS_PER_END * order.length
  const end = Math.floor(shotCount / shotsPerEnd)
  const seatIndex = Math.floor((shotCount % shotsPerEnd) / ARROWS_PER_END)
  return {
    end,
    seatIndex,
    seat: order[seatIndex] ?? null,
    arrowInEnd: shotCount % ARROWS_PER_END,
    complete: shotCount >= ends * shotsPerEnd,
  }
}

export function scorecard(shots = [], seats = ARCHERY_SEATS.slice(0, 2), seed = 0, format = 'standard') {
  const rows = Object.fromEntries(seats.map(seat => [seat, { score: 0, xCount: 0, arrows: 0, ends: [] }]))
  normalizeShots(shots).forEach((shot, i) => {
    if (!shot || !rows[shot.by]) return
    const turn = arrowTurn(i, seats, format)
    const config = ARCHERY_FORMATS[archeryFormat(format)]
    const distance = shot.distance ?? (config.distances[turn.end] ?? 70)
    const result = shotResult(shot, i, seed, distance)
    const row = rows[shot.by]
    row.score += result.score
    row.xCount += result.x ? 1 : 0
    row.arrows += 1
    row.ends[turn.end] = (row.ends[turn.end] || 0) + result.score
  })
  return rows
}

export function matchResult(shots, seats, seed = 0, format = 'standard') {
  const card = scorecard(shots, seats, seed, format)
  if (!seats.length) return { card, tied: [], winner: null }
  const highScore = Math.max(...seats.map(seat => card[seat].score))
  const scoreLeaders = seats.filter(seat => card[seat].score === highScore)
  const highX = Math.max(...scoreLeaders.map(seat => card[seat].xCount))
  const tied = scoreLeaders.filter(seat => card[seat].xCount === highX)
  return { card, tied: tied.length > 1 ? tied : [], winner: tied.length === 1 ? tied[0] : null }
}

export function shootOffResult(shots, seats) {
  const records = normalizeShots(shots)
  if (!seats.length || records.length < seats.length || records.slice(0, seats.length).some(shot => !shot)) {
    return { complete: false, winner: null, tied: seats }
  }
  const results = seats.map((seat, i) => {
    const shot = records[i]
    const result = shotResult(shot, i, 0, 70)
    return { seat, score: result.score, radiusSq: result.ax * result.ax + result.ay * result.ay }
  })
  const highScore = Math.max(...results.map(item => item.score))
  const scoreLeaders = results.filter(item => item.score === highScore)
  const closest = Math.min(...scoreLeaders.map(item => item.radiusSq))
  const tied = scoreLeaders.filter(item => item.radiusSq === closest).map(item => item.seat)
  return { complete: true, winner: tied.length === 1 ? tied[0] : null, tied: tied.length > 1 ? tied : [] }
}

// Deterministic settle → sweet window → fatigue curve. `phase` seeds sway so
// holding still still feels alive, while recording sway keeps replays stable.
export function steadyAim(drawMs, assist = true, phase = 0) {
  if (!assist) return 0
  const seconds = Math.max(0, drawMs) / 1000
  const amplitude = seconds < 0.35
    ? 12 - seconds * 24
    : seconds < 1.25
      ? 3 + Math.abs(seconds - 0.8) * 4
      : Math.min(34, 5 + (seconds - 1.25) * 12)
  const wave = Math.sin(seconds * 9 + phase) * amplitude
  return Math.round(wave * 0.5)
}

export function cpuAim(level, rng = Math.random, distance = 70) {
  const spread = [180, 120, 76, 42][Math.max(0, Math.min(3, level))]
  return {
    ax: Math.round((rng() - 0.5) * spread),
    ay: Math.round((rng() - 0.5) * spread),
    dr: idealDrawForDistance(distance),
  }
}

export function appendShot(shots, shot) {
  const list = normalizeShots(shots)
  return [...list, shot]
}

export function advanceArcheryShot(game, shot, seats) {
  if (!game || game.status !== 'playing' || !seats.includes(shot?.by)) return null
  const format = archeryFormat(game.archeryFormat)
  const mainShots = normalizeShots(game.archeryShots)
  const seed = Number(game.archerySeed) || 0
  const phase = game.archeryPhase || 'main'

  if (phase === 'shootOff') {
    const tied = Array.isArray(game.archeryTied) ? game.archeryTied : []
    const existingTieShots = normalizeShots(game.archeryShootOffShots)
    const current = tied[existingTieShots.length % Math.max(1, tied.length)]
    if (shot.by !== current) return null
    const shotIndex = mainShots.length + existingTieShots.length
    const savedShot = {
      by: shot.by, ax: shot.ax ?? 0, ay: shot.ay ?? 0,
      dr: shot.dr ?? 850, sway: shot.sway ?? 0, distance: 70, shotIndex,
      wind: windForShot(seed, shotIndex, 70, shot.dr),
    }
    const shootOffShots = appendShot(game.archeryShootOffShots, savedShot)
    const decision = shootOffResult(shootOffShots, tied)
    if (decision.complete && decision.winner) {
      return { archeryShootOffShots: shootOffShots, currentTurn: decision.winner, winner: decision.winner, status: 'finished' }
    }
    if (decision.complete) {
      return {
        archeryShootOffShots: [], archeryTied: decision.tied,
        currentTurn: decision.tied[0],
      }
    }
    return { archeryShootOffShots: shootOffShots, currentTurn: tied[shootOffShots.length % tied.length] }
  }

  const turn = arrowTurn(mainShots.length, seats, format)
  if (shot.by !== turn.seat || turn.complete) return null
  const config = ARCHERY_FORMATS[format]
  const distance = config.distances[turn.end] ?? 70
  const savedShot = {
    by: shot.by, ax: shot.ax ?? 0, ay: shot.ay ?? 0,
    dr: shot.dr ?? 850, sway: shot.sway ?? 0, distance, shotIndex: mainShots.length,
    wind: windForShot(seed, mainShots.length, distance, shot.dr),
  }
  const archeryShots = appendShot(game.archeryShots, savedShot)
  const nextCount = mainShots.length + 1
  const nextTurn = arrowTurn(nextCount, seats, format)
  if (!nextTurn.complete) return { archeryShots, currentTurn: nextTurn.seat }

  const decision = matchResult(archeryShots, seats, seed, format)
  if (decision.winner) return { archeryShots, currentTurn: decision.winner, winner: decision.winner, status: 'finished' }
  return {
    archeryShots,
    archeryPhase: 'shootOff',
    archeryTied: decision.tied,
    archeryShootOffShots: [],
    currentTurn: decision.tied[0],
  }
}

export function cpuScoreAttack(shots, seed = 0, format = 'standard') {
  return scorecard(shots, ['X'], seed, format).X
}
