// @ts-check
// PIXEL EMOTES pack art: one 16×16 pixel sprite with a short frame loop per
// premium reaction (EMOTES_PREMIUM in emotes.js). Pure data and drawing — no
// DOM. PixelEmote.jsx paints a sprite onto a canvas.
//
// The room still carries the Unicode glyph (🚀, 👑, …), so older clients keep
// showing the plain emoji; newer ones draw the sprite wherever a premium
// glyph appears as a reaction. Like avatars, these are cosmetics a player may
// pay for, so their colours come from the fixed avatar palette (RGB
// triplets), never from the theme's --c-* tokens.
import { RAMPS } from './avatarKit/palette'
import { EMOTES_PREMIUM } from './emotes'

export const SPRITE_SIZE = 16
export const FRAME_MS = 140

const ramp = (name, step) => /** @type {[number, number, number]} */ ((RAMPS[name] || RAMPS.grey || [[0, 0, 0]])[step])

/** Palette keys used in the sprite grids; '.' is transparent. */
export const PIXEL_PALETTE = {
  K: ramp('black', 0),
  Y: ramp('yellow', 2),
  O: ramp('yellow', 1),
  L: ramp('yellow', 4),
  W: ramp('white', 4),
  S: ramp('white', 2),
  D: ramp('grey', 2),
  R: ramp('red', 2),
  B: ramp('blue', 2),
  b: ramp('sky', 3),
  T: ramp('teal', 3),
  G: ramp('green', 2),
  F: ramp('orange', 2),
  Z: ramp('pink', 3),
  p: ramp('pink', 2),
  P: ramp('purple', 3),
  C: ramp('brown', 2),
  c: ramp('brown', 3),
}

/** @typedef {string[][]} Grid */

/** @returns {Grid} */
function blank() {
  return Array.from({ length: SPRITE_SIZE }, () => Array(SPRITE_SIZE).fill('.'))
}

/** Stamps text rows onto a grid, '.' leaving cells as they are. */
function put(g, rows, dy = 0, dx = 0) {
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    const yy = y + dy
    const xx = x + dx
    if (c !== '.' && yy >= 0 && yy < SPRITE_SIZE && xx >= 0 && xx < SPRITE_SIZE) g[yy][xx] = c
  }))
  return g
}

function set(g, x, y, c) {
  if (x >= 0 && x < SPRITE_SIZE && y >= 0 && y < SPRITE_SIZE) g[y][x] = c
}

/** A four-point glint: white centre, light arms. */
function glint(g, x, y) {
  set(g, x, y, 'W')
  set(g, x - 1, y, 'L'); set(g, x + 1, y, 'L'); set(g, x, y - 1, 'L'); set(g, x, y + 1, 'L')
}

/** @type {Record<string, { frames: number, draw: (f: number) => Grid }>} */
export const SPRITES = {
  crown: { frames: 6, draw(f) {
    const g = put(blank(), [
      '................', '................', '..K....KK....K..', '.KYK..KYYK..KYK.', '.KYK..KYYK..KYK.', '.KYYKKYYYYKKYYK.',
      '.KYYYYYRRYYYYYK.', '.KYYYYRWRRYYYYK.', '.KYYYYYRRYYYYYK.', '.KYYYYYYYYYYYYK.', '.KOOOOOOOOOOOOK.', '.KYBYYYBYYYBYYK.',
      '.KOOOOOOOOOOOOK.', '..KKKKKKKKKKKK..'])
    const spots = [[3, 2], [8, 3], [12, 3], [13, 6], [4, 9], null]
    const s = spots[f]
    if (s) glint(g, s[0], s[1])
    return g
  } },

  rocket: { frames: 4, draw(f) {
    const bob = f % 2
    const g = put(blank(), [
      '.......KK.......', '......KWWK......', '.....KWWWWK.....', '.....KWRRWK.....', '.....KWRRWK.....', '.....KWWWWK.....',
      '.....KWBBWK.....', '.....KWBBWK.....', '.....KWWWWK.....', '....KRKWWKRK....', '...KRRKWWKRRK...', '...KRRKKKKRRK...'], bob)
    const flames = [
      ['......KFFK......', '......FYYF......', '.......YY.......', '.......F........'],
      ['......KFFK......', '.....FYYYYF.....', '......FYYF......', '.......FF.......'],
      ['......KFFK......', '......FYYF......', '......FYYF......', '........F.......'],
      ['......KFFK......', '.....FFYYFF.....', '......FYYF......', '......F..F......']]
    return put(g, flames[f], 12 + bob)
  } },

  ufo: { frames: 4, draw(f) {
    const g = put(blank(), [
      '................', '................', '................', '......KKKK......', '.....KbbbbK.....', '....KbWbbbbK....',
      '..KKKKKKKKKKKK..', '.KGGGGGGGGGGGGK.', 'KGGGGGGGGGGGGGGK', '.KGGGGGGGGGGGGK.', '..KKKKKKKKKKKK..'])
    for (let i = 0; i < 4; i++) set(g, 2 + i * 4 + (f % 2) * 2, 8, f % 2 ? 'Z' : 'Y')
    const beams = [
      ['.....b....b.....', '....b......b....', '...b........b...', '..b..........b..'],
      ['.....bbbbbb.....', '....b.bbbb.b....', '...b..bbbb..b...', '..b...bbbb...b..'],
      ['.....bbbbbb.....', '....bbbbbbbb....', '...bbbbbbbbbb...', '..bbbbbbbbbbbb..'],
      ['.....bbbbbb.....', '....b.bbbb.b....', '...b..bbbb..b...', '..b...bbbb...b..']]
    return put(g, beams[f], 11)
  } },

  disco: { frames: 3, draw(f) {
    const g = blank()
    set(g, 7, 0, 'K'); set(g, 7, 1, 'K'); set(g, 7, 2, 'K')
    for (let y = 3; y < SPRITE_SIZE; y++) {
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const d = Math.hypot(x - 7.5, y - 9)
        if (d > 6.6) continue
        if (d > 5.7) { g[y][x] = 'K'; continue }
        const k = (x + y + f) % 3
        g[y][x] = k === 0 ? 'W' : k === 1 ? 'S' : 'D'
        if ((x * 7 + y * 3 + f * 5) % 23 === 0) g[y][x] = 'Z'
      }
    }
    return g
  } },

  firework: { frames: 4, draw(f) {
    const g = blank()
    const colours = ['R', 'Y', 'b', 'Z', 'G', 'F', 'P', 'Y']
    const radius = [2, 4, 6, 7][f]
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      const x = Math.round(7.5 + Math.cos(a) * radius)
      const y = Math.round(7.5 + Math.sin(a) * radius)
      set(g, x, y, f === 3 ? 'D' : colours[i])
      if (radius > 2) {
        set(g, Math.round(7.5 + Math.cos(a) * (radius - 2)), Math.round(7.5 + Math.sin(a) * (radius - 2)), f === 3 ? 'D' : 'L')
      }
    }
    if (f === 0) {
      // The shell still climbing: a bright head over a fading trail.
      set(g, 7, 7, 'W'); set(g, 8, 8, 'W'); set(g, 7, 8, 'L'); set(g, 8, 7, 'L')
      for (let y = 10; y <= 15; y++) set(g, 7 + (y % 2), y, y < 13 ? 'F' : 'O')
    }
    if (f === 1) set(g, 7, 7, 'L')
    return g
  } },

  unicorn: { frames: 3, draw(f) {
    const mane = [['P', 'Z'], ['Z', 'T'], ['T', 'P']][f]
    const rows = [
      '...........L....', '..........LY....', '.........LY.....', '.....12KKY......', '....12KWWWK.....', '...12KWWWWWK....',
      '...21KWWKWWWK...', '..12KWWWWWWWWK..', '..21KWWWWWWWpWK.', '..12KWWWWKKKKK..', '..21KWWWWK......', '..12KWWWWK......',
      '...KWWWWK.......', '...KWWWWWK......', '...KKKKKKK......']
    const g = put(blank(), rows.map(r => r.replace(/1/g, mane[0]).replace(/2/g, mane[1])))
    if (f === 1) glint(g, 12, 1)
    return g
  } },

  trophy: { frames: 4, draw(f) {
    const g = put(blank(), [
      '................', '...KKKKKKKKKK...', '.KKYYYYYYYYYYKK.', 'K.KYYYYYYYYYYK.K', 'K.KYYYYYYYYYYK.K', '.KKYYYYYYYYYYKK.',
      '...KYYYYYYYYK...', '....KYYYYYYK....', '.....KYYYYK.....', '......KOOK......', '......KOOK......', '.....KYYYYK.....',
      '....KCCCCCCK....', '....KCcccCCK....', '....KKKKKKKK....'])
    const x = 4 + f * 2
    for (let y = 2; y <= 6; y++) if (g[y][x + (y - 2) % 2] === 'Y') g[y][x + (y - 2) % 2] = 'L'
    if (f === 2) glint(g, 11, 3)
    return g
  } },

  joystick: { frames: 4, draw(f) {
    const g = put(blank(), [
      '..KKKKKKKKKKKK..', '.KDDDDDDDDDDDDK.', '.KDRDDDDDDDDDDK.', '.KSSSSSSSSSSSSK.', '..KKKKKKKKKKKK..'], 10)
    if (f % 2) set(g, 3, 12, 'Z')
    const tilt = [0, -2, 0, 2][f]
    for (let y = 5; y <= 9; y++) {
      const x = Math.round(8 + tilt * ((9 - y) / 4))
      set(g, x, y, 'K'); set(g, x - 1, y, 'D')
    }
    const cx = 8 + tilt
    put(g, ['.KKK.', 'KRRRK', 'KRWRK', 'KRRRK', '.KKK.'], 1, cx - 3)
    return g
  } },

  gem: { frames: 4, draw(f) {
    const g = put(blank(), [
      '................', '................', '................', '....KKKKKKKK....', '...KbWbTTbTbK...', '..KbWbbTTbbTbK..',
      '.KKKKKKKKKKKKKK.', '..KbbbTTTTbbbK..', '...KbbTTTTbbK...', '....KbTTTTbK....', '.....KbTTbK.....', '......KbbK......',
      '.......KK.......'])
    const spots = [[4, 4], [12, 5], [7, 8], null]
    const s = spots[f]
    if (s) glint(g, s[0], s[1])
    return g
  } },

  popcorn: { frames: 3, draw(f) {
    const g = put(blank(), [
      '....LWL.LWL.....', '..LWWLWWLWWLWL..', '..WLWWLWWLWWLW..', '..KKKKKKKKKKKK..', '..KWRWRWRWRWRK..', '..KWRWRWRWRWRK..',
      '...KWRWRWRWRK...', '...KWRWRWRWRK...', '...KWRWRWRWRK...', '....KWRWRWRK....', '....KKKKKKKK....'], 4)
    const kernel = [[5, 2], [10, 0], [7, 1]][f]
    set(g, kernel[0], kernel[1], 'W'); set(g, kernel[0] + 1, kernel[1], 'L'); set(g, kernel[0], kernel[1] + 1, 'L')
    return g
  } },

  // 🫧 BUBBLES (catalogue id `ghostly`).
  ghostly: { frames: 4, draw(f) {
    const g = blank()
    const bubbles = [[5, 11, 3], [11, 8, 2.2], [8, 4, 1.4]]
    bubbles.forEach(([cx, cy, r], i) => {
      const y0 = cy - ((f + i) % 4)
      for (let y = 0; y < SPRITE_SIZE; y++) {
        for (let x = 0; x < SPRITE_SIZE; x++) {
          if (Math.abs(Math.hypot(x - cx, y - y0) - r) < 0.6) g[y][x] = 'b'
        }
      }
      set(g, Math.round(cx - r / 2), Math.round(y0 - r / 2), 'W')
    })
    return g
  } },

  sparkle: { frames: 4, draw(f) {
    const g = blank()
    const star = (cx, cy, size) => {
      for (let d = 1; d <= size; d++) {
        const c = d === size ? 'L' : 'Y'
        set(g, cx + d, cy, c); set(g, cx - d, cy, c); set(g, cx, cy + d, c); set(g, cx, cy - d, c)
      }
      if (size >= 3) { set(g, cx + 1, cy + 1, 'Y'); set(g, cx - 1, cy - 1, 'Y'); set(g, cx + 1, cy - 1, 'Y'); set(g, cx - 1, cy + 1, 'Y') }
      set(g, cx, cy, 'W')
    }
    star(6, 9, [4, 5, 4, 3][f])
    star(12, 3, [2, 1, 2, 3][f])
    if (f % 2 === 0) set(g, 13, 12, 'L')
    else star(3, 2, 1)
    return g
  } },
}

const GLYPH_TO_SPRITE = Object.fromEntries(EMOTES_PREMIUM.map(item => [item.glyph, item.id]))

/** The sprite id for a premium reaction glyph, or null for any other glyph. */
export function pixelEmoteFor(glyph) {
  const id = GLYPH_TO_SPRITE[glyph]
  return id && SPRITES[id] ? id : null
}

/** One frame of a sprite as a 16×16 grid of palette keys. Frame wraps. */
export function spriteFrame(id, frame = 0) {
  const sprite = SPRITES[id]
  if (!sprite) return null
  return sprite.draw(((frame % sprite.frames) + sprite.frames) % sprite.frames)
}

/** CSS colour for a palette key, or null when transparent. */
export function pixelColour(key) {
  const rgb = PIXEL_PALETTE[key]
  return rgb ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})` : null
}
