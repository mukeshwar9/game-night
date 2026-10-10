// WIRE CROSSED module: CALL SIGN. The Tech reads a row of letter wheels; the
// Handbook lists every valid call sign. Exactly one list word can be spelled
// from the wheels (one letter per wheel), so the Tech transmits that word.
// Tier I: 4-letter words, 4 letters per wheel. Tier II: 5-letter words, 6 per
// wheel. Tier III: as II, but every wheel letter is shifted forward by the
// serial's last digit (mod 26); the Handbook shifts back.
//
// `device.wheels[k]` is the string of letters wheel k shows (already shifted at
// tier III); `manual.shift` is the shift (0 below tier III). Wheel positions are
// local UI state; only TRANSMIT writes: `{ kind: 'transmit', word }`, where
// `word` is what the wheels show. A wrong word is a strike.
//
// Pure — no DOM, no Firebase, no React.
import { pick, sample, shuffle } from '../rng'
import { serialLastDigit } from '../shell'
import { callsignWords } from '../callsignWords'

export const CALLSIGN_LENGTH = { 1: 4, 2: 5, 3: 5 }
export const CALLSIGN_WHEEL_SIZE = { 1: 4, 2: 6, 3: 6 }
export const MIN_FIRST_WHEEL_WORDS = 3

const A = 65
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Shift one letter forward by `by` (negative shifts back), mod 26. */
export const shiftLetter = (ch, by) => String.fromCharCode(A + ((((ch.charCodeAt(0) - A + by) % 26) + 26) % 26))
/** Shift every letter of `word` forward by `by`. */
export const shiftWord = (word, by) => Array.from(word, ch => shiftLetter(ch, by)).join('')

/** True when `word` can be spelled with one letter from each wheel. */
const spellable = (word, wheels) => word.length === wheels.length && Array.from(word).every((ch, k) => wheels[k].includes(ch))

/** The wheels as the Handbook sees them (shift undone). */
export const trueWheels = (module) => module.device.wheels.map(w => shiftWord(w, -(module.manual.shift || 0)))

/** The list word that can be spelled from the wheels, unshifted. */
export function callsignAnswer(module) {
  const wheels = trueWheels(module)
  return callsignWords(wheels.length).find(w => spellable(w, wheels)) ?? null
}

/** What the wheels must show to spell the answer (shifted at tier III). */
export const callsignTransmit = (module) => shiftWord(callsignAnswer(module), module.manual.shift || 0)

export default {
  type: 'callsign',
  name: 'CALL SIGN',
  maxTier: 3,

  generate(rng, tier = 1, ctx = {}) {
    const length = CALLSIGN_LENGTH[tier] ?? CALLSIGN_LENGTH[1]
    const size = CALLSIGN_WHEEL_SIZE[tier] ?? CALLSIGN_WHEEL_SIZE[1]
    const words = callsignWords(length)
    const shift = tier >= 3 ? serialLastDigit(String(ctx.serial ?? '0')) : 0
    for (let attempt = 0; attempt < 2000; attempt++) {
      const target = pick(rng, words)
      const wheels = Array.from(target, ch => {
        const decoys = sample(rng, Array.from(ALPHABET).filter(c => c !== ch), size - 1)
        return shuffle(rng, [ch, ...decoys]).join('')
      })
      if (words.filter(w => spellable(w, wheels)).length !== 1) continue
      if (words.filter(w => wheels[0].includes(w[0])).length < MIN_FIRST_WHEEL_WORDS) continue
      return {
        type: 'callsign',
        tier,
        device: { wheels: wheels.map(w => shiftWord(w, shift)) },
        manual: { length, shift },
      }
    }
    /* c8 ignore next */
    throw new Error('callsign generation failed')
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'transmit') return null
    const { word } = action
    const length = module.device.wheels.length
    if (typeof word !== 'string' || word.length !== length || !/^[A-Z]+$/.test(word)) return null
    if (word !== callsignTransmit(module)) {
      return { ok: false, solved: false, progress: { touched: true }, text: `TRANSMITTED ${word} — NO ANSWER` }
    }
    return { ok: true, solved: true, progress: { touched: true, sent: word }, text: `TRANSMITTED ${word}` }
  },

  solveNext(module, bomb, wire, i) {
    return { mod: i, kind: 'transmit', word: callsignTransmit(module) }
  },
}
