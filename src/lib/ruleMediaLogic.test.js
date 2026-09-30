import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import manifest from './ruleMedia.json'
import { GAME_RULES } from './rules'
import { getRuleMedia, lookFor, stepCaption, stepIndex, stillPath } from './ruleMediaLogic'

// games.js pulls in board components that touch `localStorage` at module load.
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {} }
}
let GAME_TYPES
beforeAll(async () => { ;({ GAME_TYPES } = await import('./games')) })

// scripts/rule-media.mjs hashes the same way.
const hashOf = files => createHash('sha256').update(files.map(f => readFileSync(f, 'utf8')).join('\0')).digest('hex').slice(0, 12)
const SOURCES = {
  tictactoe: ['src/components/Board.jsx', 'src/components/Cell.jsx', 'src/lib/gameLogic.js'],
  tictactoe4: ['src/components/Board.jsx', 'src/components/Cell.jsx', 'src/lib/tictactoe4Logic.js'],
  connectfour: ['src/components/ConnectFourBoard.jsx', 'src/lib/connectFourLogic.js'],
  gomoku: ['src/components/GomokuBoard.jsx', 'src/lib/gomokuLogic.js'],
  reversi: ['src/components/ReversiBoard.jsx', 'src/lib/reversiLogic.js'],
}

const entries = Object.entries(manifest.types)

describe('ruleMedia manifest', () => {
  it('covers five games', () => {
    expect(entries.length).toBe(5)
  })

  it('only lists types in the registry', () => {
    for (const [type] of entries) expect(GAME_TYPES.some(g => g.type === type), type).toBe(true)
  })

  it('every caption index exists in rules.js', () => {
    for (const [type, m] of entries) {
      const rules = GAME_RULES[type]
      for (const { cap } of m.steps) {
        if (cap === 'win' || cap === 'objective') continue
        expect(Number.isInteger(cap) && cap >= 0 && cap < rules.howToPlay.length, `${type} caption ${cap}`).toBe(true)
      }
      for (const s of m.steps) expect(stepCaption(rules, s.cap).trim(), `${type} ${s.cap}`).toBeTruthy()
    }
  })

  it('has 2-3 steps with a sane highlight box each', () => {
    for (const [type, m] of entries) {
      expect(m.steps.length, type).toBeGreaterThanOrEqual(2)
      expect(m.steps.length, type).toBeLessThanOrEqual(3)
      for (const { box } of m.steps) {
        if (!box) continue
        expect(box.x, type).toBeGreaterThanOrEqual(0)
        expect(box.y, type).toBeGreaterThanOrEqual(0)
        expect(box.x + box.w, type).toBeLessThanOrEqual(100.5)
        expect(box.y + box.h, type).toBeLessThanOrEqual(100.5)
      }
    }
  })

  it('has a still per step and look, each small, and the sheet stays height-capped', () => {
    for (const [type, m] of entries) {
      expect(m.h, `${type} crop height`).toBeLessThanOrEqual(340)
      for (const look of ['light', 'dark']) {
        for (let n = 1; n <= m.steps.length; n++) {
          const file = `public/${stillPath(type, look, n)}`
          expect(existsSync(file), file).toBe(true)
          expect(statSync(file).size, file).toBeLessThanOrEqual(100 * 1024)
        }
      }
    }
  })

  it('is fresh: a changed board or logic file means the stills need recapturing', () => {
    for (const [type, m] of entries) {
      expect(m.sourceHash, `${type} stale — run npm run rules:media`).toBe(hashOf(SOURCES[type]))
    }
  })
})

describe('ruleMediaLogic', () => {
  it('getRuleMedia is null for games without stills', () => {
    expect(getRuleMedia('connectfour')).toBeTruthy()
    expect(getRuleMedia('pong')).toBeNull()
  })

  it('stepIndex wraps both ways', () => {
    expect(stepIndex(2, 3, 1)).toBe(0)
    expect(stepIndex(0, 3, -1)).toBe(2)
    expect(stepIndex(1, 3, 1)).toBe(2)
  })

  it('lookFor picks light for bright backgrounds and dark otherwise', () => {
    expect(lookFor('245 247 238')).toBe('light')
    expect(lookFor('10 12 30')).toBe('dark')
    expect(lookFor('')).toBe('dark')
    expect(lookFor(undefined)).toBe('dark')
  })
})
