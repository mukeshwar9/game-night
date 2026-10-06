// @ts-check
// Background music: the pure half. Pattern parsing for the procedural tracks
// (src/lib/musicTracks.js), which track a screen plays, and the stored
// preference rules. No WebAudio, DOM or React here — the scheduler lives in
// musicEngine.js and the app wiring in music.js.

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 }

/** @param {string} name e.g. 'C#5' @returns {number | null} MIDI note number */
export function midi(name) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(name)
  return m ? 12 * (Number(m[2]) + 1) + NOTE[/** @type {keyof NOTE} */ (m[1])] : null
}

/** @param {number} m MIDI note @returns {number} frequency in Hz */
export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12)

/**
 * One token per 16th step: '.' rest, '-' holds the previous note one more
 * step, anything else is a note name. Returns one entry per step: null, or
 * { m, len } on the step a note starts (len counts its held steps).
 * @param {string} str
 * @returns {({ m: number, len: number } | null)[]}
 */
export function parseLine(str) {
  /** @type {({ m: number, len: number } | null)[]} */
  const out = []
  /** @type {{ m: number, len: number } | null} */
  let last = null
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '-') {
      if (last) last.len++
      out.push(null)
    } else if (tok === '.') {
      last = null
      out.push(null)
    } else {
      const m = midi(tok)
      if (m === null) throw new Error(`bad note "${tok}"`)
      last = { m, len: 1 }
      out.push(last)
    }
  }
  return out
}

/** Drum hits per 16th step: 'x' full, 'o' soft, anything else silent. */
export function parseHits(/** @type {string} */ str) {
  return str.replace(/\s+/g, '').split('').map(c => (c === 'x' ? 1 : c === 'o' ? 0.55 : 0))
}

const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 7: [0, 4, 7, 10], 6: [0, 4, 7, 9], sus2: [0, 2, 7], sus4: [0, 5, 7] }

/**
 * Chord symbol ('Am7', 'F', 'G6') to MIDI chord tones rooted in `octave`.
 * @param {string} sym
 * @param {number} [octave]
 */
export function chordTones(sym, octave = 3) {
  const m = /^([A-G][#b]?)(.*)$/.exec(sym)
  if (!m || !(m[2] in QUALITY)) throw new Error(`bad chord "${sym}"`)
  const root = 12 * (octave + 1) + NOTE[/** @type {keyof NOTE} */ (m[1])]
  return QUALITY[/** @type {keyof QUALITY} */ (m[2])].map(i => root + i)
}

// ─── Which track plays where ─────────────────────────────────────────────────

/** In-game track per registry `category` (src/lib/games.js GAME_CATEGORIES). */
export const CATEGORY_TRACK = {
  board: 'think', word: 'think', memory: 'think', dicebluff: 'think',
  reflex: 'turbo',
  party: 'party',
}

/** Themes whose menus get their own lobby loop instead of INSERT COIN. */
export const THEME_LOBBY_TRACK = { synthwave: 'neon', grid: 'neon' }

/** How many times the results loop plays before the lobby loop takes over. */
export const RESULTS_LOOPS = 2

/**
 * The track id for a music scene.
 *   'lobby'   menus: home, picker, profile… (theme-flavoured)
 *   'wait'    a room waiting for players
 *   'results' a finished round (until `resultsDone`, then the lobby loop)
 *   'game'    in a game: the registry `music` override, else by `category`
 * @param {string | null | undefined} scene
 * @param {{ category?: string, music?: string, theme?: string, resultsDone?: boolean }} [ctx]
 * @returns {string}
 */
export function trackForScene(scene, { category, music, theme, resultsDone } = {}) {
  const lobby = (theme && THEME_LOBBY_TRACK[/** @type {keyof THEME_LOBBY_TRACK} */ (theme)]) || 'coin'
  switch (scene) {
    case 'wait': return 'wait'
    case 'results': return resultsDone ? lobby : 'score'
    case 'game': return music || (category && CATEGORY_TRACK[/** @type {keyof CATEGORY_TRACK} */ (category)]) || 'think'
    default: return lobby
  }
}

/**
 * The scene for a game room, from its status. null (no room yet) keeps
 * whatever the page played before.
 * @param {{ status?: string } | null | undefined} game
 * @returns {'wait' | 'game' | 'results' | null}
 */
export function roomMusicScene(game) {
  if (!game) return null
  if (game.status === 'waiting') return 'wait'
  if (game.status === 'finished') return 'results'
  return 'game'
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export const DEFAULT_MUSIC_VOLUME = 0.6

/**
 * Music is on by default and only the player's own music choice turns it off.
 * It is deliberately independent of the game-sounds mute: that switch used to
 * silence music for anyone who had never touched the music toggle, which looked
 * like music "sometimes not playing".
 * @param {string | null} stored localStorage 'music': 'on' | 'off' | null
 */
export function resolveMusicOn(stored) {
  return stored !== 'off'
}

/** Player-facing names for the reasons music can be held back. */
const BLOCK_LABELS = /** @type {Record<string, string>} */ ({
  videoCall: 'VIDEO CALL LAYOUT',
  voice: 'VOICE CHAT',
})

/** @param {string[]} reasons @returns {string} e.g. 'VOICE CHAT' */
export function blockLabel(reasons) {
  return reasons.map(r => BLOCK_LABELS[r] ?? r.toUpperCase()).join(' + ')
}

/**
 * What the music toggle should tell the player. Order matters: an off switch
 * wins, then a blocker, then a failed engine load, then "armed but silent"
 * (no first tap yet, or a context the browser suspended), else playing.
 * @param {{ on: boolean, blocked: string[], failed: boolean, running: boolean }} s
 * @returns {'off' | 'blocked' | 'failed' | 'needs-tap' | 'playing'}
 */
export function musicStatus({ on, blocked, failed, running }) {
  if (!on) return 'off'
  if (blocked.length) return 'blocked'
  if (failed) return 'failed'
  return running ? 'playing' : 'needs-tap'
}

/** Waits before each engine-chunk retry; null once the retries are used up. */
export const ENGINE_RETRY_MS = [800, 2500, 7000]

/** @param {number} attempt 0-based count of failed loads so far @returns {number | null} */
export function engineRetryDelay(attempt) {
  return attempt < ENGINE_RETRY_MS.length ? ENGINE_RETRY_MS[attempt] : null
}

/** A tap this soon after one that started the music must not also toggle it off. */
export const REVIVE_TAP_MS = 500

/** @param {unknown} raw @returns {number} volume in [0, 1] */
export function normalizeMusicVolume(raw) {
  if (raw === null || raw === undefined || raw === '') return DEFAULT_MUSIC_VOLUME
  const v = Number(raw)
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_MUSIC_VOLUME
}

/** Slider position to gain: squared, so the slider feels even to the ear. */
export const volumeToGain = (/** @type {number} */ v) => v * v
