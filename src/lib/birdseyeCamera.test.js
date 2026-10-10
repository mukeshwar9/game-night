import { describe, it, expect } from 'vitest'
import { AIM_CAM, MAX_PULL, projectToScreen, pulledBird, sideCamGoal, pipCamGoal, pipVisible } from './birdseyeCamera'
import { SLING, ANGLE_MIN, ANGLE_MAX } from './birdseyeCore'

// canvas shapes from a tall narrow phone to a wide landscape one
const ASPECTS = [0.45, 0.55, 0.75, 1, 1.8, 2.2]

describe('aim camera framing', () => {
  it('puts the sling at the horizontal centre on every canvas shape', () => {
    for (const a of ASPECTS) {
      const [x] = projectToScreen(AIM_CAM, a, [SLING.x, SLING.y, 0])
      expect(Math.abs(x - 0.5), `aspect ${a}`).toBeLessThan(0.06)
    }
  })

  it('keeps the bird on screen through the whole pull, at every angle and power', () => {
    for (const a of ASPECTS) for (let ang = ANGLE_MIN; ang <= ANGLE_MAX + 1e-9; ang += 0.1) for (const pow of [0, 0.5, 1]) {
      const [x, y] = projectToScreen(AIM_CAM, a, pulledBird(ang, pow))
      expect(x, `x @ aspect ${a} ang ${ang.toFixed(2)}`).toBeGreaterThan(0.25)
      expect(x).toBeLessThan(0.75)
      expect(y, `y @ aspect ${a} ang ${ang.toFixed(2)}`).toBeGreaterThan(0.2)
      expect(y).toBeLessThan(0.82)
    }
  })

  it('still shows the fort ahead of the sling', () => {
    for (const a of ASPECTS) {
      const [x, y] = projectToScreen(AIM_CAM, a, [38, 2, 0])
      expect(x).toBeGreaterThan(0.3)
      expect(x).toBeLessThan(0.85)
      expect(y).toBeGreaterThan(0.25)
      expect(y).toBeLessThan(0.7)
    }
  })

  it('pulls the bird straight back by MAX_PULL at full power', () => {
    const p = pulledBird(0, 1)
    expect(p[0]).toBeCloseTo(SLING.x - MAX_PULL)
    expect(p[1]).toBeCloseTo(SLING.y)
  })

  it('returns null for a point behind the camera', () => {
    expect(projectToScreen(AIM_CAM, 1, [-40, 2, 0])).toBeNull()
  })
})

describe('side framings', () => {
  it('SIDE camera: frames the whole lane while aiming, follows the bird in flight, parks on the fort after', () => {
    const aim = sideCamGoal({ phase: 'aim', aspect: 0.6 })
    expect(aim.target[0]).toBe(21.5)
    const fly = sideCamGoal({ phase: 'fly', birdX: 0, aspect: 0.6 })
    expect(fly.target[0]).toBe(10) // clamped: never behind the sling window
    expect(sideCamGoal({ phase: 'fly', birdX: 80 }).target[0]).toBe(37)
    expect(sideCamGoal({ phase: 'done', fortX: 100 }).target[0]).toBe(40)
  })

  it('SIDE camera: a narrow canvas backs off so the same horizontal span fits', () => {
    expect(sideCamGoal({ phase: 'aim', aspect: 0.4 }).pos[2]).toBeGreaterThan(sideCamGoal({ phase: 'aim', aspect: 1.2 }).pos[2])
  })

  it('PiP camera: the sling and the fort both sit inside the window, ground near the bottom', () => {
    const cam = pipCamGoal(1.7)
    for (const p of [[SLING.x, SLING.y, 0], [38, 2, 0], [38, 0, 0]]) {
      const [x, y] = projectToScreen(cam, 1.7, p)
      expect(x).toBeGreaterThan(0.02)
      expect(x).toBeLessThan(0.98)
      expect(y).toBeGreaterThan(0.5)
      expect(y).toBeLessThan(0.95)
    }
    // a lob high above the fort is still in the window
    const [, top] = projectToScreen(cam, 1.7, [20, 22, 0])
    expect(top).toBeGreaterThan(0.02)
  })
})

describe('pipVisible', () => {
  it('shows behind CHASE and BEAK while aiming and flying', () => {
    for (const cam of ['chase', 'beak']) for (const phase of ['aim', 'fly', 'impact']) expect(pipVisible({ cam, phase })).toBe(true)
  })
  it('stays off for SIDE, when settled, idle, or while PEEK already shows the side', () => {
    expect(pipVisible({ cam: 'side', phase: 'fly' })).toBe(false)
    expect(pipVisible({ cam: 'chase', phase: 'done' })).toBe(false)
    expect(pipVisible({ cam: 'chase', phase: 'idle' })).toBe(false)
    expect(pipVisible({ cam: 'chase', phase: 'aim', peek: true })).toBe(false)
  })
})
