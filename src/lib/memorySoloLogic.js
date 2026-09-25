// Single-player runs of the memory games, for the /solo/:type page. The online games
// are duels; played alone they used to be a hot-seat "Alice vs Bob" on one screen
// (so the second seat watched the first seat's reveal). These are the classic solo
// formats instead: the game grows until you slip, and your best run is the score.
// Pure state transitions only — the page components own timers and storage.

import { SIMON_PADS } from './simonLogic'
import { generateVmPattern, VM_START_LEVEL, vmCellCount } from './visualMemoryLogic'
import { generateChimpLayout, CHIMP_START_LEVEL, CHIMP_GRID } from './chimpLogic'
import { generateNumber } from './numberMemoryLogic'

// Visual Memory and Chimp Test forgive a slip: a wrong tap costs a life and replays
// the level with a fresh layout; the run ends when the lives are gone.
export const SOLO_LIVES = 3

const randomPad = (rand = Math.random) => Math.floor(rand() * SIMON_PADS)

// ── Simon: the game adds one pad per round, you repeat the whole sequence ──

export function startSimonSolo(rand = Math.random) {
  return { seq: [randomPad(rand)], progress: 0, score: 0, over: false, miss: null }
}

// score = length of the longest sequence repeated in full.
export function applySimonSoloPress(state, pad, rand = Math.random) {
  if (state.over || pad < 0 || pad >= SIMON_PADS) return state
  if (pad !== state.seq[state.progress]) return { ...state, over: true, miss: pad }
  const progress = state.progress + 1
  if (progress < state.seq.length) return { ...state, progress }
  return { ...state, seq: [...state.seq, randomPad(rand)], progress: 0, score: state.seq.length }
}

// ── Visual Memory: one more tile per level, the grid grows with it ──

export function startVmSolo(gen = generateVmPattern) {
  return {
    level: VM_START_LEVEL, pattern: gen(VM_START_LEVEL), clicked: [],
    lives: SOLO_LIVES, over: false, miss: null, lostLife: false,
  }
}

export function applyVmSoloTap(state, cell, gen = generateVmPattern) {
  if (state.over || cell < 0 || cell >= vmCellCount(state.level) || state.clicked.includes(cell)) return state
  if (!state.pattern.includes(cell)) {
    const lives = state.lives - 1
    if (lives <= 0) return { ...state, lives: 0, over: true, miss: cell, lostLife: true }
    // Same level again, new pattern.
    return { ...state, lives, pattern: gen(state.level), clicked: [], miss: null, lostLife: true }
  }
  const clicked = [...state.clicked, cell]
  if (clicked.length < state.pattern.length) return { ...state, clicked, lostLife: false }
  const level = state.level + 1
  return { ...state, level, pattern: gen(level), clicked: [], miss: null, lostLife: false }
}

// Levels fully cleared this run.
export function vmSoloScore(state) {
  return state.level - VM_START_LEVEL
}

// ── Chimp Test: numbers hide once you start; tap them in order ──

export function startChimpSolo(gen = generateChimpLayout) {
  return {
    level: CHIMP_START_LEVEL, layout: gen(CHIMP_START_LEVEL), progress: 0,
    lives: SOLO_LIVES, over: false, miss: null, lostLife: false,
  }
}

export function applyChimpSoloTap(state, cell, gen = generateChimpLayout) {
  if (state.over || cell < 0 || cell >= CHIMP_GRID) return state
  if (state.layout[state.progress] !== cell) {
    const lives = state.lives - 1
    if (lives <= 0) return { ...state, lives: 0, over: true, miss: cell, lostLife: true }
    return { ...state, lives, layout: gen(state.level), progress: 0, miss: null, lostLife: true }
  }
  const progress = state.progress + 1
  if (progress < state.layout.length) return { ...state, progress, lostLife: false }
  const level = Math.min(state.level + 1, CHIMP_GRID)
  return { ...state, level, layout: gen(level), progress: 0, miss: null, lostLife: false }
}

// Highest count of numbers recalled in order (the level last cleared).
export function chimpSoloScore(state) {
  return state.level - 1
}

// ── Number Memory: one more digit per level, one miss ends the run ──

export function startNumberSolo(gen = generateNumber) {
  return { level: 1, number: gen(1), phase: 'showing', answer: null, over: false }
}

export function submitNumberSolo(state, answer, gen = generateNumber) {
  if (state.over || state.phase !== 'recall') return state
  const guess = String(answer ?? '').trim()
  if (guess === state.number) {
    const level = state.level + 1
    return { level, number: gen(level), phase: 'showing', answer: null, over: false }
  }
  return { ...state, phase: 'over', answer: guess, over: true }
}

// Digits recalled correctly in the longest cleared level.
export function numberSoloScore(state) {
  return state.level - 1
}
