import { describe, expect, it } from 'vitest'
import { COURSES, COURSE_H, COURSE_W, HOLES, coursePar, getCourse, holeExtent } from './minigolfCourses'
import { pointInPoly, inRect } from './minigolfPhysics'

const inside = (hole, [x, y]) => hole.bounds.some(p => pointInPoly(x, y, p))

describe('minigolf courses', () => {
  it('has nine uniquely named front-nine holes inside the 360×600 course space, plus the test level', () => {
    expect(HOLES).toHaveLength(10)
    expect(new Set(HOLES.map(h => h.id)).size).toBe(10)
    for (const h of COURSES.front9.holes.map(i => HOLES[i])) {
      for (const poly of [...h.bounds, ...(h.blocks || [])]) {
        expect(poly.length).toBeGreaterThanOrEqual(3)
        for (const [x, y] of poly) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(COURSE_W)
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(COURSE_H)
        }
      }
    }
  })

  it('puts every tee and cup on open fairway (not in a block, water or sand)', () => {
    for (const h of HOLES) {
      for (const pt of [h.tee, h.cup]) {
        expect(inside(h, pt), `${h.id} ${pt}`).toBe(true)
        expect((h.blocks || []).some(p => pointInPoly(pt[0], pt[1], p))).toBe(false)
        expect((h.zones || []).some(z => z.t !== 'slope' && inRect(pt[0], pt[1], z.r))).toBe(false)
      }
      for (const pt of h.portals || []) {
        expect(inside(h, pt.a)).toBe(true)
        expect(inside(h, pt.b)).toBe(true)
      }
    }
  })

  it('front 9 is par 26, quick 3 is par 8 and the test level is one par-5 hole; unknown ids fall back to front 9', () => {
    expect(coursePar('front9')).toBe(26)
    expect(coursePar('quick3')).toBe(8)
    expect(getCourse('test').holes).toHaveLength(1)
    expect(coursePar('test')).toBe(5)
    expect(getCourse('nope')).toBe(COURSES.front9)
    expect(getCourse(null)).toBe(COURSES.front9)
  })

  it('the test level is a long ball-camera hole with the newer mechanics, inside its own extent', () => {
    const h = HOLES[COURSES.test.holes[0]]
    expect(h.ballCam).toBe(true)
    const ext = holeExtent(h)
    expect(ext.h / 40).toBeGreaterThan(29) // metres: 40 course units = 1 m
    expect(ext.h / 40).toBeLessThan(33)
    for (const t of ['boost', 'jump', 'ice']) expect(h.zones.some(z => z.t === t), t).toBe(true)
    expect(h.terrain.length).toBeGreaterThan(0)
    for (const poly of [...h.bounds, ...(h.blocks || [])]) for (const [x, y] of poly) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(ext.w)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(ext.h)
    }
    // the front nine keep the classic extent
    for (const i of COURSES.front9.holes) expect(holeExtent(HOLES[i])).toEqual({ w: COURSE_W, h: COURSE_H })
  })
})
