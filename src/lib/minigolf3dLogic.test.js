import { describe, it, expect } from 'vitest'
import { HOLES, COURSE_W, COURSE_H } from './minigolfCourses'
import {
  K, RISE, FOV_DEG, courseToWorld, worldToCourse, heightAt, zoneAt, zoneDip, rayToCourse,
  makeProjector, solveTeeCamera, followCamera, sinkCamera, easePose, poseSettled, easeAlpha,
  cameraMode, pathHeading, reachMetres,
} from './minigolf3dLogic'

const byId = (id) => HOLES.find(h => h.id === id)

describe('course ↔ world', () => {
  it('centres the course on the origin and round-trips', () => {
    expect(courseToWorld(COURSE_W / 2, COURSE_H / 2)).toEqual({ x: 0, z: 0 })
    for (const [x, y] of [[0, 0], [180, 510], [359, 599], [95.5, 12.25]]) {
      const w = courseToWorld(x, y)
      const c = worldToCourse(w.x, w.z)
      expect(c.x).toBeCloseTo(x, 9)
      expect(c.y).toBeCloseTo(y, 9)
    }
  })
  it('is 40 course units per world unit', () => {
    expect(courseToWorld(220, 300).x - courseToWorld(180, 300).x).toBeCloseTo(1, 9)
    expect(K).toBe(1 / 40)
  })
})

describe('heightAt', () => {
  it('is flat on holes without slopes', () => {
    for (const id of ['straight', 'dogleg', 'bumpers', 'windmill', 'sand', 'moat', 'sliders', 'portals']) {
      const h = byId(id)
      for (const [x, y] of [[100, 100], [180, 300], [250, 500]]) expect(heightAt(h, x, y)).toBe(0)
    }
  })
  it('climbs The Ramp toward the cup and levels off past it', () => {
    const ramp = byId('ramp') // slope band y 220–370, pushing toward the tee
    expect(heightAt(ramp, 180, 400)).toBe(0) // tee side
    expect(heightAt(ramp, 180, 100)).toBe(RISE) // cup side
    const mid = heightAt(ramp, 180, 295)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(RISE)
    // monotone rise toward smaller y
    let prev = -1
    for (let y = 380; y >= 210; y -= 10) {
      const v = heightAt(ramp, 180, y)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
  it('ignores slopes far to the side', () => {
    expect(heightAt(byId('ramp'), 10, 100)).toBe(0)
  })
  it('lifts the high side of a sideways camber and only inside its band', () => {
    const hole = { zones: [{ t: 'slope', r: [100, 200, 100, 100], ax: 80, ay: 0 }] }
    expect(heightAt(hole, 100, 250)).toBeGreaterThan(heightAt(hole, 200, 250))
    expect(heightAt(hole, 150, 100)).toBe(0)
    expect(heightAt({ zones: [{ ...hole.zones[0], ax: -80 }] }, 200, 250)).toBeGreaterThan(heightAt({ zones: [{ ...hole.zones[0], ax: -80 }] }, 100, 250))
  })
})

describe('zones', () => {
  it('finds sand and water and sinks them', () => {
    expect(zoneAt(byId('moat'), 80, 280)).toBe('water')
    expect(zoneAt(byId('moat'), 180, 280)).toBeUndefined()
    expect(zoneAt(byId('sand'), 100, 200)).toBe('sand')
    expect(zoneDip('water')).toBeLessThan(zoneDip('sand'))
    expect(zoneDip('sand')).toBeLessThan(0)
    expect(zoneDip('slope')).toBe(0)
    expect(zoneDip(undefined)).toBe(0)
  })
})

describe('rayToCourse', () => {
  it('hits the turf plane and maps back to course coordinates', () => {
    const target = courseToWorld(120, 340)
    const origin = { x: target.x + 1, y: 6, z: target.z + 5 }
    const d = { x: target.x - origin.x, y: -origin.y, z: target.z - origin.z }
    const c = rayToCourse(origin, d)
    expect(c.x).toBeCloseTo(120, 6)
    expect(c.y).toBeCloseTo(340, 6)
  })
  it('honours a raised plane', () => {
    const c = rayToCourse({ x: 0, y: 4, z: 0 }, { x: 0, y: -1, z: 0 }, 1)
    expect(c).toEqual(worldToCourse(0, 0))
  })
  it('returns null for rays that never reach the plane', () => {
    expect(rayToCourse({ x: 0, y: 4, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(rayToCourse({ x: 0, y: 4, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull()
  })
})

describe('makeProjector', () => {
  const pose = { pos: { x: 0, y: 5, z: 5 }, look: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }
  it('puts the look point at the centre of the view', () => {
    const p = makeProjector(pose, FOV_DEG, 0.6)({ x: 0, y: 0, z: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(0, 9)
  })
  it('puts far things higher and right things to the right', () => {
    const project = makeProjector(pose, FOV_DEG, 0.6)
    expect(project({ x: 0, y: 0, z: -3 }).y).toBeGreaterThan(0)
    expect(project({ x: 2, y: 0, z: 0 }).x).toBeGreaterThan(0)
  })
  it('rejects points behind the camera', () => {
    expect(makeProjector(pose, FOV_DEG, 0.6)({ x: 0, y: 5, z: 12 })).toBeNull()
  })
})

describe('solveTeeCamera', () => {
  const corners = (hole) => {
    const pts = hole.bounds.flat()
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
    const out = []
    for (const x of [Math.min(...xs), Math.max(...xs)]) for (const y of [Math.min(...ys), Math.max(...ys)]) {
      const w = courseToWorld(x, y)
      out.push({ x: w.x, y: 0, z: w.z })
    }
    return out
  }

  it('fits every hole inside the view in portrait', () => {
    const aspect = COURSE_W / COURSE_H
    for (const hole of HOLES) {
      const pose = solveTeeCamera(hole, { aspect })
      const project = makeProjector(pose, FOV_DEG, aspect)
      for (const c of corners(hole)) {
        const v = project(c)
        expect(v, hole.id).not.toBeNull()
        expect(Math.abs(v.x), hole.id).toBeLessThanOrEqual(0.95)
        expect(Math.abs(v.y), hole.id).toBeLessThanOrEqual(0.95)
      }
    }
  })
  it('fits every hole inside the view in landscape and puts the cup left of the tee', () => {
    const aspect = COURSE_H / COURSE_W
    for (const hole of HOLES) {
      const pose = solveTeeCamera(hole, { aspect, landscape: true })
      const project = makeProjector(pose, FOV_DEG, aspect)
      for (const c of corners(hole)) {
        const v = project(c)
        expect(v, hole.id).not.toBeNull()
        expect(Math.abs(v.x), hole.id).toBeLessThanOrEqual(0.95)
        expect(Math.abs(v.y), hole.id).toBeLessThanOrEqual(0.95)
      }
      const tee = courseToWorld(...hole.tee), cup = courseToWorld(...hole.cup)
      expect(project({ x: cup.x, y: 0, z: cup.z }).x, hole.id).toBeLessThan(project({ x: tee.x, y: 0, z: tee.z }).x)
    }
  })
  it('keeps the tee nearer the viewer than the cup in portrait', () => {
    const hole = byId('straight')
    const pose = solveTeeCamera(hole, { aspect: 0.6 })
    const project = makeProjector(pose, FOV_DEG, 0.6)
    const tee = courseToWorld(...hole.tee), cup = courseToWorld(...hole.cup)
    expect(project({ x: tee.x, y: 0, z: tee.z }).y).toBeLessThan(project({ x: cup.x, y: 0, z: cup.z }).y)
  })
  it('sits as tight as it can: a narrower view needs a longer lens', () => {
    const hole = byId('straight')
    const wide = solveTeeCamera(hole, { aspect: 1 })
    const narrow = solveTeeCamera(hole, { aspect: 0.3 })
    const dist = (p) => Math.hypot(p.pos.x - p.look.x, p.pos.y - p.look.y, p.pos.z - p.look.z)
    expect(dist(narrow)).toBeGreaterThan(dist(wide) * 0.9)
  })
})

describe('chase cameras', () => {
  it('follow sits behind the ball along its heading and looks ahead', () => {
    const hole = byId('straight')
    const pose = followCamera(hole, 180, 300, 0, -50) // rolling toward the cup (−y)
    const ball = courseToWorld(180, 300)
    expect(pose.pos.z).toBeGreaterThan(ball.z) // behind = nearer the tee
    expect(pose.look.z).toBeLessThan(ball.z)
    expect(pose.pos.y).toBeGreaterThan(pose.look.y)
    expect(pose.up).toEqual({ x: 0, y: 1, z: 0 })
  })
  it('follow copes with a ball at rest and rides up a ramp', () => {
    const pose = followCamera(byId('ramp'), 180, 100, 0, 0)
    expect(Number.isFinite(pose.pos.x + pose.pos.y + pose.pos.z)).toBe(true)
    expect(pose.look.y).toBe(RISE)
  })
  it('sink looks at the cup from above and to the side', () => {
    const hole = byId('moat')
    const pose = sinkCamera(hole)
    const cup = courseToWorld(...hole.cup)
    expect(pose.look.x).toBeCloseTo(cup.x, 9)
    expect(pose.look.z).toBeCloseTo(cup.z, 9)
    expect(pose.pos.y).toBeGreaterThan(pose.look.y)
  })
  it('picks the rig from what is happening', () => {
    expect(cameraMode({ playing: false, sunk: false })).toBe('tee')
    expect(cameraMode({ playing: true, sunk: false })).toBe('follow')
    expect(cameraMode({ playing: true, sunk: true })).toBe('sink')
    expect(cameraMode({ playing: false, sunk: true })).toBe('sink')
  })
})

describe('easing', () => {
  const a = { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: -1 }, up: { x: 1, y: 0, z: 0 } }
  const b = { pos: { x: 10, y: 4, z: 2 }, look: { x: 1, y: 0, z: -3 }, up: { x: 0, y: 1, z: 0 } }
  it('moves partway and settles at the target', () => {
    expect(easePose(a, b, 0)).toEqual({ ...a, up: { x: 1, y: 0, z: 0 } })
    const half = easePose(a, b, 0.5)
    expect(half.pos).toEqual({ x: 5, y: 2, z: 1 })
    expect(Math.hypot(half.up.x, half.up.y, half.up.z)).toBeCloseTo(1, 9)
    let cur = a
    for (let i = 0; i < 80; i++) cur = easePose(cur, b, 0.2)
    expect(poseSettled(cur, b)).toBe(true)
    expect(poseSettled(a, b)).toBe(false)
  })
  it('alpha grows with elapsed time and never leaves 0..1', () => {
    expect(easeAlpha(0, 8)).toBe(0)
    expect(easeAlpha(-1, 8)).toBe(0)
    expect(easeAlpha(0.016, 8)).toBeGreaterThan(0)
    expect(easeAlpha(0.1, 8)).toBeGreaterThan(easeAlpha(0.016, 8))
    expect(easeAlpha(100, 8)).toBeLessThanOrEqual(1)
  })
})

describe('helpers', () => {
  it('pathHeading reads the last few steps and clamps at the start', () => {
    const path = [0, 0, 1, 0, 2, 0, 3, 1, 4, 2, 5, 3]
    expect(pathHeading(path, 5, 2)).toEqual({ vx: 2, vy: 2 })
    expect(pathHeading(path, 1, 6)).toEqual({ vx: 1, vy: 0 })
    expect(pathHeading(path, 0)).toEqual({ vx: 0, vy: 0 })
  })
  it('reach is in world metres', () => {
    expect(reachMetres(200)).toBe(5)
  })
})
