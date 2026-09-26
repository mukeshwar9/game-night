import { describe, it, expect } from 'vitest'
import {
  newApproach, normalizeRound, applyReady, applyPlace, placeProblem, legalSlots,
  resolveBurn, moveFor, dockLimit, forecast, debrisTarget, LEVELS, MAX_BURNS, DICE_PER_SEAT,
} from './dockingLogic'

// Deterministic rng from a list of values in [0, 1).
const seq = (...values) => { let i = 0; return () => values[i++ % values.length] }
const dice = (...vs) => vs.map(v => ({ v, used: false }))

function placing(overrides = {}) {
  return normalizeRound({
    phase: 'place', level: 'pilot', burn: 1, maxBurns: MAX_BURNS, start: 7, distance: 7,
    tilt: 0, coolant: 0,
    debris: [{ at: 5, v: 3, cleared: false }, { at: 2, v: 6, cleared: false }],
    systems: [{ owner: 'X', v: 1, armed: false }, { owner: 'O', v: 2, armed: false }],
    ready: { X: true, O: true },
    dice: { X: dice(3, 4, 1, 5), O: dice(4, 2, 6, 1) },
    placed: [], lead: 'X', turn: 'X',
    ...overrides,
  })
}

// Place a list of [seat, die, slot, adjust?] moves in order.
function run(round, moves) {
  return moves.reduce((r, [seat, die, slot, adjust = 0]) => {
    const next = applyPlace(r, seat, { die, slot, adjust })
    if (!next) throw new Error(`illegal: ${seat} ${die} ${slot} — ${placeProblem(r, seat, { die, slot, adjust })}`)
    return next
  }, round)
}

describe('newApproach', () => {
  it('lays out debris between start and port and switches by seat parity', () => {
    const r = newApproach({ level: 'ace', rng: seq(0.1, 0.5, 0.9, 0.3, 0.7) })
    expect(r.distance).toBe(LEVELS.ace.distance)
    expect(r.debris).toHaveLength(4)
    expect(r.debris.every(d => d.at >= 1 && d.at < 8 && d.v >= 1 && d.v <= 6)).toBe(true)
    expect(new Set(r.debris.map(d => d.at)).size).toBe(4)
    expect(r.systems).toHaveLength(4)
    expect(r.systems.filter(s => s.owner === 'X').every(s => s.v % 2 === 1)).toBe(true)
    expect(r.systems.filter(s => s.owner === 'O').every(s => s.v % 2 === 0)).toBe(true)
    expect(r.phase).toBe('talk')
  })

  it('the starter leads the first burn', () => {
    expect(newApproach({ starter: 'O' }).turn).toBe('O')
  })
})

describe('talk phase', () => {
  it('rolls four dice each only once both seats are ready', () => {
    let r = newApproach({ level: 'cadet' })
    r = applyReady(r, 'X', true, seq(0))
    expect(r.phase).toBe('talk')
    expect(r.dice.X).toHaveLength(0)
    r = applyReady(r, 'O', true, seq(0, 0.99))
    expect(r.phase).toBe('place')
    expect(r.dice.X).toHaveLength(DICE_PER_SEAT)
    expect(r.dice.O).toHaveLength(DICE_PER_SEAT)
    expect(r.dice.X.every(d => d.v >= 1 && d.v <= 6)).toBe(true)
    expect(r.turn).toBe(r.lead)
  })

  it('ignores READY outside the talk phase', () => {
    expect(applyReady(placing(), 'X')).toBeNull()
  })
})

describe('placement rules', () => {
  it('turns alternate and every placed die is spent', () => {
    const r = run(placing(), [['X', 0, 'att']])
    expect(r.turn).toBe('O')
    expect(r.dice.X[0].used).toBe(true)
    expect(placeProblem(r, 'X', { die: 1, slot: 'thr' })).toBe('NOT YOUR TURN')
    expect(placeProblem(r, 'O', { die: 0, slot: 'att' })).toBeNull()
  })

  it('a filled required slot cannot take a second die', () => {
    const r = run(placing(), [['X', 0, 'att'], ['O', 0, 'att']])
    expect(placeProblem(r, 'X', { die: 1, slot: 'att' })).toBe('SLOT ALREADY FILLED')
  })

  it('the last dice are forced onto attitude and thrust', () => {
    const r = run(placing(), [['X', 3, 'vent'], ['O', 3, 'vent'], ['X', 2, 'sys0'], ['O', 1, 'sys1']])
    // X holds two dice with att and thr open: only those two slots are legal.
    expect(legalSlots(r, 'X', 0)).toEqual(['att', 'thr'])
    expect(placeProblem(r, 'X', { die: 0, slot: 'cool' })).toBe('THIS DIE MUST GO TO ATTITUDE OR THRUST')
  })

  it('debris clears only with an exact match, nearest first, two per burn', () => {
    const r0 = placing({ debris: [{ at: 5, v: 4, cleared: false }, { at: 3, v: 4, cleared: false }, { at: 2, v: 1, cleared: false }] })
    expect(debrisTarget(r0, 4)).toBe(0)
    expect(placeProblem(r0, 'X', { die: 3, slot: 'deb' })).toBe('NO 5 DEBRIS TO CLEAR')
    const r1 = run(r0, [['X', 1, 'deb'], ['O', 0, 'deb']])
    expect(r1.debris.map(d => d.cleared)).toEqual([true, true, false])
    expect(placeProblem(r1, 'X', { die: 2, slot: 'deb' })).toBe('DEBRIS SLOTS FULL')
  })

  it('switches need their owner and exact value, and raise the docking limit', () => {
    const r = placing()
    expect(placeProblem(r, 'X', { die: 0, slot: 'sys1' })).toBe("THAT SWITCH IS THE ENGINEER'S")
    expect(placeProblem(r, 'X', { die: 0, slot: 'sys0' })).toBe('SWITCH NEEDS A 1')
    expect(dockLimit(r)).toBe(6)
    const armed = run(r, [['X', 2, 'sys0']])
    expect(armed.systems[0].armed).toBe(true)
    expect(dockLimit(armed)).toBe(7)
  })

  it('coolant banks a token and a token nudges a die by one', () => {
    let r = run(placing(), [['X', 3, 'cool']])
    expect(r.coolant).toBe(1)
    expect(placeProblem(r, 'O', { die: 1, slot: 'cool' })).toBeNull()
    // O's 2 nudged to 3 clears the 3 debris.
    r = run(r, [['O', 1, 'deb', 1]])
    expect(r.coolant).toBe(0)
    expect(r.debris[0].cleared).toBe(true)
    expect(r.placed.at(-1)).toMatchObject({ by: 'O', slot: 'deb', v: 3 })
    expect(placeProblem(r, 'X', { die: 0, slot: 'att', adjust: 1 })).toBe('NO COOLANT')
  })

  it('a nudge cannot leave 1–6', () => {
    const r = placing({ coolant: 1, dice: { X: dice(6, 1, 2, 3), O: dice(1, 2, 3, 4) } })
    expect(placeProblem(r, 'X', { die: 0, slot: 'att', adjust: 1 })).toBe('DICE RUN 1 TO 6')
  })
})

describe('resolving a burn', () => {
  it('thrust bands close 0, 1 or 2', () => {
    expect(moveFor(4)).toBe(0)
    expect(moveFor(5)).toBe(1)
    expect(moveFor(8)).toBe(1)
    expect(moveFor(9)).toBe(2)
  })

  it('a clean burn closes distance, flips the lead and returns to talk', () => {
    // X att 3, O att 4 → tilt -1; thrust 4+2 = 6 → close 1.
    const r = run(placing(), [
      ['X', 0, 'att'], ['O', 0, 'att'], ['X', 1, 'thr'], ['O', 1, 'thr'],
      ['X', 2, 'sys0'], ['O', 2, 'vent'], ['X', 3, 'vent'], ['O', 3, 'vent'],
    ])
    expect(r.phase).toBe('talk')
    expect(r.distance).toBe(6)
    expect(r.tilt).toBe(-1)
    expect(r.burn).toBe(2)
    expect(r.lead).toBe('O')
    expect(r.turn).toBe('O')
    expect(r.dice.X).toEqual([])
    expect(r.lastBurn).toMatchObject({ thrust: 6, move: 1, from: 7, to: 6 })
  })

  it('spins out past the tilt limit', () => {
    const r = resolveBurn(placing({
      tilt: 2,
      placed: [
        { by: 'X', slot: 'att', v: 5, die: 0 }, { by: 'O', slot: 'att', v: 1, die: 0 },
        { by: 'X', slot: 'thr', v: 3, die: 1 }, { by: 'O', slot: 'thr', v: 3, die: 1 },
      ],
    }))
    expect(r.result).toMatchObject({ outcome: 'loss', reason: 'spin' })
  })

  it('flying onto or past uncleared debris loses', () => {
    const r = resolveBurn(placing({
      distance: 6,
      placed: [
        { by: 'X', slot: 'att', v: 3, die: 0 }, { by: 'O', slot: 'att', v: 3, die: 0 },
        { by: 'X', slot: 'thr', v: 5, die: 1 }, { by: 'O', slot: 'thr', v: 5, die: 1 },
      ],
    }))
    expect(r.result).toMatchObject({ outcome: 'loss', reason: 'debris' })
    expect(r.distance).toBe(5)
  })

  const dockingBurn = (thrX, thrO, attX = 2, attO = 2, extra = {}) => resolveBurn(placing({
    distance: 1, debris: [], ...extra,
    placed: [
      { by: 'X', slot: 'att', v: attX, die: 0 }, { by: 'O', slot: 'att', v: attO, die: 0 },
      { by: 'X', slot: 'thr', v: thrX, die: 1 }, { by: 'O', slot: 'thr', v: thrO, die: 1 },
    ],
  }))

  it('docks when level and within the limit', () => {
    expect(dockingBurn(3, 3).result).toMatchObject({ outcome: 'win', reason: 'docked' })
  })

  it('crashes above the docking limit', () => {
    expect(dockingBurn(4, 3).result).toMatchObject({ outcome: 'loss', reason: 'fast' })
    const armed = [{ owner: 'X', v: 1, armed: true }, { owner: 'O', v: 2, armed: true }]
    expect(dockingBurn(4, 4, 2, 2, { systems: armed }).result.outcome).toBe('win')
  })

  it('cannot dock tilted', () => {
    expect(dockingBurn(3, 3, 3, 2).result).toMatchObject({ outcome: 'loss', reason: 'tilt' })
  })

  it('holding position at the port does not dock', () => {
    const r = dockingBurn(2, 2)
    expect(r.phase).toBe('talk')
    expect(r.distance).toBe(1)
  })

  it('runs out of burns after the last one', () => {
    const r = resolveBurn(placing({
      burn: MAX_BURNS, distance: 4, debris: [],
      placed: [
        { by: 'X', slot: 'att', v: 2, die: 0 }, { by: 'O', slot: 'att', v: 2, die: 0 },
        { by: 'X', slot: 'thr', v: 3, die: 1 }, { by: 'O', slot: 'thr', v: 3, die: 1 },
      ],
    }))
    expect(r.result).toMatchObject({ outcome: 'loss', reason: 'window' })
  })
})

describe('forecast and normalize', () => {
  it('forecasts tilt and thrust once both dice of a pair are down', () => {
    const r = run(placing(), [['X', 0, 'att'], ['O', 0, 'att'], ['X', 1, 'thr']])
    expect(forecast(r)).toEqual({ tilt: -1, thrust: null, move: null })
  })

  it('normalizes Firebase-shaped data', () => {
    const r = normalizeRound({
      phase: 'talk', level: 'nope', burn: 2,
      debris: { 1: { at: 2, v: 6 }, 0: { at: 4, v: 1, cleared: true } },
      dice: {},
    })
    expect(r.level).toBe('cadet')
    expect(r.debris).toEqual([{ at: 4, v: 1, cleared: true }, { at: 2, v: 6, cleared: false }])
    expect(r.placed).toEqual([])
    expect(r.dice).toEqual({ X: [], O: [] })
    expect(r.ready).toEqual({ X: false, O: false })
  })
})
