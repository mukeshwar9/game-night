import { describe, expect, it } from 'vitest'
import { COURSES, COURSE_H, COURSE_W, HOLES, coursePar, getCourse } from './minigolfCourses'
import { pointInPoly, inRect } from './minigolfPhysics'

const inside = (hole, [x, y]) => hole.bounds.some(p => pointInPoly(x, y, p))

describe('minigolf courses', () => {
  it('has nine uniquely named holes inside the 360×600 course space', () => {
    expect(HOLES).toHaveLength(9)
    expect(new Set(HOLES.map(h => h.id)).size).toBe(9)
    for (const h of HOLES) {
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

  it('front 9 is par 26 and quick 3 is par 8; unknown ids fall back to front 9', () => {
    expect(coursePar('front9')).toBe(26)
    expect(coursePar('quick3')).toBe(8)
    expect(getCourse('nope')).toBe(COURSES.front9)
    expect(getCourse(null)).toBe(COURSES.front9)
  })
})
