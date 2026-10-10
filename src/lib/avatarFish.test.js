import { describe, it, expect } from 'vitest'
import { fishSpec, FISH_SIZE, FISH_TONES } from './avatarFish'
import { HAIR_STYLES, ACCESSORIES, SKIN_TONES, HUMANOIDS, makeHumanoid } from './avatars'

const parts = over => ({ cap: 'none', shirt: 'p1', pants: 'dim', shoes: 'text', skin: 's3', hair: 'none', hairColor: 'p1', acc: 'none', ...over })

function expectValid(sp) {
  expect(Object.keys(sp).sort()).toEqual(['acc', 'band', 'belly', 'body', 'cap', 'fin', 'fin2', 'finTone'])
  for (const k of ['body', 'band', 'fin', 'finTone']) expect(FISH_TONES).toContain(sp[k])
  expect([...SKIN_TONES, 'white']).toContain(sp.belly)
  expect(sp.cap === null || FISH_TONES.includes(sp.cap)).toBe(true)
  expect(['none', ...HAIR_STYLES]).toContain(sp.fin2)
  expect(ACCESSORIES).toContain(sp.acc)
}

describe('fishSpec', () => {
  it('exports the fish sprite size', () => {
    expect(FISH_SIZE).toEqual([18, 15])
  })

  it.each(HAIR_STYLES)('maps hair style %s to fin2', hair => {
    const sp = fishSpec(makeHumanoid('kid', parts({ hair })))
    expect(sp.fin2).toBe(hair)
    expectValid(sp)
  })

  it.each(ACCESSORIES)('maps accessory %s', acc => {
    const sp = fishSpec(makeHumanoid('girl', parts({ acc })))
    expect(sp.acc).toBe(acc)
    expectValid(sp)
  })

  it('maps cap none to null and a cap to its tone', () => {
    expect(fishSpec(makeHumanoid('boy', parts({ cap: 'none' }))).cap).toBeNull()
    expect(fishSpec(makeHumanoid('boy', parts({ cap: 'cta' }))).cap).toBe('cta')
  })

  it.each(HUMANOIDS)('maps the %s humanoid parts', shape => {
    const sp = fishSpec(makeHumanoid(shape, parts({ shirt: 'av1', pants: 'p2', shoes: 'win', skin: 's5', hairColor: 'av3', hair: 'bob' })))
    expect(sp).toMatchObject({ body: 'av1', band: 'p2', fin: 'win', belly: 's5', fin2: 'bob', finTone: 'av3' })
    expectValid(sp)
  })

  it('maps a creature to one tone with white bands', () => {
    const sp = fishSpec('octopus.p2')
    expect(sp).toMatchObject({ body: 'p2', fin: 'p2', band: 'white', belly: 'white', cap: null, acc: 'none' })
    expectValid(sp)
  })

  it('handles legacy bare keys', () => {
    expectValid(fishSpec('fish'))
    expectValid(fishSpec('cat'))
  })

  it('never throws on garbage and always returns a complete spec', () => {
    for (const bad of [undefined, null, '', 42, {}, [], 'zzz', '.', 'a.b.c', 'kid.zz-zz-zz-zz-zz-zz-zz-zz', 'kid.none-p1-dim-text', '💥']) {
      expect(() => fishSpec(bad)).not.toThrow()
      expectValid(fishSpec(bad))
    }
  })
})
