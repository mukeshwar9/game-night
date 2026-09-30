// WIRE CROSSED bomb shell: colours, serial, indicators and the bomb
// conditions ("serial is odd", "indicator X is lit") shared by module rules.
//
// Pure — no DOM, no Firebase, no React.
import { int, pick, sample } from './rng'

export const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green']
export const COLOR_NAMES = {
  red: 'RED', blue: 'BLUE', yellow: 'YELLOW', white: 'WHITE', black: 'BLACK', green: 'GREEN',
}
/** Letter tags printed on every wire and strip, so colour is never the only cue. */
export const COLOR_LETTERS = {
  red: 'R', blue: 'B', yellow: 'Y', white: 'W', black: 'K', green: 'G',
}

export const INDICATOR_LABELS = ['SIG', 'CLR', 'BUS', 'FRQ', 'NAV', 'AUX', 'VNT', 'TRN']

export const SERIAL_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O: they read as 1/0

export function makeSerial(rng) {
  const chars = []
  for (let i = 0; i < 5; i++) {
    chars.push(rng() < 0.55 ? pick(rng, SERIAL_LETTERS) : String(int(rng, 0, 9)))
  }
  if (!chars.some(c => /[A-Z]/.test(c))) chars[0] = pick(rng, SERIAL_LETTERS)
  chars.push(String(int(rng, 0, 9)))
  return chars.join('')
}

export const serialLastDigit = (serial) => Number(String(serial).slice(-1))

export function makeIndicators(rng) {
  return sample(rng, INDICATOR_LABELS, 2).map(label => ({ label, lit: rng() < 0.5 }))
}

export const isLit = (bomb, label) => bomb.indicators.some(i => i.lit && i.label === label)

export function genBombCond(rng) {
  const r = rng()
  if (r < 0.5) return { kind: rng() < 0.5 ? 'serialOdd' : 'serialEven' }
  return { kind: 'lit', label: pick(rng, INDICATOR_LABELS) }
}

export function bombCondHolds(cond, bomb) {
  const digit = serialLastDigit(bomb.serial)
  if (cond.kind === 'serialOdd') return digit % 2 === 1
  if (cond.kind === 'serialEven') return digit % 2 === 0
  if (cond.kind === 'lit') return isLit(bomb, cond.label)
  return false
}

export function describeBombCond(cond) {
  if (cond.kind === 'serialOdd') return 'the serial ends in an odd digit'
  if (cond.kind === 'serialEven') return 'the serial ends in an even digit'
  if (cond.kind === 'lit') return `an indicator marked ${cond.label} is lit`
  return ''
}

/** Fresh shell drawn first from every bomb's rng: serial, indicators, ruleset. */
export function makeShell(rng) {
  const serial = makeSerial(rng)
  const indicators = makeIndicators(rng)
  const ruleset = `${pick(rng, SERIAL_LETTERS)}-${int(rng, 1, 9)}`
  return { serial, indicators, ruleset }
}
