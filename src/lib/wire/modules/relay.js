// WIRE CROSSED module: RELAY. A memory module. Each stage shows a display word
// (HOLD, SEND, MUTE or OPEN) and a digit 1-4 above 4 keys labelled 1-4 in
// shuffled order. The manual has one rule block per stage and one rule per
// word. Tier I: 3 stages, rules look back 1 stage. Tier II: 4 stages, up to 2
// stages back. Tier III: 5 stages, up to 2 back, and a strike sends the Tech
// back to stage 1 with new displays.
//
// Rule kinds: labelIsDisplay, position(n), samePositionAs(stage),
// sameLabelAs(stage), leftmost, rightmost. Stage numbers in rules are 0-based
// and always point at an earlier stage, so every stage has one defined key.
//
// Nothing about the displays is stored in the module: the stage displays and
// key orders are re-derived from `makeRng(seed + ':' + modIndex + ':' + resets)`
// on both screens. `seed` and `modIndex` come from `bomb.seed` / `i`.
//
// Progress is `mods[i] = { presses: [{ pos, label }], resets }`. Firebase drops
// empty arrays, so `relayState` reads a missing `presses` as [] and a missing
// `resets` as 0, and reads by explicit key.
//
// Pure — no DOM, no Firebase, no React.
import { int, makeRng, pick, shuffle } from '../rng'

export const RELAY_WORDS = ['HOLD', 'SEND', 'MUTE', 'OPEN']
export const RELAY_STAGES = { 1: 3, 2: 4, 3: 5 }
/** How many stages back a rule may look. */
export const RELAY_LOOKBACK = { 1: 1, 2: 2, 3: 2 }
export const RELAY_KEYS = 4

const LOOKBACK_KINDS = ['samePositionAs', 'sameLabelAs']
const FREE_KINDS = ['labelIsDisplay', 'position', 'leftmost', 'rightmost']

const validPos = (v) => Number.isInteger(v) && v >= 0 && v < RELAY_KEYS
const validLabel = (v) => Number.isInteger(v) && v >= 1 && v <= RELAY_KEYS

const tierOf = (module) => (module.tier in RELAY_STAGES ? module.tier : 1)
/** Number of stages of this module. */
export const relayStageCount = (module) => module.manual.stages.length

/** Stage displays for one attempt: [{ word, digit, labels }], labels[pos] = key label. */
export function relayStages(seed, modIndex, resets, count) {
  const rng = makeRng(`${seed}:${modIndex}:${resets}`)
  return Array.from({ length: count }, () => ({
    word: pick(rng, RELAY_WORDS),
    digit: int(rng, 1, RELAY_KEYS),
    labels: shuffle(rng, [1, 2, 3, 4]),
  }))
}

/**
 * Normalised progress of module `i`: { presses, resets }. Reads by explicit
 * key (Firebase may return an array or a numeric-keyed object) and drops
 * malformed entries.
 */
export function relayState(wire, i) {
  const raw = wire?.mods?.[i]
  const resets = Number.isInteger(raw?.resets) && raw.resets > 0 ? raw.resets : 0
  const presses = []
  const entries = Object.entries(raw?.presses || {})
    .filter(([, v]) => v != null)
    .map(([k, v]) => [parseInt(k, 10), v])
    .filter(([k]) => Number.isInteger(k) && k >= 0)
    .sort((a, b) => a[0] - b[0])
  for (const [k, v] of entries) {
    if (k !== presses.length || !validPos(Number(v.pos)) || !validLabel(Number(v.label))) break
    presses.push({ pos: Number(v.pos), label: Number(v.label) })
  }
  return { presses, resets }
}

/** The key position the manual asks for at `stageIndex`, given the earlier presses. */
export function relayCorrectPos(module, stages, presses, stageIndex) {
  const stage = stages[stageIndex]
  const rule = module.manual.stages[stageIndex][stage.word]
  switch (rule.kind) {
    case 'labelIsDisplay': return stage.labels.indexOf(stage.digit)
    case 'position': return rule.n
    case 'samePositionAs': return presses[rule.stage].pos
    case 'sameLabelAs': return stage.labels.indexOf(presses[rule.stage].label)
    case 'leftmost': return 0
    default: return RELAY_KEYS - 1
  }
}

/** Everything a screen needs: the current attempt's stages and the stage in play. */
export function relayView(module, wire, i) {
  const { presses, resets } = relayState(wire, i)
  const stages = relayStages(wire?.seed, i, resets, relayStageCount(module))
  const stageIndex = Math.min(presses.length, stages.length - 1)
  return { presses, resets, stages, stageIndex, stage: stages[stageIndex], done: presses.length >= stages.length }
}

/** Plain-English text of one rule, shared by the manual and the tests. */
export function describeRelayRule(rule) {
  switch (rule.kind) {
    case 'labelIsDisplay': return 'press the key labelled with the display number'
    case 'position': return `press the key in position ${rule.n + 1} from the left`
    case 'samePositionAs': return `press the key in the same position you pressed at stage ${rule.stage + 1}`
    case 'sameLabelAs': return `press the key with the same label you pressed at stage ${rule.stage + 1}`
    case 'leftmost': return 'press the leftmost key'
    default: return 'press the rightmost key'
  }
}

function genRule(rng, stageIndex, lookback, forceBack) {
  const canLook = stageIndex >= 1
  const kinds = forceBack ? LOOKBACK_KINDS : canLook ? [...FREE_KINDS, ...LOOKBACK_KINDS] : FREE_KINDS
  const kind = pick(rng, kinds)
  if (kind === 'position') return { kind, n: int(rng, 0, RELAY_KEYS - 1) }
  if (LOOKBACK_KINDS.includes(kind)) {
    const back = int(rng, 1, Math.min(lookback, stageIndex))
    return { kind, stage: stageIndex - back }
  }
  return { kind }
}

export default {
  type: 'relay',
  name: 'RELAY',
  maxTier: 3,

  generate(rng, tier = 1) {
    const t = tier in RELAY_STAGES ? tier : 1
    const count = RELAY_STAGES[t]
    const lookback = RELAY_LOOKBACK[t]
    const stages = Array.from({ length: count }, (_, s) => {
      // From the second stage on, at least one word looks back so the log matters.
      const back = s >= 1 ? int(rng, 0, RELAY_WORDS.length - 1) : -1
      const block = {}
      RELAY_WORDS.forEach((word, w) => { block[word] = genRule(rng, s, lookback, w === back) })
      return block
    })
    return { type: 'relay', tier: t, device: { keys: RELAY_KEYS }, manual: { stages } }
  },

  judge(module, bomb, wire, i, action) {
    if (action.kind !== 'press' || !validPos(action.key)) return null
    const { presses, resets } = relayState(wire, i)
    const stages = relayStages(bomb.seed, i, resets, relayStageCount(module))
    if (presses.length >= stages.length) return null
    const at = presses.length
    const stage = stages[at]
    const pos = action.key
    const label = stage.labels[pos]
    const want = relayCorrectPos(module, stages, presses, at)

    if (pos !== want) {
      if (tierOf(module) >= 3) {
        return {
          ok: false,
          solved: false,
          progress: { presses: [], resets: resets + 1 },
          text: `PRESSED KEY ${label} AT STAGE ${at + 1} — WRONG, BACK TO STAGE 1`,
        }
      }
      return {
        ok: false,
        solved: false,
        progress: { presses, resets },
        text: `PRESSED KEY ${label} AT STAGE ${at + 1} — WRONG`,
      }
    }
    const next = [...presses, { pos, label }]
    return {
      ok: true,
      solved: next.length === stages.length,
      progress: { presses: next, resets },
      text: `PRESSED KEY ${label} AT STAGE ${at + 1}`,
    }
  },

  solveNext(module, bomb, wire, i) {
    const { presses, resets } = relayState(wire, i)
    const stages = relayStages(bomb.seed, i, resets, relayStageCount(module))
    const at = Math.min(presses.length, stages.length - 1)
    return { mod: i, kind: 'press', key: relayCorrectPos(module, stages, presses, at) }
  },
}
