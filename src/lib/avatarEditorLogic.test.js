import { describe, it, expect } from 'vitest'
import {
  EDITOR_GROUPS, PET_FIELD, groupOfTab, firstTabOf, previewViewFor, thumbLook, currentChoiceLabel,
  createHistory, pushHistory, undoHistory, redoHistory, canUndo, canRedo, HISTORY_CAP,
  pickAction, previewAvatar, shuffleTab, petOptions, petOf, withPet, petTierText,
} from './avatarEditorLogic'
import { CATEGORIES } from './avatarKit/categories'
import { DEFAULTS, decodeAvatar, encodeAvatar, optionsFor } from './avatarKit/catalog'
import { renderPet, PET_BOX, isPetAnimated } from './avatarKit'

const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length] }

describe('editor groups', () => {
  it('cover every category except the pet exactly once', () => {
    const tabs = EDITOR_GROUPS.flatMap(g => g.tabs)
    expect(new Set(tabs).size).toBe(tabs.length)
    expect(tabs.sort()).toEqual(CATEGORIES.map(c => c.id).filter(id => id !== PET_FIELD).sort())
  })

  it('keeps headings few and tabs per heading phone-sized', () => {
    expect(EDITOR_GROUPS.length).toBeLessThanOrEqual(5)
    for (const g of EDITOR_GROUPS) expect(g.tabs.length).toBeLessThanOrEqual(6)
  })

  it('maps tabs to headings and back', () => {
    expect(groupOfTab('hat')).toBe('style')
    expect(groupOfTab('beard')).toBe('hair')
    expect(groupOfTab('nope')).toBe('face')
    expect(firstTabOf('scene')).toBe('bg')
    expect(firstTabOf('nope')).toBe('skin')
  })

  it('frames the preview by what the tab dresses', () => {
    expect(previewViewFor('outfit')).toBe('hero')
    expect(previewViewFor('hat')).toBe('bust')
    expect(previewViewFor('skin')).toBe('bust')
  })
})

describe('thumbLook', () => {
  it('wears the option on the current look', () => {
    const look = { ...DEFAULTS, hat: 'cap' }
    expect(thumbLook(look, 'glasses', 'round')).toMatchObject({ glasses: 'round', hat: 'cap' })
  })

  it('takes headwear off for hair thumbnails so styles stay visible', () => {
    const look = { ...DEFAULTS, hat: 'cap' }
    expect(thumbLook(look, 'hair', 'long').hat).toBe('none')
    expect(thumbLook(look, 'hairColor', 'red').hat).toBe('none')
    expect(look.hat).toBe('cap')
  })

  it('leaves the pet out of thumbnails', () => {
    expect(thumbLook({ ...DEFAULTS, pet: 'duck' }, 'outfit', 'suit').pet).toBe('none')
  })
})

describe('currentChoiceLabel', () => {
  it('names the worn part or the first colour of a colour tab', () => {
    expect(currentChoiceLabel({ ...DEFAULTS, hair: 'crop' }, 'hair')).toBe('CROP')
    expect(currentChoiceLabel(DEFAULTS, 'skin')).toMatch(/\S/)
    expect(currentChoiceLabel(DEFAULTS, 'nope')).toBe('')
  })
})

describe('history', () => {
  it('undoes and redoes in order, and a new edit clears redo', () => {
    let h = createHistory('a')
    expect(canUndo(h)).toBe(false)
    h = pushHistory(h, 'b')
    h = pushHistory(h, 'c')
    h = undoHistory(h)
    expect(h.present).toBe('b')
    expect(canRedo(h)).toBe(true)
    h = redoHistory(h)
    expect(h.present).toBe('c')
    h = undoHistory(undoHistory(h))
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    h = pushHistory(h, 'd')
    expect(canRedo(h)).toBe(false)
    expect(h.past).toEqual(['a'])
  })

  it('ignores a no-op push and an empty undo or redo', () => {
    const h = createHistory('a')
    expect(pushHistory(h, 'a')).toBe(h)
    expect(undoHistory(h)).toBe(h)
    expect(redoHistory(h)).toBe(h)
  })

  it('caps the past', () => {
    let h = createHistory('0')
    for (let i = 1; i <= HISTORY_CAP + 10; i++) h = pushHistory(h, String(i))
    expect(h.past.length).toBe(HISTORY_CAP)
    expect(h.past[0]).toBe('10')
  })
})

describe('try-on', () => {
  it('commits open items, tries locked ones on, and a second tap takes them off', () => {
    expect(pickAction({ locked: false, tryOn: null, field: 'hat', id: 'cap' })).toBe('commit')
    expect(pickAction({ locked: true, tryOn: null, field: 'hat', id: 'halo' })).toBe('try-on')
    expect(pickAction({ locked: true, tryOn: { field: 'hat', id: 'halo' }, field: 'hat', id: 'halo' })).toBe('clear')
    expect(pickAction({ locked: true, tryOn: { field: 'hat', id: 'halo' }, field: 'hat', id: 'crown' })).toBe('try-on')
  })

  it('previews the try-on without touching the draft', () => {
    const draft = encodeAvatar(DEFAULTS)
    expect(previewAvatar(draft, null)).toBe(draft)
    const shown = previewAvatar(draft, { field: 'pet', id: 'ufo' })
    expect(decodeAvatar(shown).pet).toBe('ufo')
    expect(decodeAvatar(draft).pet).toBe('none')
    expect(previewAvatar('ghost.p2', { field: 'pet', id: 'ufo' })).toBe('ghost.p2')
  })
})

describe('shuffleTab', () => {
  const open = () => true

  it('only re-rolls the fields of that tab', () => {
    const look = { ...DEFAULTS }
    const next = shuffleTab(seq(0.5, 0.1, 0.9), look, 'hat', open)
    for (const k of Object.keys(DEFAULTS)) {
      if (!['hat', 'hatColor', 'hatAccent'].includes(k)) expect(next[k]).toBe(look[k])
    }
    expect(next.hat).not.toBe(look.hat)
  })

  it('never rolls a locked option', () => {
    const locked = new Set(optionsFor('hat').slice(1))
    for (let i = 0; i < 20; i++) {
      const next = shuffleTab(() => i / 20, { ...DEFAULTS, hat: 'cap' }, 'hat', (f, id) => f !== 'hat' || !locked.has(id))
      expect(locked.has(next.hat)).toBe(false)
    }
  })

  it('leaves an unknown tab alone', () => {
    expect(shuffleTab(Math.random, DEFAULTS, 'nope', open)).toBe(DEFAULTS)
  })
})

describe('pets', () => {
  it('lists every pet with none first and tier info', () => {
    const pets = petOptions()
    expect(pets[0].id).toBe('none')
    expect(pets.map(p => p.id)).toEqual(optionsFor('pet'))
    expect(pets.find(p => p.id === 'slime').tier).toBe('earn')
  })

  it('reads and swaps only the pet of a look', () => {
    const a = encodeAvatar({ ...DEFAULTS, hair: 'long' })
    const b = withPet(a, 'kitten')
    expect(petOf(b)).toBe('kitten')
    expect(decodeAvatar(b).hair).toBe('long')
    expect(petOf('ghost.p2')).toBe('none')
    expect(withPet('ghost.p2', 'kitten')).toBe('ghost.p2')
  })

  it('describes tiers for the cards', () => {
    expect(petTierText({ id: 'duck', label: 'DUCK', tier: 'free' })).toBe('')
    expect(petTierText({ id: 'slime', label: 'SLIME', tier: 'earn', note: 'Play 100 games' })).toBe('EARNED: PLAY 100 GAMES')
    expect(petTierText({ id: 'ufo', label: 'UFO', tier: 'pass' })).toBe('PASS ITEM')
    expect(petTierText({ id: 'drake', label: 'MINI DRAKE', tier: 'pack', pack: 'dragon' })).toBe('PACK ITEM')
  })

  it('draws every pet on its own, with ink and transparent around it', () => {
    for (const id of optionsFor('pet')) {
      const px = renderPet(id, 0)
      if (id === 'none') { expect(px).toBeNull(); continue }
      expect(px.length).toBe(PET_BOX * PET_BOX)
      const ink = px.filter(Boolean).length
      expect(ink).toBeGreaterThan(15)
      expect(ink).toBeLessThan(PET_BOX * PET_BOX)
    }
    expect(renderPet('nope')).toBeNull()
    expect(isPetAnimated('ufo')).toBe(true)
    expect(isPetAnimated('duck')).toBe(false)
  })
})
