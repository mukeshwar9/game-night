import { describe, it, expect } from 'vitest'
import {
  ARROWS_REWARD_LADDER, ARROWS_REWARD_GOAL, arrowsRewardFor, isArrowsRewardEarned, earnedArrowsSteps, nextArrowsStep,
  crossedArrowsSteps, arrowsRewardItems, arrowsLockText, unearnedArrowsInLook, newUnearnedArrows,
  stepsToAnnounce, announcedItems, parseRewardSeen, meterPosition, meterLine, resultRewardLine, starHuntLevels,
} from './arrowsRewardsLogic'
import { optionsFor, optionInfo, encodeAvatar, decodeAvatar, DEFAULTS, isValidKitAvatar, randomLook, shuffleAvatar, FIELDS } from './avatarKit/catalog.js'
import { renderPixels, renderPet } from './avatarKit/character.js'
import { arrowsLock, avatarItem } from './avatarGate'
import { shuffleTab } from './avatarEditorLogic'

function seeded(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

describe('ladder', () => {
  it('ascends strictly and ends at the goal', () => {
    const stars = ARROWS_REWARD_LADDER.map(s => s.stars)
    expect(stars).toEqual([...stars].sort((a, b) => a - b))
    expect(new Set(stars).size).toBe(stars.length)
    expect(stars[stars.length - 1]).toBe(ARROWS_REWARD_GOAL)
    expect(ARROWS_REWARD_GOAL).toBe(400)
    expect(stars).toHaveLength(9)
  })

  it('lists 14 items, each in the real catalog, tier earn, agreeing on stars', () => {
    const items = arrowsRewardItems()
    expect(items).toHaveLength(14)
    for (const it of items) {
      expect(optionsFor(it.field), `${it.field}:${it.id}`).toContain(it.id)
      const info = optionInfo(it.field, it.id)
      expect(info.tier).toBe('earn')
      expect(info.note).toContain(`${it.stars}★`)
      expect(info.earn).toEqual({ game: 'arrows', stars: it.stars })
    }
  })

  it('every catalog item flagged as an Arrows reward is on the ladder', () => {
    for (const f of FIELDS) {
      for (const id of optionsFor(f.key)) {
        if (optionInfo(f.key, id).earn?.game === 'arrows') expect(arrowsRewardFor(f.key, id), `${f.key}:${id}`).not.toBeNull()
      }
    }
  })

  it('names each step after its first item', () => {
    for (const s of ARROWS_REWARD_LADDER) expect(optionInfo(s.items[0].field, s.items[0].id).label).toBe(s.name)
  })

  it('has no item on two steps', () => {
    const keys = arrowsRewardItems().map(i => `${i.field}:${i.id}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('earning', () => {
  it('finds the step of an item, null for anything else', () => {
    expect(arrowsRewardFor('pet', 'arrowsnake').stars).toBe(250)
    expect(arrowsRewardFor('hat', 'crown')).toBeNull()
    expect(arrowsRewardFor('outfit', 'pjs')).toBeNull()
  })

  it('opens at the threshold and not a star before', () => {
    expect(isArrowsRewardEarned('bg', 'arrowfield', 24)).toBe(false)
    expect(isArrowsRewardEarned('bg', 'arrowfield', 25)).toBe(true)
    expect(isArrowsRewardEarned('hat', 'arrowcrown', 399)).toBe(false)
    expect(isArrowsRewardEarned('hat', 'arrowcrown', 400)).toBe(true)
    expect(isArrowsRewardEarned('hat', 'arrowcrown', 510)).toBe(true)
  })

  it('leaves non-Arrows items open at zero stars', () => {
    expect(isArrowsRewardEarned('hat', 'crown', 0)).toBe(true)
    expect(isArrowsRewardEarned('outfit', 'pjs', 0)).toBe(true)
  })

  it('earnedArrowsSteps and nextArrowsStep', () => {
    expect(earnedArrowsSteps(0)).toEqual([])
    expect(earnedArrowsSteps(24)).toEqual([])
    expect(earnedArrowsSteps(25).map(s => s.stars)).toEqual([25])
    expect(earnedArrowsSteps(212).map(s => s.stars)).toEqual([25, 100, 150, 200])
    expect(earnedArrowsSteps(510)).toHaveLength(9)
    expect(nextArrowsStep(0)).toMatchObject({ toGo: 25, step: { stars: 25 } })
    expect(nextArrowsStep(212)).toMatchObject({ toGo: 38, step: { name: 'ARROW SNAKE' } })
    expect(nextArrowsStep(399)).toMatchObject({ toGo: 1, step: { stars: 400 } })
    expect(nextArrowsStep(400)).toBeNull()
    expect(nextArrowsStep(510)).toBeNull()
  })

  it('crossedArrowsSteps', () => {
    expect(crossedArrowsSteps(140, 260).map(s => s.stars)).toEqual([150, 200, 250])
    expect(crossedArrowsSteps(24, 25).map(s => s.stars)).toEqual([25])
    expect(crossedArrowsSteps(25, 26)).toEqual([])
    expect(crossedArrowsSteps(399, 400).map(s => s.stars)).toEqual([400])
    expect(crossedArrowsSteps(260, 140)).toEqual([])
    expect(crossedArrowsSteps(0, 510)).toHaveLength(9)
    expect(crossedArrowsSteps(400, 510)).toEqual([])
  })

  it('gives nothing above 400', () => {
    expect(ARROWS_REWARD_LADDER.every(s => s.stars <= 400)).toBe(true)
    expect(ARROWS_REWARD_LADDER.filter(s => s.badge).map(s => s.stars)).toEqual([400])
  })

  it('tolerates junk star counts', () => {
    expect(earnedArrowsSteps(undefined)).toEqual([])
    expect(nextArrowsStep(NaN).toGo).toBe(25)
  })
})

describe('gate', () => {
  it('locks an unearned item and opens it at its stars', () => {
    expect(arrowsLock('pet', 'arrowsnake', 212)).toEqual({ kind: 'arrows', field: 'pet', option: 'arrowsnake', label: 'ARROW SNAKE', stars: 250 })
    expect(arrowsLock('pet', 'arrowsnake', 250)).toBeNull()
    expect(arrowsLock('hat', 'crown', 0)).toBeNull()
    expect(arrowsLock('outfit', 'pjs', 0)).toBeNull()
  })

  it('is never a paywall item', () => {
    for (const it of arrowsRewardItems()) expect(avatarItem(it.field, it.id)).toBeNull()
  })

  it('formats the lock line', () => {
    expect(arrowsLockText(250, 212)).toBe('EARN IT: 250★ IN ARROWS · YOU HAVE 212★')
  })

  it('save guard flags only newly added unearned items', () => {
    const base = { ...DEFAULTS }
    const crown = { ...DEFAULTS, hat: 'arrowcrown', pet: 'snakeegg' }
    expect(unearnedArrowsInLook(crown, 150).map(i => i.id)).toEqual(['arrowcrown'])
    expect(newUnearnedArrows(base, crown, 150).map(i => i.id)).toEqual(['arrowcrown'])
    expect(newUnearnedArrows(base, crown, 400)).toEqual([])
    // already worn on the saved look (progress not synced yet): not blocked
    expect(newUnearnedArrows(crown, { ...crown, hair: 'buzz' }, 0)).toEqual([])
    expect(newUnearnedArrows(base, base, 0)).toEqual([])
  })
})

describe('shuffle', () => {
  it('never rolls an Arrows reward, with or without premium', () => {
    const rand = seeded(5)
    for (let i = 0; i < 600; i++) {
      const look = randomLook(rand, { premium: i % 2 === 0 })
      for (const it of arrowsRewardItems()) expect(look[it.field], `${it.field}:${it.id}`).not.toBe(it.id)
      const s = shuffleAvatar(rand, null, { premium: i % 2 === 0 })
      const d = decodeAvatar(s)
      for (const it of arrowsRewardItems()) expect(d[it.field]).not.toBe(it.id)
    }
  })

  it('tab shuffle respects a lock-aware isOpen', () => {
    const rand = seeded(9)
    const isOpen = (f, id) => !arrowsLock(f, id, 20)
    for (let i = 0; i < 100; i++) {
      const next = shuffleTab(rand, { ...DEFAULTS }, 'bg', isOpen)
      expect(['arrowfield', 'portalsky']).not.toContain(next.bg)
    }
  })
})

describe('art', () => {
  it('keeps the wire string valid and indices within base-36', () => {
    const wear = Object.fromEntries(arrowsRewardItems().map(i => [i.field, i.id]))
    const s = encodeAvatar({ ...DEFAULTS, ...wear })
    expect(s).toHaveLength(25)
    expect(isValidKitAvatar(s)).toBe(true)
    expect(decodeAvatar(s)).toMatchObject(wear)
    for (const f of FIELDS) expect(optionsFor(f.key).length).toBeLessThanOrEqual(36)
  })

  it('draws every reward in both views at several moments without throwing', () => {
    for (const it of arrowsRewardItems()) {
      for (const view of ['bust', 'hero']) {
        for (const t of [0, 0.4, 1.3]) {
          const px = renderPixels({ ...DEFAULTS, [it.field]: it.id }, view, { t })
          expect(px).toHaveLength(24 * 24)
          if (it.field === 'bg' || it.field === 'frame') expect(px.filter(Boolean).length).toBeGreaterThan(100)
        }
      }
      if (it.field === 'pet') expect(renderPet(it.id, 0.2).some(Boolean)).toBe(true)
    }
  })

  it('draws the backdrops and frames differently from a plain tile', () => {
    const plain = renderPixels({ ...DEFAULTS, bg: 'solid', frame: 'none' }, 'bust', { t: 0 })
    const same = (a, b) => a.every((c, i) => String(c) === String(b[i]))
    for (const id of ['arrowfield', 'portalsky']) expect(same(plain, renderPixels({ ...DEFAULTS, bg: id }, 'bust', { t: 0 }))).toBe(false)
    for (const id of ['portalrim', 'arrowchase', 'goldarrow']) expect(same(plain, renderPixels({ ...DEFAULTS, frame: id }, 'bust', { t: 0 }))).toBe(false)
  })
})

describe('reveal announcements', () => {
  it('announces every step above the seen one that the stars reached', () => {
    expect(stepsToAnnounce(0, 0)).toEqual([])
    expect(stepsToAnnounce(0, 24)).toEqual([])
    expect(stepsToAnnounce(0, 25).map(s => s.stars)).toEqual([25])
    expect(stepsToAnnounce(0, 300).map(s => s.stars)).toEqual([25, 100, 150, 200, 250, 300])
    expect(stepsToAnnounce(250, 300).map(s => s.stars)).toEqual([300])
    expect(stepsToAnnounce(300, 300)).toEqual([])
    expect(stepsToAnnounce(400, 510)).toEqual([])
    expect(stepsToAnnounce(undefined, 100).map(s => s.stars)).toEqual([25, 100])
  })
  it('agrees with crossedArrowsSteps for a single result', () => {
    expect(stepsToAnnounce(140, 260)).toEqual(crossedArrowsSteps(140, 260))
  })
  it('lists items newest step first', () => {
    const items = announcedItems(stepsToAnnounce(0, 350))
    expect(items[0]).toMatchObject({ field: 'pet', id: 'hooky', stars: 350 })
    expect(items).toHaveLength(arrowsRewardItems().filter(i => i.stars <= 350).length)
  })
  it('parses the stored marker defensively', () => {
    expect(parseRewardSeen(null)).toBe(0)
    expect(parseRewardSeen('abc')).toBe(0)
    expect(parseRewardSeen('-5')).toBe(0)
    expect(parseRewardSeen('250')).toBe(250)
  })
})

describe('meter and result copy', () => {
  it('places stars on the 0..1 track', () => {
    expect(meterPosition(0)).toBe(0)
    expect(meterPosition(200)).toBe(0.5)
    expect(meterPosition(510)).toBe(1)
  })
  it('names the next reward, then finishes', () => {
    expect(meterLine(212)).toBe('38★ TO ARROW SNAKE')
    expect(meterLine(0)).toBe('25★ TO ARROW FIELD')
    expect(meterLine(399)).toBe('1★ TO ARROW CROWN')
    expect(meterLine(400)).toBe('ALL ARROWS REWARDS EARNED')
  })
  it('result line counts only new stars', () => {
    expect(resultRewardLine(268, 271)).toBe('+3★ · 29★ TO PORTAL GOGGLES')
    expect(resultRewardLine(271, 271)).toBe('29★ TO PORTAL GOGGLES')
    expect(resultRewardLine(398, 402)).toBe('+4★ · ALL ARROWS REWARDS EARNED')
  })
})

describe('starHuntLevels', () => {
  const progress = { levels: { l1: 3, l2: 1, l3: 2, l4: 2, l5: 1, l6: 0, l7: 1, l8: 2, l9: 1 } }
  const sizes = { 2: 30, 3: 12, 4: 12, 5: 8, 7: 50, 8: 20, 9: 25 }
  const sizeOf = n => sizes[n]
  it('lists cleared levels under three stars, smallest board first, ties by level', () => {
    expect(starHuntLevels(progress, sizeOf, 5).map(l => l.n)).toEqual([5, 3, 4, 8, 9])
  })
  it('respects the limit and skips 3-star and uncleared levels', () => {
    expect(starHuntLevels(progress, sizeOf, 2).map(l => l.n)).toEqual([5, 3])
    expect(starHuntLevels(progress, sizeOf, 99).map(l => l.n)).not.toContain(1)
    expect(starHuntLevels(progress, sizeOf, 99).map(l => l.n)).not.toContain(6)
  })
  it('is empty with nothing to hunt, and never measures a level it will not list', () => {
    const calls = []
    expect(starHuntLevels({ levels: { l1: 3, l2: 3 } }, n => { calls.push(n); return 1 })).toEqual([])
    expect(calls).toEqual([])
    expect(starHuntLevels(null, sizeOf)).toEqual([])
    expect(starHuntLevels({}, sizeOf)).toEqual([])
  })
})
