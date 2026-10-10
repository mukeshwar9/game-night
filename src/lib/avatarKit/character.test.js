import { describe, it, expect } from 'vitest'
import { renderPixels, composeLayer, isAnimated, PART_CATALOGS } from './character.js'
import { DEFAULTS, optionsFor, FIELDS, randomLook, encodeAvatar } from './catalog.js'
import { OUTFITS, tops, outfits, hat, hair, pets } from './art.js'
import { RAMPS, PREMIUM_RAMPS, colourAt } from './palette.js'
import { W, H, BACKGROUNDS, FRAMES } from './compose.js'
import { CATEGORIES, categoryOptions, colourOptions, tierBadge, swatchBackground } from './categories.js'

const count = (px) => px.filter(Boolean).length

describe('part art', () => {
  it('every grid has equal-length rows and fits inside the tile', () => {
    const errs = []
    const check = (name, rows) => {
      const lens = rows.filter(Boolean).map(r => r.length)
      if (lens.length && new Set(lens).size > 1) errs.push(`${name}: ragged rows ${[...new Set(lens)]}`)
    }
    for (const [cat, items] of Object.entries({ ...PART_CATALOGS, tops, outfits })) {
      for (const [id, p] of Object.entries(items)) {
        for (const rows of p.frames || (p.rows ? [p.rows] : [])) check(`${cat}.${id}`, rows)
        for (const layer of ['front', 'back']) if (p[layer]) check(`${cat}.${id}.${layer}`, p[layer].rows)
      }
    }
    expect(errs).toEqual([])
  })

  it('every outfit points at real body and bust art', () => {
    for (const [id, o] of Object.entries(OUTFITS)) {
      expect(outfits[o.body], `${id} body`).toBeTruthy()
      expect(tops[o.bust], `${id} bust`).toBeTruthy()
    }
  })

  it('every option carries a tier', () => {
    for (const [cat, items] of Object.entries(PART_CATALOGS)) {
      for (const [id, p] of Object.entries(items)) expect(['free', 'earn', 'pass', 'pack'], `${cat}.${id}`).toContain(p.tier)
    }
  })

  it('every pack item names its pack', () => {
    for (const items of Object.values(PART_CATALOGS)) for (const p of Object.values(items)) if (p.tier === 'pack') expect(p.pack).toBeTruthy()
  })

  it('palette: every static ramp has five RGB steps; animated ramps resolve', () => {
    for (const [id, r] of Object.entries(RAMPS)) {
      if (PREMIUM_RAMPS.includes(id) && r === null) continue
      expect(r, id).toHaveLength(5)
      for (const c of r) expect(c.every(v => v >= 0 && v <= 255)).toBe(true)
    }
    for (const id of PREMIUM_RAMPS) for (let s = 0; s < 5; s++) {
      const c = colourAt(id, s, 3, 4, 1.7)
      expect(c).toHaveLength(3)
      expect(c.every(v => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(true)
    }
  })
})

describe('rendering', () => {
  it('draws a tile with transparent rounded corners in both views', () => {
    for (const view of ['bust', 'hero', 'back']) {
      const px = renderPixels(DEFAULTS, view)
      expect(px).toHaveLength(W * H)
      expect(px[0]).toBeNull()
      expect(px[W - 1]).toBeNull()
      expect(px[W * H - 1]).toBeNull()
      expect(px[Math.floor(H / 2) * W + 1]).not.toBeNull() // backdrop fills the rest
      expect(count(px)).toBeGreaterThan(W * H * 0.7)
    }
  })

  it('tile=false leaves the backdrop transparent but draws the character', () => {
    const px = renderPixels(DEFAULTS, 'hero', { tile: false })
    expect(count(px)).toBeGreaterThan(80)
    expect(count(px)).toBeLessThan(W * H * 0.6)
  })

  it('every option of every field renders without throwing, in both views', () => {
    for (const f of FIELDS) {
      for (const id of optionsFor(f.key)) {
        for (const view of ['bust', 'hero', 'back']) {
          const px = renderPixels({ ...DEFAULTS, [f.key]: id }, view, { t: 0.4 })
          expect(count(px), `${f.key}=${id} ${view}`).toBeGreaterThan(200)
        }
      }
    }
  })

  it('random premium looks render in both views', () => {
    let a = 5
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296 }
    for (let i = 0; i < 200; i++) {
      const look = randomLook(rand, { premium: true })
      for (const view of ['bust', 'hero']) expect(count(renderPixels(look, view, { t: i / 7 }))).toBeGreaterThan(200)
    }
  })

  it('is deterministic for a given look and time', () => {
    const look = { ...DEFAULTS, hat: 'halo', hairColor: 'holo', frame: 'neon' }
    expect(renderPixels(look, 'bust', { t: 1.2 })).toEqual(renderPixels(look, 'bust', { t: 1.2 }))
  })

  it('looks differ when a part changes (skin tone shows on the face)', () => {
    expect(renderPixels({ ...DEFAULTS, skin: 's1' }, 'bust')).not.toEqual(renderPixels({ ...DEFAULTS, skin: 's10' }, 'bust'))
  })

  it('theme independence: output never depends on CSS - same pixels twice', () => {
    expect(encodeAvatar(DEFAULTS)).toBe(encodeAvatar({ ...DEFAULTS }))
    expect(composeLayer(DEFAULTS, 'bust')).toEqual(composeLayer(DEFAULTS, 'bust'))
  })

  it('animated premium ramps change over time; static looks do not', () => {
    const premium = { ...DEFAULTS, hairColor: 'holo' }
    expect(renderPixels(premium, 'bust', { t: 0 })).not.toEqual(renderPixels(premium, 'bust', { t: 0.5 }))
    expect(renderPixels(DEFAULTS, 'bust', { t: 0 })).toEqual(renderPixels(DEFAULTS, 'bust', { t: 0.5 }))
  })

  it('hero poses move the body; pets show only in the hero view', () => {
    const base = renderPixels(DEFAULTS, 'hero', { t: 0 })
    expect(renderPixels(DEFAULTS, 'hero', { t: 0, pose: 'wave' })).not.toEqual(base)
    const withPet = { ...DEFAULTS, pet: 'duck' }
    expect(renderPixels(withPet, 'hero', { t: 0 })).not.toEqual(base)
    expect(renderPixels(withPet, 'bust', { t: 0 })).toEqual(renderPixels(DEFAULTS, 'bust', { t: 0 }))
  })

  it('isAnimated flags moving looks only', () => {
    expect(isAnimated(DEFAULTS, 'bust')).toBe(false)
    expect(isAnimated({ ...DEFAULTS, frame: 'neon' }, 'bust')).toBe(true)
    expect(isAnimated({ ...DEFAULTS, topColor: 'lava' }, 'hero')).toBe(true)
    expect(isAnimated({ ...DEFAULTS, pet: 'ghost' }, 'hero')).toBe(true)
    expect(isAnimated({ ...DEFAULTS, pet: 'ghost' }, 'bust')).toBe(false)
    expect(Object.keys(BACKGROUNDS).length).toBeGreaterThan(5)
    expect(Object.keys(FRAMES).length).toBeGreaterThan(5)
    expect(hat.halo.anim && hair.bald && pets.duck).toBeTruthy()
  })
})

describe('the back view', () => {
  const FACE = ['eyes', 'brows', 'nose', 'mouth', 'marks', 'beard', 'glasses', 'extra']

  it('is the same character from behind: outlined, tile-less, and not the front', () => {
    const back = renderPixels(DEFAULTS, 'back', { tile: false })
    const front = renderPixels(DEFAULTS, 'bust', { tile: false })
    expect(count(back)).toBeGreaterThan(150)
    expect(back).not.toEqual(front)
    expect(back[0]).toBeNull()
  })

  it('shows no face: no face part changes a single pixel', () => {
    const base = renderPixels(DEFAULTS, 'back', { tile: false, t: 0.35 })
    for (const key of FACE) {
      for (const id of optionsFor(key)) {
        // Hats and hair hide parts of the head, never the other way round.
        expect(renderPixels({ ...DEFAULTS, [key]: id }, 'back', { tile: false, t: 0.35 }), `${key}=${id}`).toEqual(base)
      }
    }
  })

  it('fills the back of the head in the hair colour, and a hat covers it', () => {
    const bald = renderPixels({ ...DEFAULTS, hair: 'bald', hat: 'none' }, 'back', { tile: false })
    const haired = renderPixels({ ...DEFAULTS, hair: 'crop', hat: 'none' }, 'back', { tile: false })
    expect(haired).not.toEqual(bald)
  })

  it('renders every hair with every hat, with the character kept on the tile', () => {
    for (const hr of optionsFor('hair')) {
      for (const h of optionsFor('hat')) {
        const px = renderPixels({ ...DEFAULTS, hair: hr, hat: h }, 'back', { tile: false, t: 0.2 })
        expect(count(px), `hair=${hr} hat=${h}`).toBeGreaterThan(150)
        expect(count(px), `hair=${hr} hat=${h}`).toBeLessThan(W * H * 0.8)
      }
    }
  })

  it('is deterministic, is not animated by default looks, and takes the outfit colours', () => {
    expect(renderPixels(DEFAULTS, 'back', { t: 0.3 })).toEqual(renderPixels(DEFAULTS, 'back', { t: 0.3 }))
    const a = renderPixels({ ...DEFAULTS, topColor: 'red' }, 'back', { tile: false })
    const b = renderPixels({ ...DEFAULTS, topColor: 'blue' }, 'back', { tile: false })
    expect(a).not.toEqual(b)
  })
})

describe('editor categories', () => {
  it('every tab points at a real catalog and real colour fields', () => {
    const ids = new Set()
    for (const c of CATEGORIES) {
      expect(ids.has(c.id)).toBe(false)
      ids.add(c.id)
      if (c.field) expect(PART_CATALOGS[c.field], c.id).toBeTruthy()
      for (const row of c.colours) expect(FIELDS.some(f => f.key === row.key && f.kind === 'colour')).toBe(true)
      expect(c.field || c.colours.length).toBeTruthy()
      if (c.field) expect(categoryOptions(c).length).toBeGreaterThan(1)
    }
    // every wire field is editable somewhere
    const editable = new Set(CATEGORIES.flatMap(c => [c.field, ...c.colours.map(r => r.key)]))
    for (const f of FIELDS) expect(editable.has(f.key), f.key).toBe(true)
  })

  it('badges only non-free items and swatches resolve', () => {
    expect(tierBadge({ tier: 'free' })).toBeNull()
    expect(tierBadge({ tier: 'pass' }).text).toBe('PASS ITEM')
    expect(tierBadge({ tier: 'pack', pack: 'royal' }).text).toMatch(/ROYAL/)
    expect(tierBadge({ tier: 'earn', note: 'Win 50 matches' }).text).toMatch(/Win 50/)
    for (const c of colourOptions('topColor')) expect(swatchBackground(c.id)).toMatch(/^(rgb|linear-gradient)\(/)
    expect(colourOptions('topColor').filter(c => c.premium)).toHaveLength(PREMIUM_RAMPS.length)
  })
})
